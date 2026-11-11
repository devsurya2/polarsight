/**
 * Administrator accounts.
 *
 * Guards that matter here:
 *  - nobody disables, deletes or re-roles their own account
 *  - nobody is given a role holding permissions the caller lacks
 *  - the last active Super Admin cannot be removed or demoted
 *  - nobody acts on an account more privileged than their own: you
 *    cannot reset the password of, disable, delete or end the
 *    sessions of an administrator whose role holds a permission you
 *    lack (otherwise admin:write alone is a route to Super Admin)
 *  - disabling an account, resetting a password or changing a role
 *    ends that account's sessions immediately
 *  - every mutation needs a recent re-authentication
 */

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { requireRecentAuth } from "../../middleware/reauth.js";
import { writeAudit } from "../../lib/audit.js";
import { assessPassword, hashPassword } from "../../lib/password.js";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../../lib/errors.js";
import { paginated, skipTake } from "../../lib/pagination.js";
import { param } from "../../lib/params.js";
import { singleLineText } from "../../lib/sanitize.js";
import { SUPER_ADMIN_ROLE } from "../roles/routes.js";

const idParam = z.object({ id: z.string().min(1) });

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  roleId: z.string().trim().max(60).optional(),
  active: z.enum(["true", "false"]).optional(),
});

const password = z
  .string()
  .min(12)
  .max(200)
  .superRefine((v, ctx) => {
    for (const problem of assessPassword(v)) {
      ctx.addIssue({ code: "custom", message: `Password ${problem}` });
    }
  });

const createSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(200),
    name: singleLineText(120, "Name").refine((v) => v.length >= 2, "Name is too short"),
    password,
    roleId: z.string().min(1),
  })
  .strict();

const updateSchema = z
  .object({
    name: singleLineText(120, "Name").optional(),
    roleId: z.string().min(1).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

const resetSchema = z.object({ password }).strict();

// Never select the hash.
const safeSelect = {
  id: true,
  email: true,
  name: true,
  isActive: true,
  lastLoginAt: true,
  lockedUntil: true,
  createdAt: true,
  updatedAt: true,
  role: { select: { id: true, name: true } },
} as const;

export const adminUsersRouter = Router();
adminUsersRouter.use(requireAuth);

adminUsersRouter.get(
  "/",
  requirePermission("admin:read"),
  validate({ query: listQuery }),
  async (req, res, next) => {
    try {
      const { page, perPage, search, roleId, active } = req.query as unknown as z.infer<
        typeof listQuery
      >;

      const where: Record<string, unknown> = {};
      if (roleId) where.roleId = roleId;
      if (active) where.isActive = active === "true";
      if (search) {
        where.OR = [
          { email: { contains: search, mode: "insensitive" } },
          { name: { contains: search, mode: "insensitive" } },
        ];
      }

      const [rows, total] = await Promise.all([
        prisma.adminUser.findMany({
          where,
          orderBy: { createdAt: "desc" },
          ...skipTake({ page, perPage }),
          select: { ...safeSelect, _count: { select: { refreshTokens: true } } },
        }),
        prisma.adminUser.count({ where }),
      ]);

      // Count only sessions that are still usable, not every token
      // ever issued.
      const activeSessions = await prisma.refreshToken.groupBy({
        by: ["userId"],
        where: {
          userId: { in: rows.map((r) => r.id) },
          revokedAt: null,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        _count: { _all: true },
      });
      const sessionsByUser = new Map(activeSessions.map((s) => [s.userId, s._count._all]));

      const items = rows.map(({ _count, ...r }) => ({
        ...r,
        activeSessions: sessionsByUser.get(r.id) ?? 0,
        isLockedOut: Boolean(r.lockedUntil && r.lockedUntil > new Date()),
      }));

      res.json(paginated(items, total, { page, perPage }));
    } catch (err) {
      next(err);
    }
  }
);

/** One administrator, with their recent activity. */
adminUsersRouter.get(
  "/:id",
  requirePermission("admin:read"),
  validate({ params: idParam }),
  async (req, res, next) => {
    try {
      const id = param(req, "id");
      const user = await prisma.adminUser.findUnique({ where: { id }, select: safeSelect });
      if (!user) throw new NotFoundError("Administrator");

      const [activity, sessions] = await Promise.all([
        prisma.auditLog.findMany({
          where: { actorId: id },
          orderBy: { createdAt: "desc" },
          take: 25,
          select: { id: true, action: true, entity: true, entityId: true, createdAt: true, ip: true },
        }),
        prisma.refreshToken.findMany({
          where: { userId: id, revokedAt: null, usedAt: null, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: "desc" },
          // Never the token or its hash: only where and when.
          select: { id: true, createdAt: true, expiresAt: true, ip: true, userAgent: true },
        }),
      ]);

      res.json({
        item: {
          ...user,
          isLockedOut: Boolean(user.lockedUntil && user.lockedUntil > new Date()),
        },
        activity,
        sessions,
      });
    } catch (err) {
      next(err);
    }
  }
);

adminUsersRouter.post(
  "/",
  requirePermission("admin:write"),
  requireRecentAuth,
  validate({ body: createSchema }),
  async (req, res, next) => {
    try {
      const { email, name, password: plain, roleId } = req.body as z.infer<typeof createSchema>;

      const role = await loadRole(roleId);
      await assertCanGrantRole(req, role.id);

      const existing = await prisma.adminUser.findUnique({ where: { email } });
      if (existing) throw new ConflictError("An account with that email already exists");

      const created = await prisma.adminUser.create({
        data: { email, name, roleId, passwordHash: await hashPassword(plain) },
        select: safeSelect,
      });

      await writeAudit(req, {
        action: "admin.create",
        entity: "AdminUser",
        entityId: created.id,
        after: { email: created.email, role: role.name },
      });
      res.status(201).json({ item: created });
    } catch (err) {
      next(err);
    }
  }
);

adminUsersRouter.patch(
  "/:id",
  requirePermission("admin:write"),
  requireRecentAuth,
  validate({ params: idParam, body: updateSchema }),
  async (req, res, next) => {
    try {
      const id = param(req, "id");
      const before = await prisma.adminUser.findUnique({ where: { id }, select: safeSelect });
      if (!before) throw new NotFoundError("Administrator");

      const body = req.body as z.infer<typeof updateSchema>;
      const isSelf = id === req.user!.id;
      if (!isSelf) await assertCanActOn(req, before.role.id);

      // Locking yourself out is almost never intended, and changing
      // your own role is the simplest privilege escalation there is.
      if (isSelf && body.isActive === false) {
        throw new BadRequestError("You cannot disable your own account");
      }
      if (isSelf && body.roleId && body.roleId !== before.role.id) {
        throw new BadRequestError("You cannot change your own role");
      }

      if (body.roleId && body.roleId !== before.role.id) {
        const role = await loadRole(body.roleId);
        await assertCanGrantRole(req, role.id);

        // Demoting the last Super Admin leaves nobody who can manage
        // administrators or roles.
        if (before.role.name === SUPER_ADMIN_ROLE && role.name !== SUPER_ADMIN_ROLE) {
          await assertNotLastSuperAdmin(id, "change the role of");
        }
      }

      if (body.isActive === false && before.role.name === SUPER_ADMIN_ROLE) {
        await assertNotLastSuperAdmin(id, "disable");
      }

      const after = await prisma.adminUser.update({
        where: { id },
        data: body,
        select: safeSelect,
      });

      // Disabling an account, or changing what it may do, must take
      // effect now rather than when its access token happens to expire.
      if (body.isActive === false || (body.roleId && body.roleId !== before.role.id)) {
        await revokeSessions(id);
      }

      await writeAudit(req, {
        action: "admin.update",
        entity: "AdminUser",
        entityId: after.id,
        before,
        after,
      });
      res.json({ item: after });
    } catch (err) {
      next(err);
    }
  }
);

adminUsersRouter.post(
  "/:id/reset-password",
  requirePermission("admin:write"),
  requireRecentAuth,
  validate({ params: idParam, body: resetSchema }),
  async (req, res, next) => {
    try {
      const target = await prisma.adminUser.findUnique({ where: { id: param(req, "id") } });
      if (!target) throw new NotFoundError("Administrator");
      if (target.id === req.user!.id) {
        throw new BadRequestError("Change your own password from Your account, with your current password");
      }
      await assertCanActOn(req, target.roleId);

      await prisma.adminUser.update({
        where: { id: target.id },
        data: {
          passwordHash: await hashPassword((req.body as { password: string }).password),
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });
      await revokeSessions(target.id);

      await writeAudit(req, {
        action: "admin.reset_password",
        entity: "AdminUser",
        entityId: target.id,
      });
      res.json({ message: "Password reset. Their other sessions were ended." });
    } catch (err) {
      next(err);
    }
  }
);

/** Ends every session for an account, without changing its password. */
adminUsersRouter.post(
  "/:id/revoke-sessions",
  requirePermission("admin:write"),
  requireRecentAuth,
  validate({ params: idParam }),
  async (req, res, next) => {
    try {
      const id = param(req, "id");
      const target = await prisma.adminUser.findUnique({
        where: { id },
        select: { id: true, email: true, roleId: true },
      });
      if (!target) throw new NotFoundError("Administrator");
      if (target.id !== req.user!.id) await assertCanActOn(req, target.roleId);

      const revoked = await revokeSessions(id);

      await writeAudit(req, {
        action: "admin.revoke_sessions",
        entity: "AdminUser",
        entityId: id,
        after: { revoked },
      });
      res.json({
        revoked,
        message:
          id === req.user!.id
            ? "Your other sessions were ended. This one will end when its token next refreshes."
            : `Ended ${revoked} session(s).`,
      });
    } catch (err) {
      next(err);
    }
  }
);

/** Clears a lockout after repeated failed sign-ins. */
adminUsersRouter.post(
  "/:id/unlock",
  requirePermission("admin:write"),
  requireRecentAuth,
  validate({ params: idParam }),
  async (req, res, next) => {
    try {
      const id = param(req, "id");
      const target = await prisma.adminUser.findUnique({
        where: { id },
        select: { id: true, lockedUntil: true, failedLoginCount: true },
      });
      if (!target) throw new NotFoundError("Administrator");

      await prisma.adminUser.update({
        where: { id },
        data: { lockedUntil: null, failedLoginCount: 0 },
      });
      await writeAudit(req, {
        action: "admin.unlock",
        entity: "AdminUser",
        entityId: id,
        before: { lockedUntil: target.lockedUntil, failedLoginCount: target.failedLoginCount },
      });
      res.json({ message: "Account unlocked." });
    } catch (err) {
      next(err);
    }
  }
);

adminUsersRouter.delete(
  "/:id",
  requirePermission("admin:delete"),
  requireRecentAuth,
  validate({ params: idParam }),
  async (req, res, next) => {
    try {
      const id = param(req, "id");
      if (id === req.user!.id) {
        throw new BadRequestError("You cannot delete your own account");
      }

      const before = await prisma.adminUser.findUnique({ where: { id }, select: safeSelect });
      if (!before) throw new NotFoundError("Administrator");
      await assertCanActOn(req, before.role.id);

      if (before.role.name === SUPER_ADMIN_ROLE) {
        await assertNotLastSuperAdmin(id, "delete");
      }

      await prisma.adminUser.delete({ where: { id } });
      await writeAudit(req, {
        action: "admin.delete",
        entity: "AdminUser",
        entityId: id,
        before,
      });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

/* ── Helpers ─────────────────────────────────────────────────── */

async function loadRole(roleId: string) {
  const role = await prisma.role.findUnique({ where: { id: roleId }, select: { id: true, name: true } });
  if (!role) throw new BadRequestError("That role does not exist");
  return role;
}

/**
 * Refuses to put somebody into a role that holds permissions the
 * caller does not hold. Otherwise an administrator with admin:write
 * could create an account more powerful than their own and sign in
 * as it.
 */
async function assertCanGrantRole(req: import("express").Request, roleId: string): Promise<void> {
  const rows = await prisma.rolePermission.findMany({
    where: { roleId },
    select: { permission: { select: { key: true } } },
  });
  const held = new Set(req.user!.permissions);
  const gained = rows.map((r) => r.permission.key).filter((k) => !held.has(k));

  if (gained.length > 0) {
    throw new BadRequestError(
      `That role holds permissions you do not: ${gained.join(", ")}. You cannot assign it.`
    );
  }
}

/**
 * Refuses to act on an account whose role holds a permission the
 * caller lacks. Resetting such an account's password, disabling it or
 * ending its sessions would let a lesser administrator take over or
 * lock out a greater one. Same rule as granting: you cannot touch
 * authority you do not hold.
 */
async function assertCanActOn(req: import("express").Request, targetRoleId: string): Promise<void> {
  const rows = await prisma.rolePermission.findMany({
    where: { roleId: targetRoleId },
    select: { permission: { select: { key: true } } },
  });
  const held = new Set(req.user!.permissions);
  const beyond = rows.map((r) => r.permission.key).filter((k) => !held.has(k));
  if (beyond.length > 0) {
    throw new ForbiddenError("That administrator holds permissions you do not. You cannot manage their account.");
  }
}

/** The portal must always have at least one administrator who can run it. */
async function assertNotLastSuperAdmin(excludingId: string, verb: string): Promise<void> {
  const others = await prisma.adminUser.count({
    where: { id: { not: excludingId }, isActive: true, role: { name: SUPER_ADMIN_ROLE } },
  });
  if (others === 0) {
    throw new BadRequestError(
      `This is the last active Super Admin. Promote another account before you ${verb} it.`
    );
  }
}

/**
 * Ends every session for an account.
 *
 * Revokes the refresh tokens AND stamps sessionsValidFrom, which is
 * what actually stops the access token already in the browser: that
 * token is stateless, so without the stamp it would keep working
 * until it expired.
 */
async function revokeSessions(userId: string): Promise<number> {
  const [{ count }] = await prisma.$transaction([
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.adminUser.update({
      where: { id: userId },
      data: { sessionsValidFrom: new Date() },
    }),
  ]);
  return count;
}

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { writeAudit } from "../../lib/audit.js";
import { assessPassword, hashPassword } from "../../lib/password.js";
import { BadRequestError, ConflictError, NotFoundError } from "../../lib/errors.js";
import { paginated, skipTake } from "../../lib/pagination.js";
import { param } from "../../lib/params.js";

const idParam = z.object({ id: z.string().min(1) });

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
});

const password = z.string().min(12).max(200).superRefine((v, ctx) => {
  for (const problem of assessPassword(v)) {
    ctx.addIssue({ code: "custom", message: `Password ${problem}` });
  }
});

const createSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(200),
    name: z.string().trim().min(2).max(120),
    password,
    roleId: z.string().min(1),
  })
  .strict();

const updateSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
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
      const { page, perPage, search } = req.query as unknown as z.infer<typeof listQuery>;
      const where = search
        ? {
            OR: [
              { email: { contains: search, mode: "insensitive" as const } },
              { name: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {};

      const [items, total] = await Promise.all([
        prisma.adminUser.findMany({
          where,
          orderBy: { createdAt: "desc" },
          ...skipTake({ page, perPage }),
          select: safeSelect,
        }),
        prisma.adminUser.count({ where }),
      ]);
      res.json(paginated(items, total, { page, perPage }));
    } catch (err) {
      next(err);
    }
  }
);

adminUsersRouter.post(
  "/",
  requirePermission("admin:write"),
  validate({ body: createSchema }),
  async (req, res, next) => {
    try {
      const { email, name, password: plain, roleId } = req.body;

      const role = await prisma.role.findUnique({ where: { id: roleId } });
      if (!role) throw new BadRequestError("That role does not exist");

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
  validate({ params: idParam, body: updateSchema }),
  async (req, res, next) => {
    try {
      const before = await prisma.adminUser.findUnique({
        where: { id: param(req, "id") },
        select: safeSelect,
      });
      if (!before) throw new NotFoundError("Administrator");

      // Locking yourself out is almost never intended.
      if (param(req, "id") === req.user!.id && req.body.isActive === false) {
        throw new BadRequestError("You cannot disable your own account");
      }
      if (param(req, "id") === req.user!.id && req.body.roleId && req.body.roleId !== before.role.id) {
        throw new BadRequestError("You cannot change your own role");
      }

      const after = await prisma.adminUser.update({
        where: { id: param(req, "id") },
        data: req.body,
        select: safeSelect,
      });

      // Disabling an account must end its sessions immediately.
      if (req.body.isActive === false) {
        await prisma.refreshToken.updateMany({
          where: { userId: param(req, "id"), revokedAt: null },
          data: { revokedAt: new Date() },
        });
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
  validate({ params: idParam, body: resetSchema }),
  async (req, res, next) => {
    try {
      const target = await prisma.adminUser.findUnique({ where: { id: param(req, "id") } });
      if (!target) throw new NotFoundError("Administrator");

      await prisma.adminUser.update({
        where: { id: target.id },
        data: {
          passwordHash: await hashPassword(req.body.password),
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });
      await prisma.refreshToken.updateMany({
        where: { userId: target.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

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

adminUsersRouter.delete(
  "/:id",
  requirePermission("admin:delete"),
  validate({ params: idParam }),
  async (req, res, next) => {
    try {
      if (param(req, "id") === req.user!.id) {
        throw new BadRequestError("You cannot delete your own account");
      }
      const before = await prisma.adminUser.findUnique({
        where: { id: param(req, "id") },
        select: safeSelect,
      });
      if (!before) throw new NotFoundError("Administrator");

      const superAdmins = await prisma.adminUser.count({
        where: { isActive: true, role: { name: "Super Admin" } },
      });
      if (before.role.name === "Super Admin" && superAdmins <= 1) {
        throw new BadRequestError("Cannot remove the last active Super Admin");
      }

      await prisma.adminUser.delete({ where: { id: param(req, "id") } });
      await writeAudit(req, {
        action: "admin.delete",
        entity: "AdminUser",
        entityId: param(req, "id"),
        before,
      });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

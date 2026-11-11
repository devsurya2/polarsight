/**
 * Roles and permissions.
 *
 * Permissions are granted to roles, and roles to administrators. The
 * API enforces them on every protected route; the admin portal only
 * hides what it knows is unavailable.
 *
 * Two invariants are defended here:
 *  - the Super Admin role always holds every permission, so there is
 *    always a way back into the portal
 *  - nobody can raise their own privileges, directly or by editing
 *    the role they happen to hold
 */

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { requireRecentAuth } from "../../middleware/reauth.js";
import { writeAudit } from "../../lib/audit.js";
import { BadRequestError, ConflictError, NotFoundError } from "../../lib/errors.js";
import { param } from "../../lib/params.js";
import { requiredSafeText, safeText } from "../../lib/sanitize.js";

export const SUPER_ADMIN_ROLE = "Super Admin";

const idParam = z.object({ id: z.string().min(1) });

const createRoleSchema = z
  .object({
    name: requiredSafeText(80, "Role name"),
    description: safeText(300, "Description").nullish(),
    permissionKeys: z.array(z.string().min(1).max(80)).max(200).default([]),
  })
  .strict();

const updateRoleSchema = z
  .object({
    name: requiredSafeText(80, "Role name").optional(),
    description: safeText(300, "Description").nullish(),
  })
  .strict();

const updatePermissionsSchema = z
  .object({ permissionKeys: z.array(z.string().min(1).max(80)).max(200) })
  .strict();

export const rolesRouter = Router();
rolesRouter.use(requireAuth);

const shape = (r: {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  _count: { users: number };
  permissions: Array<{ permission: { key: string } }>;
}) => ({
  id: r.id,
  name: r.name,
  description: r.description,
  isSystem: r.isSystem,
  userCount: r._count.users,
  permissions: r.permissions.map((rp) => rp.permission.key),
});

const roleInclude = {
  permissions: { include: { permission: true } },
  _count: { select: { users: true } },
} as const;

rolesRouter.get("/", requirePermission("role:read"), async (_req, res, next) => {
  try {
    const roles = await prisma.role.findMany({ orderBy: { name: "asc" }, include: roleInclude });
    res.json({ items: roles.map(shape) });
  } catch (err) {
    next(err);
  }
});

/** Every permission the system defines, grouped for the editor. */
rolesRouter.get("/permissions", requirePermission("role:read"), async (_req, res, next) => {
  try {
    const permissions = await prisma.permission.findMany({
      orderBy: [{ group: "asc" }, { key: "asc" }],
    });
    const groups = permissions.reduce<Record<string, typeof permissions>>((acc, p) => {
      (acc[p.group] ??= []).push(p);
      return acc;
    }, {});
    res.json({ groups });
  } catch (err) {
    next(err);
  }
});

rolesRouter.post(
  "/",
  requirePermission("role:write"),
  requireRecentAuth,
  validate({ body: createRoleSchema }),
  async (req, res, next) => {
    try {
      const { name, description, permissionKeys } = req.body as z.infer<typeof createRoleSchema>;

      if (name.toLowerCase() === SUPER_ADMIN_ROLE.toLowerCase()) {
        throw new ConflictError("A role with that name already exists");
      }

      const granted = await resolvePermissions(permissionKeys);
      assertNoSelfElevation(req, granted.map((p) => p.key));

      const role = await prisma.$transaction(async (tx) => {
        const created = await tx.role.create({
          data: { name, description: description ?? null, isSystem: false },
        });
        if (granted.length) {
          await tx.rolePermission.createMany({
            data: granted.map((p) => ({ roleId: created.id, permissionId: p.id })),
          });
        }
        return created;
      });

      await writeAudit(req, {
        action: "role.create",
        entity: "Role",
        entityId: role.id,
        after: { name: role.name, permissions: granted.map((p) => p.key) },
      });

      const full = await prisma.role.findUniqueOrThrow({
        where: { id: role.id },
        include: roleInclude,
      });
      res.status(201).json({ item: shape(full) });
    } catch (err) {
      next(err);
    }
  }
);

rolesRouter.patch(
  "/:id",
  requirePermission("role:write"),
  requireRecentAuth,
  validate({ params: idParam, body: updateRoleSchema }),
  async (req, res, next) => {
    try {
      const role = await load(param(req, "id"));

      // A system role's name is referenced in code and in the seed;
      // renaming one would break those references silently.
      if (role.isSystem && req.body.name && req.body.name !== role.name) {
        throw new BadRequestError(`"${role.name}" is a system role and cannot be renamed`);
      }

      const after = await prisma.role.update({
        where: { id: role.id },
        data: req.body,
        include: roleInclude,
      });
      await writeAudit(req, {
        action: "role.update",
        entity: "Role",
        entityId: role.id,
        before: { name: role.name, description: role.description },
        after: { name: after.name, description: after.description },
      });
      res.json({ item: shape(after) });
    } catch (err) {
      next(err);
    }
  }
);

rolesRouter.put(
  "/:id/permissions",
  requirePermission("role:write"),
  requireRecentAuth,
  validate({ params: idParam, body: updatePermissionsSchema }),
  async (req, res, next) => {
    try {
      const role = await load(param(req, "id"));

      // Stripping Super Admin is a reliable way to lock everyone out.
      if (role.name === SUPER_ADMIN_ROLE) {
        throw new BadRequestError("The Super Admin role always holds every permission");
      }

      const { permissionKeys } = req.body as z.infer<typeof updatePermissionsSchema>;
      const granted = await resolvePermissions(permissionKeys);
      assertNoSelfElevation(req, granted.map((p) => p.key), role.id);

      await prisma.$transaction([
        prisma.rolePermission.deleteMany({ where: { roleId: role.id } }),
        ...(granted.length
          ? [
              prisma.rolePermission.createMany({
                data: granted.map((p) => ({ roleId: role.id, permissionId: p.id })),
              }),
            ]
          : []),
      ]);

      await writeAudit(req, {
        action: "role.permissions_updated",
        entity: "Role",
        entityId: role.id,
        before: { permissions: role.permissions.map((rp) => rp.permission.key) },
        after: { permissions: granted.map((p) => p.key) },
      });

      // Permissions are read from the role on every request, so this
      // is already in force for every session holding the role.
      res.json({
        id: role.id,
        permissions: granted.map((p) => p.key),
        note: "In effect immediately for every administrator with this role.",
      });
    } catch (err) {
      next(err);
    }
  }
);

rolesRouter.delete(
  "/:id",
  requirePermission("role:write"),
  requireRecentAuth,
  validate({ params: idParam }),
  async (req, res, next) => {
    try {
      const role = await load(param(req, "id"));

      if (role.isSystem) {
        throw new BadRequestError(`"${role.name}" is a system role and cannot be deleted`);
      }
      if (role._count.users > 0) {
        throw new ConflictError(
          `${role._count.users} administrator(s) hold this role. Move them to another role first.`
        );
      }

      await prisma.role.delete({ where: { id: role.id } });
      await writeAudit(req, {
        action: "role.delete",
        entity: "Role",
        entityId: role.id,
        before: { name: role.name },
      });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

/* ── Helpers ─────────────────────────────────────────────────── */

async function load(id: string) {
  const role = await prisma.role.findUnique({ where: { id }, include: roleInclude });
  if (!role) throw new NotFoundError("Role");
  return role;
}

/** Turns permission keys into rows, refusing any that do not exist. */
async function resolvePermissions(keys: string[]) {
  const unique = [...new Set(keys)];
  if (unique.length === 0) return [];

  const found = await prisma.permission.findMany({ where: { key: { in: unique } } });
  if (found.length !== unique.length) {
    const missing = unique.filter((k) => !found.some((p) => p.key === k));
    throw new BadRequestError(`Unknown permission(s): ${missing.join(", ")}`);
  }
  return found;
}

/**
 * Refuses a change that would hand out a permission the caller does
 * not themselves hold.
 *
 * Without this, an administrator with role:write could grant a role
 * admin:write and then assign themselves that role, escalating to
 * full control. The rule is simply "you cannot delegate authority you
 * do not have", which is also why it needs no special case: a Super
 * Admin holds every permission, so it never constrains them.
 */
function assertNoSelfElevation(
  req: import("express").Request,
  grantedKeys: string[],
  _roleId?: string
): void {
  const held = new Set(req.user!.permissions);
  const gained = grantedKeys.filter((k) => !held.has(k));
  if (gained.length > 0) {
    throw new BadRequestError(
      `You cannot grant permissions you do not hold yourself: ${gained.join(", ")}`
    );
  }
}

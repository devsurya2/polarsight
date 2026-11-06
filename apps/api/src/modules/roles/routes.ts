import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { writeAudit } from "../../lib/audit.js";
import { BadRequestError, NotFoundError } from "../../lib/errors.js";
import { param } from "../../lib/params.js";

const idParam = z.object({ id: z.string().min(1) });

const updatePermissionsSchema = z
  .object({ permissionKeys: z.array(z.string().min(1)).max(200) })
  .strict();

export const rolesRouter = Router();
rolesRouter.use(requireAuth);

rolesRouter.get("/", requirePermission("role:read"), async (_req, res, next) => {
  try {
    const roles = await prisma.role.findMany({
      orderBy: { name: "asc" },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    });
    res.json({
      items: roles.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        isSystem: r.isSystem,
        userCount: r._count.users,
        permissions: r.permissions.map((rp) => rp.permission.key),
      })),
    });
  } catch (err) {
    next(err);
  }
});

rolesRouter.get("/permissions", requirePermission("role:read"), async (_req, res, next) => {
  try {
    const permissions = await prisma.permission.findMany({ orderBy: [{ group: "asc" }, { key: "asc" }] });
    const grouped = permissions.reduce<Record<string, typeof permissions>>((acc, p) => {
      (acc[p.group] ??= []).push(p);
      return acc;
    }, {});
    res.json({ groups: grouped });
  } catch (err) {
    next(err);
  }
});

rolesRouter.put(
  "/:id/permissions",
  requirePermission("role:write"),
  validate({ params: idParam, body: updatePermissionsSchema }),
  async (req, res, next) => {
    try {
      const role = await prisma.role.findUnique({
        where: { id: param(req, "id") },
        include: { permissions: { include: { permission: true } } },
      });
      if (!role) throw new NotFoundError("Role");

      // Stripping the Super Admin role is a reliable way to lock
      // everyone out of the portal.
      if (role.name === "Super Admin") {
        throw new BadRequestError("The Super Admin role always holds every permission");
      }

      const wanted = await prisma.permission.findMany({
        where: { key: { in: req.body.permissionKeys } },
      });
      if (wanted.length !== req.body.permissionKeys.length) {
        throw new BadRequestError("One or more permission keys do not exist");
      }

      await prisma.$transaction([
        prisma.rolePermission.deleteMany({ where: { roleId: role.id } }),
        prisma.rolePermission.createMany({
          data: wanted.map((p) => ({ roleId: role.id, permissionId: p.id })),
        }),
      ]);

      await writeAudit(req, {
        action: "role.permissions_updated",
        entity: "Role",
        entityId: role.id,
        before: { permissions: role.permissions.map((rp) => rp.permission.key) },
        after: { permissions: wanted.map((p) => p.key) },
      });

      res.json({ id: role.id, permissions: wanted.map((p) => p.key) });
    } catch (err) {
      next(err);
    }
  }
);

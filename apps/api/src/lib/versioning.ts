/**
 * Content version history.
 *
 * A snapshot is written whenever editable content is published, and on
 * demand before a risky edit. Snapshots are append-only: restoring
 * one writes its payload back into the record's *draft*, leaving the
 * live published value untouched until someone publishes again. That
 * way a rollback is itself reviewable, and an accidental restore
 * cannot change the public site on its own.
 *
 * There is no API that edits or deletes a snapshot.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { NotFoundError } from "./errors.js";

/** Entities that carry version history. */
export type VersionedEntity = "SitePage" | "WebsiteContent" | "Programme";

interface SnapshotInput {
  entity: VersionedEntity;
  entityId: string;
  payload: unknown;
  label?: string | undefined;
  actorId?: string | null | undefined;
}

/**
 * Records a snapshot and returns it. The version number is allocated
 * inside a transaction so two concurrent publishes cannot collide on
 * the same number.
 */
export async function snapshot(
  input: SnapshotInput,
  tx?: Prisma.TransactionClient
): Promise<{ id: string; version: number }> {
  const run = async (client: Prisma.TransactionClient) => {
    const latest = await client.contentVersion.findFirst({
      where: { entity: input.entity, entityId: input.entityId },
      orderBy: { version: "desc" },
      select: { version: true },
    });

    return client.contentVersion.create({
      data: {
        entity: input.entity,
        entityId: input.entityId,
        version: (latest?.version ?? 0) + 1,
        label: input.label ?? null,
        payload: (input.payload ?? {}) as Prisma.InputJsonValue,
        actorId: input.actorId ?? null,
      },
      select: { id: true, version: true },
    });
  };

  return tx ? run(tx) : prisma.$transaction(run);
}

export async function listVersions(
  entity: VersionedEntity,
  entityId: string,
  limit = 50
) {
  return prisma.contentVersion.findMany({
    where: { entity, entityId },
    orderBy: { version: "desc" },
    take: limit,
    select: {
      id: true,
      version: true,
      label: true,
      createdAt: true,
      actor: { select: { id: true, name: true, email: true } },
    },
  });
}

export async function getVersion(entity: VersionedEntity, entityId: string, version: number) {
  const found = await prisma.contentVersion.findUnique({
    where: { entity_entityId_version: { entity, entityId, version } },
  });
  if (!found) throw new NotFoundError("Version");
  return found;
}

/**
 * Keeps history bounded. Called after a publish; retains the most
 * recent `keep` snapshots for an entity and removes older ones.
 * Deliberately generous, because storage is cheap and an audit trail
 * that silently discards recent history is worse than useless.
 */
export async function pruneVersions(
  entity: VersionedEntity,
  entityId: string,
  keep = 50
): Promise<number> {
  const survivors = await prisma.contentVersion.findMany({
    where: { entity, entityId },
    orderBy: { version: "desc" },
    take: keep,
    select: { version: true },
  });
  if (survivors.length < keep) return 0;

  const floor = survivors.at(-1)!.version;
  const { count } = await prisma.contentVersion.deleteMany({
    where: { entity, entityId, version: { lt: floor } },
  });
  return count;
}

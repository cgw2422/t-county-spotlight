import { db } from "./db";
import type { Prisma } from "@/generated/prisma/client";

export async function audit(
  userId: string | null | undefined,
  action: string,
  entityType?: string,
  entityId?: string,
  details?: Prisma.InputJsonValue,
) {
  try {
    await db.auditLog.create({ data: { userId: userId ?? null, action, entityType, entityId, details } });
  } catch (e) {
    console.error("[audit] failed", e);
  }
}

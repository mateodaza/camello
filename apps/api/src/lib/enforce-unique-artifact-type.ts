import { sql, eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { artifacts } from '@camello/db';
import type { TenantTransaction } from '@camello/db';

/**
 * Inside an existing transaction, acquires a per-(tenant,type) advisory lock
 * and checks that no other artifact of the same type exists.
 *
 * @param excludeId — pass the current artifact's ID when called from update
 *                     (so it doesn't conflict with itself).
 */
export async function enforceUniqueArtifactType(
  tx: TenantTransaction,
  tenantId: string,
  type: string,
  excludeId?: string,
): Promise<void> {
  // 1. Advisory lock: serialize per (tenantId, type) — released on COMMIT
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${type}))`,
  );

  // 2. Check for existing artifact of same type
  const conditions = [eq(artifacts.tenantId, tenantId), eq(artifacts.type, type)];
  if (excludeId) {
    conditions.push(sql`${artifacts.id} != ${excludeId}`);
  }

  const existing = await tx
    .select({ id: artifacts.id })
    .from(artifacts)
    .where(and(...conditions))
    .limit(1);

  if (existing.length > 0) {
    throw new TRPCError({ code: 'CONFLICT', message: 'An artifact of this type already exists' });
  }
}

import { v5 as uuidv5 } from 'uuid';
import { eq, and, sql } from 'drizzle-orm';
import { createTenantDb, tenants, tenantMembers, customers } from '@camello/db';
import { COST_BUDGET_DEFAULTS } from '@camello/shared/constants';
import { clerk } from '../lib/clerk.js';
import { clearOrgCache } from '../trpc/context.js';

// Stable namespace for deterministic UUIDv5 derivation.
// Both the Clerk webhook and the onboarding.provision mutation produce
// the same tenant UUID for a given orgId, eliminating race-condition orphans.
const CAMELLO_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

const MAX_SLUG_RETRIES = 3;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/** Deterministically derive a tenant UUID from a Clerk org ID. */
export function orgIdToTenantId(orgId: string): string {
  return uuidv5(orgId, CAMELLO_NAMESPACE);
}

/** Generate a URL-safe slug from a name with a random 4-char suffix. */
export function deriveSlug(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 6);
  return base ? `${base}-${suffix}` : `tenant-${suffix}`;
}

// ---------------------------------------------------------------------------
// provisionTenant
// ---------------------------------------------------------------------------

export interface ProvisionInput {
  orgId: string;
  orgName: string;
  orgSlug?: string | null;
  creatorUserId?: string | null;
  ownerEmail?: string | null;
}

export interface ProvisionResult {
  tenantId: string;
  previewCustomerId: string | null;
  alreadyExisted: boolean;
}

/**
 * Idempotent tenant provisioning — safe to call from both the Clerk
 * webhook and the onboarding wizard's `provision` mutation concurrently.
 *
 * Deterministic UUIDv5 + ON CONFLICT (id) DO NOTHING ensures both paths
 * converge on the same row.
 */
export async function provisionTenant(input: ProvisionInput): Promise<ProvisionResult> {
  const { orgId, orgName, orgSlug, creatorUserId, ownerEmail } = input;
  let tenantId = orgIdToTenantId(orgId);

  // --- 0. Check for legacy pre-wizard org ---
  // Orgs provisioned before deterministic UUIDs may have a manually-set
  // camello_tenant_id that differs from the UUIDv5 derivation. If that
  // tenant row actually exists in the DB, adopt it instead of creating a new one.
  const org = await clerk.organizations.getOrganization({ organizationId: orgId });
  const existingMetaTenantId = (org.publicMetadata as Record<string, unknown>)?.camello_tenant_id;

  if (typeof existingMetaTenantId === 'string' && existingMetaTenantId && existingMetaTenantId !== tenantId) {
    // P2: Validate UUID format before passing to createTenantDb (which throws on non-UUID)
    if (!UUID_RE.test(existingMetaTenantId)) {
      console.error(
        `[provisioning] INVALID METADATA orgId=${orgId} camello_tenant_id=${existingMetaTenantId} is not a valid UUID`,
      );
      throw new Error(
        `Clerk org ${orgId} metadata has malformed camello_tenant_id=${existingMetaTenantId}`,
      );
    }

    const legacyDb = createTenantDb(existingMetaTenantId);
    const legacyRow = await legacyDb.query(async (db) => {
      return db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, existingMetaTenantId)).limit(1);
    });

    if (legacyRow.length > 0) {
      // P1: Only adopt if tenant has zero members (fresh seed). If it has
      // members, require the caller to be one of them. This blocks both
      // null-creator webhook paths and non-member callers from binding to
      // an already-occupied tenant.
      //
      // Two separate queries to avoid false rejections: `.limit(1)` on a
      // single query + `.some()` would only check the first returned row,
      // missing valid members when they aren't the first row.
      const hasAnyMembers = await legacyDb.query(async (db) => {
        return db
          .select({ id: tenantMembers.id })
          .from(tenantMembers)
          .where(eq(tenantMembers.tenantId, existingMetaTenantId))
          .limit(1);
      });

      if (hasAnyMembers.length > 0) {
        // Tenant is occupied — caller must be an existing member
        if (creatorUserId == null) {
          console.error(
            `[provisioning] ADOPTION BLOCKED orgId=${orgId} user=(null) tenant=${existingMetaTenantId} has existing members`,
          );
          throw new Error(
            `Cannot adopt tenant ${existingMetaTenantId}: caller is not an existing member`,
          );
        }

        const callerMembership = await legacyDb.query(async (db) => {
          return db
            .select({ id: tenantMembers.id })
            .from(tenantMembers)
            .where(
              and(
                eq(tenantMembers.tenantId, existingMetaTenantId),
                eq(tenantMembers.userId, creatorUserId),
              ),
            )
            .limit(1);
        });

        if (callerMembership.length === 0) {
          console.error(
            `[provisioning] ADOPTION BLOCKED orgId=${orgId} user=${creatorUserId} tenant=${existingMetaTenantId} has existing members`,
          );
          throw new Error(
            `Cannot adopt tenant ${existingMetaTenantId}: caller is not an existing member`,
          );
        }
      }

      console.info(
        `[provisioning] Legacy org: orgId=${orgId} adopting tenantId=${existingMetaTenantId} (deterministic=${tenantId})`,
      );
      tenantId = existingMetaTenantId;
    } else {
      // Metadata points to a non-existent tenant — actual corruption
      console.error(
        `[provisioning] METADATA MISMATCH orgId=${orgId} expected=${tenantId} found=${existingMetaTenantId} (row missing)`,
      );
      throw new Error(
        `Clerk org ${orgId} metadata has camello_tenant_id=${existingMetaTenantId} but that tenant does not exist`,
      );
    }
  }

  // --- 1. Insert tenant row (idempotent via ON CONFLICT (id) DO NOTHING) ---
  let alreadyExisted = false;
  let slug = deriveSlug(orgSlug ?? orgName);

  const tenantDb = createTenantDb(tenantId);

  for (let attempt = 0; attempt < MAX_SLUG_RETRIES; attempt++) {
    try {
      const inserted = await tenantDb.transaction(async (tx) => {
        const rows = await tx
          .insert(tenants)
          .values({
            id: tenantId,
            name: orgName,
            slug,
            planTier: 'starter',
            monthlyCostBudgetUsd: String(COST_BUDGET_DEFAULTS.starter),
            settings: { onboardingComplete: false, ownerEmail: ownerEmail ?? null },
          })
          .onConflictDoNothing({ target: tenants.id })
          .returning({ id: tenants.id });

        return rows.length > 0; // true = newly inserted, false = already existed
      });

      alreadyExisted = !inserted;
      break;
    } catch (err: unknown) {
      // Slug unique violation (code 23505, constraint on tenants.slug)
      const pgErr = err as { code?: string; constraint?: string };
      if (pgErr.code === '23505' && attempt < MAX_SLUG_RETRIES - 1) {
        slug = deriveSlug(orgSlug ?? orgName); // retry with new random suffix
        continue;
      }
      throw err;
    }
  }

  // --- 1b. Patch ownerEmail into settings if tenant pre-existed and caller has an email ---
  if (alreadyExisted && ownerEmail) {
    await tenantDb.query(async (db) => {
      await db
        .update(tenants)
        .set({
          settings: sql`COALESCE(settings, '{}'::jsonb) || ${JSON.stringify({ ownerEmail })}::jsonb`,
          updatedAt: new Date(),
        })
        .where(eq(tenants.id, tenantId));
    });
  }

  // --- 2. Insert tenant member (owner) ---
  let previewCustomerId: string | null = null;

  if (creatorUserId) {
    await tenantDb.transaction(async (tx) => {
      await tx
        .insert(tenantMembers)
        .values({ tenantId, userId: creatorUserId, role: 'owner' })
        .onConflictDoNothing();

      // --- 3. Insert preview customer for Step 5 live test ---
      const custRows = await tx
        .insert(customers)
        .values({
          tenantId,
          externalId: creatorUserId,
          channel: 'webchat',
          name: 'Founder Preview',
        })
        .onConflictDoNothing()
        .returning({ id: customers.id });

      previewCustomerId = custRows[0]?.id ?? null;
    });

    // If ON CONFLICT hit (customer already existed), look it up
    if (!previewCustomerId) {
      const existing = await tenantDb.query(async (db) => {
        return db
          .select({ id: customers.id })
          .from(customers)
          .where(
            and(
              eq(customers.tenantId, tenantId),
              eq(customers.channel, 'webchat'),
              eq(customers.externalId, creatorUserId),
            ),
          )
          .limit(1);
      });
      previewCustomerId = existing[0]?.id ?? null;
    }
  }

  // --- 4. Sync Clerk org metadata (if not already set or legacy-adopted) ---
  if (!existingMetaTenantId || existingMetaTenantId !== tenantId) {
    await clerk.organizations.updateOrganizationMetadata(orgId, {
      publicMetadata: { camello_tenant_id: tenantId },
    });
  }

  // --- 5. Invalidate LRU cache ---
  clearOrgCache(orgId);

  return { tenantId, previewCustomerId, alreadyExisted };
}

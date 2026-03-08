import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { clerk } from '../lib/clerk.js';
import { createTenantDb, type TenantDb } from '@camello/db';

export interface Context {
  req: Request;
  /** Clerk user ID (e.g. "user_xxx"). Null if unauthenticated. */
  userId: string | null;
  /** Clerk organization ID (e.g. "org_xxx"). Null if no org selected. */
  orgId: string | null;
  /** Resolved full name of the authenticated user. Null if lookup failed or unauthenticated. Optional for backward compat with test contexts. */
  userFullName?: string | null;
  /** Clerk organization ID mapped to tenant UUID. Null if no org selected. */
  tenantId: string | null;
  /** Tenant-scoped DB helper. Null if no tenant context. */
  tenantDb: TenantDb | null;
}

// In-memory LRU cache: Clerk orgId → camello_tenant_id.
// This mapping only changes when org metadata is updated (rare — onboarding only).
// TTL keeps it fresh; max size prevents unbounded growth in long-lived processes.
const ORG_TENANT_CACHE = new Map<string, { tenantId: string; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_MAX_SIZE = 500;

/**
 * Invalidates a single org→tenant mapping from the LRU cache.
 * Called after provisioning writes camello_tenant_id to Clerk org metadata,
 * so the next request re-reads from Clerk immediately instead of waiting
 * for the 5-min TTL to expire.
 */
export function clearOrgCache(orgId: string): void {
  ORG_TENANT_CACHE.delete(orgId);
}

async function resolveOrgTenantId(orgId: string): Promise<string | null> {
  const cached = ORG_TENANT_CACHE.get(orgId);
  if (cached && Date.now() < cached.expiresAt) {
    // Move to end for LRU ordering (Map iterates in insertion order)
    ORG_TENANT_CACHE.delete(orgId);
    ORG_TENANT_CACHE.set(orgId, cached);
    return cached.tenantId;
  }

  const org = await clerk.organizations.getOrganization({ organizationId: orgId });
  const camelloTenantId = (org.publicMetadata as Record<string, unknown>)?.camello_tenant_id;

  if (typeof camelloTenantId === 'string' && camelloTenantId) {
    // Evict oldest entry if at capacity
    if (ORG_TENANT_CACHE.size >= CACHE_MAX_SIZE) {
      const oldest = ORG_TENANT_CACHE.keys().next().value;
      if (oldest !== undefined) ORG_TENANT_CACHE.delete(oldest);
    }
    ORG_TENANT_CACHE.set(orgId, { tenantId: camelloTenantId, expiresAt: Date.now() + CACHE_TTL_MS });
    return camelloTenantId;
  }
  return null;
}

/**
 * Creates tRPC context from the incoming request.
 *
 * Auth flow:
 * 1. Verify Clerk session JWT from Authorization header
 * 2. Extract orgId (Clerk Organization = Camello Tenant)
 * 3. Look up tenant UUID from org metadata (cached, 5min TTL)
 * 4. Create tenant-scoped DB helper with RLS context
 *
 * If auth fails or no org is selected, tenantId/tenantDb are null.
 * Protected procedures will reject unauthenticated requests.
 */
export async function createContext(opts: FetchCreateContextFnOptions): Promise<Context> {
  const { req } = opts;

  let userId: string | null = null;
  let orgId: string | null = null;
  let userFullName: string | null = null;
  let tenantId: string | null = null;
  let tenantDb: TenantDb | null = null;

  const authHeader = req.headers.get('authorization');
  if (authHeader) {
    let requestState;
    try {
      requestState = await clerk.authenticateRequest(req, {});
    } catch {
      // JWT verification failure → proceed as unauthenticated.
      // Protected procedures will reject via middleware.
      return { req, userId, orgId, userFullName, tenantId, tenantDb };
    }

    if (requestState.isSignedIn) {
      const { userId: clerkUserId, orgId: clerkOrgId } = requestState.toAuth();
      userId = clerkUserId;
      orgId = clerkOrgId ?? null;

      try {
        const user = await clerk.users.getUser(clerkUserId);
        userFullName = user.fullName ?? user.firstName ?? null;
      } catch (err) {
        console.error('[createContext] Clerk users.getUser failed:', err);
        // userFullName stays null — replyAsOwner will throw INTERNAL_SERVER_ERROR explicitly.
      }

      if (clerkOrgId) {
        // Let org resolution + tenant DB errors propagate as 500s
        // rather than silently downgrading authenticated users to unauthenticated.
        const resolved = await resolveOrgTenantId(clerkOrgId);
        if (resolved) {
          tenantId = resolved;
          tenantDb = createTenantDb(tenantId);
        }
      }
    }
  }

  return { req, userId, orgId, userFullName, tenantId, tenantDb };
}

import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { clerk } from '../lib/clerk.js';
import { createTenantDb, type TenantDb } from '@camello/db';

export interface Context {
  req: Request;
  /** Clerk user ID (e.g. "user_xxx"). Null if unauthenticated. */
  userId: string | null;
  /** Clerk organization ID mapped to tenant UUID. Null if no org selected. */
  tenantId: string | null;
  /** Tenant-scoped DB helper. Null if no tenant context. */
  tenantDb: TenantDb | null;
}

// In-memory cache: Clerk orgId → camello_tenant_id.
// This mapping only changes when org metadata is updated (rare — onboarding only).
// TTL keeps it fresh without hitting Clerk API on every request.
const ORG_TENANT_CACHE = new Map<string, { tenantId: string; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function resolveOrgTenantId(orgId: string): Promise<string | null> {
  const cached = ORG_TENANT_CACHE.get(orgId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.tenantId;
  }

  const org = await clerk.organizations.getOrganization({ organizationId: orgId });
  const camelloTenantId = (org.publicMetadata as Record<string, unknown>)?.camello_tenant_id;

  if (typeof camelloTenantId === 'string' && camelloTenantId) {
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
  let tenantId: string | null = null;
  let tenantDb: TenantDb | null = null;

  try {
    const authHeader = req.headers.get('authorization');
    if (authHeader) {
      const requestState = await clerk.authenticateRequest(req, {});

      if (requestState.isSignedIn) {
        const { userId: clerkUserId, orgId } = requestState.toAuth();
        userId = clerkUserId;

        if (orgId) {
          const resolved = await resolveOrgTenantId(orgId);
          if (resolved) {
            tenantId = resolved;
            tenantDb = createTenantDb(tenantId);
          }
        }
      }
    }
  } catch {
    // Auth failure → proceed as unauthenticated.
    // Protected procedures will reject via middleware.
  }

  return { req, userId, tenantId, tenantDb };
}

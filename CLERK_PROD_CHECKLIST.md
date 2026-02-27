# Clerk Production Keys Checklist (#41)

> Swap Clerk dev instance to production instance for `camello.xyz`.
> This document covers every env var, service, and manual step required.

---

## 1. Environment Variables Inventory

### `CLERK_SECRET_KEY`

| Attribute | Value |
|-----------|-------|
| **Current value pattern** | `sk_test_...` (dev instance) |
| **Production value pattern** | `sk_live_...` (prod instance) |
| **Used by** | `apps/api` |
| **Source code reference** | `apps/api/src/lib/clerk.ts:4` — `createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! })` |
| **Also referenced in** | `apps/api/src/trpc/context.ts:81` (via `clerk.authenticateRequest()`), `apps/api/src/services/tenant-provisioning.ts` (via `clerk.organizations.*`) |
| **Configured in** | Railway env vars (API service) |
| **`.env.example` files** | Root `.env.example:6`, `apps/api/.env.example:13`, `apps/web/.env.example:3` |
| **Action** | Replace with `sk_live_...` from Clerk prod instance in Railway API env vars |

### `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`

| Attribute | Value |
|-----------|-------|
| **Current value pattern** | `pk_test_...` (dev instance) |
| **Production value pattern** | `pk_live_...` (prod instance) |
| **Used by** | `apps/web` (frontend auth), `apps/api` (backend client) |
| **Source code references** | `apps/api/src/lib/clerk.ts:5` — `createClerkClient({ publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY! })`. Implicitly used by `@clerk/nextjs` in `apps/web` (ClerkProvider, middleware, useAuth, etc.) |
| **Configured in** | Vercel env vars (web), Railway env vars (API service) |
| **`.env.example` files** | Root `.env.example:5`, `apps/api/.env.example:14`, `apps/web/.env.example:2` |
| **Action** | Replace with `pk_live_...` from Clerk prod instance in **both** Vercel (web) and Railway (API) env vars |

### `CLERK_WEBHOOK_SECRET`

| Attribute | Value |
|-----------|-------|
| **Current value pattern** | `whsec_...` (Svix signing secret from dev webhook endpoint) |
| **Production value pattern** | `whsec_...` (new Svix signing secret from prod webhook endpoint) |
| **Used by** | `apps/api` |
| **Source code reference** | `apps/api/src/webhooks/clerk.ts:39` — `const secret = process.env.CLERK_WEBHOOK_SECRET` |
| **Configured in** | Railway env vars (API service) |
| **`.env.example` files** | Root `.env.example:7`, `apps/api/.env.example:15` |
| **Action** | After registering the webhook endpoint in the Clerk prod instance (see Section 2), copy the new Svix signing secret to Railway API env vars |

### `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `NEXT_PUBLIC_CLERK_SIGN_UP_URL`

| Attribute | Value |
|-----------|-------|
| **Current status** | Not explicitly set in codebase or `.env.example` files |
| **Used by** | `@clerk/nextjs` (implicit defaults to `/sign-in` and `/sign-up`) |
| **Action** | No change needed unless custom sign-in/sign-up routes are added. Clerk defaults work with both dev and prod instances. |

### `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` / `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL`

| Attribute | Value |
|-----------|-------|
| **Current status** | Not explicitly set in codebase or `.env.example` files |
| **Used by** | `@clerk/nextjs` (implicit defaults) |
| **Action** | No change needed. Post-auth redirect is handled by middleware + route matchers. |

### Services that do NOT use Clerk

| Service | Confirmation |
|---------|-------------|
| `apps/jobs` | Grep confirmed: zero `CLERK_` references. Jobs worker uses `DATABASE_URL_SERVICE_ROLE` only. |
| `apps/widget` | Grep confirmed: zero `CLERK_` references. Widget uses its own JWT (`WIDGET_JWT_SECRET`). |

---

## 2. Webhook Re-Registration

### Current webhook endpoint
- **URL:** `https://api.camello.xyz/api/webhooks/clerk`
- **Events subscribed:** `organization.created`
- **Registered in:** Clerk dev instance dashboard

### Steps to re-register
1. Open the Clerk **production** instance dashboard
2. Navigate to **Webhooks** > **Add Endpoint**
3. Set endpoint URL: `https://api.camello.xyz/api/webhooks/clerk`
4. Subscribe to event: `organization.created`
5. Copy the new **Signing Secret** (`whsec_...`) from the endpoint details
6. Update `CLERK_WEBHOOK_SECRET` in Railway API env vars with the new secret
7. Trigger a test event from the Clerk dashboard to verify

### Svix signing secret change
The Svix signing secret is instance-specific. The dev instance secret will NOT work with the prod instance. The webhook handler in `apps/api/src/webhooks/clerk.ts` uses `new Webhook(secret)` from the `svix` package, which will reject events signed with the wrong secret. This is why Step 6 above is critical.

---

## 3. Clerk Organization Metadata Re-Provisioning

### How it works
- When a Clerk org is created, the webhook fires `organization.created`
- `provisionTenant()` creates a tenant row in Supabase and writes `camello_tenant_id` to the org's `publicMetadata`
- The tRPC context (`apps/api/src/trpc/context.ts`) reads `camello_tenant_id` from org metadata to resolve the tenant UUID
- There is an in-memory LRU cache (5-min TTL, max 500 entries) that maps `orgId -> tenantId`

### What happens on prod switch
- **New orgs:** Will be provisioned automatically via the webhook (after re-registration)
- **Existing dev orgs:** Will NOT exist in the prod Clerk instance. Users must create new orgs in production.
- **Seed tenant:** The seed tenant UUID `a0a0a0a0-0000-0000-0000-000000000001` in Supabase was linked to a dev Clerk org. It will need to be re-linked to a prod Clerk org by setting `camello_tenant_id` in the prod org's `publicMetadata`.

### Manual re-linking steps (for the seed tenant or any pre-existing tenant)
1. Create or identify the org in the Clerk prod instance
2. In the Clerk dashboard, go to the org > **Metadata**
3. Set `publicMetadata` to: `{ "camello_tenant_id": "a0a0a0a0-0000-0000-0000-000000000001" }`
4. The tRPC context will pick up the mapping on the next request (or after cache TTL)

---

## 4. Clerk Dashboard Configuration (Prod Instance)

### Items to verify in the prod instance dashboard
- [ ] **Application name** matches production (e.g., "Camello")
- [ ] **Allowed origins** include `https://camello.xyz` and `https://www.camello.xyz`
- [ ] **Organizations** feature is enabled (required for multi-tenant architecture)
- [ ] **Sign-in methods** match dev config (email, Google OAuth, etc.)
- [ ] **Session token lifetime** is acceptable (Clerk default: 1 week)
- [ ] **User data** (name, email) collection settings match dev config

### Clerk frontend components affected
These components in `apps/web` will automatically use the prod instance once `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is updated:
- `ClerkProvider` (`apps/web/src/components/providers.tsx:5`)
- `clerkMiddleware` (`apps/web/src/middleware.ts:1`)
- `UserButton` (`apps/web/src/components/sidebar.tsx:12`, `apps/web/src/app/dashboard/layout.tsx:9`)
- `OrganizationSwitcher` (`apps/web/src/components/sidebar.tsx:12`)
- `useOrganization` (`apps/web/src/app/onboarding/page.tsx:4`, `apps/web/src/app/dashboard/page.tsx:5`)
- `CreateOrganization` (`apps/web/src/app/onboarding/components/Step1CompanyName.tsx:5`)
- `useAuth` (`apps/web/src/components/providers.tsx:5`)
- `auth()` server helper (`apps/web/src/app/page.tsx:1`)
- `esES` Clerk localization (`apps/web/src/components/providers.tsx:6`)

---

## 5. Deployment Sequence

> Order matters. Do NOT update keys in a rolling fashion.

1. **Prepare prod Clerk instance:** Create application, enable organizations, configure sign-in methods, set allowed origins
2. **Register webhook** in prod Clerk dashboard (see Section 2)
3. **Coordinate env var update** — update all three vars simultaneously:
   - Railway API: `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_WEBHOOK_SECRET`
   - Vercel Web: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
4. **Redeploy** Railway API service (picks up new env vars)
5. **Redeploy** Vercel Web (rebuild with new publishable key)
6. **Verify:** Sign in on `camello.xyz`, create an org, check webhook fires, verify tenant provisioning
7. **Re-link seed tenant** if needed (see Section 3)

### Rollback plan
If something breaks after the switch:
1. Revert all env vars back to `sk_test_` / `pk_test_` / dev `whsec_` values
2. Redeploy both Railway API and Vercel Web
3. The dev instance will resume working immediately (dev webhook endpoint is still registered)

---

## 6. Post-Switch Verification Checklist

- [ ] Sign-up flow works on `camello.xyz`
- [ ] Organization creation triggers webhook and provisions tenant
- [ ] Dashboard loads with tenant data (tRPC auth resolves `camello_tenant_id`)
- [ ] Onboarding wizard completes (6 steps)
- [ ] Public chat page (`/chat/[slug]`) works (widget routes are unaffected by Clerk)
- [ ] Billing page loads (Paddle is independent of Clerk)
- [ ] Clerk `esES` localization works for Spanish users
- [ ] No `CLERK_WEBHOOK_SECRET not configured` errors in Railway API logs
- [ ] No `Invalid signature` warnings in Railway API logs (Svix verification)

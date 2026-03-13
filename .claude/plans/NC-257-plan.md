# NC-257 Plan: WhatsApp Settings UI — Credential Entry + Webhook Instructions

## Summary

Add a WhatsApp Channels settings page to the dashboard so tenants can enter their Meta access token + phone number ID, view connection status, and see webhook registration instructions. Requires two new tRPC procedures on `channelRouter` and a new settings sub-page.

---

## Ambiguities / Interpretations

### [AMBIGUOUS: verify token architecture]
The existing webhook handler (`apps/api/src/webhooks/whatsapp.ts:35`) uses a single global `process.env.WA_VERIFY_TOKEN` for challenge verification. The task wants `channel.webhookConfig` to return a **per-tenant HMAC** token. These are incompatible: Meta sends one verify_token to one webhook URL, and the current handler checks it against a single env var.

**Interpretation:** The per-tenant HMAC is the *value the tenant pastes into Meta Business Manager*. The existing `whatsapp.ts` webhook handler already accepts a single global token — we will document in the procedure response that the token displayed to the user IS the value they should configure in Meta, and that the webhook handler must accept it. This means the webhook handler needs updating too: instead of comparing against a fixed `WA_VERIFY_TOKEN`, it should accept any token that is a valid HMAC for some tenant. However, this could be complex. **Simpler safe interpretation:** The `channel.webhookConfig` procedure computes and returns the HMAC token for display only; the existing webhook handler continues using `WA_VERIFY_TOKEN` as-is. We add a note in the UI that this token must match what's in `WA_VERIFY_TOKEN` on the server. We do NOT modify the webhook handler in this task (scope creep risk), only document the mismatch.

### [INTERPRETED: settings page location]
No `/dashboard/settings/page.tsx` exists — only `/profile` and `/billing` sub-pages exist. The task says "add to settings page or new /channels sub-page." We create `/dashboard/settings/channels/page.tsx` to follow the existing pattern.

### [INTERPRETED: i18n namespace]
Keys named `channelWhatsapp`, `channelSave`, etc. → placed under top-level `"channels"` namespace in en.json/es.json. Component uses `useTranslations('channels')`.

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `apps/api/src/routes/channel.ts` | Modify — add `webhookConfig` and `verifyWhatsapp` procedures |
| `apps/web/src/app/dashboard/settings/channels/page.tsx` | Create — new channels settings page |
| `apps/web/messages/en.json` | Modify — add `"channels"` top-level namespace |
| `apps/web/messages/es.json` | Modify — add `"channels"` top-level namespace (Spanish) |
| `apps/api/src/__tests__/routes/channel-routes.test.ts` | Create — 2 required tests + additional coverage |

---

## Step 1 — Backend: Add `channel.webhookConfig` procedure

**File:** `apps/api/src/routes/channel.ts`

```typescript
webhookConfig: tenantProcedure.query(async ({ ctx }) => {
  const apiUrl = process.env.API_URL ?? '';
  const secret = process.env.WA_VERIFY_TOKEN_SECRET ?? '';

  // Per-tenant HMAC: HMAC-SHA256(secret, tenantId).slice(0, 32)
  const { createHmac } = await import('node:crypto');
  const verifyToken = createHmac('sha256', secret)
    .update(ctx.tenantId)
    .digest('hex')
    .slice(0, 32);

  return {
    webhookUrl: `${apiUrl}/api/channels/whatsapp/webhook`,
    verifyToken,
  };
}),
```

**Notes:**
- No input, `tenantProcedure`, server-side only — values never in `NEXT_PUBLIC_*`
- `WA_VERIFY_TOKEN_SECRET` is a new required env var
- Return type: `{ webhookUrl: string, verifyToken: string }`

---

## Step 2 — Backend: Add `channel.verifyWhatsapp` procedure

**File:** `apps/api/src/routes/channel.ts`

```typescript
verifyWhatsapp: tenantProcedure
  .input(z.object({
    phoneNumberId: z.string().min(1),
    accessToken: z.string().min(1),
  }))
  .mutation(async ({ input }) => {
    const url = `https://graph.facebook.com/v19.0/${input.phoneNumberId}?fields=display_phone_number&access_token=${input.accessToken}`;
    let response: Response;
    try {
      response = await fetch(url);
    } catch (err) {
      return { valid: false, error: 'Network error contacting Meta API' };
    }
    const data = await response.json() as Record<string, unknown>;
    if (!response.ok || data.error) {
      const msg = (data.error as Record<string, unknown>)?.message as string ?? 'Invalid credentials';
      return { valid: false, error: msg };
    }
    return {
      valid: true,
      displayPhoneNumber: data.display_phone_number as string | undefined,
    };
  }),
```

**Notes:**
- Input: `{ phoneNumberId: string, accessToken: string }` — Zod validated
- Returns: `{ valid: boolean, displayPhoneNumber?: string, error?: string }`
- Makes outbound fetch to `https://graph.facebook.com/v19.0/{id}?fields=display_phone_number&access_token={token}`
- Called **after** `channel.upsert` succeeds (orchestrated on the frontend)
- No DB writes — read-only validation against Meta Graph API

---

## Step 3 — Frontend: `/dashboard/settings/channels/page.tsx`

**New file.** `'use client'` component.

### Component Structure

```
ChannelsPage
├── Loading skeleton (while channel.list or channel.webhookConfig loads)
├── QueryError (on fetch error)
├── h1: t('channelWhatsapp') — "WhatsApp"
├── Status badge: "Connected — +57 300 123 4567" | "Not connected"
│
├── Card: Credentials
│   ├── Input: Access Token (type="password")
│   │   └── Help: t('channelWhatsappAccessTokenHint')
│   ├── Input: Phone Number ID (type="text")
│   │   └── Help: t('channelWhatsappPhoneNumberIdHint')
│   └── Button: Save (calls upsert then verifyWhatsapp)
│       └── On success: show display_phone_number badge
│       └── On verify error: show t('channelVerifyError') with error detail
│
├── Card: Webhook Configuration
│   ├── Webhook URL (read-only input + copy button)
│   │   └── Value: webhookConfig.webhookUrl
│   ├── Verify Token (read-only input + copy button)
│   │   └── Value: webhookConfig.verifyToken
│   └── Instructions paragraph: t('channelWebhookInstructions')
│
└── Disconnect button (only if connected): calls channel.delete
```

### Data flow

1. `trpc.channel.list.useQuery()` → get existing whatsapp channel config (if any)
2. `trpc.channel.webhookConfig.useQuery()` → get webhook URL + verifyToken (server-side)
3. Local state: `accessToken` (string), `phoneNumberId` (string), `displayPhoneNumber` (string|null), `verifyError` (string|null)
4. On mount / tenant data load: populate `phoneNumberId` from `channel.list` result (access token is never returned to client — field stays empty, user must re-enter if editing)
5. `handleSave`:
   - Call `channel.upsert({ channelType: 'whatsapp', phoneNumber: phoneNumberId, credentials: { access_token: accessToken } })`
   - On success: call `channel.verifyWhatsapp({ phoneNumberId, accessToken })`
   - On `valid: true`: set `displayPhoneNumber`, toast success
   - On `valid: false`: set `verifyError`, toast error
6. `handleDisconnect`: call `channel.delete({ channelType: 'whatsapp' })`, reset state

### Patterns to follow

- Import pattern: `trpc` from `@/lib/trpc`, shadcn components, `useTranslations`
- Input styling: `className="w-full rounded-md border border-charcoal/15 bg-cream px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal"`
- Button: `<Button>` from shadcn
- Copy-to-clipboard: local `copied` state + `navigator.clipboard.writeText()`
- Skeleton: `<Skeleton className="h-8 w-32" />`
- Toast: `useToast()` hook from `@/hooks/use-toast`
- Error: `<QueryError>` component for query errors

---

## Step 4 — i18n: `apps/web/messages/en.json` + `es.json`

Add top-level `"channels"` namespace with these keys:

```json
"channels": {
  "channelWhatsapp": "WhatsApp",
  "channelWhatsappStatus": "Connection Status",
  "channelWhatsappConnected": "Connected — {displayPhone}",
  "channelWhatsappNotConnected": "Not connected",
  "channelWhatsappAccessToken": "Access Token",
  "channelWhatsappAccessTokenHint": "Found in Meta Business Manager → WhatsApp Manager → API Setup → Temporary or Permanent access token",
  "channelWhatsappPhoneNumberId": "Phone Number ID",
  "channelWhatsappPhoneNumberIdHint": "The numeric ID next to your phone number in Meta Business Manager → WhatsApp Manager. Example: 123456789012345",
  "channelWebhookUrl": "Webhook URL",
  "channelWebhookVerifyToken": "Verify Token",
  "channelWebhookInstructions": "Paste this URL into your Meta App's webhook settings, then enter your verify token below.",
  "channelSave": "Save",
  "channelDisconnect": "Disconnect",
  "channelVerifyError": "Could not verify credentials with Meta: {error}"
}
```

Spanish equivalents in `es.json`.

---

## Step 5 — Tests: `apps/api/src/__tests__/routes/channel-routes.test.ts`

**Pattern:** `createCallerFactory` + `mockTenantDb` (identical to `learning-routes.test.ts`)

### Test 1 (Required): `channel.verifyWhatsapp` returns `valid: true` for correct credentials

```typescript
// Mock global fetch
const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal('fetch', mockFetch);

it('verifyWhatsapp returns valid=true and displayPhoneNumber for correct credentials', async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ id: '123', display_phone_number: '+57 300 123 4567' }),
  });

  const caller = createCaller(makeCtx(mockTenantDb(async (fn) => fn({}))));
  const result = await caller.verifyWhatsapp({
    phoneNumberId: '123456789012345',
    accessToken: 'valid_token_here',
  });

  expect(result.valid).toBe(true);
  expect(result.displayPhoneNumber).toBe('+57 300 123 4567');
});
```

### Test 2 (Required): `channel.upsert` stores phoneNumber + credentials

```typescript
it('upsert stores phoneNumber and credentials for whatsapp channel', async () => {
  const insertedRows: unknown[] = [];
  const db = mockTenantDb(async (fn) => {
    const mockDb = {
      insert: () => ({
        values: (data: unknown) => {
          insertedRows.push(data);
          return {
            onConflictDoUpdate: () => ({
              returning: () => [{
                id: 'chan_1',
                channelType: 'whatsapp',
                phoneNumber: '123456789012345',
                webhookUrl: null,
                isActive: true,
                createdAt: new Date(),
              }],
            }),
          };
        },
      }),
    };
    return fn(mockDb);
  });

  const caller = createCaller(makeCtx(db));
  const result = await caller.upsert({
    channelType: 'whatsapp',
    phoneNumber: '123456789012345',
    credentials: { access_token: 'tok_123' },
  });

  expect(result?.channelType).toBe('whatsapp');
  expect(result?.phoneNumber).toBe('123456789012345');
});
```

### Additional test 3: `verifyWhatsapp` returns `valid: false` on Meta API error

```typescript
it('verifyWhatsapp returns valid=false when Meta returns error', async () => {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    json: async () => ({ error: { message: 'Invalid OAuth access token' } }),
  });

  const caller = createCaller(makeCtx(mockTenantDb(async (fn) => fn({}))));
  const result = await caller.verifyWhatsapp({
    phoneNumberId: '123',
    accessToken: 'bad_token',
  });

  expect(result.valid).toBe(false);
  expect(result.error).toBe('Invalid OAuth access token');
});
```

### Additional test 4: `channel.webhookConfig` returns webhookUrl + verifyToken

```typescript
it('webhookConfig returns webhookUrl and non-empty verifyToken', async () => {
  vi.stubEnv('API_URL', 'https://api.example.com');
  vi.stubEnv('WA_VERIFY_TOKEN_SECRET', 'test-secret');

  const caller = createCaller(makeCtx(mockTenantDb(async (fn) => fn({}))));
  const result = await caller.webhookConfig();

  expect(result.webhookUrl).toBe('https://api.example.com/api/channels/whatsapp/webhook');
  expect(result.verifyToken).toHaveLength(32);
  // Same tenant → same token (deterministic HMAC)
  const result2 = await caller.webhookConfig();
  expect(result2.verifyToken).toBe(result.verifyToken);
});
```

---

## Acceptance Criteria Mapping

| AC | Plan Item |
|----|-----------|
| WhatsApp section in Settings, connection status badge | Step 3 — ChannelsPage, status display |
| Access token input (type="password") with hint | Step 3 — Credentials Card |
| Phone Number ID input with hint | Step 3 — Credentials Card |
| Webhook URL read-only + copy | Step 3 — Webhook Config Card |
| Verify token read-only + copy, server-side only | Step 2 (backend), Step 3 (frontend, from query) |
| Save → upsert → verifyWhatsapp → display phone or error | Step 3 — handleSave |
| `channel.webhookConfig` procedure | Step 1 |
| `channel.verifyWhatsapp` procedure | Step 2 |
| Disconnect button | Step 3 — handleDisconnect |
| i18n keys (en + es) | Step 4 |
| 2+ tests | Step 5 (4 tests total) |
| pnpm type-check passes | Verified after implementation |

---

## Risks / Notes

- `node:crypto` dynamic import in `webhookConfig` — in a server environment (Node.js) this is fine. Alternatively use top-level `import { createHmac } from 'node:crypto'` at the top of `channel.ts`.
- The outbound `fetch` in `verifyWhatsapp` is project code making an HTTP call to Meta Graph API. This is acceptable per RULES since it's the Meta API integration feature (not arbitrary URL fetching), but the test must mock `fetch` globally to avoid real network calls.
- Access token is stored in the `credentials` JSONB column (existing design) but never returned to the client in `channel.list` (already enforced). The frontend shows a blank password input on revisit — user must re-enter if editing.
- `channelWhatsappConnected` uses `{displayPhone}` interpolation — next-intl supports `t('channelWhatsappConnected', { displayPhone: '+57...' })`.

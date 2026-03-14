# Task Queue — Camello

> **How this file works:** Rolling work queue for NC (Nightcrawler) autonomous execution.
> Tasks use `NC-XXX` / `CAM-XXX` IDs. Format: `#### NC-XXX [ ] Title` (NC regex-parses this).
> Phases = priority groups (P0 first). Dependencies listed per task.
> After completing a task: mark `[x]`, add summary line, update `PROGRESS.md`, commit together.
> When starting a new sprint: update the goal below, add new tasks, collapse old completed tasks.

> **Current sprint:** WhatsApp + Payments + Onboarding (NC-257 → NC-268)
> Adds WhatsApp as a live customer channel (alongside webchat), a simple payment link flow (no processor, manual confirmation), a chat-style onboarding that collects org context conversationally, and an internal advisor agent auto-created for every new tenant.

---

## Completed (all previous sprints)

#### CAM-001 [x] Foundation + intelligence + channels + dashboard + billing + i18n
Full monorepo, 22 tables, RLS, RAG, 9 modules, channel adapters, widget, dashboard, onboarding, Paddle, i18n, production deploy.

#### CAM-002 [x] Public chat + business card + customer memory + agent workspaces
/chat/[slug], business card, abuse prevention, customer memory, archetype registry, all 3 workspace UIs, 20+ agent router procedures, handoffs, RAG bias. Migrations 0001-0015.

#### CAM-003 [x] Sales Agent Optimization Sprint (CAM-007, CAM-101–116)
Follow-up cron, approve/reject UI, module config, polling, budget parser, lead scoring, prompt optimization, notifications, quote-to-payment flow, auto-stage progression, lead notes/timeline, source attribution, auto-follow-up scheduling, conversation summarization. Migrations 0016-0020. Audited + 13 fixes applied.

#### CAM-004 [x] Launch-Ready Polish Sprint (CAM-107, CAM-111, CAM-114, CAM-117–132)
Onboarding fixes, period comparison, revenue forecast, support resolution+CSAT, knowledge gap UX, marketing stats+drafts, error boundaries, test coverage, a11y audit, conversation filters, dashboard home, settings polish, teach agent UX, widget typing indicator, prompt optimization, performance dashboard, customer insights, smoke tests. 23 audit fixes applied.

#### NC-201–NC-220 [x] Inbox Sprint
`display_name` column + backfill, `conversation.activity`, `conversation.replyAsOwner`, anonymous customer naming cleanup, 3-panel inbox layout, conversation list, chat thread, customer panel, owner reply, deep-link + mobile, dashboard simplification, agents config page, analytics page, workspace cleanup, a11y + i18n, sidebar nav, smoke tests. Migrations 0021-0022.

#### NC-221–NC-230 [x] Sales Agent Dashboard Sprint
Tab navigation, quotes/meetings/payments/follow-ups sections, i18n audit, performance+activity wiring, pending approvals UI, trust graduation card, visual polish. Migration 0023 (pending manual apply).

#### NC-231–NC-240 [x] Pre-Ship Sprint
Sprint audit, sales-only onboarding lock, Resend email client + templates, owner email resolution, approval email notifications, knowledge gap tracking + UI + email, widget branding dashboard UI + runtime. Migration 0024. Smoke tests pass.

#### NC-241–NC-246 [x] Sales Agent Polish Sprint
Conversations page polish (preview + unread), widget sandbox indicator, knowledge base empty state nudge, smoke tests for prompt + intent profile changes, sprint summary. Best-in-class sales strategies encoded (SPIN/BANT/Challenger/Sandler) into archetype prompt.

#### NC-247–NC-256 [x] Sales-Only Polish + Repo Quality Sprint
Sales-only mode (support/marketing/custom hidden), dashboard tab as default, analytics UX (date presets, health card, intents hero), knowledge page (gaps first, learnings polished), artifacts page (sales hero card + Test Chat + layout), repo quality sweep (71 orphaned i18n keys removed).

#### NC-251 [x] Onboarding: chat-like redesign (superseded)
Superseded by NC-263–NC-267 (full chat-style onboarding with advisor agent). Original placeholder scope no longer applies.

---

## Deferred — Post User Feedback

#### CAM-210 [deferred] Invoice module
Generate formatted invoices from quotes (new module + table + shareable public link). Build when real users request it. (User is researching Wompi/Nequi integration for Colombia first.)

---

## Manual / Blocked — Not for NC

#### CAM-200 [x] Clerk production keys (Mateo)
Done: Clerk production instance created (cloned from dev). Google OAuth configured with production credentials. 5 DNS CNAMEs verified on Cloudflare (gray cloud). Webhook registered with Svix signing secret. Env vars swapped on Railway (API) + Vercel (Web). Onboarding cache invalidation bug fixed (stale `tenant.me` after `onboarding.complete` → bounce loop).

#### CAM-201 [waiting] Paddle business verification (Mateo)
Submitted: legal pages created (/terms, /privacy, /refund), business info filled. Provisional approval received — 3 feedback items addressed (removed refund qualifiers, added 14-day window, fixed legal name to "Camello"). Production API key + client-side token generated and ready to set on Railway/Vercel. Products/prices to be created once plan structure finalized. Waiting for Paddle final verification approval.

#### CAM-202 [manual] Apply migration 0023 to Supabase cloud (Mateo)
`context_curation` JSONB column on `interaction_logs`. Review SQL in `packages/db/migrations/0023_context_curation_telemetry.sql` and apply via Supabase dashboard.

#### CAM-203 [manual] Meta App review + business verification (Mateo)
Submit Camello's Meta App for Advanced Access (`whatsapp_business_messaging` + `whatsapp_business_management`). 1-4 week approval. Required for >250 msgs/day and for Embedded Signup (future). Not a blocker for manual-token first users.

---

## WhatsApp + Payments + Onboarding Sprint (NC-257 → NC-268)

> **Sprint goal:** Three independent feature tracks that together make the product ready for real users: (1) WhatsApp as a live channel alongside webchat — manual token setup, no external signup required; (2) payment links the agent can send in chat, manually confirmed by the owner; (3) chat-style onboarding that collects business context conversationally and auto-creates an internal advisor agent.

### Sprint guardrails

**WhatsApp:** Both webchat AND WhatsApp channels run simultaneously — no mutual exclusion. The `channel_configs` table already has a unique index on `(tenantId, channelType)`, so a tenant can have one webchat config and one whatsapp config independently. The full WhatsApp adapter + webhook handler + DB schema + tests already exist. Only the credential collection UI is missing.

**Payments:** Backend is 100% complete. `collect_payment` module already reads `ctx.configOverrides.paymentUrl`. `payments` table already has `paymentUrl` column. No new tRPC procedures needed for the payment link — use existing `artifact.attachModule` with `configOverrides: { paymentUrl: "..." }`. Only dashboard UI changes.

**Onboarding:** Keep ALL existing tRPC procedures (`provision`, `parseBusinessModel`, `setupArtifact`, `saveStep`, `complete`, `getStatus`, `ensurePreviewCustomer`). Only the UI changes — replace the step-based stepper with a chat-style single-page flow. The `parseBusinessModel` procedure already forces `agentType = 'sales'`. DB schema unchanged.

**Advisor agent:** New `advisor` archetype type requires migration 0025 (adds `'advisor'` to the CHECK constraint on `artifacts.type`). Add `packages/ai/src/archetypes/advisor.ts` following the self-registration pattern. Auto-create in `onboarding.complete()`. This is an internal agent — not customer-facing, no channel config needed.

**Next migration number:** 0025 (`packages/db/migrations/0025_advisor_artifact_type.sql`).

---

## P0 — WhatsApp Channel

#### NC-257 [x] WhatsApp settings UI — credential entry + webhook instructions

The WhatsApp adapter + webhook handler are fully built. The only missing piece is a UI for the tenant to input their Meta access token + phone number ID, and instructions for registering the webhook in Meta Business Manager.

**Background:** Each tenant must have a Meta WhatsApp Business Account (WABA) with a registered phone number and a permanent access token. Both are available in Meta Business Manager → WhatsApp Manager → API Setup. The `phone_number_id` is the numeric ID shown there (e.g., `123456789012345`), NOT the human-readable phone number. The access token is either the temporary 24h token (for testing) or a permanent system user token (for production).

**Files to create/modify:**
- `apps/web/src/app/dashboard/settings/page.tsx` — add "Channels" section (or a new `/dashboard/settings/channels/page.tsx`)
- `apps/api/src/routes/channel.ts` — add `channel.verifyWhatsapp` tRPC procedure (calls Meta API to validate token); add `channel.webhookConfig` tRPC procedure (returns webhook URL + verify token)
- i18n: `apps/web/messages/en.json` + `es.json` — new `settings.channels` keys

**Acceptance Criteria:**
- New "WhatsApp" section in Settings (or Channels sub-page). Shows connection status: "Not connected" / "Connected — +57 300 123 4567" (human-readable number, fetched from Meta after save).
- **Two input fields:**
  1. **Access token** — `<input type="password">` (masked). Help text: *"Found in Meta Business Manager → WhatsApp Manager → API Setup → Temporary or Permanent access token"*
  2. **Phone Number ID** — text input. Help text: *"The numeric ID next to your phone number in Meta Business Manager → WhatsApp Manager. Example: 123456789012345"*
- **Webhook URL display** — read-only field showing `{NEXT_PUBLIC_API_URL}/api/channels/whatsapp/webhook` with a copy-to-clipboard button. Instructions: *"Paste this URL into your Meta App's webhook settings, then enter your verify token below."*
- **Verify token display** — read-only, value fetched from new `channel.webhookConfig` tRPC procedure (see below). **Never expose via `NEXT_PUBLIC_*` env or inline into client components.** The token is served server-side only.
- **Save button** — calls `trpc.channel.upsert({ channelType: 'whatsapp', phoneNumber: phoneNumberId, credentials: { access_token: token } })`. On success: call new `channel.verifyWhatsapp` procedure which makes `GET https://graph.facebook.com/v19.0/{phoneNumberId}?fields=display_phone_number&access_token={token}` to confirm connectivity. Show the `display_phone_number` returned ("Connected to +57 300 123 4567") or an error if the API call fails.
- **New tRPC procedure** `channel.webhookConfig` — `tenantProcedure`, no input. Returns `{ webhookUrl: string, verifyToken: string }`. The `webhookUrl` is `${process.env.API_URL}/api/channels/whatsapp/webhook`. The `verifyToken` is a per-tenant HMAC: `HMAC-SHA256(process.env.WA_VERIFY_TOKEN_SECRET, ctx.tenantId).slice(0, 32)`. Both values computed server-side, never leaked to client bundles. The same `verifyToken` must be used in the existing `apps/api/src/routes/channels/whatsapp.ts` webhook handler for challenge verification (check that they match or document how `WA_VERIFY_TOKEN` is currently used there).
- **New tRPC procedure** `channel.verifyWhatsapp` — `tenantProcedure`, input `{ phoneNumberId, accessToken }`. Makes outbound fetch to Meta Graph API. Returns `{ valid: boolean, displayPhoneNumber?: string, error?: string }`. This procedure is called after `channel.upsert`, not before.
- Disconnect button: calls `channel.delete({ channelType: 'whatsapp' })`.
- i18n keys (en + es): `channelWhatsapp`, `channelWhatsappStatus`, `channelWhatsappConnected`, `channelWhatsappNotConnected`, `channelWhatsappAccessToken`, `channelWhatsappAccessTokenHint`, `channelWhatsappPhoneNumberId`, `channelWhatsappPhoneNumberIdHint`, `channelWebhookUrl`, `channelWebhookVerifyToken`, `channelWebhookInstructions`, `channelSave`, `channelDisconnect`, `channelVerifyError`
- At least 2 tests: (1) channel.verifyWhatsapp returns valid=true for correct credentials (mock Meta API), (2) upsert stores phoneNumber + credentials
- `pnpm type-check` passes

**Depends on:** —

---

#### NC-258 [x] WhatsApp onboarding: add token + phone number ID fields to Step 5

The current onboarding Step 5 (Connect Channel) already has a WhatsApp path that collects the phone number. It needs the access token field added, and the phone number input relabeled as "Phone Number ID".

**Files to modify:**
- `apps/web/src/app/onboarding/components/Step4ConnectChannel.tsx`

**Acceptance Criteria:**
- WhatsApp path currently shows one input ("Phone number"). Change:
  1. Relabel existing phone field to "Phone Number ID" — same help text as NC-257
  2. Add new "Access token" field below it — same help text as NC-257
  3. Show webhook URL + verify token as read-only fields — both fetched from `channel.webhookConfig` tRPC procedure (same source as NC-257 settings page; do NOT read from env or NEXT_PUBLIC_* vars)
- On submit: call `channel.upsert({ channelType: 'whatsapp', phoneNumber: phoneNumberId, credentials: { access_token: token } })`
- Both fields required when WhatsApp is selected. Show inline validation if empty on submit attempt.
- WebChat path: unchanged (no token needed, webchat has no credential requirement)
- The tenant can complete onboarding with EITHER webchat OR WhatsApp. Both are valid. They can add the other channel later via Settings.
- i18n: reuse keys from NC-257 where possible; add any onboarding-specific keys to `onboarding` namespace
- At least 1 test: WhatsApp path submits both token + phoneNumberId to channel.upsert
- `pnpm type-check` passes

**Depends on:** NC-257
_Done: Relabeled phone→Phone Number ID, added access token field, webhook URL + verify token read-only from `channel.webhookConfig`, inline validation, `copy` i18n key added (en+es), 3 tests in `step4-connect-channel.test.tsx`._

---

#### NC-260 [x] Two-way WhatsApp conversation sync — validation + integration test

The WhatsApp adapter already handles inbound messages and `conversation.replyAsOwner` sends outbound. Verify the full round-trip: customer sends → agent replies → customer sends again → lands in the SAME conversation (not a new one).

**Background:** `findOrCreateWhatsAppCustomer()` uses `externalId = waId` (customer's phone number in E.164 format). On each inbound message, it finds the existing customer and resolves their active conversation via the artifact's conversation logic. The risk is that after the owner replies via `conversation.replyAsOwner`, the customer's next message might create a new conversation instead of continuing the existing one.

**Files to modify:**
- `apps/api/src/__tests__/whatsapp-roundtrip.test.ts` — new test file

**Acceptance Criteria:**
- New test file `apps/api/src/__tests__/whatsapp-roundtrip.test.ts` with at least 4 tests:
  1. First message from customer → creates conversation with `channel: 'whatsapp'`
  2. Same customer sends second message → lands in same conversation (same `conversationId`)
  3. Owner replies via `conversation.replyAsOwner` → message inserted with `role: 'human'`
  4. Customer sends a third message after owner reply → still in same conversation (not a new one)
- Use `createCallerFactory` pattern from `learning-routes.test.ts` for tRPC call tests
- Mock the WhatsApp adapter's `sendText` method (don't make real API calls)
- If a bug is found (new conversation created instead of continuing), fix `findOrCreateWhatsAppCustomer` or the conversation resolution logic in `message-handler.ts`
- `pnpm type-check` passes

**Depends on:** NC-257
_Done: Fixed `findActiveConversation` bug — replaced `eq(conversations.status, 'active')` with `inArray(conversations.status, ['active', 'escalated'])` so customer messages after owner escalation continue in the same conversation. Exported `findActiveConversation` for direct testing. Created `apps/api/src/__tests__/whatsapp-roundtrip.test.ts` with 5 tests: (1) first message creates conversation with `channel: 'whatsapp'`; (2) second message reuses same conversation; (3) `replyAsOwner` inserts `role: 'human'` + WhatsApp delivery; (4) third message after owner reply continues same conversation (AC4 behavioral); (5) pg-proxy SQL regression test confirms `inArray` generates params containing `'escalated'`. All 427 tests pass._

---

## P1 — Payment Link

#### NC-261 [x] Payment link field in `collect_payment` module binding UI

**Already built.** The payment URL field is fully implemented in `apps/web/src/components/agent-workspace/module-settings.tsx` (lines 192–204 for the input UI, line 83 for save). No action needed.

**Depends on:** —

---

#### NC-262 [x] "Mark as Paid" action in Payments section
Added `markPaymentPaid` tenantProcedure (preflight PRECONDITION_FAILED guard), Button in payments-section.tsx with stopPropagation + invalidate + toast, 3 i18n keys en+es, 2 tests. Type-check passes.

When the agent sends a payment link, it creates a `payments` row with `status: 'pending'`. The owner needs to manually confirm when they receive the money. Add a "Mark as Paid" button in the Dashboard tab → Payments section.

**Background:**
- `agent.salesPayments` tRPC query returns payments with `id, status, amount, currency, description, customerName, dueDate, paidAt, conversationId`
- Payment status enum: `'pending' | 'sent' | 'viewed' | 'paid' | 'overdue' | 'cancelled'`
- No existing tRPC procedure for updating payment status — need to add one

**Files to modify:**
- `apps/api/src/routes/agent.ts` — add `markPaymentPaid` tenantProcedure
- `apps/web/src/components/agent-workspace/sales/payments-section.tsx`
- i18n: `apps/web/messages/en.json` + `es.json`

**Acceptance Criteria:**
- New tRPC procedure `agent.markPaymentPaid`: `tenantProcedure`, input `{ paymentId: z.string().uuid() }`. Sets `payments.status = 'paid'`, `payments.paidAt = now()` where `id = paymentId AND tenantId = ctx.tenantId`. Throws `NOT_FOUND` if not found. Throws `PRECONDITION_FAILED` if already `status = 'paid'`.
- In `payments-section.tsx`: for rows where `status === 'pending' || status === 'sent' || status === 'viewed'`, show a "Mark as Paid" button (small, `variant="outline"` style). On click: call `agent.markPaymentPaid`. On success: invalidate `salesPayments` query + show toast "Payment marked as received".
- Button disabled while mutation is pending (`isPending` state).
- Row appearance after marking: status badge updates to `paid` (teal). No re-fetch delay — invalidate query on success.
- i18n keys (en + es): `markAsPaid`, `paymentMarkedPaid`, `paymentAlreadyPaid`
- At least 2 tests: (1) markPaymentPaid sets status to paid, (2) already-paid throws PRECONDITION_FAILED
- `pnpm type-check` passes

**Depends on:** —

---

## P2 — Chat-Style Onboarding

#### NC-263 [x] Chat onboarding shell: replace stepper with conversational UI

Replace the 6-step stepper (`apps/web/src/app/onboarding/page.tsx` + `components/Step*.tsx`) with a single-page chat-style flow. Keep ALL existing tRPC procedures — only the UI changes.

**Background (existing tRPC procedures to reuse):**
- `onboarding.provision({ orgId, companyName })` — creates Clerk org + tenant. Step 1.
- `onboarding.parseBusinessModel({ description, locale })` — LLM call, returns `BusinessModelSuggestion` (agentName, personality, constraints, industry, template). Step 2.
- `onboarding.setupArtifact({ name, type, personality, constraints, profile, moduleIds })` — creates the sales artifact. Step 3.
- `onboarding.saveStep({ step?, suggestion?, businessDescription?, businessDescriptionSeeded? })` — persists state to `tenants.settings` JSONB. Used for resume.
- `onboarding.getStatus()` — returns `{ settings, tenantName, previewCustomerId }`. Used for resume.
- `onboarding.complete()` — marks onboarding done. Will be extended in NC-268 to also create the advisor artifact.
- `channel.upsert({ channelType, phoneNumber, credentials })` — saves channel config. Step 5.
- `chat.send(...)` — powers the test chat in the final step.

**State machine:**
```
idle → creating_org → provisioning → ask_description → generating_agent → confirm_agent →
collecting_knowledge → ask_channel → done
```
> `creating_org`: Clerk `<CreateOrganization />` renders inside the chat shell. The component owns org creation — the user types the company name directly into Clerk's UI.
> `provisioning`: Once `useOrganization()` resolves an org, a `useEffect` immediately calls `onboarding.provision({ orgId, companyName })` (same pattern as current `Step1CompanyName.tsx:35`). This state is transient (spinner, no user input needed). On success → advance to `ask_description`.

**Files to create/modify:**
- `apps/web/src/app/onboarding/page.tsx` — rewrite as chat shell (keep file, replace content)
- `apps/web/src/app/onboarding/components/ChatOnboarding.tsx` — new main component
- `apps/web/src/app/onboarding/components/ChatBubble.tsx` — platform message bubble (left-aligned, avatar)
- `apps/web/src/app/onboarding/components/ChatInput.tsx` — user input below bubble
- Keep `Step1CompanyName.tsx` through `Step5TestIt.tsx` intact but unused (do NOT delete — they are reference implementations)
- i18n: `apps/web/messages/en.json` + `es.json` — new `onboardingChat` section

**Chat flow script (exact bot messages, adapt in code):**

1. **creating_org:**
   Bot: *"Hi! I'm going to help you set up your AI sales agent. First — what's your company called?"*
   UI: Clerk's `<CreateOrganization />` component renders inside the chat bubble. The user types the company name here — do NOT replace with a plain text input. `onboarding.provision` is a `tenantProcedure` that enforces `ctx.orgId === input.orgId` (see `onboarding.ts:171`), so a real Clerk org must exist before provision is ever called.

2. **provisioning (transient):**
   Once `useOrganization().organization` resolves, `useEffect` auto-fires: `provision.mutate({ orgId: org.id, companyName: org.name })`. Show a spinner ("Setting up your workspace…"). No user input at this step. On success → advance.

3. **ask_description:**
   Bot: *"Nice, [companyName]! Now tell me about your business. What do you sell, who are your customers, and what makes you different? (The more detail you give, the smarter your agent will be.)"*
   Input: textarea, 10–2000 chars. On submit → calls `onboarding.parseBusinessModel` (show a typing indicator while it runs — this is an LLM call, takes 2-4s) → calls `onboarding.saveStep`.

4. **generating_agent** (shown during parseBusinessModel):
   Bot: *"Analyzing your business…"* with animated dots.

5. **confirm_agent:**
   Bot: *"Got it. I've set up your sales agent: **[agentName]**. Here's how they'll introduce themselves: '[greeting]'. Sound good?"*
   Two buttons: "Yes, that's great" → proceed | "Change the name" → inline text input to override name.
   On confirm → calls `onboarding.setupArtifact`.

6. **collecting_knowledge:**
   Bot: *"Now let's teach [agentName] about your business. What are the top 3–5 things your customers always ask you about? (pricing, how it works, delivery, etc.)"*
   Input: textarea. Each line = one topic. On submit → ingests as knowledge doc (calls `knowledge.ingest` or the existing URL/text ingestion tRPC procedure).
   Then: *"Do you have a website? I'll read it so [agentName] knows your full catalog."*
   Input: URL (optional, skip button). On submit → calls existing URL sync procedure.

7. **ask_channel:**
   Bot: *"Almost done! Where should [agentName] talk to your customers?"*
   Two buttons: "Web chat (embed on website)" | "WhatsApp".
   - Web chat → shows embed snippet + copy button → advance to done.
   - WhatsApp → shows Phone Number ID + Access Token fields (same as NC-257) → calls `channel.upsert` → advance to done.

8. **done:**
   Bot: *"[agentName] is live! Here's your share link: [link]. Open your dashboard to see how your agent is doing."*
   CTA button: "Open Dashboard" → navigates to `/dashboard`.

**Resume behavior:** On mount, call `onboarding.getStatus()`. If `settings.onboardingStep > 0`, restore state and resume from the last completed step. The `hasResumed` ref pattern (already in codebase) prevents double-firing.

**Acceptance Criteria:**
- Single page at `/onboarding` with chat-style UI (scrollable message feed, input at bottom)
- Platform messages styled as left-aligned chat bubbles with a small Camello avatar (initials "C" in teal)
- User responses styled as right-aligned, bg-sand bubbles
- Typing indicator (animated 3-dot) shown during LLM calls (`parseBusinessModel`)
- All existing tRPC calls preserved (same procedures, same input/output)
- Resume from `tenants.settings.onboardingStep` on remount
- "Skip for now" text link below channel step (goes directly to done state)
- Mobile-responsive (works on 375px width — same constraint as old wizard)
- i18n: all bot messages in `onboardingChat` namespace (en + es). Min 15 keys.
- At least 3 tests: (1) company name step calls provision on submit, (2) description step shows typing indicator during parseBusinessModel, (3) resume restores from saved step
- `pnpm type-check` passes

**Depends on:** —

---

#### NC-264 [x] Knowledge sufficiency score + dashboard nudge
> Added `sufficiencyScore` tenantProcedure (doc count, synced URL, gap count → formula). Gold banner on dashboard when score<60. Score widget (N/100 + label + bucket) on Knowledge page header. 6 i18n keys en+es. 5 API tests + 5 web tests updated. Gap query fixed (iter 3): uses `ownerNotifications` type='knowledge_gap' instead of `isNull(interactionLogs.resolutionType)` — `resolutionType` is never populated so the old query inflated gapCount.

Track whether the tenant has enough knowledge to make their agent useful. Surface as a proactive nudge on the home dashboard.

**Background:**
- `knowledgeDocs` table: `SELECT COUNT(*) FROM knowledge_docs WHERE tenant_id = ?`
- Knowledge gaps: `interaction_logs` where `resolution_type IS NULL` in last 30 days. **Do NOT reuse `supportKnowledgeGaps`** — that procedure requires an `artifactId` param and is scoped to a single agent. The `sufficiencyScore` procedure must do its own tenant-wide gap count: `SELECT COUNT(*) FROM interaction_logs WHERE tenant_id = ? AND resolution_type IS NULL AND created_at > now() - interval '30 days'`.
- No existing "sufficiency" concept — we derive it from raw signals

**Files to create/modify:**
- `apps/api/src/routes/knowledge.ts` — add `knowledge.sufficiencyScore` tenantProcedure
- `apps/web/src/app/dashboard/page.tsx` — add nudge banner
- `apps/web/src/components/dashboard/knowledge-banner.tsx` — update existing component (already exists from NC-243; file is named `knowledge-banner.tsx`, NOT `knowledge-nudge.tsx`)
- i18n: `apps/web/messages/en.json` + `es.json`

**Score formula:**
```
base = min(knowledgeDocs.count * 20, 80)        // 4+ docs = 80 pts
websiteBonus = hasActiveSyncedUrl ? 20 : 0       // website scraped = +20
gapPenalty = min(recentGaps.count * 5, 40)       // each gap = -5pts, max -40
score = max(0, base + websiteBonus - gapPenalty)
```
Max score = 100 (80 base + 20 bonus, no gaps). Returns `{ score: number (0-100), signals: string[] }` where `signals` are human-readable issues.

**Signal examples:**
- `"No product information added yet"` — when `knowledgeDocs.count === 0`
- `"No website connected"` — when no synced URL exists
- `"N questions your agent couldn't answer this week"` — when `recentGaps.count > 0`

**Acceptance Criteria:**
- New `knowledge.sufficiencyScore` tenantProcedure — returns `{ score: number, signals: string[], docCount: number, gapCount: number }`
- Home dashboard: if `score < 60`, show a gold banner above "Your Agents": "[agentName]'s knowledge score: N/100. [top signal] → [Add Knowledge]". Link goes to `/dashboard/knowledge`.
- Banner hidden when `score >= 60` or when `artifactsQuery.data` is empty.
- Score displayed on Knowledge page header as a `N/100` number + brief label ("Needs improvement" < 60, "Good" 60–79, "Excellent" 80+).
- i18n keys (en + es): `knowledgeScore`, `knowledgeScoreNeedsWork`, `knowledgeScoreGood`, `knowledgeScoreExcellent`, `knowledgeScoreBanner`, `knowledgeScoreAddCta`
- At least 3 tests: (1) score = 0 when no docs, (2) score increases with docs, (3) gap penalty applied correctly
- `pnpm type-check` passes

**Depends on:** —

---

#### NC-265 [x] "Teach more" inline input on Knowledge page
Inline textarea + "Add" button above Documents section; calls `knowledge.ingest` with auto-title; min-20-char validation; 4 i18n keys en+es; 2 new tests.

Reduce friction for adding knowledge after onboarding. A single text input at the top of the Knowledge page that ingests any text as a knowledge doc.

**Files to modify:**
- `apps/web/src/app/dashboard/knowledge/page.tsx`
- i18n: `apps/web/messages/en.json` + `es.json`

**Acceptance Criteria:**
- At the top of the Knowledge page (above the Documents section), add a "Teach your agent" input row:
  - Textarea placeholder: *"Paste any text — a product description, FAQ answer, pricing table, policy..."*
  - "Add" button to the right
  - On submit: calls the existing `knowledge.ingest` mutation (same procedure used by the full upload flow) with `{ content: text.trim(), title: 'Manual entry — [first 50 chars of text]', sourceType: 'upload' }`
  - On success: clear input, show toast "Added to knowledge base", invalidate `knowledge.list` query
  - Min 20 chars validation (inline error if shorter)
- i18n keys (en + es): `teachInputPlaceholder`, `teachInputAdd`, `teachInputTooShort`, `teachInputSuccess`
- At least 1 test: submit triggers knowledge.ingest with correct payload
- `pnpm type-check` passes

**Depends on:** —

---

#### NC-266 [x] Knowledge gap → teach prompt: inline answer flow
Added inline teach form per gap card: expandedGapIntent state, gapTeachIngest mutation, handleGapTeach/handleGapSave handlers, answered state with CheckCircle2 badge + opacity-50. 6 i18n keys en+es. 2 tests in knowledge-page.test.tsx. Type-check passes.

Each gap card in the Knowledge page already shows the intent + a sample customer question. Add a "Teach" action so the owner can immediately answer the gap without leaving the page.

**Files to modify:**
- `apps/web/src/app/dashboard/knowledge/page.tsx`
- i18n: `apps/web/messages/en.json` + `es.json`

**Acceptance Criteria:**
- Each gap card gets a "Teach" button (small, secondary style) in the top-right.
- Click: expand an inline textarea below the card, pre-populated with: `"Answer about [intent]: "` as placeholder.
- User types the answer. "Save" button calls `knowledge.ingest` with `{ content: text.trim(), title: 'Answer: [intent]', sourceType: 'upload' }`.
- On success: gap card gets a visual "covered" state (teal checkmark + "Answered" badge, opacity-50). Does NOT remove the gap row immediately (it'll disappear on next data refresh).
- Only one gap expanded at a time (opening a second closes the first).
- i18n keys (en + es): `gapTeachButton`, `gapTeachPlaceholder`, `gapTeachSave`, `gapTeachCancel`, `gapTeachSuccess`, `gapAnswered`
- At least 2 tests: (1) Teach button expands inline textarea, (2) saving calls ingest with correct title
- `pnpm type-check` passes

**Depends on:** —

---

#### NC-267 [x] Onboarding polish: skip/resume + mobile + i18n

Final polish on the chat onboarding.

**Files to modify:**
- `apps/web/src/app/onboarding/` — chat components from NC-263
- `apps/web/src/app/dashboard/page.tsx` — resume nudge
- i18n: `apps/web/messages/en.json` + `es.json`

**Acceptance Criteria:**
- **Skip/escape:** "I'll finish this later" text link below each input (from ask_description onward). Clicking saves current step via `onboarding.saveStep` and redirects to `/dashboard`.
- **Resume nudge on dashboard:** If `onboarding.getStatus()` returns `settings.onboardingComplete !== true`, show a compact banner at the top of the home page: "Finish setting up your agent → [Continue setup]". Link goes to `/onboarding`. Hide after onboarding is complete.
- **Mobile layout:** Chat bubbles max-width 85% on mobile (320px+). Input pinned to bottom with `sticky bottom-0`. Bot avatar hidden on very small screens (< 360px).
- **Transition animation:** Each new bot message fades in (`opacity-0` → `opacity-100`, 300ms). User reply appears immediately (no animation).
- **Full i18n sweep:** All chat script strings in `onboardingChat` namespace (en + es). Ensure every bot message, button label, and placeholder has translations.
- At least 2 tests: (1) skip saves current step and redirects, (2) resume nudge shown when onboarding incomplete
- `pnpm type-check` passes

**Depends on:** NC-263

---

## P3 — Advisor Agent

#### NC-268 [x] Advisor archetype + auto-create in onboarding

Every Camello tenant gets an internal advisor agent — not customer-facing, but available in the dashboard as an AI co-pilot that knows their business, conversations, and knowledge base. Auto-created when onboarding completes.

**Background:**
- Artifact type is a CHECK constraint on `artifacts.type`: currently `IN ('sales', 'support', 'marketing', 'custom')`. Need to add `'advisor'`.
- Archetype self-registration pattern: `packages/ai/src/archetypes/*.ts` files import-and-register via `registerArchetype()`. Side-effect import in `packages/ai/src/archetypes/index.ts`.
- `onboarding.complete()` tRPC procedure in `apps/api/src/routes/onboarding.ts` — extend it to auto-create the advisor artifact after marking onboarding done.
- The advisor is internal: no channel config, not accessible from the public `/chat/[slug]` route.

**Files to create/modify:**
- `packages/db/migrations/0025_advisor_artifact_type.sql` — new migration
- `packages/ai/src/archetypes/advisor.ts` — new archetype file
- `packages/ai/src/archetypes/index.ts` — add import for advisor
- `packages/shared/src/types/index.ts` — add `'advisor'` to `ArtifactType` union (line 39)
- `apps/api/src/routes/artifact.ts` — add `'advisor'` to artifact type Zod enum (line 16)
- `apps/api/src/routes/onboarding.ts` — add `'advisor'` to type Zod enum (line 33); extend `complete()` to create advisor artifact
- `apps/web/src/app/dashboard/artifacts/page.tsx` — add `'advisor'` to `ArtifactType` (line 22); show advisor card (read-only, no toggle)
- i18n: `apps/web/messages/en.json` + `es.json`

**Migration (`0025_advisor_artifact_type.sql`):**
```sql
-- Add 'advisor' to artifact type constraint
ALTER TABLE artifacts DROP CONSTRAINT IF EXISTS artifacts_type_check;
ALTER TABLE artifacts ADD CONSTRAINT artifacts_type_check
  CHECK (type IN ('sales', 'support', 'marketing', 'custom', 'advisor'));
```

**Archetype (`packages/ai/src/archetypes/advisor.ts`):**
```ts
registerArchetype({
  type: 'advisor',
  prompts: {
    en: `You are [companyName]'s internal business advisor. You have full context about their
    sales activity, customer conversations, and knowledge base. Help the owner understand their
    business: summarize what's happening, identify patterns, surface opportunities, flag risks.
    Be direct and specific — reference actual data when available. You are an internal tool,
    not a customer-facing agent.`,
    es: `Eres el asesor interno de [companyName]. Tienes acceso completo a su actividad de ventas,
    conversaciones con clientes y base de conocimiento. Ayuda al propietario a entender su negocio:
    resume lo que está pasando, identifica patrones, detecta oportunidades y señala riesgos.
    Sé directo y específico — usa datos reales cuando estén disponibles. Eres una herramienta
    interna, no un agente para clientes.`,
  },
  defaultTone: { en: 'analytical, direct, and specific', es: 'analítico, directo y específico' },
  moduleSlugs: [],       // Internal agent — no action modules
  icon: 'BrainCircuit',
  color: 'gold',
  ragBias: { docTypes: ['upload', 'url', 'api'], boost: 1.5 },  // Pull from all knowledge sources
});
```

**`onboarding.complete()` extension:**
After marking `settings.onboardingComplete = true`, check if an `advisor` artifact already exists for this tenant (`SELECT id FROM artifacts WHERE tenant_id = ? AND type = 'advisor'`). If not found, create one:
```ts
await tenantDb.query(async (db) => {
  await db.insert(artifacts).values({
    tenantId: ctx.tenantId,
    name: `${tenant.name} Advisor`,
    type: 'advisor',
    isActive: true,
    personality: { instructions: '', tone: 'analytical, direct, and specific' },
    constraints: {},
  });
});
```

**Dashboard (artifacts page):**
- Show the advisor artifact below the sales hero + disabled cards row.
- Compact card (not a hero): gold-accented border (`ring-1 ring-gold/30`), brain icon, name ("Acme Advisor"), description "Your internal business co-pilot — ask it anything about your sales activity".
- **No toggle** (always active, internal). CTA: "Chat with Advisor" button → opens `TestChatPanel` with the advisor artifact.
- Gated: only show if an advisor artifact exists in `byType.get('advisor')`.

**Acceptance Criteria:**
- Migration `0025_advisor_artifact_type.sql` adds `'advisor'` to CHECK constraint (do NOT apply — human applies)
- `packages/ai/src/archetypes/advisor.ts` registers advisor archetype with en + es prompts, `ragBias: { docTypes: ['upload', 'url', 'api'], boost: 1.5 }`, `moduleSlugs: []`, `icon: 'BrainCircuit'`, `color: 'gold'`
- `index.ts` imports the new file (side-effect registration)
- `onboarding.complete()` idempotently creates advisor artifact if one doesn't exist for the tenant
- Artifacts page shows advisor card below the main grid, with "Chat with Advisor" CTA
- i18n keys (en + es) under `artifacts` namespace: `advisorDesc`, `chatWithAdvisor`
- At least 3 tests: (1) complete() creates advisor artifact, (2) complete() is idempotent (no duplicate on second call), (3) advisor card renders on artifacts page
- `pnpm type-check` passes

**Depends on:** NC-263 (onboarding complete() extension should run after chat onboarding is wired up)
_Done: Migration 0026_advisor_artifact_type.sql adds 'advisor' to CHECK constraint. `advisor.ts` archetype self-registers with en/es prompts, ragBias, gold color, BrainCircuit icon. `onboarding.complete()` idempotently creates advisor artifact post-completion. Artifacts page shows gold-accented AdvisorCard with "Chat with Advisor" CTA. 2 i18n keys (en+es). 2 API tests (create + idempotent) + 1 web test (card renders). Type-check passes._

---

#### NC-269 [x] PR audit + hardening pass (NC-257–268 branch)

4-agent automated PR review (code-reviewer, silent-failure-hunter, pr-test-analyzer, comment-analyzer) run against the full sprint branch. All critical and high-priority findings resolved.

_Done: (1) **`pool.query()` fix** — `resolveTenantByPhoneNumberId()` and `getWhatsappTenantIds()` both used `db.execute(sql\`...\`)` which produces malformed SQL when bundled with tsup `noExternal`. Replaced both with `pool.query<T>()` raw pg driver calls. (2) **`verifyWhatsapp` silent success fixed** — 0-row DB update (channel not upserted first) now throws `NOT_FOUND` instead of silently succeeding. (3) **`queueUrl` silent failure surfaced** — catch block in `ChatOnboarding.tsx` now calls `setKnowledgeError(t('websiteQueueError'))` instead of discarding the error. (4) **Stale Trigger.dev comments** replaced with accurate dead-letter queue description. (5) **`onboarding-advisor.test.ts` rewritten** — previous test used 4× `mockImplementationOnce` for a single-transaction function; rewrote with `makeTxMock()` helper + single `transactionFn.mockImplementation`. (6) **5 new tests**: malformed JSON → 400, empty tenant list → 403, DB fail → 500 (whatsapp-routes); `verifyWhatsapp` NOT_FOUND (channel-routes); `markPaymentPaid` NOT_FOUND (mark-payment-paid). (7) **Design-system fix**: `text-error` → `text-sunset` in Step4ConnectChannel. (8) **`webhookConfigError`/`websiteQueueError` i18n keys** added (en+es). Type-check passes._

---

---

## Reliability + Intelligence Sprint (NC-270 → NC-272)

> **Sprint goal:** Make the platform production-ready for real users on three fronts: (1) WhatsApp reliability — automatically retry failed webhook events instead of silently dropping them; (2) real-time inbox — new messages appear without a manual refresh; (3) advisor intelligence — inject live business data into every advisor conversation, surface it on the dashboard home, and persist session learnings so the advisor accumulates knowledge of the owner's business over time.

---

#### NC-270 [x] WhatsApp dead-letter retry cron

The `webhook_events` table is a dead-letter queue — rows with `processed_at = NULL` are unprocessed messages that failed silently. Currently nothing retries them. Add a 5-minute sweep job.

**Background:** The `setImmediate` callback in `apps/api/src/webhooks/whatsapp.ts` catches errors and logs them, leaving `processed_at = NULL` as the failure signal. The `webhook_events` table currently has no `retry_count` column — add one.

**Cross-app constraint:** `handleMessage`, `findOrCreateWhatsAppCustomer`, and `whatsappAdapter.sendText` all live in `apps/api` — NOT in shared packages. The jobs worker (`apps/jobs`) cannot import from `apps/api` (separate monorepo app). The solution is an internal Hono route on the API that the retry job calls via HTTP. This reuses 100% of the existing pipeline with no code duplication.

**Architecture:** The retry job claims stale rows → calls `POST /api/internal/webhook-retry` on the API with `{ webhookEventId }` + `x-internal-secret` header → the internal route re-runs the full processing pipeline for that row, bypassing signature verification (already verified on first receipt) and idempotency check (row already exists with `processed_at = NULL`).

**Files to create/modify:**
- `packages/db/migrations/0027_webhook_events_retry_count.sql` — add `retry_count` column
- `apps/api/src/routes/internal.ts` — new Hono router with `POST /internal/webhook-retry`
- `apps/api/src/index.ts` (or wherever Hono routes are mounted) — mount internal router at `/api/internal`
- `apps/jobs/src/jobs/whatsapp-retry.ts` — new job file
- `apps/jobs/src/main.ts` — register `*/5 * * * *` cron schedule
- `apps/jobs/src/__tests__/whatsapp-retry.test.ts` — new test file

**Migration (`0027_webhook_events_retry_count.sql`):**
```sql
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;
```

**Internal API route (`apps/api/src/routes/internal.ts`):**
```ts
import { Hono } from 'hono';
// Protected by shared secret — NOT public
export const internalRoutes = new Hono();

internalRoutes.post('/webhook-retry', async (c) => {
  const secret = c.req.header('x-internal-secret');
  if (!secret || secret !== process.env.INTERNAL_RETRY_SECRET) {
    return c.text('Forbidden', 403);
  }
  const { webhookEventId } = await c.req.json();

  // Fetch the stored event
  const { rows } = await servicePool.query<{ tenant_id: string; external_id: string; raw_payload: unknown }>(
    `SELECT tenant_id, external_id, raw_payload FROM webhook_events WHERE id = $1 AND processed_at IS NULL`,
    [webhookEventId],
  );
  if (!rows[0]) return c.text('Not found or already processed', 404);

  const { tenant_id, external_id, raw_payload } = rows[0];

  // Re-run the same async processing pipeline as the live webhook handler
  // (same logic as the setImmediate block in apps/api/src/webhooks/whatsapp.ts)
  const extracted = extractMetaMessage(raw_payload as any);
  if (!extracted) return c.text('OK', 200); // status-only event

  const resolved = await resolveTenantByPhoneNumberId(extracted.phoneNumberId);
  if (!resolved) return c.text('OK', 200);

  const tenantDb = createTenantDb(tenant_id);
  const customerId = await findOrCreateWhatsAppCustomer(tenantDb, tenant_id, extracted.contact.waId, extracted.contact.name);
  const canonical = normalizeMetaMessage(extracted.message, tenant_id, customerId, extracted.contact.waId);
  const result = await handleMessage({ tenantDb, tenantId: tenant_id, channel: 'whatsapp', customerId, messageText: canonical.content.text ?? '[non-text]' });
  await whatsappAdapter.sendText(extracted.contact.waId, result.responseText, { credentials: resolved.credentials, phoneNumber: extracted.phoneNumberId });
  await markWebhookProcessed(tenant_id, external_id);

  return c.text('OK', 200);
});
```

**Job logic (`whatsapp-retry.ts`):**
```ts
// 1. Claim up to 20 stale rows atomically (SKIP LOCKED = no double-processing)
const rows = await servicePool.query<{ id: string }>(
  `UPDATE webhook_events
   SET retry_count = retry_count + 1
   WHERE id IN (
     SELECT id FROM webhook_events
     WHERE processed_at IS NULL
       AND retry_count < 3
       AND created_at < now() - interval '10 minutes'
     ORDER BY created_at
     FOR UPDATE SKIP LOCKED
     LIMIT 20
   )
   RETURNING id`,
);

// 2. For each claimed row: call the internal retry endpoint
for (const row of rows.rows) {
  try {
    const res = await fetch(`${process.env.API_URL}/api/internal/webhook-retry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_RETRY_SECRET! },
      body: JSON.stringify({ webhookEventId: row.id }),
    });
    if (!res.ok) throw new Error(`API returned ${res.status}`);
    // processed_at is set by the internal route on success
  } catch (err) {
    console.error('[whatsapp-retry] Failed attempt for event', row.id, err);
    // retry_count already incremented above — retried next sweep until count = 3
  }
}
```

**Notes:**
- `INTERNAL_RETRY_SECRET` env var must be set on both Railway API and Railway Jobs services
- Follow `createWorker()` factory pattern from `apps/jobs/src/worker.ts` (zero side effects at import)
- Use `DATABASE_URL_SERVICE_ROLE` pool for the claim query — NOT `@camello/db` client
- After 3 failures the row stays with `retry_count = 3` and `processed_at = NULL` — manual intervention required (intentional)

**Acceptance Criteria:**
- Migration `0027_webhook_events_retry_count.sql` adds `retry_count integer NOT NULL DEFAULT 0`
- Job registered on `*/5 * * * *` schedule in `main.ts`
- Skips events newer than 10 minutes (avoid racing the live webhook handler)
- Skips events with `retry_count >= 3`
- Increments `retry_count` atomically before attempting (prevents double-count on crash)
- Sets `processed_at = now()` on success
- At least 3 tests: (1) skips fresh events (<10 min), (2) skips exhausted retries (count=3), (3) increments retry_count on processing failure without crashing job
- `pnpm type-check` passes

**Depends on:** —
_Done: Migration 0027 adds retry_count. `servicePool` exported from `@camello/db`. Internal route `POST /api/internal/webhook-retry` with channel_type + processed_at guards. `whatsapp-retry` cron job (5-min sweep, claims up to 20 rows atomically). Worker REQUIRED_ENV + 5th schedule added. 11 tests across 3 files. `pnpm type-check` passes._

---

#### NC-271 [x] Real-time inbox — Supabase Realtime Broadcast for new messages

When a WhatsApp (or webchat) message arrives, the conversations list and chat thread should update automatically. Currently the owner must refresh manually.

**Background:** Supabase Realtime Broadcast is the planned real-time mechanism (NOT Postgres Changes). Neither a server-side admin broadcast client nor a web browser Supabase client exist yet — both must be created from scratch. The inbox (`/dashboard/conversations`) uses tRPC `conversation.list` and `conversation.byId` queries — these need to be invalidated when a new message arrives for the current tenant.

**Files to create/modify:**
- `apps/api/src/lib/supabase-broadcast.ts` — NEW: creates a Supabase admin client and exports `broadcastNewMessage(tenantId, payload)`. Uses `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (already set on Railway).
- `apps/api/src/webhooks/whatsapp.ts` — call `broadcastNewMessage` after `markWebhookProcessed` in the setImmediate callback
- `apps/api/src/routes/conversation.ts` — call `broadcastNewMessage` in `replyAsOwner`
- `apps/web/src/lib/supabase-client.ts` — NEW: browser Supabase client singleton (`createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)`). Add `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` to Vercel env vars (same project as the existing Supabase instance).
- `apps/web/src/hooks/use-realtime-inbox.ts` — NEW: subscribes to `tenant:{tenantId}` broadcast channel
- `apps/web/src/app/dashboard/conversations/page.tsx` — consume hook, invalidate queries on new event

**Broadcast payload:**
```ts
{
  event: 'new_message',
  tenantId: string,
  conversationId: string,
  channel: 'whatsapp' | 'webchat',
  preview: string,   // first 100 chars of message
  at: string,        // ISO timestamp
}
```

**Channel name:** `tenant:${tenantId}` — scoped per tenant so one tenant's messages never trigger another's inbox refresh.

**`broadcastNewMessage` helper (`apps/api/src/lib/supabase-broadcast.ts`):**
```ts
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

export async function broadcastNewMessage(tenantId: string, payload: NewMessagePayload) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return; // noop in dev
  const channel = supabaseAdmin.channel(`tenant:${tenantId}`);
  await channel.send({ type: 'broadcast', event: 'new_message', payload });
  await supabaseAdmin.removeChannel(channel);
}
```

**`use-realtime-inbox` hook:**
```ts
export function useRealtimeInbox(tenantId: string | null, onMessage: (payload: NewMessagePayload) => void) {
  useEffect(() => {
    if (!tenantId) return;
    const channel = supabaseBrowser
      .channel(`tenant:${tenantId}`)
      .on('broadcast', { event: 'new_message' }, ({ payload }) => onMessage(payload))
      .subscribe();
    return () => { supabaseBrowser.removeChannel(channel); };
  }, [tenantId, onMessage]);
}
```

**Acceptance Criteria:**
- `broadcastNewMessage` called after WhatsApp `markWebhookProcessed` and after `replyAsOwner`
- Conversations page subscribes and invalidates `conversation.list` on `new_message` event
- Active conversation (`byId`) also invalidated if `payload.conversationId` matches
- Channel unsubscribed on component unmount (no memory leaks)
- Graceful noop when `SUPABASE_SERVICE_ROLE_KEY` not set (dev/test environments)
- At least 2 tests: (1) `broadcastNewMessage` called with correct payload after webhook processing, (2) hook triggers invalidation on event receipt (mock Supabase channel)
- `pnpm type-check` passes

**Depends on:** —
_Done: `supabase-broadcast.ts` (lazy admin client, noop without env vars). `broadcastNewMessage` wired into whatsapp.ts (after markWebhookProcessed) + conversation.ts (replyAsOwner, fire-and-forget). `@supabase/supabase-js` added to web. `supabase-client.ts` browser singleton + `use-realtime-inbox.ts` hook. `conversations/page.tsx` uses `useOrganization().publicMetadata.camello_tenant_id`, invalidates list always + byId/messages(no-args)/activity when conversationId matches. 7 tests: broadcast T1 in whatsapp-routes.test.ts, assertion in conversation-reply-as-owner.test.ts, 3 in use-realtime-inbox.test.ts, 4 in conversations-realtime.test.tsx. `pnpm type-check` passes._

---

#### NC-272 [x] Advisor — business snapshot + dashboard panel + session learning
Migration 0028 adds `'advisor'` to `knowledge_docs.source_type`. `advisor-snapshot.ts` lib + `advisorRouter` (snapshot + summarizeSession with advisor-verification pre-flight). Snapshot block injected into advisor system prompt in `message-handler.ts`. `AdvisorPanel` dashboard component with two-phase open, `TestChatPanel` extended with `initialMessages`/`onMessagesChange` optional props. 5 test suites (15 tests). `pnpm type-check` passes.

Make the advisor the owner's real business co-pilot: inject live business data into every conversation so it can answer "how am I doing?", surface it prominently on the dashboard, and store learnings from each session so the advisor accumulates knowledge of the business over time.

**Background:** The advisor artifact exists (`type: 'advisor'`, auto-created in onboarding) but currently has no business data access — it only reads knowledge docs via RAG. The `handleMessage()` pipeline doesn't differentiate advisor artifacts from customer-facing ones. The learning system (`knowledge_docs`) accepts new entries programmatically.

**Files to create/modify:**
- `packages/db/migrations/0028_knowledge_docs_advisor_source.sql` — add `'advisor'` to `source_type` check constraint
- `apps/api/src/routes/advisor.ts` — new router: `snapshot` + `summarizeSession` procedures
- `apps/api/src/routes/index.ts` — register `advisorRouter` as `advisor`
- `apps/api/src/orchestration/message-handler.ts` — inject snapshot context when `artifact.type === 'advisor'`
- `apps/web/src/components/dashboard/advisor-panel.tsx` — new collapsible chat panel
- `apps/web/src/app/dashboard/page.tsx` — render `AdvisorPanel` as first card on home
- i18n: `apps/web/messages/en.json` + `es.json`

**Migration (`0028_knowledge_docs_advisor_source.sql`):**
```sql
-- knowledge_docs has no existing source_type CHECK constraint (confirmed: no prior migration adds one).
-- Drop defensively in case a future migration adds one, then recreate including all known values.
-- IMPORTANT: include 'website' — URL sync may insert rows with source_type = 'website'.
ALTER TABLE knowledge_docs DROP CONSTRAINT IF EXISTS knowledge_docs_source_type_check;
ALTER TABLE knowledge_docs ADD CONSTRAINT knowledge_docs_source_type_check
  CHECK (source_type IN ('upload', 'url', 'website', 'api', 'advisor'));
```

**`advisor.snapshot` procedure (`tenantProcedure`, no input):**
```ts
// Returns a live business snapshot scoped to ctx.tenantId
{
  activeConversations: number,        // conversations created/updated in last 7 days
  conversationTrend: number,          // % delta vs prior 7-day window (signed)
  pendingPayments: { count: number, totalAmount: number, currency: string },
  paidPayments:    { count: number, totalAmount: number },
  leadsByStage: Record<string, number>, // stage → count (from leads table or conversation metadata)
  topKnowledgeGaps: string[],          // top 3 most frequent unanswered intents (owner_notifications type='knowledge_gap', last 30d)
  pendingApprovals: number,            // module_executions with status = 'pending'
  recentExecutions: { slug: string, count: number }[], // module_executions last 7d, grouped by module_slug
}
```
Use `ctx.tenantDb.query()` (Drizzle) for all queries — no raw SQL needed here.

**Context injection in `message-handler.ts`:**
After resolving the artifact (step 0), if `artifact.type === 'advisor'`, fetch `advisor.snapshot` data and prepend a formatted block to the system prompt before the LLM call:
```
=== Business Snapshot (${formattedDate}) ===
Conversations (7d): ${activeConversations} (${trend > 0 ? '+' : ''}${trend}% vs prior week)
Payments pending: ${pendingPayments.count} totalling ${currency} ${totalAmount}
Leads: ${Object.entries(leadsByStage).map(([s,n]) => `${s}: ${n}`).join(' · ')}
Top unanswered questions: ${topKnowledgeGaps.join(', ') || 'none yet'}
Pending approvals: ${pendingApprovals}
==============================================
```
This runs synchronously with step 0 — do NOT add a separate DB round-trip; pass snapshot data directly into the system prompt string. The snapshot fetch happens inside `handleMessage` only when `artifact.type === 'advisor'`.

**`advisor.summarizeSession` procedure (`tenantProcedure`, input: `{ conversationId: z.string().uuid() }`):**
1. Fetch last 20 messages from the conversation (filter by `conversationId` + `tenantId`)
2. Format as `"Owner: ...\nAdvisor: ...\n..."` dialogue
3. Call LLM (use `generateText`, model: `openai/gpt-4o-mini`) with prompt:
   *"Summarize the key business facts, corrections, and decisions from this advisor conversation in 3–5 concise bullet points. Focus on what the owner revealed about their business, not the advisor's responses."*
4. Insert into `knowledge_docs`:
   ```ts
   { tenantId: ctx.tenantId, title: `Advisor session — ${new Date().toLocaleDateString()}`,
     content: summaryText, sourceType: 'advisor', isActive: true }
   ```
5. Return `{ ok: true, summary: summaryText }`

These stored docs are immediately available in future advisor RAG lookups — the advisor's `ragBias` already covers all source types. The advisor will reference past sessions naturally: *"Last time you mentioned your conversion rate is 30%..."*

**Dashboard panel (`advisor-panel.tsx`):**
- Collapsible card rendered **between `KnowledgeBanner` and the hero metrics grid** on dashboard home (after banners, before agents section). Current order: title → ShareLinkCard → OnboardingResumeBanner → KnowledgeBanner → **AdvisorPanel** → hero metrics → YourAgentsSection → ActivityFeedSection.
- Only renders when an advisor artifact exists — wrap in `if (!advisorArtifact) return null`.
- Snapshot query is lazy — fetched only when `AdvisorPanel` mounts, not on initial page load.
- **Collapsed state (default):** One-line header showing live snapshot stats — `"N conversations · N payments pending · N leads"` — plus a "Chat with your advisor ›" chevron
- **Expanded state:** Full chat interface using the existing `TestChatPanel` component (pass `artifactId` of the advisor artifact). Auto-sends an opening message from the advisor: *"Here's your business as of [date]: [top 2 snapshot signals]. What do you want to dig into?"* — generated client-side from snapshot data, no extra LLM call.
- On collapse: if `messageCount >= 3`, call `advisor.summarizeSession({ conversationId })` mutation (fire-and-forget — don't block UI). This stores the session learning.
- Show only when an advisor artifact exists (`byType.get('advisor')` from `trpc.agent.workspace` or a dedicated `advisor.getArtifact` query)
- Gold accent border (`ring-1 ring-gold/30`) matching the AdvisorCard on the artifacts page

**i18n keys (en + es) under `advisor` namespace:**
`advisorPanelHeader`, `advisorPanelCta`, `advisorConversations`, `advisorPaymentsPending`, `advisorLeads`, `advisorOpeningMessage`, `advisorSessionSaved`

**Acceptance Criteria:**
- Migration `0028` adds `'advisor'` to `knowledge_docs.source_type` without breaking existing rows
- `advisor.snapshot` returns accurate, tenant-scoped business data from real DB tables
- System prompt for advisor artifact conversations includes the snapshot block (assert in test: prompt string contains "Business Snapshot")
- `advisor.summarizeSession` stores a `knowledge_docs` row with `source_type = 'advisor'`
- On the next advisor session, past session docs appear in RAG context (RAG test: search returns advisor-source doc)
- Dashboard home renders `AdvisorPanel` as first card; collapsed by default; expands to chat
- Panel collapse with ≥3 messages fires `summarizeSession` mutation
- At least 4 tests: (1) `snapshot` returns correct counts for known fixture data, (2) message-handler injects snapshot block when artifact type = 'advisor', (3) `summarizeSession` inserts knowledge_doc with source_type='advisor', (4) advisor panel renders collapsed state with snapshot stats
- `pnpm type-check` passes

**Depends on:** NC-268 (advisor artifact exists)

---

## Post-Sprint (After NC-268)

After this sprint completes, the product is ready for the first 5-10 real users. Next priorities (to be planned after user feedback):
1. **Email notifications for pending approvals** — Resend infrastructure is already in place (NC-233). The trigger (fire on `module_executions.status = 'pending'`) and the email template are NOT yet built, so this is still real future work despite the infrastructure existing.
2. **Meta Embedded Signup** — Replace manual token entry with a proper OAuth flow (1-week Meta App review required).
3. **Invoice module** — Quote → formatted invoice with shareable link. Integrate Wompi/Nequi for Colombia.

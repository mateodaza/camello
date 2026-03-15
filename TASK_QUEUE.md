# Task Queue — Camello

> **How this file works:** Rolling work queue for NC (Nightcrawler) autonomous execution.
> Tasks use `NC-XXX` / `CAM-XXX` IDs. Format: `#### NC-XXX [ ] Title` (NC regex-parses this).
> Phases = priority groups (P0 first). Dependencies listed per task.
> After completing a task: mark `[x]`, add summary line, update `PROGRESS.md`, commit together.
> When starting a new sprint: update the goal below, add new tasks, collapse old completed tasks.

> **Current sprint:** Dashboard UX Simplification (NC-275 → NC-282)
> Radically simplify the dashboard from 12 pages / 6 nav items to 4 pages / 4 nav items. Inspired by Vapi (single-page agent config), Chatwoot/Crisp (inbox-first home), Intercom (inline test chat). Kill navigation depth, merge scattered config surfaces, apply aggressive progressive disclosure.

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

#### NC-270–NC-274 [x] Reliability + Intelligence Sprint
WhatsApp dead-letter retry cron, Supabase Realtime Broadcast, advisor business snapshot + dashboard panel + session learning, global vs per-agent knowledge split, env.example cleanup, PR audit hardening (11 source fixes + 3 test additions). Migrations 0027-0029.

---

## Dashboard UX Simplification Sprint (NC-275 → NC-282)

> **Sprint goal:** Cut the dashboard from 12 pages / 6 sidebar items to 4 pages / 4 sidebar items. Merge scattered agent config into one scrollable page, make the inbox the home screen, flatten settings, and apply aggressive progressive disclosure. No new features — pure UX restructuring. All existing functionality preserved, just reorganized.

### Sprint guardrails

**No feature deletions.** Every existing capability (analytics charts, knowledge gaps, module settings, trust graduation, billing, channels, profile) is preserved — but reorganized into fewer, more focused pages. Nothing is removed from the codebase, only moved.

**Sales-only MVP simplification.** The current product ships sales-only. Support/Marketing/Custom archetypes are disabled ("coming soon"). The Agents list page exists to show one hero card + 3 disabled cards — this is unnecessary indirection. The single sales agent's config should be directly accessible.

**Existing tRPC routes unchanged.** No backend changes in this sprint. All queries/mutations stay exactly as-is. This is a pure frontend restructuring.

**Test coverage.** Update existing tests to match new page structure. No net test loss.

**Current page inventory (what we're simplifying):**
```
BEFORE (12 pages, 6 nav items):                AFTER (4 pages, 4 nav items):
─────────────────────────────                   ─────────────────────────────
Home (/dashboard)                    ──→        [deleted — inbox is home]
Inbox (/dashboard/conversations)     ──→        Inbox (/dashboard) ← NEW HOME
Agents (/dashboard/artifacts)        ─┐
Agent Workspace (/dashboard/agents/[id])        Agent (/dashboard/agent) ← single page
  → Setup tab (6 sections)           ─┤
  → Dashboard tab (8 sections)       ─┘
Analytics (/dashboard/analytics)     ──→        [folded into Agent page header]
Knowledge (/dashboard/knowledge)     ──→        Knowledge (/dashboard/knowledge)
Settings → Profile                   ─┐
Settings → Billing                   ─┼→        Settings (/dashboard/settings)
Settings → Channels                  ─┘
Docs (/dashboard/docs)               ──→        [deleted — low traffic, move to help link]
```

---

## P0 — Navigation + Inbox Home

#### NC-275 [x] Inbox as home — redirect `/dashboard` to conversations + stat strip

Narrow scope: make the inbox the home page and add a stat strip. Do NOT touch `/dashboard/agent`, `/dashboard/artifacts`, `/dashboard/analytics`, or settings. Those pages continue to work at their current URLs until later tasks replace them.

**Background:** The current `/dashboard/page.tsx` (278 lines) renders: page title, share link card, onboarding resume banner, knowledge sufficiency banner, advisor panel, 4 stat cards, agents section, activity feed. This task replaces it with a redirect to the inbox. The Home page sections that need to survive are moved to the inbox or deferred to later tasks.

**Files to modify:**
- `apps/web/src/app/dashboard/page.tsx` — rewrite to redirect to `/dashboard/conversations`
- `apps/web/src/components/sidebar.tsx` — update nav items (4 items)
- `apps/web/src/app/dashboard/conversations/page.tsx` — add stat strip + onboarding resume banner
- i18n: `apps/web/messages/en.json` + `es.json` — update `sidebar` namespace

**What this task does:**
1. `/dashboard/page.tsx` becomes a redirect to `/dashboard/conversations`
2. Sidebar updates to 4 nav items (see below)
3. Inbox gets a stat strip + onboarding resume banner moved from Home
4. Everything else from the old Home page is simply dropped for now (advisor panel, share link, agents section, activity feed, knowledge banner — later tasks will place them)

**What this task does NOT do:**
- Does NOT create `/dashboard/agent` — that page doesn't exist yet (NC-276 creates it)
- Does NOT add redirects for `/dashboard/artifacts` or `/dashboard/analytics` — those pages keep working as-is at their current URLs until NC-276 and NC-280 replace them
- Does NOT touch settings pages — they keep working at their current URLs until NC-278

**New sidebar nav items (4 total):**
```ts
const navItems = [
  { href: '/dashboard/conversations', label: t('inbox'), icon: MessageSquare, badge: true },
  { href: '/dashboard/artifacts', label: t('agent'), icon: Bot },       // points to EXISTING page (NC-276 will change this href later)
  { href: '/dashboard/knowledge', label: t('knowledge'), icon: BookOpen },
  { href: '/dashboard/settings/billing', label: t('settings'), icon: Settings },  // points to EXISTING page (NC-278 will change this href later)
];
```
**Critical:** The "Agent" and "Settings" sidebar links point to **existing pages** (`/dashboard/artifacts` and `/dashboard/settings/billing`). Do NOT point them to `/dashboard/agent` or `/dashboard/settings` — those routes don't exist yet. Later tasks (NC-276, NC-278) will update the `href` values when the new pages are ready.

**Stat strip at top of Inbox:**
A compact horizontal strip (not cards — just text) above the conversation list showing: `{N} conversations today · {N} pending approvals · {N} active leads`. Uses same tRPC queries as the old Home page (`conversation.todayCount`, `agent.pendingApprovals`, `agent.activeLeads` or equivalent). Each stat is plain text with a count — no click targets needed yet (NC-276 will add the approvals link once the agent page exists).

**Onboarding resume banner:**
Move the banner from the old Home page to the top of the Inbox (above the stat strip). Condition: show when `onboardingComplete !== true`. Link: `/onboarding`. Same component, just a different render location.

**Acceptance Criteria:**
- `/dashboard` redirects to `/dashboard/conversations` (client-side redirect or `page.tsx` renders inbox directly — either approach is fine, prefer whichever avoids a flash)
- Sidebar shows exactly 4 nav items: Inbox, Agent, Knowledge, Settings
- Sidebar "Agent" link points to `/dashboard/artifacts` (existing page)
- Sidebar "Settings" link points to `/dashboard/settings/billing` (existing page)
- Inbox page has a compact stat strip above the conversation list with 3 metrics
- Onboarding resume banner renders at top of inbox when `onboardingComplete !== true`
- Old Home page content (advisor panel, share link card, agents grid, activity feed, knowledge banner) is simply removed — NOT moved to other pages in this task
- All existing routes (`/dashboard/artifacts`, `/dashboard/analytics`, `/dashboard/agents/[id]`, `/dashboard/settings/*`) continue to work unchanged
- i18n: update sidebar label keys (en + es). Old label "Home" → "Inbox", label for artifacts link → "Agent"
- At least 2 tests: (1) `/dashboard` redirects to conversations, (2) sidebar renders 4 nav items with correct hrefs
- `pnpm type-check` passes

**Depends on:** —
_Done: `/dashboard/page.tsx` → client redirect to `/dashboard/conversations`. Sidebar: 6→4 items (Inbox, Agent→`/dashboard/artifacts`, Knowledge, Settings→`/dashboard/settings/billing`). Conversations page: stat strip (today convos, pending approvals, active leads via `dashboardOverview`) + onboarding resume banner. Added `sidebar.agent` i18n key (en+es), 5 inbox stat/banner keys (en+es). Type-check passes._

---

## P0 — Single-Page Agent

#### NC-276 [x] Single-page agent config — merge artifacts + workspace into `/dashboard/agent`

Replace the Agents list page (`/dashboard/artifacts`, 619 lines) and Agent Workspace page (`/dashboard/agents/[id]`, 420 lines) with a single scrollable page at `/dashboard/agent`. Kill the dual-tab (Setup vs Dashboard) pattern. Everything on one page with progressive disclosure.

**Background:** Currently the user flow is: sidebar → Agents → see hero card → click "Open Workspace" → land on workspace → pick Setup or Dashboard tab → find the section they want. That's 3-4 clicks to change the agent's greeting. The new flow: sidebar → Agent → scroll to Personality section → edit. One click.

Since the MVP is sales-only with exactly one agent, the "list" page is pure overhead. If the tenant has no artifact yet, show an empty state with "Create your sales agent" CTA (calls `setupArtifact`).

**Files to create/modify:**
- `apps/web/src/app/dashboard/agent/page.tsx` — NEW: single-page agent config
- `apps/web/src/app/dashboard/artifacts/page.tsx` — rewrite as redirect to `/dashboard/agent`
- `apps/web/src/app/dashboard/agents/[id]/page.tsx` — rewrite as redirect to `/dashboard/agent`
- i18n: `apps/web/messages/en.json` + `es.json`

**Page layout (top to bottom, single scroll):**

```
┌─────────────────────────────────────────────────┐
│ Agent Header                                     │
│ [avatar] Cami · Sales Agent · ● Active          │
│ 127 conversations · 84% automation · 3 pending  │
│                                    [Test Chat]  │
├─────────────────────────────────────────────────┤
│ ▼ Identity (expanded by default)                │
│   Name: [________]  Active: [toggle]            │
│   Greeting: [________________]                  │
│   Quick Actions: [edit list]                    │
│                                        [Save]   │
├─────────────────────────────────────────────────┤
│ ► Personality (collapsed)                       │
│   Instructions, tone preset                     │
├─────────────────────────────────────────────────┤
│ ► Modules & Autonomy (collapsed)                │
│   Module list with autonomy level toggles       │
├─────────────────────────────────────────────────┤
│ ► Approvals ({N} pending) (collapsed, or        │
│   expanded if pending > 0)                      │
│   Inline approve/reject for pending executions  │
├─────────────────────────────────────────────────┤
│ ► Performance (collapsed)                       │
│   Trust graduation + KPI strip + charts         │
│   (content from old Analytics + Dashboard tab)  │
├─────────────────────────────────────────────────┤
│ ► Sales Activity (collapsed)                    │
│   Quotes, Meetings, Payments, Follow-ups        │
│   (4 sub-sections, tabbed or stacked)           │
├─────────────────────────────────────────────────┤
│ ► Advanced (collapsed)                          │
│   Constraints, escalation config, widget        │
│   appearance, routing rules                     │
└─────────────────────────────────────────────────┘
```

**Progressive disclosure rules:**
- **Always expanded:** Identity (most-edited section)
- **Auto-expand if actionable:** Approvals (when `pendingCount > 0`)
- **Collapsed by default:** Everything else — user clicks to expand
- Each section is a `<details>` or collapsible div with a chevron + section title + optional count badge

**Header metrics strip:**
Replaces the separate Analytics page. Shows 3-4 key numbers from the existing `agent.workspace` and `agent.salesComparison` tRPC queries:
- Conversations (7d) with delta badge
- Automation score (%) with progress bar
- Pending approvals (count, clickable → scrolls to Approvals section)
- Active leads (count)

**Inline test chat:**
Floating action button (bottom-right) that opens `TestChatPanel` as a slide-up panel. Same component as the current artifacts page test chat — just mounted here. Lets users verify changes immediately after editing personality/greeting.

**Empty state (no artifact):**
If no sales artifact exists for the tenant, show a centered empty state: illustration + "Create your sales agent" button. Button calls `onboarding.setupArtifact` with default sales config, then invalidates + re-renders.

**Acceptance Criteria:**
- New page at `/dashboard/agent` renders all agent config + performance in a single scroll
- `/dashboard/artifacts` redirects to `/dashboard/agent`
- `/dashboard/agents/[id]` redirects to `/dashboard/agent` (ignores the `[id]` param — MVP has one agent)
- No dual tabs — single scrollable page with collapsible sections
- Identity section expanded by default; Approvals auto-expanded when pending > 0
- Header shows 3-4 KPI metrics (replaces Analytics page)
- Floating test chat button (reuses `TestChatPanel`)
- Empty state when no artifact exists
- Advisor card rendered below the main agent sections (same gold-accent card from artifacts page)
- All existing functionality preserved: personality editing, module config, autonomy toggles, approval actions, trust graduation, sales activity tables
- i18n: new `agent` namespace keys (en + es) — `agentHeader`, `agentIdentity`, `agentPersonality`, `agentModules`, `agentApprovals`, `agentPerformance`, `agentSalesActivity`, `agentAdvanced`, `agentTestChat`, `agentEmpty`, `agentCreate`
- At least 4 tests: (1) page renders agent header with name + type, (2) identity section expanded by default, (3) approvals section auto-expands when pending > 0, (4) redirect from old `/dashboard/artifacts` works
- `pnpm type-check` passes

**Sidebar href update:** After creating `/dashboard/agent`, update the sidebar nav in `apps/web/src/components/sidebar.tsx` to change the "Agent" link from `/dashboard/artifacts` to `/dashboard/agent`.

**Depends on:** NC-275 (sidebar exists with 4 items — this task updates the Agent href)

---

#### NC-277 [x] Advisor panel — move to Agent page

Move the `AdvisorPanel` component from the old Home page to the bottom of the new Agent page.

**Files to modify:**
- `apps/web/src/app/dashboard/agent/page.tsx` — render `AdvisorPanel` below all agent sections
- `apps/web/src/app/dashboard/page.tsx` — remove `AdvisorPanel` import (page is now a redirect)

**Acceptance Criteria:**
- `AdvisorPanel` renders below the last collapsible section on `/dashboard/agent`
- Same behavior: collapsed by default, shows snapshot stats, expands to chat, summarize on close
- Only renders when advisor artifact exists
- At least 1 test: advisor panel renders on agent page when advisor artifact exists
- `pnpm type-check` passes

**Depends on:** NC-276

---

## P1 — Flatten Settings

#### NC-278 [x] One-page Settings — merge Profile + Billing + Channels
Created `settings/page.tsx` with ProfileSection, ChannelsSection, BillingSection in `<details>` accordion. Rewrote 3 sub-pages as redirects, stubbed `settings-nav.tsx`, updated sidebar href + isActive logic, updated i18n (en/es), added 3-test suite. Type-check passes.

Replace the 3-page settings sub-navigation with a single scrollable page using collapsible sections. Kill `settings-nav.tsx` and the layout wrapper.

**Background:** Currently Settings has a horizontal tab bar (Profile / Billing / Channels) routing to 3 separate pages (424 + 272 + 212 = 908 lines). The sections are independent — no shared state between them. Merge into one page with 3 `<details>` sections.

**Files to modify:**
- `apps/web/src/app/dashboard/settings/page.tsx` — NEW: single page with 3 collapsible sections
- `apps/web/src/app/dashboard/settings/layout.tsx` — simplify (remove `SettingsNav`, just render children)
- `apps/web/src/app/dashboard/settings/profile/page.tsx` — rewrite as redirect to `/dashboard/settings`
- `apps/web/src/app/dashboard/settings/billing/page.tsx` — rewrite as redirect to `/dashboard/settings`
- `apps/web/src/app/dashboard/settings/channels/page.tsx` — rewrite as redirect to `/dashboard/settings`
- `apps/web/src/app/dashboard/settings/settings-nav.tsx` — delete (no longer needed; imported from `layout.tsx` line 1)
- i18n: `apps/web/messages/en.json` + `es.json`

**Page layout:**
```
┌─────────────────────────────────────────────────┐
│ Settings                                         │
├─────────────────────────────────────────────────┤
│ ▼ Profile & Branding (expanded by default)      │
│   Avatar, tagline, bio, location, hours,        │
│   social links, language selector               │
│   Share link + QR code                          │
│                                        [Save]   │
├─────────────────────────────────────────────────┤
│ ► Channels (collapsed)                          │
│   WebChat: embed snippet + copy                 │
│   WhatsApp: token + phone number ID + status    │
├─────────────────────────────────────────────────┤
│ ► Billing (collapsed)                           │
│   Current plan badge + renewal date             │
│   Plan cards (Starter/Growth/Scale)             │
│   Billing history table                         │
│   Cancel subscription                           │
└─────────────────────────────────────────────────┘
```

**Acceptance Criteria:**
- Single page at `/dashboard/settings` with 3 collapsible sections
- All 3 old sub-page URLs redirect to `/dashboard/settings`
- `settings-nav.tsx` deleted
- `layout.tsx` simplified to just render `{children}` with page title
- All Profile/Billing/Channels functionality preserved exactly (same forms, same mutations, same validation)
- Profile section expanded by default (most frequently edited)
- i18n: minimal changes — reuse existing keys, just move section headers
- At least 3 tests: (1) profile section expanded by default, (2) billing section shows current plan, (3) old `/dashboard/settings/profile` redirects to `/dashboard/settings`
- `pnpm type-check` passes

**Sidebar href update:** After creating `/dashboard/settings`, update the sidebar nav in `apps/web/src/components/sidebar.tsx` to change the "Settings" link from `/dashboard/settings/billing` to `/dashboard/settings`.

**Depends on:** NC-275 (sidebar exists with 4 items — this task updates the Settings href)

---

## P1 — Knowledge Simplification

#### NC-279 [x] Knowledge page cleanup — reduce visual noise

Simplify the Knowledge page (currently 835 lines, 5 sections) without removing functionality.

**Background:** The Knowledge page has: a collapsible ingest form, knowledge gaps section, documents list with pagination + filters, learning audit log. The ingest form and audit log add visual noise for the common case (reviewing docs + teaching gaps).

**Files to modify:**
- `apps/web/src/app/dashboard/knowledge/page.tsx`
- i18n: `apps/web/messages/en.json` + `es.json`

**Changes:**
1. **Ingest form → modal.** Replace the collapsible inline form with a prominent "Add Knowledge" button (top-right, `variant="default"`, teal) that opens a dialog/modal. Same form fields inside. Benefit: the document list is immediately visible without scrolling past the form.
2. **Knowledge score → page header subtitle.** Move the sufficiency score from a separate widget to inline text in the page header: "Knowledge · Score: 72/100 — Good". Compact, always visible.
3. **Learning audit log → move to Advanced section on Agent page.** The audit log is admin-level detail, not day-to-day. Move it to the Advanced collapsible section on the Agent page (NC-276). Remove from Knowledge page.
4. **Gaps section stays.** Knowledge gaps are the primary teaching loop — keep them prominent, above the documents list.
5. **Scope filter stays.** The All/Global/By Agent toggle is useful — keep it.
6. **Simplify document cards.** Currently each doc card shows: title, source type, chunk count, created date, scope badge, edit title button, delete button. Reduce to: title + scope badge + delete button. Edit title and chunk count are rarely used — hide behind a "..." menu.

**Acceptance Criteria:**
- "Add Knowledge" button opens a modal (replaces inline collapsible form)
- Knowledge score shown as inline text in page header
- Learning audit log removed from this page (moved to Agent page Advanced section in NC-276)
- Document cards simplified: title + scope badge + overflow menu (edit title, delete, view chunks)
- Gaps section stays in current position (above documents)
- Page line count reduced by ~150+ lines
- i18n: add `addKnowledge` key (en + es)
- At least 2 tests: (1) "Add Knowledge" button opens modal, (2) document cards render with overflow menu
- `pnpm type-check` passes

**Depends on:** NC-276 (audit log moves to Agent page Advanced section, which must exist first)
_Done: Ingest form → Dialog modal (reuses existing `Dialog` component). Knowledge score → inline header subtitle ("Score: 72/100 — Good"). Learnings section removed (−205 lines, 835→630). Document table simplified: title + scope badge + overflow `...` menu (edit/delete). No dropdown-menu primitive needed — uses inline expand pattern. 2 i18n keys added (en+es: `knowledgeScoreInline`, `docActions`). Type-check passes._

---

## P2 — Cleanup + Polish

#### NC-280 [x] Route cleanup — redirects, dead pages, orphaned components
analytics/page.tsx → redirect('/dashboard/agent'). docs/page.tsx → notFound() stub (404). Removed analytics+help top-level i18n namespaces (46+19 keys en+es) + sidebar.analytics + sidebar.help. Rewrote analytics-page.test.tsx (2 new tests). Extended i18n-orphans.test.ts with NC-280 block. Type-check passes.

Clean up old routes and components that are no longer directly rendered.

**Files to modify:**
- `apps/web/src/app/dashboard/docs/page.tsx` — delete (or redirect to external help URL)
- `apps/web/src/app/dashboard/analytics/page.tsx` — rewrite as redirect to `/dashboard/agent`
- `apps/web/src/app/dashboard/artifacts/page.tsx` — confirm redirect to `/dashboard/agent` (done in NC-276)
- `apps/web/src/app/dashboard/agents/[id]/page.tsx` — confirm redirect (done in NC-276)
- Remove any sidebar references to deleted routes
- Remove orphaned i18n keys for deleted pages
- Remove unused component imports

**Acceptance Criteria:**
- `/dashboard/docs` → external help link or 404 (not a full page)
- `/dashboard/analytics` → redirect to `/dashboard/agent`
- All old routes that had content now redirect cleanly (no 404s, no white screens)
- No orphaned imports or dead component references
- i18n: remove keys for deleted pages (`docs.*`, `analytics.*` namespaces if fully moved)
- At least 2 tests: (1) `/dashboard/analytics` redirects, (2) `/dashboard/docs` redirects
- `pnpm type-check` passes

**Depends on:** NC-276, NC-278

---

#### NC-281 [x] Collapsible section primitive — shared `<Section>` component
Created `section.tsx` (forwardRef, autoOpen reactive useEffect, Tailwind group-open chevron, badge). Used in agent page (7 sections, modulesRef) and settings page (3 sections). Tests: section.test.tsx (2), agent-page.test.tsx updated. Type-check passes.

Extract the repeated collapsible section pattern into a reusable primitive used by both the Agent page and Settings page.

**Files to create/modify:**
- `apps/web/src/components/dashboard/section.tsx` — NEW: shared collapsible section component
- `apps/web/src/app/dashboard/agent/page.tsx` — use `<Section>` for all collapsible sections
- `apps/web/src/app/dashboard/settings/page.tsx` — use `<Section>` for all collapsible sections

**Component API:**
```tsx
<Section
  title="Personality"
  icon={Sparkles}
  badge={3}                    // optional count badge
  defaultOpen={false}          // collapsed by default
  autoOpen={pending > 0}       // auto-expand when condition is true
>
  {children}
</Section>
```

**Implementation:**
- Uses `<details>` + `<summary>` for native browser expand/collapse (no JS state needed for basic behavior)
- Chevron rotates on open (CSS `details[open] > summary .chevron { rotate: 90deg }`)
- Optional count badge (teal pill) next to title
- `autoOpen` prop: if true, adds `open` attribute programmatically on mount
- Consistent padding, border-bottom between sections
- Accessible: `<summary>` is natively focusable + keyboard-navigable

**Acceptance Criteria:**
- Shared `<Section>` component with `title`, `icon`, `badge`, `defaultOpen`, `autoOpen` props
- Used in Agent page (7+ sections) and Settings page (3 sections)
- Native `<details>/<summary>` for accessibility
- Chevron animation on expand/collapse
- Badge renders when `badge` prop > 0
- `autoOpen` works: section opens automatically when condition is true
- At least 2 tests: (1) section renders collapsed when `defaultOpen={false}`, (2) section auto-opens when `autoOpen={true}`
- `pnpm type-check` passes

**Depends on:** NC-276, NC-278

---

#### NC-282 [ ] Sprint audit — test sweep + i18n cleanup + smoke test

Final audit of the entire sprint. Fix broken tests, remove orphaned i18n keys, verify all redirects work, run full smoke test.

**Files to modify:**
- All test files affected by page restructuring
- `apps/web/messages/en.json` + `es.json` — remove orphaned keys
- Any components with broken imports after moves

**Acceptance Criteria:**
- `pnpm type-check` passes
- All existing tests pass (update imports/paths for moved components)
- No orphaned i18n keys (run `grep` audit: keys in JSON but not referenced in code)
- Manual smoke test checklist:
  - [ ] `/dashboard` → lands on conversations inbox
  - [ ] Sidebar shows 4 items: Inbox, Agent, Knowledge, Settings
  - [ ] `/dashboard/agent` → single-page agent config with collapsible sections
  - [ ] Edit agent greeting → save → test chat → greeting updated
  - [ ] Approve a pending module execution from Agent page
  - [ ] `/dashboard/knowledge` → "Add Knowledge" button opens modal
  - [ ] Knowledge gaps visible and teachable
  - [ ] `/dashboard/settings` → 3 collapsible sections (Profile, Channels, Billing)
  - [ ] Old URLs redirect: `/dashboard/artifacts` → `/dashboard/agent`, `/dashboard/analytics` → `/dashboard/agent`, `/dashboard/settings/profile` → `/dashboard/settings`
  - [ ] Mobile: sidebar collapses, agent page scrollable, settings sections work
- At least 2 new tests for overall flow
- `pnpm type-check` passes

**Depends on:** NC-275, NC-276, NC-277, NC-278, NC-279, NC-280, NC-281

---

---

## Experience Layer Sprint (NC-283 → NC-289)

> **Sprint goal:** Make the product comfortable for non-technical owners. The nav sprint (NC-275–282) made the product navigable — this sprint makes it understandable. Rename developer terminology to plain language, replace complex controls with simple toggles, add contextual tooltips, coach first-time users through empty states, and make the test chat impossible to miss. No new features — pure UX empathy work.

### Sprint guardrails

**i18n symmetry.** Every English label change must have a matching Spanish change. Use the existing `apps/web/messages/{en,es}.json` structure. No new namespaces unless a section is truly new.

**No backend changes.** All terminology lives in i18n files and frontend components. The backend still uses `module`, `artifact`, `autonomy_level`, etc. internally — only user-facing strings change. tRPC procedure names, DB columns, and TypeScript types stay as-is.

**Tooltip component exists.** `apps/web/src/components/ui/tooltip.tsx` is already built (CSS-only hover, `bg-charcoal`, positioned right of trigger). Currently unused anywhere in the dashboard. This sprint activates it.

**Preserve technical accuracy in code.** Variable names, type names, tRPC routes keep their current names (`artifact`, `module`, `autonomyLevel`). Only i18n values and hardcoded UI strings change. This avoids a codebase-wide rename that would break tests and imports.

---

## P0 — Terminology

#### NC-283 [ ] User-facing terminology audit — rename developer language to plain English

Replace every user-facing instance of developer/architecture terminology with language a restaurant owner or salon operator would understand. This is an i18n-only change — no component logic changes, no tRPC renames, no DB migrations.

**Background:** The dashboard currently uses terms like "modules," "executions," "autonomy level," "escalation," "ingestion," and "knowledge gaps." These are accurate engineering terms but meaningless to the target user. Research (Tidio, Vapi, Intercom) shows the most successful platforms use action-oriented plain language: "skills" not "modules," "runs" not "executions," "hand off" not "escalate."

**Files to modify:**
- `apps/web/messages/en.json` — update values (NOT keys) across all namespaces
- `apps/web/messages/es.json` — matching Spanish updates
- Any hardcoded strings in components that bypass i18n (grep for raw English text in `.tsx` files under `agent-workspace/`, `dashboard/`)

**Terminology mapping (comprehensive):**

| Current (user sees) | New (user sees) | Affected i18n keys | Why |
|---|---|---|---|
| Modules | Skills | `boundModules`, `moduleSettings`, `performanceModuleUsageTitle` | "Skills" = what the agent can do. "Modules" = software architecture. |
| Total Executions | Times Used | `metricTotal` | Nobody outside engineering says "execution" |
| Executions (all time) | Runs (all time) | `performanceModuleUsage` | Same |
| Autonomy | Approval Mode | `autonomyLevel` | Owners think about approving, not granting autonomy |
| Fully Autonomous | Automatic | `autonomyFullyAutonomous` | Plain, no jargon |
| Draft & Approve | Review First | `autonomyDraftAndApprove` | Action-oriented: you review, then approve |
| Suggest Only | Manual | `autonomySuggestOnly` | Clearest possible: you do it yourself |
| Escalation acknowledged | Handed off to you | `escalationAcknowledged` | Human language |
| Escalations | Handoffs | `supportEscalations` | Same |
| Knowledge Gaps | Unanswered Questions | `configKnowledgeGapsTitle`, knowledge page header | Immediately understandable |
| Knowledge | What your agent knows | `configKnowledgeTitle` (sidebar label stays "Knowledge" — it's already clear enough there) | Context-dependent: in agent config, "what your agent knows" is clearer |
| {count} documents | {count} topics taught | `configKnowledgeDocs` | "Documents" is vague. "Topics taught" shows value. |
| Answer added to knowledge base | Answer saved — your agent will use this next time | `gapAnswerIngested` | Explains the outcome, not the mechanism |
| Module execution history... | Action history... | `activityEmptyDesc` | Plain |
| Risk | Sensitivity | risk tier labels in module-settings.tsx | "Risk" sounds scary. "Sensitivity" = how careful the agent should be |

**Additional string sweeps (check for hardcoded English):**
- `apps/web/src/components/agent-workspace/module-settings.tsx` — risk tier labels, any hardcoded "Module" text
- `apps/web/src/components/agent-workspace/sales/` — section headers, empty states
- `apps/web/src/app/dashboard/agent/page.tsx` (post NC-276) — section titles

**Acceptance Criteria:**
- Every term in the mapping table updated in both en.json and es.json
- No hardcoded English strings for any term in the mapping table (all go through `t()`)
- i18n keys unchanged (only values change) — no broken references
- Spanish translations are natural, not literal (e.g., "Modo de aprobación" not "Modo de autonomía")
- At least 2 tests: (1) module settings renders "Approval Mode" not "Autonomy", (2) knowledge section renders "Unanswered Questions" not "Knowledge Gaps"
- `pnpm type-check` passes

**Depends on:** NC-276 (agent page must exist so we know which strings are actually rendered)

---

## P0 — Simplify Controls

#### NC-284 [ ] Approval mode toggle — replace autonomy dropdown with plain switch

Replace the 3-option autonomy dropdown per module with a single toggle: "Agent handles this automatically" (on = `fully_autonomous`, off = `draft_and_approve`). Remove `suggest_only` from the UI entirely — it's the least useful mode and adds decision burden.

**Background:** The current module-settings.tsx (lines 58-82) renders a `<select>` dropdown with 3 options per module. For 6 modules, that's 6 dropdowns × 3 options = 18 autonomy decisions. A salon owner doesn't need this granularity. They need one question per skill: "Should my agent do this on its own, or check with me first?"

**Files to modify:**
- `apps/web/src/components/agent-workspace/module-settings.tsx` — replace dropdown with toggle switch
- `apps/web/messages/en.json` + `es.json` — update labels

**New UI per module row:**
```
┌──────────────────────────────────────────────┐
│ 📅 Book Meeting                    [toggle]  │
│ "Agent handles this automatically"           │
│                                              │
│ ⓘ When off, the agent prepares the action   │
│    and asks for your approval first.         │
└──────────────────────────────────────────────┘
```

**Toggle behavior:**
- **ON** → `autonomy_level = 'fully_autonomous'` — agent acts independently
- **OFF** → `autonomy_level = 'draft_and_approve'` — agent drafts, owner approves
- `suggest_only` is still valid in the DB and backend — just not selectable from the UI. If an existing module binding has `suggest_only`, treat it as OFF (same as `draft_and_approve` from the user's perspective: "agent checks with me").

**Risk tier → sensitivity hint:**
Replace the "Low / Medium / High" risk badge with a subtle hint below the toggle for high-sensitivity skills only:
- `send_quote`, `collect_payment`: show `"💡 Most owners keep this on Review First until they trust the agent's pricing"` (i18n key: `sensitivityHint`)
- All others: no hint (default behavior is fine)

**Acceptance Criteria:**
- Dropdown replaced with a toggle switch (shadcn Switch component or `<input type="checkbox">` styled as toggle)
- Toggle label: "Agent handles this automatically" (i18n: `autoToggleLabel`)
- Helper text below toggle when OFF: "When off, your agent prepares the action and asks for your approval first" (i18n: `autoToggleOffHint`)
- Sensitivity hint shown for `send_quote` and `collect_payment` modules only
- `suggest_only` removed from UI but still accepted from backend (backward compat)
- Reuse existing `artifact.attachModule` mutation on toggle change (same procedure used by current dropdown in `module-settings.tsx` line 99). Map toggle ON → `fully_autonomous`, OFF → `draft_and_approve`
- At least 2 tests: (1) toggle ON maps to `fully_autonomous`, (2) toggle OFF maps to `draft_and_approve`
- `pnpm type-check` passes

**Depends on:** NC-276 (module settings rendered inside Agent page)

---

## P1 — Test Chat Prominence

#### NC-285 [ ] Test chat split-pane — persistent side panel on Agent page

Replace the floating action button test chat with a persistent split-pane on the right side of the Agent page. The test chat should be visible and inviting at all times — not hidden behind a FAB.

**Background:** The single most confidence-building action is talking to your own agent. Currently it's a floating button that opens a bottom-sheet modal (on artifacts page) or a slide-up panel. Research (Vapi, Intercom) shows inline test chat — visible alongside the config — is the aha-moment accelerator. Users see their changes reflected immediately.

**Files to modify:**
- `apps/web/src/app/dashboard/agent/page.tsx` — add right split-pane
- `apps/web/src/components/test-chat-panel.tsx` — adapt for inline rendering (not modal). This is the shared component (NOT under `agent-workspace/`). Test file: `apps/web/src/__tests__/test-chat-panel.test.tsx`
- i18n: `apps/web/messages/en.json` + `es.json`

**Layout:**
```
Desktop (≥1024px):
┌────────────────────────────┬──────────────────┐
│ Agent config (scrollable)  │ Test Chat        │
│ ┌────────────────────────┐ │ ┌──────────────┐ │
│ │ Header + metrics       │ │ │ Chat with    │ │
│ ├────────────────────────┤ │ │ your agent   │ │
│ │ ▼ Identity             │ │ │              │ │
│ │ ► Personality          │ │ │ [messages]   │ │
│ │ ► Skills               │ │ │              │ │
│ │ ► Approvals            │ │ │              │ │
│ │ ► Performance          │ │ │ [input]      │ │
│ │ ...                    │ │ └──────────────┘ │
│ └────────────────────────┘ │                  │
└────────────────────────────┴──────────────────┘
  ~65% width                   ~35% width

Mobile (<1024px):
┌────────────────────────────┐
│ Agent config (full width)  │
│ ...                        │
│ [Test your agent] button   │ ← sticky bottom bar
└────────────────────────────┘
  → opens full-screen chat sheet
```

**Split-pane behavior:**
- Desktop: always visible alongside config. Fixed height (`h-[calc(100vh-4rem)]`, sticky). Agent config scrolls independently.
- The chat panel shows a friendly empty state: "Chat with your agent to see how it responds. Try asking about your pricing or booking a meeting."
- Conversation resets when the user saves any config change (new session = fresh test). Show a subtle toast: "Config saved — starting fresh chat."
- Mobile: full-width config page, sticky "Test your agent" button at bottom. Tapping opens `TestChatPanel` as a full-screen sheet.

**Acceptance Criteria:**
- Desktop: 65/35 split-pane, left = scrollable config, right = sticky test chat
- Chat panel always visible on desktop (no toggle/FAB needed)
- Friendly empty state with suggested first message
- Chat resets on config save (new widget session)
- Mobile: sticky bottom button → full-screen chat sheet
- Remove the old floating test chat button (FAB)
- i18n keys (en + es): `testChatTitle`, `testChatEmpty`, `testChatReset`, `testChatMobileButton`
- At least 2 tests: (1) split-pane renders on desktop viewport, (2) mobile renders bottom button instead of split-pane
- `pnpm type-check` passes

**Depends on:** NC-276 (agent page must exist)

---

## P1 — Contextual Help

#### NC-286 [ ] Tooltips — add contextual help to key UI concepts

Add tooltips to every UI element where a non-technical user might pause and think "what does this mean?" Use the existing `Tooltip` component (`apps/web/src/components/ui/tooltip.tsx`).

**Background:** The tooltip component exists but is unused anywhere in the dashboard. It's CSS-only (hover-triggered, `bg-charcoal`, positioned right). This task activates it across the Agent page, Knowledge page, and Settings.

**Files to modify:**
- `apps/web/src/components/ui/tooltip.tsx` — extend if needed (see below)
- `apps/web/src/app/dashboard/agent/page.tsx` — add tooltips to section headers and controls
- `apps/web/src/components/agent-workspace/module-settings.tsx` — tooltip on approval mode toggle
- `apps/web/src/app/dashboard/knowledge/page.tsx` — tooltip on score, gaps
- `apps/web/src/app/dashboard/settings/page.tsx` — tooltip on channels section
- i18n: `apps/web/messages/en.json` + `es.json` — new `tooltips` namespace

**Tooltip component improvements:**
The current component is basic (CSS hover, fixed position). Extend it:
1. Add a small `ⓘ` info icon trigger variant — a 16px circle-info icon that shows the tooltip on hover. This is more discoverable than wrapping arbitrary elements.
2. Support `position` prop: `'right' | 'top' | 'bottom'` (current is right-only). Default to `'top'` for inline use.
3. Max-width: `240px` with text wrapping (current has no max-width — long tooltips overflow).
4. Mobile: tooltips fire on tap (not hover). Add `onClick` handler that toggles visibility for 3 seconds, then auto-hides.

**Tooltip placement map (where + what):**

| Location | Trigger | Tooltip text (en) | i18n key |
|---|---|---|---|
| Agent page → Skills section header | ⓘ next to "Skills" | "Skills are actions your agent can perform — like booking meetings, qualifying leads, or sending quotes." | `tooltipSkills` |
| Agent page → Approval Mode toggle | ⓘ next to toggle | "When automatic, your agent acts on its own. When off, it prepares the action and waits for you to approve in the Approvals section." | `tooltipApprovalMode` |
| Agent page → Approvals section header | ⓘ next to "Approvals" | "Actions your agent has prepared but needs your OK to send to the customer." | `tooltipApprovals` |
| Agent page → Performance section header | ⓘ next to "Performance" | "How your agent is doing — conversations handled, leads qualified, and actions taken." | `tooltipPerformance` |
| Agent page → Trust Graduation card | ⓘ next to title | "As you approve more actions, your agent earns more independence. This card tracks your journey from manual to automatic." | `tooltipTrustGraduation` |
| Agent page → Personality → Instructions | ⓘ next to "Instructions" | "Tell your agent how to behave. Example: 'Always greet warmly. Never discuss competitor pricing. Focus on booking demos.'" | `tooltipInstructions` |
| Agent page → Personality → Tone | ⓘ next to "Tone" | "Sets the overall communication style. Professional works for most businesses. Friendly works well for retail and hospitality." | `tooltipTone` |
| Agent page → Advanced → Constraints | ⓘ next to section | "Rules your agent always follows. 'Never discuss' = topics the agent refuses to talk about. 'Always hand off' = situations where it immediately connects you." | `tooltipConstraints` |
| Knowledge page → Score | ⓘ next to score number | "Measures how well-prepared your agent is. Add more topics and answer unanswered questions to increase your score." | `tooltipKnowledgeScore` |
| Knowledge page → Unanswered Questions | ⓘ next to section header | "Questions your customers asked that your agent couldn't answer from its knowledge base. Teach it the answer and it'll handle them next time." | `tooltipUnansweredQuestions` |
| Knowledge page → Scope toggle | ⓘ next to filter | "'All' shows everything. 'Global' shows knowledge available to all agents. 'By agent' shows knowledge only a specific agent can see." | `tooltipKnowledgeScope` |
| Settings → Channels → Webhook URL | ⓘ next to field | "This is the URL you paste into Meta Business Manager so WhatsApp messages reach your agent." | `tooltipWebhookUrl` |
| Settings → Channels → Verify Token | ⓘ next to field | "A secret code that confirms the connection between Meta and Camello. Paste it into Meta's webhook configuration." | `tooltipVerifyToken` |
| Settings → Channels → Phone Number ID | ⓘ next to field | "The numeric ID next to your phone number in Meta Business Manager. It looks like 123456789012345 — it's NOT your phone number." | `tooltipPhoneNumberId` |

**Acceptance Criteria:**
- Tooltip component extended: `ⓘ` icon trigger variant, `position` prop (top/right/bottom), `max-width: 240px`, mobile tap support
- All 15 tooltips from the placement map implemented with i18n keys (en + es)
- Tooltips discoverable via `ⓘ` icon (not invisible hover zones)
- Mobile: tap to show, auto-hide after 3s
- No tooltips on self-explanatory controls (name input, greeting textarea, active toggle — these don't need explanation)
- At least 3 tests: (1) tooltip renders on hover, (2) ⓘ icon visible next to "Skills" header, (3) mobile tap shows tooltip
- `pnpm type-check` passes

**Depends on:** NC-276 (agent page), NC-283 (terminology — tooltips reference new terms like "Skills")

---

## P1 — Empty States

#### NC-287 [ ] Empty state coaching — contextual "what to do next" prompts

Add friendly, action-oriented empty states to every page that can be empty. Each empty state tells the user what the page is for and gives them one clear next action.

**Background:** After onboarding, a user lands on an inbox with zero conversations and an agent page with no activity data. There's no "here's what to do next" guidance. Research (Tidio, Typebot) shows template-driven empty states with a single CTA dramatically reduce drop-off.

**Files to modify:**
- `apps/web/src/app/dashboard/conversations/page.tsx` — empty inbox state
- `apps/web/src/app/dashboard/agent/page.tsx` — empty approvals, empty performance, empty sales activity
- `apps/web/src/app/dashboard/knowledge/page.tsx` — empty docs state. **Note:** `KnowledgeGuidedEmptyState` (`apps/web/src/components/dashboard/knowledge-guided-empty-state.tsx`) is an existing richer guided component from NC-243. Keep it as-is — it already follows coaching principles. Only add the generic `<EmptyState>` where no bespoke guided state exists.
- `apps/web/src/components/dashboard/empty-state.tsx` — NEW: reusable empty state component
- i18n: `apps/web/messages/en.json` + `es.json` — new `emptyStates` namespace

**Reusable `<EmptyState>` component:**
```tsx
<EmptyState
  icon={MessageSquare}
  title="No conversations yet"
  description="Share your agent's chat link with a customer, or test it yourself."
  action={{ label: "Test your agent", href: "/dashboard/agent" }}
/>
```
Renders: centered icon (48px, muted), title (Jost 600), description (DM Sans, text-dune), optional CTA button (teal).

**Empty state map:**

| Page | Condition | Title | Description | CTA |
|---|---|---|---|---|
| Inbox | 0 conversations | "No conversations yet" | "Share your agent's chat link with a customer, or test it yourself to see how it works." | "Test your agent" → `/dashboard/agent` |
| Agent → Approvals | 0 pending | "Nothing to approve" | "When your agent prepares an action (like a quote or meeting), it'll show up here for your review." | — (no CTA, informational) |
| Agent → Performance | 0 conversations (first week) | "Your agent hasn't had any conversations yet" | "Share your chat link to start getting leads. Performance data appears after your first conversation." | "Copy chat link" → copies share URL |
| Agent → Sales Activity | 0 quotes + 0 meetings + 0 payments | "No sales activity yet" | "As your agent qualifies leads, books meetings, and sends quotes, the activity shows up here." | — |
| Knowledge → Docs | 0 docs | "Your agent doesn't know anything yet" | "Teach it about your business — paste your FAQ, pricing, product descriptions, or any info customers ask about." | "Add Knowledge" → opens ingest modal |
| Knowledge → Unanswered Questions | 0 gaps | "No unanswered questions — nice!" | "Your agent has been able to answer everything customers have asked. Keep your knowledge base updated as your business evolves." | — (positive feedback, no action needed) |

**Acceptance Criteria:**
- Reusable `<EmptyState>` component with `icon`, `title`, `description`, `action` props
- All 6 empty states from the map implemented
- Empty states use design system: Jost headings, DM Sans body, `text-dune` description, `bg-cream` card if inside a section
- CTA buttons use `bg-teal text-cream` (primary style)
- Empty states disappear as soon as data appears (conditional rendering on query results)
- i18n keys (en + es) for all 6 title + description pairs (12 keys total, under `emptyStates` namespace)
- At least 3 tests: (1) inbox shows empty state when 0 conversations, (2) empty state disappears when conversations exist, (3) CTA links to correct page
- `pnpm type-check` passes

**Depends on:** NC-276 (agent page sections), NC-279 (knowledge page structure)

---

## P2 — Polish

#### NC-288 [ ] First-session guide — post-onboarding "what's next" checklist

After onboarding completes, show a dismissible checklist card on the inbox page that guides the user through their first productive session.

**Background:** Onboarding gets the agent configured but doesn't teach the user how to use the dashboard day-to-day. Intercom's "Fin Flywheel" pattern shows that a post-setup guided checklist improves activation rates. This is NOT a new onboarding flow — it's a lightweight checklist that appears after the existing onboarding completes.

**Files to modify:**
- `apps/web/src/components/dashboard/first-session-guide.tsx` — NEW component
- `apps/web/src/app/dashboard/conversations/page.tsx` — render guide above conversation list
- i18n: `apps/web/messages/en.json` + `es.json`

**Checklist items (4 steps):**
```
┌─────────────────────────────────────────────────┐
│ 🎉 Your agent is live! Here's what to do next: │
│                                                  │
│ [✓] Set up your agent              (auto-done)  │
│ [ ] Test a conversation   → "Try it" button     │
│ [ ] Teach your agent more → "Add knowledge"     │
│ [ ] Share your chat link  → "Copy link"         │
│                                          [×]    │
└─────────────────────────────────────────────────┘
```

**State tracking:**
- Stored in `tenants.settings` JSONB as `firstSessionGuide: { dismissed: boolean, testedChat: boolean, addedKnowledge: boolean, sharedLink: boolean }`.
- New `tenant.updateGuideStep` tRPC procedure — lightweight mutation that does `jsonb_set` on the guide state.
- **Exception to "no backend changes" guardrail:** This is a single small mutation (5 lines of tRPC) that writes to existing JSONB. No schema changes, no migration.
- Card disappears permanently when the user clicks dismiss (×) or when all 4 items are checked.
- Auto-detection: `testedChat` = true when tenant has ≥1 conversation. `addedKnowledge` = true when knowledge docs count > the count at onboarding completion. `sharedLink` = true when user clicks "Copy link".

**Acceptance Criteria:**
- Checklist card renders on inbox page when `onboardingComplete === true` and `firstSessionGuide.dismissed !== true`
- 4 items with auto-detection for `testedChat` and `addedKnowledge`
- "Try it" links to `/dashboard/agent` (test chat is there after NC-285)
- "Add knowledge" links to `/dashboard/knowledge`
- "Copy link" copies the `/chat/{slug}` URL and marks `sharedLink = true`
- Dismiss (×) sets `dismissed = true` permanently
- Card fully disappears when all 4 checked OR dismissed
- i18n keys (en + es): `guideTitle`, `guideSetup`, `guideTestChat`, `guideAddKnowledge`, `guideShareLink`
- At least 2 tests: (1) guide renders after onboarding complete, (2) guide hidden when dismissed
- `pnpm type-check` passes

**Depends on:** NC-275 (inbox is home), NC-276 (agent page), NC-285 (test chat on agent page)

---

#### NC-289 [ ] Experience sprint audit — terminology + tooltip + empty state sweep

Final audit of the entire experience sprint. Verify all terminology changes are consistent, tooltips are discoverable, empty states are helpful, and the product feels cohesive for a non-technical first-time user.

**Files to modify:**
- All files touched in NC-283–NC-288
- `apps/web/messages/en.json` + `es.json` — consistency check

**Acceptance Criteria:**
- `pnpm type-check` passes
- All existing tests pass
- Terminology consistency: grep for old terms ("module" as user-facing text, "execution", "autonomy", "escalation", "ingestion") — zero hits outside of code identifiers, comments, and type names
- Tooltip consistency: every `ⓘ` icon has a matching i18n key in both en and es
- Empty state consistency: new empty states use the `<EmptyState>` component. Existing bespoke guided states (e.g., `KnowledgeGuidedEmptyState`) can stay as-is if they already follow coaching principles — don't force them into the generic component
- Manual review checklist:
  - [ ] Read every label on the Agent page aloud — would a restaurant owner understand each one?
  - [ ] Hover every `ⓘ` icon — does the tooltip answer the question "what is this?"
  - [ ] Start with 0 data — does every page have a friendly empty state with a clear next action?
  - [ ] Complete the first-session guide — does it lead to a productive first 10 minutes?
  - [ ] Switch to Spanish — are all new labels translated naturally (not literally)?
  - [ ] Mobile: do tooltips work via tap? Are empty states readable on 375px?
- `pnpm type-check` passes

**Depends on:** NC-283, NC-284, NC-285, NC-286, NC-287, NC-288

---

## Post-Sprint (After NC-289)

After this sprint completes, the product is ready for the first 5-10 real users. Next priorities (to be planned after user feedback):
1. **Email notifications for pending approvals** — Resend infrastructure is already in place (NC-233). The trigger (fire on `module_executions.status = 'pending'`) and the email template are NOT yet built, so this is still real future work despite the infrastructure existing.
2. **Meta Embedded Signup** — Replace manual token entry with a proper OAuth flow (1-week Meta App review required).
3. **Invoice module** — Quote → formatted invoice with shareable link. Integrate Wompi/Nequi for Colombia.

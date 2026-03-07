# Task Queue — Camello

> **How this file works:** Rolling work queue for NC (Nightcrawler) autonomous execution.
> Tasks use `CAM-XXX` IDs. Format: `#### CAM-XXX [ ] Title` (NC regex-parses this).
> Phases = priority groups (P0 first). Dependencies listed per task.
> After completing a task: mark `[x]`, add summary line, update `PROGRESS.md`, commit together.
> When starting a new sprint: update the goal below, add new tasks, collapse old completed tasks.

> **Current sprint:** Sales agent optimization
> Make the sales agent happy path work end-to-end. Fix blockers (approve UI, module config, polling, budget parser), then smarten the agent (scoring, prompts, notifications, auto-flows), then polish the workspace.

## Completed

#### CAM-001 [x] Foundation + intelligence + channels + dashboard + billing + i18n
Full monorepo, 22 tables, RLS, RAG, 9 modules, channel adapters, widget, dashboard, onboarding, Paddle, i18n, production deploy.

#### CAM-002 [x] Public chat + business card + customer memory + agent workspaces
/chat/[slug], business card, abuse prevention, customer memory, archetype registry, all 3 workspace UIs, 20+ agent router procedures, handoffs, RAG bias. Migrations 0001-0015.

#### CAM-007 [x] Follow-up queue cron job
`apps/jobs/src/jobs/process-followups.ts` — pure functions, FOR UPDATE SKIP LOCKED, 5-min cron, unit tests. Type-check passes.

## P0 — Fix Broken Sales Fundamentals

#### CAM-101 [x] Approve/reject UI for pending module executions
Added optimistic UI (`onMutate`/`onError` rollback) to `approveMut`; fixed `useUtils` proxy to 3-level depth and `useMutation` to forward `onMutate` in test mock; added 1 new optimistic-UI test. All 12 ACs satisfied.
The `module.approve` and `module.reject` tRPC procedures are fully implemented server-side but completely unreachable from the frontend. `SalesAlerts` shows gold pending-approval cards with zero action buttons. The owner CANNOT approve quotes or payments — they're permanently stuck at "pending".

**Acceptance Criteria:**
- Add Approve + Reject buttons to pending approval cards in `apps/web/src/components/agent-workspace/sales/sales-alerts.tsx`
- Approve button calls `trpc.module.approve.useMutation({ executionId })` with optimistic UI (card disappears, success toast)
- Reject button opens a small inline form: reason dropdown (wrong_info, not_relevant, bad_timing, other) + optional freeform text, then calls `trpc.module.reject.useMutation({ executionId, reason, freeText })`
- After approve: invalidate `salesAlerts`, `salesQuotes`, `salesPayments` queries so new data appears
- After reject: invalidate `salesAlerts` query, show brief "Rejected — the agent will learn from this" toast
- Pending card shows module output preview (e.g., quote line items + total, or payment amount) so owner has context before approving
- Touch targets >= 36px (a11y), confirm dialog on reject to prevent accidental loss
- i18n keys (en + es): approve, reject, rejectReason, rejectionSent, approvalConfirmed
- `pnpm type-check` passes

**Notes:**
This is the #1 blocker. Without this, `send_quote` and `collect_payment` are dead features. The `module.approve` handler already executes the module and writes output — the frontend just needs buttons. Check `apps/api/src/routes/module.ts` lines 63+ for the approve mutation contract.

#### CAM-102 [x] Module config UI — calendar URL, payment URL, autonomy controls
New `module-settings.tsx` collapsible component renders per-module autonomy dropdown + slug-specific config fields (calendarUrl, paymentUrl, currency/validDays, slaMinutes); inserted below WorkspaceHeader in agents/[id]/page.tsx; en/es i18n keys added. Type-check passes.
`book_meeting` returns "No calendar link configured" because there's no way to set `configOverrides.calendarUrl`. No UI exists to change autonomy levels after artifact creation.

**Acceptance Criteria:**
- New component `apps/web/src/components/agent-workspace/module-settings.tsx`
- Rendered as collapsible section in workspace shell (below workspace header, all agent types)
- Each bound module shows: name, risk tier badge (read-only, colored: low=teal, medium=gold, high=sunset), autonomy level dropdown (fully_autonomous / draft_and_approve / suggest_only)
- Config fields per module type:
  - `book_meeting` → "Calendar URL" text input (placeholder "https://calendly.com/...")
  - `collect_payment` → "Payment URL" text input (placeholder "https://buy.stripe.com/...")
  - `send_quote` → "Default currency" select (USD/EUR/COP/MXN) + "Valid days" number input
  - `escalate_to_human` → "SLA minutes" number input
  - Other modules → no config fields (just autonomy control)
- Save calls existing `artifact.attachModule` tRPC with updated `configOverrides` and `autonomyLevel`
- Backend: add `autonomy_level` to `artifact.attachModule` input schema if not present, set `autonomy_source = 'manual'` on change
- i18n keys (en + es): moduleSettings, calendarUrl, paymentUrl, riskTier, autonomyLevel, saveSettings, settingsSaved
- `pnpm type-check` passes

**Notes:**
`artifact.attachModule` already supports `configOverrides` via upsert. The gap is purely UI + adding autonomy to the upsert. This unblocks `book_meeting` (the most common sales action).

#### CAM-103 [x] Dashboard polling — refetchInterval on workspace queries
Added `refetchInterval: 30_000, refetchIntervalInBackground: false` to 10 tRPC queries across 7 files: `agents/[id]/page.tsx` (workspace), `registry/sales.tsx` (salesPipeline, salesLeads ×2), `sales/sales-alerts.tsx` (salesAlerts), `conversations/[id]/page.tsx` (messages), `conversations/page.tsx` (list), `registry/support.tsx` (supportMetrics, supportTickets, supportEscalations, supportKnowledgeGaps), `registry/marketing.tsx` (marketingInterestMap, marketingEngagement, marketingDrafts). Type-check passes.
All tRPC queries fire once on mount. New leads, messages, approvals are invisible until manual refresh. Add polling as a lightweight real-time stop-gap.

**Acceptance Criteria:**
- Add `refetchInterval: 30_000` (30 seconds) to these queries in `apps/web/src/components/agent-workspace/registry/sales.tsx`:
  - `trpc.agent.workspace` (header KPIs)
  - `trpc.agent.salesLeads` (kanban board)
  - `trpc.agent.salesAlerts` (stale/pending/high-value cards)
  - `trpc.agent.salesPipeline` (pipeline stats + sparklines)
- Add `refetchInterval: 30_000` to conversation detail page message query (`apps/web/src/app/dashboard/conversations/[id]/page.tsx`)
- Add `refetchInterval: 30_000` to conversation list query (`apps/web/src/app/dashboard/conversations/page.tsx`)
- Also add to support and marketing workspace registries for consistency
- Only poll when tab is visible: `refetchIntervalInBackground: false`
- `pnpm type-check` passes

**Notes:**
This is the simplest path to "see live what's going on". Supabase Realtime is better but requires manual wiring (Mateo handles later). 30s polling is a good stop-gap that NC can ship immediately.

#### CAM-104 [x] Robust budget parser for lead estimated_value
Exported `parseBudgetString` from `qualify-lead.ts` (handles $Nk, ~N, USD N, N/month, X-Y ranges, M/B suffixes, null-list); replaced `parseFloat` on line 44; 17 unit tests in `qualify-lead-budget-parser.test.ts`; updated 3 assertions in `module-executor.test.ts`. Type-check passes.
`parseFloat("$5k")` → `NaN` → `estimated_value = null`. Pipeline value, high-value alerts, and revenue metrics are empty for most real leads.

**Acceptance Criteria:**
- New utility function `parseBudgetString(raw: string): number | null` in `packages/ai/src/modules/qualify-lead.ts` (or a shared utility if reused)
- Handles: "$5,000" → 5000, "$5k" → 5000, "$5K" → 5000, "~5000" → 5000, "around 5000" → 5000, "USD 5000" → 5000, "5000/month" → 5000, "$3k-5k" → 4000 (midpoint), "5M" → 5000000, plain "5000" → 5000
- Returns `null` for unparseable strings ("not sure", "flexible", empty)
- Replace `parseFloat(input.budget)` call in qualify-lead.ts with `parseBudgetString(input.budget)`
- Unit tests for all cases above (at least 10 test cases)
- `pnpm type-check` passes

**Notes:**
This directly fixes the empty pipeline value problem. Most real budget strings from LLM extraction include currency symbols, abbreviations, or ranges.

## P1 — Smarter Sales Agent

#### CAM-105 [x] Enhanced lead scoring — multi-signal weighted algorithm
Added `computeLeadScore` (6-signal weighted formula), extended input schema with `asked_pricing`/`is_returning`/`need_count` (no defaults), added `numeric_score` to output, updated `formatForLLM`, 22 tests in `qualify-lead-scoring.test.ts`. Type-check passes.

**Acceptance Criteria:**
- Refactor `packages/ai/src/modules/qualify-lead.ts` execute function
- Weighted scoring: budget mentioned (+30), timeline immediate (+25), timeline soon (+15), needs identified (+10 each, max 3), returning customer (+15), asked about pricing (+10)
- Input schema extended: add optional `asked_pricing: boolean`, `is_returning: boolean`, `need_count: number` fields (backward compatible — all optional with defaults)
- Score thresholds: >= 60 hot, >= 30 warm, < 30 cold
- Stage mapping unchanged: hot → proposal, warm → qualifying, cold → new
- `formatForLLM` includes numeric score: `"Lead scored 75/100 (hot)..."`
- Update unit tests for new scoring logic
- `pnpm type-check` passes

**Depends on:** CAM-104

**Notes:**
The LLM already extracts budget/timeline/needs. New optional fields give it more signals. Existing calls without new fields still work.

#### CAM-106 [x] Sales prompt optimization — objection handling + closing techniques
Updated `packages/ai/src/archetypes/sales.ts` prompts (en + es) with structured objection handling (acknowledge→validate→reframe→offer alternative), urgency detection, trial/assumptive/alternative close techniques, upsell signals, and "never do" rules (~25 lines each). Type-check passes.

**Acceptance Criteria:**
- Update `packages/ai/src/archetypes/sales.ts` prompts (en + es)
- Objection handling framework: acknowledge → validate → reframe → offer alternative
- Urgency detection: deadline/event mentions → match urgency without being pushy
- Closing techniques: trial close, assumptive close, alternative close
- Upsell signals: satisfaction or "what else" → suggest from knowledge base
- "Never do" rules: no fake scarcity, no guilt, no excessive pressure
- Keep under ~25 lines per locale
- `pnpm type-check` passes

#### CAM-107 [ ] Fix onboarding Step 3 module badges + collect profile basics
Step 3 renders all 9 catalog modules instead of the 4 sales modules. No profile data collected during onboarding.

**Acceptance Criteria:**
- `Step3MeetAgent.tsx`: replace `trpc.module.catalog` query with filtered list from archetype's `moduleSlugs` (get from `getArchetype(suggestion.type)` or hardcode sales 4). Only show modules that will actually be bound.
- Add a "Quick profile" section in Step 3 or new Step 3b: tagline (50 chars), one-line bio (150 chars), optional avatar upload. These populate `artifacts.personality` and `tenants.settings.profile`.
- Profile data flows to `/chat/[slug]` OG metadata and business card on go-live
- i18n keys (en + es)
- `pnpm type-check` passes

**Notes:**
The module badge fix is a one-line query change. Profile collection ensures `/chat/[slug]` looks professional from day one.

#### CAM-108 [x] Owner notification channel — in-app chat with the agent
Migration 0016 + `owner_notifications` Drizzle schema; 4 tRPC procedures (ownerNotifications, markNotificationRead, markAllNotificationsRead, unreadNotificationCount); emit approval_needed from onApprovalNeeded, hot_lead from qualify_lead, deal_closed from updateLeadStage, lead_stale from salesAlerts (deduplicated via partial unique index + onConflictDoNothing); NotificationsBell + NotificationsPanel components with 15s polling; WorkspaceHeader rightAction slot; i18n en+es; 5 unit tests.
Instead of email/push, create an "Owner Chat" — a persistent in-app channel where the sales agent notifies the owner about important events. Think of it as the agent reporting to its boss.

**Acceptance Criteria:**
- New concept: `owner_notifications` table (id, tenant_id, artifact_id, type enum, title, body, metadata jsonb, read_at nullable, created_at). Migration 0016. RLS enabled.
- Notification types: `approval_needed`, `hot_lead`, `deal_closed`, `lead_stale`, `escalation`, `budget_warning`
- Backend: new tRPC procedures `agent.ownerNotifications` (paginated list, unread first) and `agent.markNotificationRead` (mutation)
- Emit notifications from existing code paths:
  - `tool-adapter.ts` `onApprovalNeeded` → insert `approval_needed` notification (alongside existing broadcast)
  - `qualify_lead` when score is hot → insert `hot_lead` notification
  - `updateLeadStage` to closed_won → insert `deal_closed` notification
  - `salesAlerts` stale detection → insert `lead_stale` (deduplicated, max 1 per lead per day)
- Frontend: new "Notifications" panel in workspace (bell icon in header with unread count badge)
  - Shows chronological feed of notifications with type icon, title, body, relative time
  - Click notification → navigate to relevant context (lead detail, approval card, conversation)
  - "Mark all read" button
  - Poll every 15 seconds for new notifications (simpler than Realtime, NC can ship it)
- i18n keys (en + es)
- `pnpm type-check` passes

**Notes:**
This is the "get notices when needed" solution without requiring email/SMS infrastructure. The owner opens the workspace and sees what their agent wants to tell them. Later this channel can be mirrored to WhatsApp/email when those are wired.

#### CAM-109 [x] Quote-to-payment auto-flow on approval
New `apps/api/src/lib/insert-payment-for-quote.ts` helper + `if (moduleRow.slug === 'send_quote')` guard in `module.ts` approve handler; 3 tests in `module-approve-quote-payment.test.ts` (payment inserted, non-send_quote skipped, no-lead skipped). Type-check passes.
When owner approves a `send_quote`, auto-create a pending payment record linked to the lead.

**Acceptance Criteria:**
- In `apps/api/src/routes/module.ts` approve handler: after executing `send_quote`, auto-insert `payments` row (status 'pending', amount from quote total, currency, lead_id via conversation lookup)
- Only fires for `send_quote` slug
- Skip if no lead exists for conversation
- Unit test: approve send_quote → payment created
- `pnpm type-check` passes

**Depends on:** CAM-101

#### CAM-110 [ ] Auto-stage progression on re-qualification
A `qualifying` lead stays forever unless manually moved. Enable automatic stage advancement when the agent re-qualifies with better signals.

**Acceptance Criteria:**
- In `qualify_lead` execute: compare new score with existing lead's stage. If new score maps to a more advanced stage (new→qualifying→proposal), update. Never auto-downgrade.
- Add `ctx.db.getLeadByConversation(conversationId)` to `ModuleDbCallbacks` — returns current stage or null
- Stage ordering: new < qualifying < proposal < negotiation < closed_won/closed_lost
- Closed stages are never auto-changed (terminal)
- Emit `lead_stale` → `stage_advanced` owner notification when auto-progression happens
- Unit tests: cold→warm advances new→qualifying, warm→hot advances qualifying→proposal, hot→cold does NOT downgrade
- `pnpm type-check` passes

**Depends on:** CAM-105, CAM-108

## P2 — Workspace Polish

#### CAM-111 [ ] Period-over-period sales comparison
This-week vs last-week comparison on sales overview with delta arrows.

**Acceptance Criteria:**
- New tRPC procedure `agent.salesComparison`: this/last week counts for new_leads, won_deals, total_revenue, conversations
- Week = Monday 00:00 UTC to Sunday 23:59 UTC
- Delta badges on existing stat cards (green up / red down / gray dash)
- Zero-division safe (last week = 0 → "+N new")
- i18n keys (en + es)
- `pnpm type-check` passes

#### CAM-112 [ ] Lead notes and unified activity timeline
Notes on leads + all touchpoints merged into one timeline on lead detail sheet.

**Acceptance Criteria:**
- Migration 0017: `lead_notes` table (id, tenant_id, lead_id FK, author 'owner'|'system', content max 500, created_at). RLS.
- `agent.addLeadNote` mutation + `agent.leadNotes` query
- Lead detail sheet: notes section with textarea + submit, chronological list
- Unified timeline: notes + messages + module executions + stage changes, sorted by timestamp
- i18n keys (en + es)
- `pnpm type-check` passes

#### CAM-113 [ ] Lead source attribution
Track which channel/page brought each lead. Show source breakdown in overview.

**Acceptance Criteria:**
- Migration 0018: add `source_channel text` and `source_page text` to `leads` table
- Populate in `qualify_lead` from `ctx.channel` + `ctx.metadata.sourcePage`
- Extend `ModuleExecutionContext` with optional `channel` and `metadata`
- Wire channel info in `message-handler.ts`
- `agent.salesSourceBreakdown` procedure + bar chart in SalesOverview
- i18n keys (en + es)
- `pnpm type-check` passes

**Depends on:** CAM-112

#### CAM-114 [ ] Revenue forecasting card
Simple weighted pipeline forecast for next 30 days.

**Acceptance Criteria:**
- `agent.salesForecast` procedure: pipeline value * historical stage conversion rates (90-day window)
- Fallback rates for < 5 leads: qualifying 20%, proposal 50%, negotiation 70%
- New card in SalesOverview: "30-day forecast: $X" with stage breakdown
- i18n keys (en + es)
- `pnpm type-check` passes

**Depends on:** CAM-111

#### CAM-115 [ ] Sales auto-follow-up scheduling
Warm/hot leads auto-schedule follow-ups processed by the cron (CAM-007).

**Acceptance Criteria:**
- In `qualify_lead`: if warm/hot AND no `book_meeting` execution exists, create `send_followup` execution with `followup_status: 'queued'`, `scheduled_at`: now+24h (warm) or now+4h (hot)
- Add `ctx.db.checkModuleExecutionExists(conversationId, moduleSlug)` to `ModuleDbCallbacks`
- No double-scheduling (check existing queued follow-up)
- Unit tests: warm=24h, hot=4h, cold=skip, existing booking=skip
- `pnpm type-check` passes

**Depends on:** CAM-105

#### CAM-116 [ ] Conversation summarization on resolve
Auto-generate summary when resolved, shown in conversation list and lead timeline.

**Acceptance Criteria:**
- `summarizeConversation(messages, locale)` in `packages/ai/src/` — cheapest LLM tier, 1-2 sentences
- Triggered async in `conversation.updateStatus` via `setImmediate`
- Stored in `conversations.metadata.summary` (JSONB, no migration)
- Shown in conversation list (truncated 80 chars) and lead detail timeline
- Graceful failure (no-op if LLM fails)
- `pnpm type-check` passes

## Manual / Blocked — Not for NC

#### CAM-200 [🚧] Supabase Realtime wiring (manual — Mateo)
Replace polling with Supabase Realtime subscriptions on frontend. Requires `supabase-js` client setup in `apps/web`.

#### CAM-201 [🚧] WhatsApp Meta Embedded Signup (#47)
Blocked on Meta App review. NC builds frontend + backend once approved.

#### CAM-202 [🚧] Email notifications via Resend (manual — Mateo)
Mirror owner notifications to email. Requires Resend account + API key setup.

# Task Queue — Camello

> **How this file works:** Rolling work queue for NC (Nightcrawler) autonomous execution.
> Tasks use `CAM-XXX` IDs. Format: `#### CAM-XXX [ ] Title` (NC regex-parses this).
> Phases = priority groups (P0 first). Dependencies listed per task.
> After completing a task: mark `[x]`, add summary line, update `PROGRESS.md`, commit together.
> When starting a new sprint: update the goal below, add new tasks, collapse old completed tasks.

> **Current sprint:** Sales Agent Dashboard (NC-221 → NC-230)
> Inbox sprint (NC-201→NC-220) is complete. This sprint adds a Dashboard tab to the Agent Workspace that surfaces all module outputs (quotes, meetings, payments, follow-ups) with inline approval actions. Progressive autonomy model: start 70% manual review, graduate to fully autonomous over time. See `SALES_DASHBOARD_PLAN.md` for full architecture.

### Sprint guardrails

**Foundation:** The inbox (NC-201→NC-220) is the shared operational layer. This sprint extends the Agent Workspace config page with an operational Dashboard tab — it does NOT replace or compete with the inbox.

**Reuse rule for NC:** Before writing new backend routes, check `apps/api/src/routes/module.ts` and `apps/api/src/routes/agent.ts` for existing queries/mutations. Key existing backends: `module.pendingExecutions`, `module.approve`, `module.reject` (with `processRejection()` learning feedback loop), `agent.salesQuotes`, `agent.salesPayments`. Extend only if fields are missing — do NOT duplicate.

**Decision rule for NC:** if a task requires interpretation about inbox vs workspace vs analytics responsibilities, consult `WORKSPACE_ARCHITECTURE.md` first, then `GENERALIST_PLATFORM_SPEC.md`.

## Completed (previous sprints)

#### CAM-001 [x] Foundation + intelligence + channels + dashboard + billing + i18n
Full monorepo, 22 tables, RLS, RAG, 9 modules, channel adapters, widget, dashboard, onboarding, Paddle, i18n, production deploy.

#### CAM-002 [x] Public chat + business card + customer memory + agent workspaces
/chat/[slug], business card, abuse prevention, customer memory, archetype registry, all 3 workspace UIs, 20+ agent router procedures, handoffs, RAG bias. Migrations 0001-0015.

#### CAM-003 [x] Sales Agent Optimization Sprint (CAM-007, CAM-101-116)
Follow-up cron, approve/reject UI, module config, polling, budget parser, lead scoring, prompt optimization, notifications, quote-to-payment flow, auto-stage progression, lead notes/timeline, source attribution, auto-follow-up scheduling, conversation summarization. Migrations 0016-0020. Audited + 13 fixes applied.

#### CAM-004 [x] Launch-Ready Polish Sprint (CAM-107, CAM-111, CAM-114, CAM-117-132)
Onboarding fixes, period comparison, revenue forecast, support resolution+CSAT, knowledge gap UX, marketing stats+drafts, error boundaries, test coverage, a11y audit, conversation filters, dashboard home, settings polish, teach agent UX, widget typing indicator, prompt optimization (support+marketing), performance dashboard, customer insights, smoke test plan. 23 audit fixes applied (ILIKE injection, scoped db racing, empty catches, focus trap, keyboard a11y).

## P0 — Foundation (Backend + Migration)

#### NC-201 [x] Add `display_name` column to customers + backfill migration
**DONE (manually applied).** Migration 0021 applied to Supabase cloud. `displayName` added to Drizzle schema at `packages/db/src/schema/customers.ts:13`. Backfill set "Visitor N" per tenant for unnamed customers.

#### NC-202 [x] `conversation.activity` tRPC procedure
New query returning module executions + stage changes for a specific conversation, chronologically sorted. This powers the right panel activity timeline in the inbox.
**DONE.** Added `activity` procedure to `conversationRouter` (3 sequential DB queries: module executions leftJoin modules, lead lookup, stage changes; JS-merged and sorted ASC). 4 tests in `conversation-activity.test.ts`. Type-check passes.

**Acceptance Criteria:**
- New `conversation.activity` tenantProcedure: input `{ conversationId: uuid }`
- Returns array of `{ type: 'execution'|'stage_change', timestamp, moduleName?, moduleSlug?, input?, output?, fromStage?, toStage? }`
- Joins `module_executions` on `conversation_id` + `leads` / `lead_stage_changes` via the lead linked to that conversation
- Sorted by timestamp ASC
- At least 3 tests (happy path, empty, mixed types)
- `pnpm type-check` passes

#### NC-203 [x] `conversation.replyAsOwner` tRPC mutation
**DONE.** `replyAsOwner` tenantProcedure added to `conversationRouter`. Authorization via `tenant_members.role = 'owner'` DB query (not Clerk JWT). `userFullName` added to `Context` interface + populated in `createContext` via `clerk.users.getUser()`. Inserts `role: 'human'` message with `metadata.authorName`. WhatsApp fire-and-forget delivery via async IIFE + `whatsappAdapter.sendText`. 5 tests in `conversation-reply-as-owner.test.ts`. Type-check passes.
Allow the tenant owner to send a message into an escalated conversation. The message is delivered to the customer through the appropriate channel adapter.

**Acceptance Criteria:**
- New `conversation.replyAsOwner` tenantProcedure: input `{ conversationId: uuid, message: string(1-4000) }`
- Guard: conversation must have `status = 'escalated'` — throw `PRECONDITION_FAILED` otherwise
- Insert into `messages` table: `role: 'human'`, `metadata: { authorName: <from Clerk user> }`. The schema CHECK constraint is `role IN ('customer', 'artifact', 'human', 'system')` — use `'human'` (NOT `'assistant'`, which doesn't exist in the schema).
- For webchat: no push needed (customer polls). For WhatsApp: call WhatsApp send API (fire-and-forget with warn logging)
- Does NOT auto-change conversation status (owner resolves manually)
- At least 4 tests (happy path, non-escalated guard, message insertion, WhatsApp delivery)
- `pnpm type-check` passes

**Notes:** Owner name comes from tRPC context (Clerk user). Use existing channel adapter pattern from `message-handler.ts` for WhatsApp delivery.

#### NC-204 [x] Anonymous customer naming cleanup + display_name read precedence
**DONE.** `findOrCreateWhatsAppCustomer` in `adapters/whatsapp.ts` now accepts `TenantDb`, sets `name: profileName ?? null`; `findOrCreateWebchatCustomer` extracted + exported from `webhooks/widget.ts` with `name: null`. Both use `pg_advisory_xact_lock` + xmax insert detection to assign `display_name = 'Visitor N'` atomically. `conversation.list` + `byId` use `COALESCE(displayName, name, 'Unknown')`. `artifactId` filter added to `conversation.list`. Migration 0022 NULLs out `visitor_%` names and backfills `display_name`. 4 new tests (3 naming + 1 artifactId filter). Type-check passes.
Currently webchat customers are created with `name: visitorId` (raw UUID like `visitor_2ec36d4e78cf2a1b`) in `apps/api/src/webhooks/widget.ts:276`. WhatsApp uses `name: profileName ?? waId` in `apps/api/src/adapters/whatsapp.ts:79`. Both pollute `customers.name` with machine identifiers. Fix the creation flow and read path.

**Acceptance Criteria:**
- **Widget session** (`apps/api/src/webhooks/widget.ts`): stop writing `name: visitorId`. Set `name: null` for anonymous webchat customers. The `externalId` already stores the visitor ID.
- **WhatsApp adapter** (`apps/api/src/adapters/whatsapp.ts`): keep `name: profileName` when available, but set `name: null` when falling back to `waId` (the phone number is already in `phone` and `externalId`).
- **Display name assignment**: on customer insert (not upsert-update), if `name` is null, assign `display_name` atomically using a tenant-scoped counter or tenant-scoped DB lock inside the same transaction. Do not use a naive `MAX(...) + 1` without a lock. The requirement is stable human-readable labels without duplicate "Visitor N" collisions under concurrent inserts.
- **Read precedence** in `conversation.list` and `conversation.byId` (`apps/api/src/routes/conversation.ts`): change `customerName: customers.name` to `customerName: sql<string>\`COALESCE(${customers.name}, ${customers.displayName}, 'Unknown')\``. This way the UI always gets a human-readable name.
- **Add `artifactId` filter** to `conversation.list` input schema: optional UUID, filters via `eq(conversations.artifactId, input.artifactId)`. This is needed by NC-212 ("View conversations" link on agent config page) and by the inbox page to filter by agent. The inbox also reads this from the `artifactId` query param.
- **Backfill**: update existing customers where `name` matches the pattern `visitor_%` — set `name = null`, `display_name = 'Visitor ' || <seq>`. Can reuse the backfill already applied in migration 0021 (already done for unnamed customers), but also needs to NULL out the polluted `name` field. Write migration 0022.
- At least 3 tests (webchat anonymous, WhatsApp with profile name, WhatsApp without profile name)
- `pnpm type-check` passes

**Depends on:** NC-201

## P1 — Inbox Route Contract + 3-Panel UI

#### NC-205 [x] Inbox layout shell: 3-panel responsive component
**DONE.** Created `apps/web/src/components/inbox/inbox-layout.tsx` with `InboxLayout` (3-panel responsive shell), `InboxLeftPanel`, `InboxCenterPanel`, `InboxRightPanel`, and `useInboxPanel` hook. Mobile uses `mobilePanel` state exclusively; tablet toggle uses `rightOpen` exclusively; xl+ always shows all 3 panels. Type-check passes.
Create the `InboxLayout` component — a 3-column layout that adapts to screen size. This is the structural foundation for the inbox page.

**Acceptance Criteria:**
- New component `apps/web/src/components/inbox/inbox-layout.tsx`
- 3 panels: left (320px fixed), center (flex-1), right (340px fixed)
- Right panel hidden below 1280px with toggle button to show/hide
- On mobile (< 768px): only one panel visible at a time (list → chat → details), with back navigation
- Panels separated by `border-charcoal/8` vertical dividers
- Full viewport height minus header (`h-[calc(100vh-4rem)]`)
- Panels scroll independently (each `overflow-y-auto`)
- Export `InboxLayout`, `InboxLeftPanel`, `InboxCenterPanel`, `InboxRightPanel` as named exports
- This is an operational shell, not a redesign exercise. Reuse current dashboard primitives before creating anything bespoke.
- `pnpm type-check` passes

#### NC-206 [x] Inbox route state + left panel conversation list
Implement the left panel of the inbox — conversation list with filter tabs, search, and proper display names.
**DONE.** Created `conversation-list.tsx` (filter tabs, 300ms debounced search, infinite query, status dots, channel icons, escalated/selected row styles, empty state, load more). Rewrote `conversations/page.tsx` as inbox shell using `InboxLayout` with `?selected=` URL sync. Added `inbox` i18n section (en+es, 8 keys). Type-check passes.

**Acceptance Criteria:**
- New component `apps/web/src/components/inbox/conversation-list.tsx`
- Inbox page owns selected conversation state and reads `selected` query param on mount
- Selecting a row updates local state and the URL query param without full navigation
- Filter tabs at top: All / Active / Escalated / Resolved (horizontal pills, `Button` variant)
- Search input with 300ms debounce (reuse existing pattern)
- Each row: display name (from NC-204), summary preview (80 chars, from `conversations.metadata->>'summary'` — already returned by `conversation.list` as `summary`), relative time (`fmtDateTime`), status dot (teal=active, sunset=escalated, dune=resolved), channel icon. Do NOT add a new `lastMessagePreview` query — use the existing `summary` field.
- Escalated rows: sunset left border (2px)
- Selected row: teal left border + bg-sand
- Infinite scroll with "Load more" (reuse existing `conversation.list` infinite query)
- Click row → sets selected conversation ID (prop callback)
- i18n keys (en + es) for filter labels, empty state
- `pnpm type-check` passes

**Depends on:** NC-204, NC-205

#### NC-207 [x] Center panel: chat thread with module execution badges
Implement the center panel — message thread with role-colored bubbles and inline module execution indicators.
**DONE.** Created `apps/web/src/components/inbox/chat-thread.tsx` with role-colored bubbles (customer/artifact/human/system), inline execution + stage-change badges, auto-scroll, scroll-to-bottom button, status header with change buttons. Wired into `conversations/page.tsx`. 24 i18n keys added (en+es). Type-check passes.

**Acceptance Criteria:**
- New component `apps/web/src/components/inbox/chat-thread.tsx`
- Header: customer display name + status badge + status change buttons (Active/Resolved/Escalated)
- Message bubbles colored by role: customer (bg-sand), artifact (bg-midnight text-cream), human/owner (bg-teal text-cream with "You" label)
- Owner messages identified by `role === 'human'` (schema CHECK: customer|artifact|human|system)
- Module execution badges inline between messages: pill-shaped, icon + description (e.g., "Qualified lead — score 85", "Quote sent — $500"). Source: `conversation.activity` query, interleaved chronologically with messages
- Timestamps on messages (xs, opacity-50)
- Auto-scroll to bottom on new messages (with "scroll to bottom" button if scrolled up)
- Empty state when no conversation selected: "Select a conversation" centered text
- Reuse `conversation.messages` query (30s poll)
- Build for legibility first. Do not add typing indicators, optimistic status chips, or presence UI in this task.
- i18n keys (en + es)
- `pnpm type-check` passes

**Depends on:** NC-202, NC-205

#### NC-208 [x] Right panel: customer details + activity timeline + notes
**DONE.** `conversation.byId` extended with LEFT JOIN on `leads` to expose `leadId: string | null`. New `customer-panel.tsx`: `CustomerPanel` (null guard) + `CustomerPanelInner` — 3 collapsible sections (customer info with avatar/email/phone/channel/first-seen/memory facts, activity timeline with CheckCircle/ArrowRight/AlertTriangle icons, notes with `agent.leadNotes` + `agent.addLeadNote`). Wired into `conversations/page.tsx`. 19 i18n keys (en+es). Type-check passes.
Implement the right panel — customer info card, activity timeline, and notes section.

**Acceptance Criteria:**
- New component `apps/web/src/components/inbox/customer-panel.tsx`
- **Customer info section:** Avatar initial (bg-teal/15), display name, email, phone, channel badge, first seen date, memory facts (key-value pairs)
- **Activity timeline:** Chronological list from `conversation.activity` — each item shows icon + description + timestamp. Icons by type: CheckCircle (execution), ArrowRight (stage change), AlertTriangle (escalation)
- **Notes section:** If conversation has a linked lead, show existing notes + "Add note" textarea + submit. Reuse existing `agent.addLeadNote` mutation
- Collapsible sections (customer info default open, activity default open, notes default open)
- i18n keys (en + es)
- `pnpm type-check` passes

**Depends on:** NC-202, NC-205

#### NC-209 [x] Owner reply input for escalated conversations
**DONE.** Added escalated-only reply textarea + send button to `chat-thread.tsx`. Calls `replyAsOwner` mutation. Optimistic message via `optimisticMessages` state merged in `useMemo`. Toast on error via `useToast`. Disable while pending. Info banner, Cmd+Enter shortcut, clear + scroll-to-bottom on success. 5 i18n keys (en+es).
Add the owner reply input at the bottom of the chat thread panel, only visible when conversation is escalated.

**Acceptance Criteria:**
- Reply input: textarea + send button, only rendered when `conversation.status === 'escalated'`
- Calls `conversation.replyAsOwner` mutation
- Optimistic: add message to local list immediately, revert on error
- Toast on error
- Disable input while sending (isPending state)
- Info banner above input: "This conversation was escalated. Your reply will be sent to the customer." (i18n)
- After sending: clear input, scroll to bottom
- i18n keys (en + es)
- `pnpm type-check` passes

**Depends on:** NC-203, NC-207

#### NC-210 [x] Deep-link redirect + mobile responsive inbox
**DONE.** `[id]/page.tsx` → server-component redirect to `?selected=<id>`. `inbox-layout.tsx` → translateX CSS transitions (200ms), desktop via `md:static`. `conversation-list.tsx` → row click calls `goToChat()`. `chat-thread.tsx` → mobile back + details buttons added; status buttons wrapped `hidden md:flex` (375px overflow fix). `customer-panel.tsx` → mobile back-to-chat row. 4 internal links updated. 3 i18n keys (en+es). Type-check passes.
Make the inbox work as the canonical conversation destination on desktop and mobile.

**Acceptance Criteria:**
- Replace `/dashboard/conversations/[id]/page.tsx` with a redirect component that forwards to `/dashboard/conversations?selected=<id>`
- Update all internal links that point to `/dashboard/conversations/<id>` to use `/dashboard/conversations?selected=<id>`
- Mobile (< 768px): show only conversation list by default
- Tap conversation → slide to chat thread (full screen)
- Back button in chat header → return to list
- Customer details: accessible via toggle button in chat header on mobile
- Smooth CSS transitions between panels (transform translateX, 200ms)
- Test on 375px width (iPhone SE)
- `pnpm type-check` passes

**Depends on:** NC-206, NC-207

## P2 — Dashboard Simplification

#### NC-211 [x] Simplify `/dashboard` home page
**DONE.** Removed 4 sections (plan usage, intent breakdown, business KPIs, advanced LLM) + 3 queries. Hero metrics grid (4 StatCards from dashboardOverview), agent grid with type badge + Open link, activity feed sliced to 5 compact rows. 5 i18n keys (en+es). Type-check passes.
Reduce the current overview page to Botly-style hero metrics + agent cards + compact activity feed.

**Acceptance Criteria:**
- 3-4 hero metric cards (large numbers): Total Conversations (today), This Week, Pending Approvals, Active Leads. All from existing `dashboardOverview` output — do not invent new metrics.
- Agent cards row: each agent shows name, type badge, active dot, "Open" link
- Recent activity feed (last 5 events, compact): one-line per event with icon + description + time
- Remove: plan usage card (move to settings/billing), intent breakdown (move to analytics), business KPIs grid (redundant), advanced LLM section (move to analytics)
- Clean, minimal layout — max 1 scroll on desktop
- No new analytics widgets in this task. This is simplification only.
- i18n keys (en + es)
- `pnpm type-check` passes

**Depends on:** NC-210

#### NC-212 [x] Simplify `/dashboard/agents/[id]` to config-only page
**DONE.** `dashboardActivityFeed` in `agent.ts` gained optional `artifactId` filter (`.input(z.object({artifactId: uuid().optional()}).default({}))`). `agents/[id]/page.tsx` rewritten as 6-section config page (Identity, Personality, Modules, Knowledge, Recent Activity, Settings); removed WorkspaceHeader, PriorityIntents, registry, AgentActivity, NotificationsBell. 15 new i18n keys in `agentWorkspace` (en+es). 2 new tests in `agent-dashboard.test.ts`. Type-check passes.
Replace the complex workspace with a clean configuration page.

**Acceptance Criteria:**
- Page sections: Agent Identity (name, type, active toggle) → Personality (instructions, greeting, tone) → Modules (list with autonomy selector) → Knowledge (doc count + link to knowledge page) → Recent Activity (last 5 events for this artifact, compact — see backend note below) → Settings (export data, danger zone)
- **Backend change required:** `dashboardActivityFeed` currently has no input params (tenant-wide only). Add an optional `artifactId?: uuid` input. When provided, add `.where(eq(ownerNotifications.artifactId, input.artifactId))` to the query. This is a one-line filter addition — do NOT create a new procedure.
- Reuse existing `ModuleSettings` component
- Reuse existing `AgentSettingsPanel` component (export + danger zone)
- Personality section: inline editable fields (reuse personality drawer pattern from artifacts page)
- Remove workspace header (3-panel KPI), remove registry sections (kanban, alerts, etc.)
- Add "View conversations" link that navigates to `/dashboard/conversations?artifactId=<id>` (filter by agent)
- Keep a tiny recent activity summary so the page does not feel dead; do not reintroduce workspace-specific dashboards.
- This task simplifies the current agent page for this sprint. It does NOT eliminate specialized workspaces as a future product concept for non-conversation-first agents (see `WORKSPACE_ARCHITECTURE.md`).
- i18n keys (en + es)
- `pnpm type-check` passes

**Depends on:** NC-210

#### NC-213 [x] Promote `/dashboard/analytics` page
**DONE.** Exported `DeltaBadge` + `ForecastCard` from `registry/sales.tsx`. Rewrote `analytics/page.tsx`: unified agent selector replaces two separate selectors; added 4 agent-specific sections (Performance via `AgentPerformance`, Top Intents via `recentLogs` frequency chart, Sales Comparison via `SalesComparisonSection`+`salesComparison`, Revenue Forecast via `ForecastSection`+`salesForecast`); sales sections gated to `type === 'sales'` agents. 6 new i18n keys in `en.json` + `es.json`. Type-check passes.
Move performance charts and metrics from old workspace into a proper analytics page.

**Acceptance Criteria:**
- Reuse `PerformancePanel` component (response time bars, volume sparkline, module usage)
- Add intent breakdown section (from current dashboard home)
- Add sales comparison section (if sales agent active) — reuse `DeltaBadge` + comparison data
- Add revenue forecast card (if sales agent active)
- Agent selector dropdown at top (filter analytics by agent or "All")
- This task moves existing numbers into a dedicated page. Do not invent new metrics or visualizations.
- i18n keys (en + es)
- `pnpm type-check` passes

**Depends on:** NC-210

#### NC-214 [x] Remove old workspace components
Clean up components no longer used after the inbox transition.
**DONE.** Deleted 11 component files (kanban-board, lead-detail-sheet, sales-alerts, sales-payments, after-hours-card, registry/sales+support+marketing+index, workspace-header, priority-intents) and `sales-timeline.test.ts`. Inlined `DeltaBadge`+`ForecastCard` into `analytics/page.tsx`. Removed stale test blocks from `agent-workspace.test.ts` and `a11y-audit.test.tsx`. Type-check + build pass.

**Acceptance Criteria:**
- Delete: `sales/kanban-board.tsx`, `sales/lead-detail-sheet.tsx`, `sales/sales-alerts.tsx`, `sales/sales-payments.tsx`, `sales/after-hours-card.tsx`
- Delete: `registry/sales.tsx`, `registry/support.tsx`, `registry/marketing.tsx`, `registry/index.ts`
- Delete: `workspace-header.tsx`, `priority-intents.tsx`
- Keep: `primitives/*`, `module-settings.tsx`, `agent-settings-panel.tsx`, `agent-activity.tsx`, `workspace-shell.tsx`, `workspace-section-error-boundary.tsx`, `sales/constants.ts`, `performance-panel.tsx`, `notifications-panel.tsx`
- Verify no imports reference deleted files
- `pnpm type-check` passes
- `pnpm build` passes

**Depends on:** NC-211, NC-212, NC-213

## P3 — Polish & Fixes

#### NC-216 [x] Fix book_meeting business hours validation
The book_meeting module currently accepts any time without checking business hours. Feed `personality.hours` into the LLM system prompt and add validation in the module.

**Acceptance Criteria:**
- `packages/ai/src/modules/book-meeting.ts`: add `businessHours` to `configOverrides` schema (optional string)
- In `handleMessage` orchestration: pass `artifact.personality.hours` as `configOverrides.businessHours` to module executor
- LLM system prompt addition: "Business hours: {hours}. Only suggest meeting times within these hours."
- Module output validation: if `proposedTime` falls outside business hours, flag in output (`outsideHours: true`) and include a suggestion within hours
- At least 3 tests
- `pnpm type-check` passes

#### NC-217 [x] i18n for all new inbox components (en + es)
**DONE.** Added `detailsPanelShow`/`detailsPanelHide` keys to `en.json` + `es.json`; wired `useTranslations('inbox')` in `inbox-layout.tsx` to replace 2 hardcoded aria-labels.

**Acceptance Criteria:**
- New `inbox` section in `en.json` and `es.json`
- Keys for: filter tabs, empty states, owner reply banner, activity timeline labels, customer panel sections, mobile back button, "Select a conversation" placeholder
- Verify all hardcoded strings in NC-205..NC-210 are replaced with `t()` calls
- `pnpm type-check` passes

**Depends on:** NC-206, NC-207, NC-208, NC-209

#### NC-218 [x] Accessibility audit on inbox
**DONE.** Keyboard nav (roving tabIndex + ArrowUp/Down/Home/End) on conversation list; `role="listbox/option"` + `aria-selected`; `role="log"` + `aria-live="polite"` + `aria-relevant="additions"` on chat scroll container; focus moves to header on conversation change; `<label>` on owner-reply textarea + notes textarea; `CollapsibleSection` upgraded to `<h3>` wrapper + `aria-expanded` + `aria-controls` + always-in-DOM `hidden` content; touch targets ≥36px on all size="sm" buttons + search input h-9; 3 i18n keys (en + es). Type-check passes.
Ensure the inbox is fully keyboard-navigable and screen-reader friendly.

**Acceptance Criteria:**
- Conversation list: arrow keys to navigate, Enter to select
- Chat thread: proper `role="log"` on message container, `aria-live="polite"` for new messages
- Owner reply: proper `<label>` on textarea
- Right panel sections: proper heading hierarchy (h3)
- Focus management: selecting a conversation moves focus to chat thread header
- Touch targets >= 36px on all interactive elements
- `pnpm type-check` passes

**Depends on:** NC-210

#### NC-219 [x] Update sidebar navigation
Rename and reorder sidebar items to match the new structure.

**Acceptance Criteria:**
- Nav items: Home (overview), Inbox (conversations), Agents (artifacts/config), Analytics, Knowledge, Settings (billing + profile)
- Remove "Help" and "Docs" (stubs) or keep as external links
- Inbox item shows a count badge from `dashboardOverview.pendingApprovalsCount` (already exists — counts `module_executions` with `status = 'pending'`). This is the most actionable inbox signal. Do NOT add a new backend field for this.
- i18n keys (en + es) for renamed items
- `pnpm type-check` passes

**Done:** Renamed nav items (Home/Inbox/Agents/Analytics/Knowledge/Settings), removed Help entry, added pending badge via `dashboardOverview`, added `home`/`inbox`/`settings` i18n keys to en+es.

#### NC-220 [x] Sprint smoke tests + summary
Final task. Write smoke tests covering the end-to-end inbox loop and produce a sprint summary.

**Acceptance Criteria:**
- **Smoke test file:** `apps/api/src/__tests__/inbox-smoke.test.ts` (Vitest)
- Tests must cover the critical path through the sprint deliverables:
  1. `conversation.activity` returns module executions + stage changes for a conversation (NC-202)
  2. `conversation.replyAsOwner` inserts a `role: 'human'` message and rejects non-escalated conversations (NC-203)
  3. `conversation.list` returns COALESCE'd display names (no raw `visitor_*` IDs) and supports `artifactId` filter (NC-204)
  4. `dashboardActivityFeed` accepts optional `artifactId` and filters correctly (NC-212 backend change)
- Each test: setup → act → assert. Use `createCallerFactory` pattern from existing test files (see `learning-routes.test.ts`).
- Minimum 6 test cases across the 4 areas above.
- `pnpm type-check` passes
- **Sprint summary:** Update `PROGRESS.md` with a "Workspace v2 Sprint Summary" section:
  - Total tasks completed (count)
  - New files created (list)
  - Files modified (list)
  - Migrations written (list with numbers)
  - New tRPC procedures added (list)
  - Components created (list)
  - i18n keys added (approximate count)
  - Known limitations or deferred items
  - `pnpm build` output (pass/fail)
  - `pnpm type-check` output (pass/fail)

**Depends on:** NC-214, NC-216, NC-217, NC-218, NC-219

**Done:** Created `apps/api/src/__tests__/inbox-smoke.test.ts` — 8 tests across AC 1–4 using `createCallerFactory` pattern; fixed mock paths (non-routes file uses `../` not `../../`). Updated `PROGRESS.md` with Sprint Summary. Type-check passes.

## Sales Agent Dashboard Sprint (NC-221 → NC-230)

> **Sprint goal:** Complete the Sales agent operational loop. Surface all module outputs (quotes, meetings, payments, follow-ups) in the Agent Workspace Dashboard tab, with inline approval actions. Progressive autonomy: 70% manual review → fully autonomous over time. Trust graduation card makes the autonomy model visible. Visual polish pass at the end. See `SALES_DASHBOARD_PLAN.md` for full architecture.

#### NC-221 [x] Tab navigation on agent workspace
**DONE.** Added `activeTab` state + pill-style tab bar (Setup/Dashboard) to `agents/[id]/page.tsx`. All 6 config sections wrapped under Setup tab conditional. Dashboard tab renders placeholder. 3 i18n keys added (en+es). Type-check passes.
**Files:** `agents/[id]/page.tsx`, i18n (en+es)
**Depends on:** —

#### NC-222 [ ] Quotes section
Reuse existing `agent.salesQuotes` tRPC query. **Backend gap:** current query returns raw `output` JSONB but no customer label or normalized amount/status fields. First enrich `salesQuotes` to LEFT JOIN customers for `customerName` and extract `output->>'total'` as `amount`, `output->>'status'` as `quoteStatus`. Then build `DataTable` UI with columns: Customer | Amount | Status | Date. Row click → deep link to conversation in inbox.
**Files:** `agent.ts` (enrich query), `sales/quotes-section.tsx`, i18n
**Depends on:** NC-221

#### NC-223 [ ] Meetings section
New `salesMeetings` tRPC query (module_executions filtered by `book_meeting` + LEFT JOIN customers). CardFeed UI with upcoming/past sort.
**Files:** `agent.ts`, `sales/meetings-section.tsx`, i18n
**Depends on:** NC-221

#### NC-224 [ ] Payments section
Reuse existing `agent.salesPayments` tRPC query (already returns amount, currency, status, customerName, dueDate, paidAt with LEFT JOIN customers). Build `DataTable` UI with status badges mapped to real `paymentStatusSchema` enum (`pending | sent | viewed | paid | overdue | cancelled`). Badge colors: teal=paid, gold=pending/sent/viewed, sunset=overdue/cancelled. Row click → inbox deep link.
**Files:** `sales/payments-section.tsx`, i18n
**Depends on:** NC-221

#### NC-225 [ ] Follow-ups section
New `salesFollowups` tRPC query (module_executions filtered by `send_followup` + LEFT JOIN customers). Simple card list.
**Files:** `agent.ts`, `sales/followups-section.tsx`, i18n
**Depends on:** NC-221

#### NC-226 [ ] i18n audit for all Dashboard sections (en + es)
Final pass ensuring all NC-221→NC-229 strings are in both locale files. Tab labels, column headers, empty states, status labels.
**Files:** `en.json`, `es.json`
**Depends on:** NC-222, NC-223, NC-224, NC-225, NC-228, NC-229

#### NC-227 [ ] Wire Performance + Activity into Dashboard tab
Move existing `AgentPerformance` and `AgentActivity` components into Dashboard tab. Remove redundant "Recent Activity" from Setup tab.
**Files:** `agents/[id]/page.tsx`
**Depends on:** NC-221

#### NC-228 [ ] Pending Approvals section with approve/reject actions
Reuse existing `module.pendingExecutions` query (already supports `artifactId` filter), `module.approve` mutation (race-safe atomic transition + module re-execution), and `module.reject` mutation (includes `processRejection()` learning feedback loop). Do NOT create duplicate routes in `agent.ts`. Build UI: list with inline Approve/Reject buttons per pending item. Reject flow: reason picker (required, enum: `false_positive | wrong_target | bad_timing | incorrect_data | policy_violation`) + optional free-text field (max 500 chars) → calls `module.reject({ executionId, reason, freeText })`. This is the key UI for the progressive autonomy model (draft_and_approve → fully_autonomous graduation).
**Files:** `sales/approvals-section.tsx`, i18n
**Depends on:** NC-221

#### NC-229 [ ] Trust graduation card on Dashboard tab
Show autonomy progress card at top of Dashboard: "N of M modules fully autonomous" with per-module status (suggest_only → draft_and_approve → fully_autonomous). For modules on `draft_and_approve`, show approval streak ("12 approved in a row — ready to graduate?") computed from recent `module_executions` (count consecutive `status='executed'` with no `rejected` in last 20). CTA links to Setup → Modules to change autonomy level. This makes the progressive trust model visible and encourages graduation.
**Files:** `sales/trust-graduation-card.tsx`, i18n (en+es)
**Depends on:** NC-221

#### NC-230 [ ] Visual polish pass on agent workspace
Improve visual hierarchy and feel of the workspace page. Both tabs. Specifics: section header icons (consistent with sidebar icon set), spacing hierarchy (hero sections vs secondary), loading skeletons for all Dashboard sections, subtle bg tint differentiation (Dashboard sections get a slightly different card feel than Setup forms), status color consistency audit across all badge/dot/pill components. Follow existing design system (CSS vars, Jost/DM Sans, 8px grid). No new dependencies.
**Files:** `agents/[id]/page.tsx`, section components, i18n if needed
**Depends on:** NC-226 (after all sections exist)

## Manual / Blocked — Not for NC

#### CAM-200 [manual] Clerk production keys (Mateo)
Swap dev keys for prod in env vars + Clerk dashboard config.

#### CAM-201 [manual] Paddle business verification (Mateo)
Submit business docs for Paddle verification.

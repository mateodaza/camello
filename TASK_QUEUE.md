# Task Queue — Camello

> **How this file works:** Rolling work queue for NC (Nightcrawler) autonomous execution.
> Tasks use `CAM-XXX` IDs. Format: `#### CAM-XXX [ ] Title` (NC regex-parses this).
> Phases = priority groups (P0 first). Dependencies listed per task.
> After completing a task: mark `[x]`, add summary line, update `PROGRESS.md`, commit together.
> When starting a new sprint: update the goal below, add new tasks, collapse old completed tasks.

> **Current sprint:** Launch-Ready Polish
> Make the product presentable for first real users. Fix onboarding gaps, finish workspace analytics, flesh out support/marketing workspaces, and harden for production.

## Completed (previous sprints)

#### CAM-001 [x] Foundation + intelligence + channels + dashboard + billing + i18n
Full monorepo, 22 tables, RLS, RAG, 9 modules, channel adapters, widget, dashboard, onboarding, Paddle, i18n, production deploy.

#### CAM-002 [x] Public chat + business card + customer memory + agent workspaces
/chat/[slug], business card, abuse prevention, customer memory, archetype registry, all 3 workspace UIs, 20+ agent router procedures, handoffs, RAG bias. Migrations 0001-0015.

#### CAM-003 [x] Sales Agent Optimization Sprint (CAM-007, CAM-101-116)
Follow-up cron, approve/reject UI, module config, polling, budget parser, lead scoring, prompt optimization, notifications, quote-to-payment flow, auto-stage progression, lead notes/timeline, source attribution, auto-follow-up scheduling, conversation summarization. Migrations 0016-0020. Audited + 13 fixes applied.

## P0 — Finish Open Items

#### CAM-107 [ ] Fix onboarding Step 3 module badges + collect profile basics
Step 3 renders all 9 catalog modules instead of the archetype's modules. No profile data collected during onboarding.

**Acceptance Criteria:**
- `Step3MeetAgent.tsx`: replace `trpc.module.catalog` query with filtered list from archetype's `moduleSlugs` (get from `getArchetype(suggestion.type)` or hardcode sales 4). Only show modules that will actually be bound.
- Add a "Quick profile" section in Step 3 or new Step 3b: tagline (50 chars), one-line bio (150 chars), optional avatar upload. These populate `artifacts.personality` and `tenants.settings.profile`.
- Profile data flows to `/chat/[slug]` OG metadata and business card on go-live
- i18n keys (en + es)
- `pnpm type-check` passes

#### CAM-111 [ ] Period-over-period sales comparison
This-week vs last-week comparison on sales overview with delta arrows.

**Acceptance Criteria:**
- New tRPC procedure `agent.salesComparison`: this/last week counts for new_leads, won_deals, total_revenue, conversations
- Week = Monday 00:00 UTC to Sunday 23:59 UTC
- Delta badges on existing stat cards (green up / red down / gray dash)
- Zero-division safe (last week = 0 → "+N new")
- i18n keys (en + es)
- `pnpm type-check` passes

#### CAM-114 [ ] Revenue forecasting card
Simple weighted pipeline forecast for next 30 days.

**Acceptance Criteria:**
- `agent.salesForecast` procedure: pipeline value * historical stage conversion rates (90-day window)
- Fallback rates for < 5 leads: qualifying 20%, proposal 50%, negotiation 70%
- New card in SalesOverview: "30-day forecast: $X" with stage breakdown
- i18n keys (en + es)
- `pnpm type-check` passes

**Depends on:** CAM-111

## P1 — Support & Marketing Workspace Substance

#### CAM-117 [ ] Support workspace: ticket resolution flow
The support workspace shows tickets but has no way to resolve them or collect feedback.

**Acceptance Criteria:**
- "Resolve" button on each open ticket in `registry/support.tsx` — calls existing `conversation.updateStatus` with `status: 'resolved'`
- After resolve: inline 1-5 star CSAT rating prompt (optional, stored in `conversations.metadata.csat`)
- New tRPC procedure `agent.supportResolutionStats`: resolved count, avg CSAT, resolution rate (resolved/total) for last 30 days
- Stats shown as `MetricsGrid` row at top of support workspace
- Ticket list shows resolved tickets grayed out with CSAT star if rated
- i18n keys (en + es)
- `pnpm type-check` passes

#### CAM-118 [ ] Support workspace: knowledge gap detection
Surface questions the agent couldn't answer so the owner can fill gaps.

**Acceptance Criteria:**
- New tRPC procedure `agent.supportKnowledgeGaps`: queries conversations where `metadata.ragConfidence < 0.3` OR `metadata.fallbackUsed = true`, groups by intent, returns top 10 with count + sample question
- New `CardFeed` section in support workspace: "Knowledge Gaps" — each card shows the question cluster, count, and a "Add to Knowledge Base" button
- "Add to Knowledge Base" button opens a textarea pre-filled with the sample question, calls existing `knowledge.ingest` on submit
- i18n keys (en + es)
- `pnpm type-check` passes

**Notes:**
The RAG pipeline already tracks confidence. This surfaces low-confidence patterns so the owner can teach the agent. Read `packages/ai/src/rag.ts` for confidence scoring and `apps/api/src/routes/knowledge.ts` for the ingest procedure.

#### CAM-119 [ ] Marketing workspace: interest stats + draft content feed
The marketing workspace is a skeleton. Add substance.

**Acceptance Criteria:**
- New tRPC procedure `agent.marketingStats`: total interests captured (from `capture_interest` executions), top 3 interest categories, draft content count (from `draft_content` executions)
- `MetricsGrid` row at top of marketing workspace with interests captured, categories, drafts pending
- `CardFeed` section: "Content Drafts" — each card shows draft title, preview (80 chars), created date, and Approve/Edit/Discard buttons
- Approve = mark execution `status: 'completed'` (existing mutation pattern)
- Discard = mark execution `status: 'rejected'`
- Edit = open textarea with full draft, save updates `output` JSONB
- i18n keys (en + es)
- `pnpm type-check` passes

**Notes:**
Follow the pattern from `sales-alerts.tsx` for approve/reject mutations with optimistic UI. Read `packages/ai/src/modules/draft-content.ts` and `capture-interest.ts` for output schemas.

## P2 — Production Hardening

#### CAM-120 [ ] Error boundary + global error handling audit
Catch uncaught errors gracefully across the dashboard.

**Acceptance Criteria:**
- Add React Error Boundary component wrapping each workspace section (not the whole page — one section crash shouldn't kill the workspace)
- Error boundary renders inline error card with "Something went wrong" + "Retry" button (calls `reset()`)
- Audit all `useMutation` calls: ensure every mutation has `onError` handler (at minimum a toast)
- Audit all `useQuery` calls with `refetchInterval`: ensure `retry: 2` is set (don't hammer a down backend)
- i18n keys (en + es) for error boundary messages
- `pnpm type-check` passes

**Notes:**
Focus on the workspace page (`agents/[id]/page.tsx`) and its registry components. The conversations pages already have `QueryError` handling.

#### CAM-121 [ ] Test coverage push for new tRPC procedures
Add integration tests for procedures added in the sales optimization sprint.

**Acceptance Criteria:**
- Tests for: `agent.ownerNotifications`, `agent.markNotificationRead`, `agent.markAllNotificationsRead`, `agent.unreadNotificationCount`, `agent.salesSourceBreakdown`
- Follow existing pattern in `apps/api/src/__tests__/routes/` using `createCallerFactory`
- Mock `tenantDb.query` via callback interception (see `learning-routes.test.ts`)
- At least 3 tests per procedure (happy path, empty data, edge case)
- `pnpm type-check` passes

#### CAM-122 [ ] Accessibility audit on new components
Ensure all components from the sales optimization sprint meet a11y standards.

**Acceptance Criteria:**
- Audit these files: `module-settings.tsx`, `notifications-panel.tsx`, `lead-detail-sheet.tsx`, `sales-alerts.tsx` (reject form), `sales-overview.tsx` (source chart)
- All interactive elements have `aria-label` or visible label
- All form inputs have associated `<label>` elements
- Focus order is logical (tab through approve→reject→form fields)
- Color contrast meets WCAG AA on all text (check dune-on-cream, gold-on-white)
- Keyboard navigation: Enter/Space activates buttons, Escape closes sheets/modals
- Touch targets >= 36px (already enforced, verify new additions)
- `pnpm type-check` passes

## P3 — Dashboard UX & Onboarding Improvements

#### CAM-123 [ ] Conversation list redesign — filters + search
The conversation list is a flat chronological dump. Add filtering and search.

**Acceptance Criteria:**
- Add filter bar above conversation list in `apps/web/src/app/dashboard/conversations/page.tsx`
- Filters: status (all/active/resolved), channel (all/web_chat/whatsapp), date range (last 7d/30d/all)
- Search input: filters by customer name or message content (ILIKE on `conversations.metadata` + join to `messages.content`)
- New tRPC input params on `conversation.list`: `status`, `channel`, `search`, `dateRange`
- Debounced search (300ms)
- i18n keys (en + es)
- `pnpm type-check` passes

**Notes:**
The existing `conversation.list` procedure already paginates. Extend the input schema with optional filter fields. Use `and()` in the Drizzle `where` clause to compose filters.

#### CAM-124 [ ] Dashboard home page — activity feed + quick stats
The `/dashboard` page is bare. Add a useful landing view.

**Acceptance Criteria:**
- New tRPC procedure `agent.dashboardOverview`: total conversations (today/week), unread notifications count, pending approvals count, active leads count. Scoped to tenant (all artifacts).
- Activity feed: last 10 events across all artifacts (new lead, conversation resolved, approval needed, deal closed). Reuse `ownerNotifications` data.
- Quick stat cards using `MetricsGrid` pattern
- "Your Agents" list with status indicators (active/paused) and link to workspace
- i18n keys (en + es)
- `pnpm type-check` passes

**Depends on:** CAM-108 (notifications exist)

#### CAM-125 [ ] Settings page polish — danger zone + data export
The settings pages need a few more features before launch.

**Acceptance Criteria:**
- "Danger Zone" section on settings page: "Delete Agent" button (confirmation dialog → calls `artifact.delete` which soft-deletes)
- New tRPC procedure `artifact.delete`: sets `artifacts.status = 'archived'`, does NOT hard delete. Archived agents hidden from dashboard list but data preserved.
- "Export Data" button: generates JSON download of all leads + conversations for the artifact (client-side blob download from tRPC query)
- New tRPC procedure `agent.exportData`: returns leads + conversations + notes as JSON (limit 1000 records, warn if truncated)
- i18n keys (en + es)
- `pnpm type-check` passes

#### CAM-126 [ ] Onboarding wizard — Step 4 (Teach Agent) improvements
Step 4 lets owners add knowledge but the UX is minimal.

**Acceptance Criteria:**
- Add "Suggested topics" section: based on archetype, show 3-4 prompts like "Add your pricing info", "Describe your services", "Add FAQ answers". Each is a clickable card that pre-fills the textarea.
- Show knowledge base count badge: "3 documents added" with progress indicator
- Add URL ingestion field: paste a URL, backend fetches + chunks it (uses existing `knowledge.ingestUrl` procedure)
- Validate minimum: soft warning if 0 docs added ("Your agent works better with knowledge")
- i18n keys (en + es)
- `pnpm type-check` passes

**Notes:**
Read `apps/web/src/components/onboarding/step4-teach-agent.tsx` for current implementation. The URL ingestion backend already exists in `apps/api/src/routes/knowledge.ts`.

#### CAM-127 [ ] Widget chat — typing indicator + message status
The widget feels static. Add basic interaction feedback.

**Acceptance Criteria:**
- Typing indicator: show animated dots while waiting for AI response (CSS-only animation, reuse `chat-page.module.css` pattern)
- Message status: sent (single check), delivered (double check), error (red X with retry). Track via message `metadata.status`.
- Auto-scroll to bottom on new message (with "scroll to bottom" button if user has scrolled up)
- Smooth message appear animation (fade-in + slide-up, CSS transition)
- Changes in `apps/widget/src/` only (widget is self-contained IIFE)
- `pnpm type-check` passes

**Notes:**
The widget is a Vite IIFE bundle (`apps/widget/`). It communicates via HTTP to `/api/widget/*`. The typing indicator is purely client-side (show while fetch is pending). Read `apps/widget/src/App.tsx` for current structure.

#### CAM-128 [ ] Support prompt optimization — empathy + escalation intelligence
The support archetype prompts are basic. Improve them like we did for sales (CAM-106).

**Acceptance Criteria:**
- Update `packages/ai/src/archetypes/support.ts` prompts (en + es)
- Empathy framework: acknowledge frustration → validate concern → provide solution → confirm resolution
- Escalation intelligence: recognize when the agent should escalate (repeated failures, anger signals, complex technical issues, billing disputes)
- De-escalation techniques: for angry customers, slow down, avoid defensive language, offer concrete next steps
- Knowledge gap handling: when unsure, say so honestly + offer to connect with human rather than guessing
- "Never do" rules: no dismissive language, no "I'm just an AI", no false promises about resolution time
- Keep under ~25 lines per locale
- `pnpm type-check` passes

#### CAM-129 [ ] Marketing prompt optimization — engagement + content strategy
The marketing archetype prompts are basic. Improve them like we did for sales (CAM-106).

**Acceptance Criteria:**
- Update `packages/ai/src/archetypes/marketing.ts` prompts (en + es)
- Interest capture: recognize buying signals, event interest, product curiosity → capture structured data
- Content tone matching: mirror the brand voice from knowledge base (professional, casual, technical)
- Lead warming: for returning visitors, reference previous interests ("Last time you asked about X...")
- Campaign awareness: if knowledge base mentions promotions/events, proactively mention them
- "Never do" rules: no spam, no pushy upsells, no fake urgency, no data collection without context
- Keep under ~25 lines per locale
- `pnpm type-check` passes

## P4 — Analytics & Insights

#### CAM-130 [ ] Agent performance dashboard — response time + satisfaction trends
Add a dedicated analytics tab/section to the workspace.

**Acceptance Criteria:**
- New tRPC procedure `agent.performanceMetrics`: avg response time (last 7d, 30d), conversation volume trend (daily counts for last 30d), resolution rate trend, module execution counts by slug
- New component `apps/web/src/components/agent-workspace/performance-panel.tsx`
- Response time chart: `BarChartCss` showing daily avg response time (last 14 days)
- Volume trend: `Sparkline` showing daily conversation count (last 30 days)
- Module usage breakdown: horizontal bar chart showing which modules fire most
- Add as a section in all workspace registries (sales, support, marketing)
- i18n keys (en + es)
- `pnpm type-check` passes

**Notes:**
Data comes from `conversations` (created_at, resolved_at for response time), `module_executions` (counts by slug), and `artifact_metrics_daily` (pre-aggregated daily stats). Prefer `artifact_metrics_daily` when available to avoid expensive queries.

#### CAM-131 [ ] Customer insights — returning visitor tracking
Show which customers come back and what they ask about over time.

**Acceptance Criteria:**
- New tRPC procedure `agent.customerInsights`: top 10 returning customers (by conversation count), with last visit date, total conversations, last topic
- Uses `customer_memories` table (already exists) + `conversations` join
- New `DataTable` section in sales workspace: "Returning Customers" with name, visits, last seen, last topic
- Click row → opens conversation list filtered to that customer
- i18n keys (en + es)
- `pnpm type-check` passes

**Depends on:** CAM-123 (conversation filters for click-through)

## Manual / Blocked — Not for NC

#### CAM-200 [manual] Clerk production keys (Mateo)
Swap dev keys for prod in env vars + Clerk dashboard config.

#### CAM-201 [manual] Paddle business verification (Mateo)
Submit business docs for Paddle verification.

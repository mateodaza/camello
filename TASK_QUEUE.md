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

#### CAM-107 [x] Fix onboarding Step 3 module badges + collect profile basics
Static `ARCHETYPE_MODULE_SLUGS` map replaces `trpc.module.catalog` query; Quick Profile section (tagline/bio/avatar) added; `setupArtifact` restructured to converge all 4 paths + unified Phase 2 profile merge; `tenant.updateProfile` chained on success; 7 API tests + 9 web tests (including Path 2 race condition). 10 i18n keys (en + es).

#### CAM-111 [x] Period-over-period sales comparison
This-week vs last-week comparison on sales overview with delta arrows. `agent.salesComparison` tRPC procedure (single CTE SQL, UTC week boundaries, delta TS logic); `DeltaBadge` component (fully i18n); delta badges on 2 hero cards + new "This Week" 4-cell card; 8 i18n keys (en+es); 4 tests in `agent-sales-comparison.test.ts`. Type-check passes.

**Acceptance Criteria:**
- New tRPC procedure `agent.salesComparison`: this/last week counts for new_leads, won_deals, total_revenue, conversations
- Week = Monday 00:00 UTC to Sunday 23:59 UTC
- Delta badges on existing stat cards (green up / red down / gray dash)
- Zero-division safe (last week = 0 → "+N new")
- i18n keys (en + es)
- `pnpm type-check` passes

#### CAM-114 [x] Revenue forecasting card
`agent.salesForecast` procedure (artifact-scoped `stage_history` + `active_pipeline` CTEs, 90-day window, MIN_SAMPLE=5 fallback); `ForecastCard` component in `SalesOverview`; stats strip Forecast cell uses backend total; 4 i18n keys (en+es); 4 tests in `agent-sales-forecast.test.ts`. Type-check passes.

**Acceptance Criteria:**
- `agent.salesForecast` procedure: pipeline value * historical stage conversion rates (90-day window)
- Fallback rates for < 5 leads: qualifying 20%, proposal 50%, negotiation 70%
- New card in SalesOverview: "30-day forecast: $X" with stage breakdown
- i18n keys (en + es)
- `pnpm type-check` passes

**Depends on:** CAM-111

## P1 — Support & Marketing Workspace Substance

#### CAM-117 [x] Support workspace: ticket resolution flow
"Resolve" button + inline CSAT (1-5 stars stored in `conversations.metadata.csat`); `agent.supportResolutionStats` procedure (resolved count, avg CSAT, resolution rate, 30d); `SupportResolutionStats` MetricsGrid section; resolved tickets grayed out with star badge; `rowClassName` added to DataTable primitive; 11 i18n keys (en+es). Type-check passes.

**Acceptance Criteria:**
- "Resolve" button on each open ticket in `registry/support.tsx` — calls existing `conversation.updateStatus` with `status: 'resolved'`
- After resolve: inline 1-5 star CSAT rating prompt (optional, stored in `conversations.metadata.csat`)
- New tRPC procedure `agent.supportResolutionStats`: resolved count, avg CSAT, resolution rate (resolved/total) for last 30 days
- Stats shown as `MetricsGrid` row at top of support workspace
- Ticket list shows resolved tickets grayed out with CSAT star if rated
- i18n keys (en + es)
- `pnpm type-check` passes

#### CAM-118 [ ] Support workspace: knowledge gap inline ingest + improved UX
The support workspace already has `agent.supportKnowledgeGaps` procedure and a `SupportKnowledgeGaps` section. Improve it with actionable inline ingest.

**Acceptance Criteria:**
- Add "Add Answer" button on each knowledge gap card — opens inline textarea where owner types the answer
- On submit: calls `knowledge.ingest` with the answer text + the original question as context (title)
- After successful ingest: remove the gap card from the list (optimistic UI)
- Add sample question preview on each card (first message from the lowest-confidence conversation)
- Add count badge: "Asked N times" on each gap card
- Improve clustering: group by normalized intent (lowercase, trim) instead of raw intent string to reduce duplicates
- i18n keys (en + es)
- `pnpm type-check` passes

**Notes:**
The backend procedure and basic UI already exist. This task improves the UX so gaps are actionable without leaving the workspace. Read `apps/web/src/components/agent-workspace/registry/support.tsx` for the current rendering.

#### CAM-119 [ ] Marketing workspace: interest stats + draft content feed
The marketing workspace is a skeleton. Add substance.

**Acceptance Criteria:**
- New tRPC procedure `agent.marketingStats`: total interests captured (from `capture_interest` executions), top 3 interest categories, draft content count (from `draft_content` executions)
- `MetricsGrid` row at top of marketing workspace with interests captured, categories, drafts pending
- `CardFeed` section: "Content Drafts" — shows `draft_content` executions with `status = 'executed'`. Each card shows draft title, preview (80 chars), created date, and Approve/Edit/Discard buttons.
- All three actions use a new `module.updateDraft` tRPC mutation (NOT `module.approve`/`module.reject` — those are for the pending-approval autonomy flow, which is a different lifecycle).
- New tRPC mutation `module.updateDraft`: input `{ executionId: string, action: 'approve' | 'edit' | 'discard', output?: Record<string, unknown> }`. Validates execution exists, belongs to tenant, and has `status = 'executed'` + `module_slug = 'draft_content'`.
  - `action: 'approve'` → sets `output.draft_status = 'approved'` (owner accepted the draft as-is)
  - `action: 'discard'` → sets `output.draft_status = 'discarded'` (owner rejected the draft)
  - `action: 'edit'` → requires `output` param, merges updated content into `output` JSONB + sets `output.draft_status = 'approved'`
- Feed filters: only show drafts where `output.draft_status` is null (unreviewed). Approved/discarded drafts hidden from feed.
- No changes to `module_executions.status` column — it stays `'executed'`. The draft lifecycle lives entirely in `output` JSONB.
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
- Search input: filters by customer name (ILIKE on `conversations.metadata->>'customerName'`) or by EXISTS subquery on `messages.content` (NOT a plain join — must avoid duplicating conversation rows and breaking keyset pagination)
- New tRPC input params on `conversation.list`: `status`, `channel`, `search`, `dateRange`, `customerId` (optional UUID — stable FK filter for click-through from customer insights CAM-131)
- Debounced search (300ms)
- IMPORTANT: use `EXISTS (SELECT 1 FROM messages WHERE messages.conversation_id = conversations.id AND messages.content ILIKE ...)` for message search — never join messages directly into the paginated query
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
- "Your Agents" list with status indicators (active/inactive, based on `artifacts.isActive` boolean) and link to workspace
- i18n keys (en + es)
- `pnpm type-check` passes

**Depends on:** CAM-108 (notifications exist)

#### CAM-125 [ ] Settings page polish — danger zone + data export
The settings pages need a few more features before launch.

**Acceptance Criteria:**
- "Danger Zone" section on settings page: "Delete Agent" button (confirmation dialog → calls `artifact.deactivate` which soft-deletes)
- New tRPC procedure `artifact.deactivate`: sets `artifacts.is_active = false`, does NOT hard delete. Deactivated agents hidden from dashboard list but data preserved. Update agent list query to filter `isActive = true`.
- "Export Data" button: generates JSON download of all leads + conversations for the artifact (client-side blob download from tRPC query)
- New tRPC procedure `agent.exportData`: returns leads + conversations + notes as JSON (limit 1000 records, warn if truncated)
- i18n keys (en + es)
- `pnpm type-check` passes

#### CAM-126 [ ] Onboarding wizard — Step 4 (Teach Agent) improvements
Step 4 lets owners add knowledge but the UX is minimal.

**Acceptance Criteria:**
- Add "Suggested topics" section: based on archetype, show 3-4 prompts like "Add your pricing info", "Describe your services", "Add FAQ answers". Each is a clickable card that pre-fills the textarea.
- Show knowledge base count badge: "3 documents added" with progress indicator
- Add URL ingestion field: paste a URL, backend fetches + chunks it (uses existing `knowledge.queueUrl` tRPC procedure)
- Validate minimum: soft warning if 0 docs added ("Your agent works better with knowledge")
- i18n keys (en + es)
- `pnpm type-check` passes

**Notes:**
Read `apps/web/src/components/onboarding/step4-teach-agent.tsx` for current implementation. URL ingestion uses `knowledge.queueUrl` (async queue + cron processing), NOT a synchronous ingest. Read `apps/api/src/routes/knowledge.ts` for the procedure.

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
- Uses `customers` table (join on `customers.id` → `conversations.customer_id`). Customer memory is stored in `customers.memory` JSONB column — extract last topic from there. Do NOT reference a `customer_memories` table (it does not exist).
- New `DataTable` section in sales workspace: "Returning Customers" with name, visits, last seen, last topic
- Click row → navigates to conversation list with `?customerId=<id>` query param. Add `customerId` as optional filter to `conversation.list` tRPC input (filter via `conversations.customer_id = customerId`). This is a stable FK filter, not a name search.
- i18n keys (en + es)
- `pnpm type-check` passes

**Depends on:** CAM-123 (conversation filters for click-through)

## P5 — Pre-Launch

#### CAM-132 [ ] E2E smoke test plan
Generate a comprehensive manual smoke test checklist covering the full user journey. This is the final gate before real users.

**Acceptance Criteria:**
- Create `SMOKE_TEST.md` in project root
- Organized by user journey phase:
  1. **Sign up & Onboarding:** Clerk sign-up → org creation → Step 1-6 wizard (describe business, meet agent, teach agent, connect channel, test chat). Verify module badges show only archetype modules (CAM-107). Verify profile fields populate `/chat/[slug]` card.
  2. **Knowledge Base:** Add text knowledge → verify RAG retrieval in chat. Queue URL ingestion (CAM-126) → verify chunked + embedded. Check knowledge gap detection surfaces low-confidence questions (CAM-118).
  3. **Public Chat (`/chat/[slug]`):** Business card renders (avatar, tagline, bio, social, hours). Quick actions work. Chat sends/receives. Typing indicator shows (CAM-127). Abuse limits trigger (20msg/min burst, 50msg/conversation, 100msg/day). Session counter increments.
  4. **Sales Workspace:** Leads appear in kanban after chat qualifies. Lead scoring shows numeric score (CAM-105). Stage auto-advances on re-qualification (CAM-110). Stale lead alerts fire. Source attribution bar chart populates (CAM-113). Week-over-week comparison shows deltas (CAM-111). Revenue forecast card renders (CAM-114). Sparklines populate.
  5. **Approvals & Notifications:** `send_quote` triggers approval card. Approve → payment record created (CAM-109). Reject with reason → toast + card removed. Bell icon shows unread count. Notification panel shows chronological feed. Mark all read works. `stage_advanced` notification fires on auto-progression.
  6. **Lead Detail:** Click lead → sheet opens. Timeline shows messages + notes + stage changes + summaries. Add note → appears in timeline. Close reason dialog works (won/lost).
  7. **Follow-ups:** Warm/hot lead → queued follow-up created (CAM-115). Cron processes follow-up (CAM-007). No duplicate follow-ups (unique index CAM-020).
  8. **Support Workspace:** Tickets list. Resolve button → CSAT prompt (CAM-117). Resolution stats populate. Knowledge gaps show with inline ingest (CAM-118).
  9. **Marketing Workspace:** Interest stats populate (CAM-119). Content drafts feed with approve/edit/discard.
  10. **Conversations Page:** List with summaries (CAM-116). Filters work: status, channel, date range, search (CAM-123). Pagination stable with search active.
  11. **Dashboard Home:** Activity feed shows recent events (CAM-124). Quick stats cards. Agent list with status.
  12. **Settings:** Profile page (tagline, bio, avatar, social, QR). Module settings (autonomy, config overrides) (CAM-102). Billing page (plan display, upgrade flow). Danger zone: deactivate agent (CAM-125). Export data download.
  13. **Error Handling:** Kill API → error boundaries render retry cards (CAM-120). Mutations show error toasts. Polling retries with backoff.
  14. **i18n:** Switch locale to Spanish → all dashboard text translates. Chat page respects artifact language. Relative timestamps localize.
  15. **Widget Embed:** Copy snippet → paste in external HTML → widget loads. Chat works end-to-end through widget.
- Each test case has: description, preconditions, steps, expected result
- Mark tests that require seed data vs. tests that can run on empty state
- `pnpm type-check` passes (no code changes, just the markdown file)

**Depends on:** All other CAM tasks in this sprint

**Notes:**
This is the checklist Mateo will walk through manually after the sprint audit is clean. It should be exhaustive enough that passing all tests means the product is ready for first users.

## Manual / Blocked — Not for NC

#### CAM-200 [manual] Clerk production keys (Mateo)
Swap dev keys for prod in env vars + Clerk dashboard config.

#### CAM-201 [manual] Paddle business verification (Mateo)
Submit business docs for Paddle verification.

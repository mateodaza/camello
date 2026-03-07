# Task Queue — Camello

## Phase 1: Completed Foundation (Weeks 1-5 + Sprint 3)

#### CAM-001 [x] Monorepo scaffold + Drizzle schema + RLS + Clerk auth
22 tables, migrations, RLS (22 tests), createTenantDb, tRPC protected procedures.

#### CAM-002 [x] Core intelligence: RAG, modules, LLM orchestration
Embedding, chunker, RAG orchestrator, artifact resolver, prompt builder, feedback loop, module executor. 486 tests.

#### CAM-003 [x] Channel adapters + widget + dashboard + i18n + billing
WebChat + WhatsApp adapters, widget, dashboard (6+ pages), onboarding wizard, Paddle billing, Spanish i18n (~640 strings), production deploy.

#### CAM-004 [x] Public chat + business card + customer memory
/chat/[slug] with SSR, business card, QR share, quick actions, abuse prevention, customer memory.

#### CAM-005 [x] Archetype registry + 9 modules + migrations 0013-0015
ArchetypeDefinition registry with ragBias, all 9 modules (qualify_lead, book_meeting, send_followup, collect_payment, send_quote, create_ticket, escalate_to_human, capture_interest, draft_content), riskTier on ModuleDefinition.

#### CAM-006 [x] Agent workspace dashboard + all 3 workspace UIs
Registry + primitives architecture, sales workspace v2 (kanban, payments, lead detail, alerts), support workspace (tickets, escalations, metrics), marketing workspace (engagement, drafts, interest map). 20+ agent router procedures including handoffs. RAG bias filtering.

## Phase 2: NC Smoke Test

#### CAM-007 [ ] Follow-up queue cron job (#53)
Add a cron job to `apps/jobs` that processes queued follow-up items from `send_followup` module executions. Follows the existing `createWorker()` pattern used by other jobs in `apps/jobs/src/jobs/`.

**Acceptance Criteria:**
- New file `apps/jobs/src/jobs/process-followups.ts`
- Exports a function matching existing job pattern (see `url-ingestion.ts` or `metrics-rollup.ts` for reference)
- Query: `module_executions WHERE module_slug = 'send_followup' AND status = 'executed' AND output->>'followup_status' = 'queued'` with `FOR UPDATE SKIP LOCKED`
- Per-row `new Date()` parsing of `output.scheduled_at` inside try/catch — bad rows get `followup_status = 'failed'` with error reason, NOT a thrown exception
- Valid rows where `parsedDate <= now` updated to `followup_status = 'processed'`
- Register in `apps/jobs/src/main.ts` with `*/5 * * * *` schedule (every 5 minutes)
- Unit tests in `apps/jobs/src/__tests__/process-followups.test.ts`: valid row processed, invalid date marked failed, empty queue is no-op
- `pnpm type-check` passes

**Notes:**
See AGENT_WORKSPACES_PLAN.md Sprint 4 "Follow-up queue cron" section. Uses service-role pool (cross-tenant). MVP marks items as 'processed' not 'sent' — reserve 'sent' for actual delivery when channels exist.

#### CAM-008 [ ] Artifact-scoped conversation filtering
Add optional `artifactId` filter to `conversation.list` tRPC procedure so agent workspaces can show only their conversations. Currently `conversation.list` accepts `status`, `limit`, `cursor` — but no artifact filter.

**Acceptance Criteria:**
- `conversation.list` input schema extended with optional `artifactId: z.string().uuid().optional()`
- When provided, adds `eq(conversations.artifactId, input.artifactId)` to the WHERE conditions
- Existing callers (no artifactId) unaffected — backward compatible
- Agent workspace header "View all conversations" link passes `artifactId` as query param
- Conversations page reads `artifactId` from searchParams and passes to `conversation.list`
- `pnpm type-check` passes

**Notes:**
UX gap noted in SPRINT_3_PLAN.md audit section 1. The workspace header currently links to unfiltered `/dashboard/conversations`. This connects the workspace to its conversations.

## Phase 3: Platform Polish

#### CAM-009 [ ] Module config UI + autonomy controls
Add a settings section to agent workspace showing bound modules with configurable fields (calendar URL, payment URL, SLA minutes) and autonomy level controls.

**Acceptance Criteria:**
- New component `apps/web/src/components/agent-workspace/module-settings.tsx`
- Shows each bound module with: name, risk tier badge (read-only), autonomy level dropdown (fully_autonomous / draft_and_approve / suggest_only)
- Config fields per module: `book_meeting` → Calendar URL, `collect_payment` → Payment URL, `send_quote` → Default currency + Valid days, `escalate_to_human` → SLA minutes
- Save calls existing `artifact.attachModule` with updated `configOverrides`
- Autonomy change sets `autonomy_source = 'manual'` via existing mutation
- Rendered as collapsible section in workspace shell (all agent types)
- i18n keys for all labels (en + es)
- `pnpm type-check` passes

**Depends on:** CAM-008

**Notes:**
See AGENT_WORKSPACES_PLAN.md Sprint 4 "Module settings" section. `artifact.attachModule` already supports configOverrides via upsert.

#### CAM-010 [ ] Owner action queue on dashboard overview
Add a "Needs Your Attention" section to `/dashboard` overview aggregating pending approvals, escalations, and draft quotes across all agents.

**Acceptance Criteria:**
- New component rendered on overview page, above existing content
- Aggregates: pending module approvals (from `module.pendingExecutions`), unacknowledged escalations (from `agent.supportEscalations` filtered to non-acknowledged), draft quotes (from `agent.salesQuotes` where status = draft)
- Each item links to the relevant agent workspace
- Empty state when nothing needs attention (don't render the section)
- i18n keys (en + es)
- `pnpm type-check` passes

**Depends on:** CAM-009

**Notes:**
See AGENT_WORKSPACES_PLAN.md Sprint 4 "Owner action queue" section. Cross-agent view — queries all artifacts for the tenant.

#### CAM-011 [ ] Progressive autonomy nudges
When a module in `draft_and_approve` mode accumulates 20+ consecutive approvals with 0 rejections, surface a suggestion to upgrade to `fully_autonomous`.

**Acceptance Criteria:**
- New tRPC query `agent.autonomyNudges` returns modules eligible for upgrade (approval_count >= 20, rejection_count = 0, current autonomy = draft_and_approve)
- Counts computed from `module_executions` grouped by artifact_id + module_slug, filtered by status (approved vs rejected)
- Banner component in module settings section showing nudge with Accept/Dismiss buttons
- Accept calls `artifact.attachModule` with `autonomy_level: 'fully_autonomous'` + `autonomy_source: 'manual'`
- Dismiss stores dismissal in `artifact_modules.config_overrides` JSONB (so nudge doesn't reappear)
- i18n keys (en + es)
- `pnpm type-check` passes

**Depends on:** CAM-009

**Notes:**
See AGENT_WORKSPACES_PLAN.md "Progressive Autonomy Nudges" section. Nudge logic is mostly frontend (threshold check on returned counts).

#### CAM-012 [ ] Conversation summarization (#60b)
Auto-generate a short summary when a conversation is resolved, stored in `conversations.metadata`. Displayed in conversation list and agent workspace activity feeds.

**Acceptance Criteria:**
- New function `summarizeConversation(messages: CanonicalMessage[])` in `packages/ai/src/` — single LLM call (cheapest tier) producing 1-2 sentence summary
- Triggered in `conversation.updateStatus` when status changes to 'resolved' (async, non-blocking via `setImmediate`, same pattern as customer memory extraction)
- Summary stored in `conversations.metadata.summary` (JSONB, no migration needed)
- Conversation list shows summary preview (truncated) when available
- Graceful failure: if LLM call fails, conversation resolves normally without summary
- Unit test for summarization prompt + mock LLM response
- `pnpm type-check` passes

**Notes:**
From #60b remaining items. Uses existing `selectModel('low')` for cheapest tier. Non-blocking = zero latency impact on conversation resolution.

#### CAM-013 [ ] Self-evolving learnings (#55)
Auto-generate learnings from successful interactions (resolved conversations with high satisfaction signals). Currently learnings only come from manual rejection feedback.

**Acceptance Criteria:**
- New function `extractLearningsFromResolution(conversation, messages, interactionLog)` in `packages/ai/src/`
- Triggered on conversation resolve (alongside memory extraction + summarization) via `setImmediate`
- Extracts patterns: successful module executions (approved or autonomous), high-confidence RAG hits, effective response patterns
- Creates learnings via existing `createLearning()` with `source: 'auto'` (add to learning type if needed)
- De-duplicates against existing learnings (embedding similarity check, threshold 0.9)
- Rate limited: max 2 learnings per conversation, max 10 auto-learnings per day per tenant
- Unit tests for extraction logic and dedup
- `pnpm type-check` passes

**Depends on:** CAM-012

**Notes:**
From Innovation Roadmap #55 (TECHNICAL_SPEC_v1.md Section 20). Uses existing learning infrastructure. The de-duplication prevents knowledge bloat.

## Phase 4: WhatsApp Self-Onboarding

#### CAM-014 [🚧] WhatsApp Meta Embedded Signup (#47)
Implement Meta Embedded Signup flow so tenants can connect their own WhatsApp Business Account. Requires Meta App review approval first (manual prerequisite).

**Notes:**
Research complete (see PROGRESS.md #47). Architecture: per-tenant WABA via Embedded Signup popup. Existing WhatsApp adapter stays as-is. Blocked on Meta App review submission (human task). NC can build the frontend flow + backend token storage once Meta approval is in place.

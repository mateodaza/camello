# Per-Agent Workspaces — Implementation Plan

## Context

Camello's 3 agent types (sales, support, marketing) are shells — stub modules that return `booked: false`, generic dashboards that don't show what each agent is actually doing. To be useful for SMBs, each agent needs:
- Real working skills that capture structured data from conversations
- Its own dashboard showing role-specific results (pipeline for sales, tickets for support, engagement for marketing)
- An extensible architecture so adding new agent types (lawyer, financial) is a 4-file checklist

**Market insight**: No platform offers unified multi-agent experience for SMBs at $29-$59/month. Intercom is support-only ($0.99/resolution). Qualified is sales-only ($3K+/month). Lindy/Relevance are builder platforms (customer does the work). Camello fills the gap: multiple agent types, zero assembly, SMB pricing.

**Key design decision**: Keep sales and support SEPARATE (different mental models, different success metrics). Skills are composable across archetypes — the behavioral framework and dashboard view are what differentiate.

**Folded-in tasks from backlog:**
- **#50** Agent handoffs — `escalate_to_human` module + conversation status change (Sprint 1), basic artifact-to-artifact transfer (Sprint 2)
- **#64b** Archetype Tier 2 — all new modules from this plan ARE 64b. Plus: archetype-specific RAG filtering (Sprint 1, piggybacks on #56 chunk roles)
- **#53** Scheduled automations — follow-up queue cron job in `apps/jobs` (Sprint 4)
- **#59** Intent prioritization — high-priority intent filter in `agentRouter` (Sprint 2)

---

## Design Principles

### 1. The 70/30 Automation Rule

**Core motto**: 70% of work is automated by agents, 30% requires owner action. Progressively increase toward 90/10 or 100/0 as trust builds.

**Current state is backwards**: all modules default to `draft_and_approve` = 0% automated. We flip this.

**Risk tiers on modules** — each `ModuleDefinition` gets a `riskTier` field:

| Tier | Behavior | Default Autonomy | Examples |
|------|----------|-----------------|----------|
| `low` | Observe/capture data | `fully_autonomous` | `qualify_lead`, `capture_interest`, `create_ticket` |
| `medium` | Act (reversible) | `fully_autonomous` | `book_meeting`, `send_followup`, `escalate_to_human` |
| `high` | Commit (irreversible/financial) | `draft_and_approve` | `collect_payment`, `send_quote`, `draft_content` |

Result: 6 of 9 modules are autonomous by default = **67% automated** (meets 70/30 target).

**Autonomy flows into existing system**: `artifact_modules.autonomy_level` already exists. The `riskTier` just determines the **default** when binding. Owners can always override per-module.

**Automation Score** — computed metric per agent:
```
automationScore = autonomous_executions / total_executions * 100
```
Returned by `agent.workspace` query. Displayed as a gauge in the workspace header. Gives owners visibility into how much the agent handles vs how much they intervene.

**Progressive Autonomy Nudges** — tracked per module per artifact:
- When a module in `draft_and_approve` mode accumulates N approvals (e.g., 20) with 0 rejections → surface a suggestion: "This module has been approved 20 times without changes. Upgrade to fully autonomous?"
- Stored in `artifact_modules` metadata or a lightweight counter column
- UI: banner in workspace settings section, dismissible

### 2. Documentation Strategy

Every architectural decision, registry pattern, and extensibility point is documented in code:
- **`AGENT_ARCHITECTURE.md`** (project root): high-level guide covering archetype registry, module system, risk tiers, automation scoring, how to add a new agent type (the 4-file checklist with examples)
- **JSDoc on all public interfaces**: `ArchetypeDefinition`, `ModuleDefinition` (updated with `riskTier`), registry functions
- **Per-archetype file header comments**: explain the behavioral framework rationale and module selection
- **Migration comments**: inline SQL explaining WHY each change exists (not just WHAT)

### 3. Abstraction Philosophy

- **Abstract**: the archetype registry (shared pattern for all agent types), the module system (shared execution + storage), the workspace page shell (shared layout with dynamic sections), the `agentRouter` query pattern (all procedures share the same `tenantProcedure` + `artifactId` filter)
- **Be explicit/redundant**: per-archetype behavioral prompts (each is unique, no templating), per-type dashboard sections (sales-pipeline.tsx is NOT a generic "data table" — it knows about stages and scores), per-module Zod schemas (each module has its own input/output shape, no shared "generic module schema")
- **Rule of thumb**: abstract the plumbing (registry, routing, layout), be explicit about the domain (what a sales lead looks like vs what a support ticket looks like)

---

## Sprint 1: Foundation — Archetype Registry + New Modules (3-4 days)

### 1A. Archetype Registry

Consolidate the three separate maps (`ARCHETYPE_PROMPTS`, `ARCHETYPE_DEFAULT_TONES`, `ARCHETYPE_MODULE_SLUGS`) into a single registry pattern.

**New file**: `packages/ai/src/archetype-registry.ts`
```typescript
interface ArchetypeDefinition {
  type: string;
  prompts: { en: string; es: string };
  defaultTone: { en: string; es: string };
  moduleSlugs: string[];
  icon: string;       // Lucide icon name for frontend
  color: string;      // Design system token
}
```

**Update `ModuleDefinition`** in `packages/ai/src/module-registry.ts` — add `riskTier`:
```typescript
riskTier: 'low' | 'medium' | 'high';  // Determines default autonomy at bind time
```
Existing modules get their tier assigned. The backfill migration (0014) uses the tier to set `autonomy_level` on new `artifact_modules` rows.

**Refactor**: Move each archetype definition into `packages/ai/src/archetypes/`:
- `sales.ts` — registers sales archetype + updates module slugs
- `support.ts` — registers support archetype + new module slugs
- `marketing.ts` — registers marketing + new module slugs
- `custom.ts` — empty/generic archetype
- `index.ts` — side-effect imports (same pattern as `modules/index.ts`)

**Backward compat**: Re-export `ARCHETYPE_PROMPTS`, `ARCHETYPE_DEFAULT_TONES`, `ARCHETYPE_MODULE_SLUGS` as computed views from registry in `archetype-prompts.ts`. Zero breaking changes.

**Adding a new type (e.g., lawyer) later**:
1. `packages/ai/src/archetypes/lawyer.ts` — register definition + modules
2. Add `'lawyer'` to `ArtifactType` in `packages/shared/src/types/index.ts`
3. Migration: update CHECK constraint on `artifacts.type`
4. Add dashboard section components in `apps/web/src/components/agent-workspace/`

**Files to modify**:
- `packages/ai/src/archetype-prompts.ts` — becomes thin re-export layer
- `apps/api/src/lib/apply-archetype-defaults.ts` — use registry instead of direct map access

### 1B. New Modules (6 new + 3 enhanced)

All follow existing pattern: `ModuleDefinition` in `packages/ai/src/modules/`, Zod schemas in `packages/shared/src/schemas/`, self-register via `registerModule()`.

**Critical design**: No external API calls. Modules capture structured data into `module_executions.output` JSONB. Owner provides their own URLs (Calendly, Stripe Payment Links) via `artifact_modules.config_overrides`, which flows through to `ctx.configOverrides`.

#### Sales modules

| Module | File | Risk | Default Autonomy | What it does |
|--------|------|------|-----------------|-------------|
| `qualify_lead` (enhance) | `modules/qualify-lead.ts` | low | `fully_autonomous` | Add `stage` + `estimated_value` to output. Upsert lead with stage tracking. |
| `book_meeting` (enhance) | `modules/book-meeting.ts` | medium | `fully_autonomous` | Read `configOverrides.calendarUrl`. If set, return link. If not, "team will confirm manually." |
| `collect_payment` (NEW) | `modules/collect-payment.ts` | high | `draft_and_approve` | Read `configOverrides.paymentUrl`. Capture amount/description. Return link or "team will send details." |
| `send_quote` (NEW) | `modules/send-quote.ts` | high | `draft_and_approve` | Capture line items (description, qty, price). Generate quote_id. Status: draft. Owner approves in dashboard. |

Updated binding: `sales → ['qualify_lead', 'book_meeting', 'collect_payment', 'send_quote']`

#### Support modules

| Module | File | Risk | Default Autonomy | What it does |
|--------|------|------|-----------------|-------------|
| `create_ticket` (NEW) | `modules/create-ticket.ts` | low | `fully_autonomous` | Capture subject, description, priority (low/medium/high/urgent), category. Generate TKT-XXXX ID. Status: open. |
| `escalate_to_human` (NEW) | `modules/escalate-to-human.ts` | medium | `fully_autonomous` | Capture reason + urgency + summary. Update conversation status to 'escalated' via `ctx.db.updateConversationStatus()`. |

Updated binding: `support → ['create_ticket', 'escalate_to_human']`

#### Marketing modules

| Module | File | Risk | Default Autonomy | What it does |
|--------|------|------|-----------------|-------------|
| `send_followup` (enhance) | `modules/send-followup.ts` | medium | `fully_autonomous` | Remove `sent: false` stub. Capture as structured queue item with status 'queued'. |
| `capture_interest` (NEW) | `modules/capture-interest.ts` | low | `fully_autonomous` | Capture product/topic + interest level (browsing/considering/ready_to_buy) + contact info. Flag follow_up_recommended. |
| `draft_content` (NEW) | `modules/draft-content.ts` | high | `draft_and_approve` | Capture content type (social_post/email/announcement) + topic + key points. LLM response becomes the draft text. Status: draft. |

Updated binding: `marketing → ['send_followup', 'capture_interest', 'draft_content']`

#### Schema additions for new modules (`packages/shared/src/schemas/index.ts`)

Add input/output Zod schemas for all 6 new modules. Follow existing pattern (see `qualifyLeadInputSchema`).

#### ModuleDbCallbacks extension

Add `updateConversationStatus` to `ModuleDbCallbacks` interface in `packages/shared/src/types/index.ts`. Wire in `message-handler.ts` tool adapter deps. Used by `escalate_to_human` module.

#### Archetype-specific RAG filtering (#64b, piggybacks on #56)

#56 built `classifyChunkRole()` which maps intent→doc_type to `lead`/`support` roles used for **prompt rendering** (PRIMARY vs SUPPORTING KNOWLEDGE blocks). This is a separate concern from retrieval ranking.

**Clarification of dimensions** (don't overload `RagChunk.role`):
- `RagChunk.role` (`lead`/`support`) = **prompt rendering role** — determines which knowledge block the chunk appears in. Unchanged.
- `RagChunk.source` (`direct`/`proactive`) = **retrieval source** — already tracked. Unchanged.
- NEW: `archetypeWeight` = **retrieval-time ranking boost** — applied before MMR, separate from role.

**Implementation:**
- Add `ragBias` to `ArchetypeDefinition`: `{ docTypes: string[], boost: number } | null`
  - Sales: `{ docTypes: ['pricing', 'product', 'case_study'], boost: 0.1 }` — pricing/product docs score higher in retrieval
  - Support: `{ docTypes: ['troubleshooting', 'faq', 'how_to'], boost: 0.1 }` — troubleshooting docs score higher in retrieval
  - Marketing/Custom: `null` (no bias)
- In `rag.ts` `assembleContext()`: if `ragBias` is provided, boost similarity score of chunks whose `docType` matches the bias list. This happens BEFORE MMR ranking and is independent of the `role` field used for prompt rendering.
- ~20 lines of code, no schema changes. The bias affects which chunks are selected, not how they're labeled in the prompt.

### 1C. Schema Migration (0013)

Minimal changes — leverage existing tables:

```sql
-- 1. Leads: add stage + estimated_value
ALTER TABLE leads ADD COLUMN stage text NOT NULL DEFAULT 'new';
ALTER TABLE leads ADD CONSTRAINT leads_stage_values
  CHECK (stage IN ('new', 'qualifying', 'proposal', 'negotiation', 'closed_won', 'closed_lost'));
ALTER TABLE leads ADD COLUMN estimated_value numeric(12,2);  -- numeric, not text — enables SUM() in pipeline queries
CREATE INDEX idx_leads_tenant_stage ON leads(tenant_id, stage, score, created_at DESC);

-- 2. Module executions: denormalize module_slug for fast dashboard queries
-- Step A: add nullable, backfill, then make NOT NULL
ALTER TABLE module_executions ADD COLUMN module_slug text;
UPDATE module_executions me SET module_slug = m.slug FROM modules m WHERE me.module_id = m.id;
-- Guard: fail if any rows have NULL slug after backfill (orphaned module_id)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM module_executions WHERE module_slug IS NULL) THEN
    RAISE EXCEPTION 'module_slug backfill incomplete — orphaned module_id rows exist';
  END IF;
END $$;
ALTER TABLE module_executions ALTER COLUMN module_slug SET NOT NULL;
CREATE INDEX idx_module_executions_slug ON module_executions(tenant_id, module_slug, status, created_at DESC);

-- 3. Seed new modules into global catalog (idempotent)
INSERT INTO modules (name, slug, description, category, is_system, input_schema, output_schema)
VALUES
  ('Collect Payment', 'collect_payment', 'Collect payment via configured payment link', 'sales', true,
   '{"type":"object","properties":{"amount":{"type":"string"},"description":{"type":"string"},"currency":{"type":"string"}}}',
   '{"type":"object","properties":{"payment_url":{"type":"string"},"status":{"type":"string"}}}'),
  ('Send Quote', 'send_quote', 'Generate a structured quote with line items', 'sales', true,
   '{"type":"object","properties":{"items":{"type":"array"},"currency":{"type":"string"},"valid_days":{"type":"number"}}}',
   '{"type":"object","properties":{"quote_id":{"type":"string"},"total":{"type":"string"},"status":{"type":"string"}}}'),
  ('Create Ticket', 'create_ticket', 'Create a support ticket from conversation', 'support', true,
   '{"type":"object","properties":{"subject":{"type":"string"},"description":{"type":"string"},"priority":{"type":"string"},"category":{"type":"string"}}}',
   '{"type":"object","properties":{"ticket_id":{"type":"string"},"status":{"type":"string"}}}'),
  ('Escalate to Human', 'escalate_to_human', 'Escalate conversation to human agent', 'support', true,
   '{"type":"object","properties":{"reason":{"type":"string"},"urgency":{"type":"string"},"summary":{"type":"string"}}}',
   '{"type":"object","properties":{"escalated":{"type":"boolean"},"conversation_status":{"type":"string"}}}'),
  ('Capture Interest', 'capture_interest', 'Capture customer interest in product or topic', 'marketing', true,
   '{"type":"object","properties":{"product_or_topic":{"type":"string"},"interest_level":{"type":"string"},"contact_info":{"type":"string"}}}',
   '{"type":"object","properties":{"logged":{"type":"boolean"},"follow_up_recommended":{"type":"boolean"}}}'),
  ('Draft Content', 'draft_content', 'Draft marketing content from conversation context', 'marketing', true,
   '{"type":"object","properties":{"content_type":{"type":"string"},"topic":{"type":"string"},"key_points":{"type":"array"}}}',
   '{"type":"object","properties":{"draft_text":{"type":"string"},"status":{"type":"string"}}}')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  input_schema = EXCLUDED.input_schema,
  output_schema = EXCLUDED.output_schema;

-- 4. Add autonomy_source to artifact_modules (provenance tracking)
ALTER TABLE artifact_modules ADD COLUMN autonomy_source text NOT NULL DEFAULT 'default';
-- CHECK: only valid sources
ALTER TABLE artifact_modules ADD CONSTRAINT artifact_modules_autonomy_source_values
  CHECK (autonomy_source IN ('default', 'manual'));
```

**Why `module_slug` on `module_executions`?** Every dashboard query needs to filter by module type. Without this, every query joins `modules` table. Slugs never change, so this denormalization is safe. Made NOT NULL after backfill — all future writes MUST set it.

**Write path enforcement**: Update `insertModuleExecution` in `message-handler.ts` (where tool adapter deps are wired — there is no separate `tool-adapter.ts`) to always pass `module_slug` alongside `module_id`. The Drizzle column is `text().notNull()` — any write without it fails at DB level.

**No new tables.** Tickets = `module_executions WHERE module_slug = 'create_ticket'`. Quotes = `WHERE module_slug = 'send_quote'`. Etc. The `output` JSONB stores structured data per module type.

**Drizzle schema updates**:
- `packages/db/src/schema/conversations.ts`: add `stage` text + `estimatedValue` numeric(12,2) to leads, add `moduleSlug` text notNull to moduleExecutions
- `packages/db/src/schema/modules.ts` (or wherever `artifact_modules` lives): add `autonomySource` text column

### 1D. Backfill migration (0014) — bind new modules + set autonomy defaults

Similar pattern to migration 0011:
```sql
-- Pre-check: all new module slugs exist (RAISE EXCEPTION if missing)

-- For each archetype: INSERT INTO artifact_modules for artifacts missing the new bindings
--   autonomy_level = 'fully_autonomous', autonomy_source = 'default' for low/medium risk
--   autonomy_level = 'draft_and_approve', autonomy_source = 'default' for high risk

-- 70/30 correction: UPDATE existing artifact_modules via JOIN to modules table
-- (artifact_modules has module_id, NOT module_slug — must join to resolve slug)
WITH low_medium_risk AS (
  SELECT id FROM modules WHERE slug IN (
    'qualify_lead', 'book_meeting', 'create_ticket',
    'escalate_to_human', 'send_followup', 'capture_interest'
  )
)
UPDATE artifact_modules am
SET autonomy_level = 'fully_autonomous'
FROM low_medium_risk lmr
WHERE am.module_id = lmr.id
  AND am.autonomy_source = 'default'   -- NEVER touch manual overrides
  AND am.autonomy_level = 'draft_and_approve';

-- Post-check: verify counts (RAISE EXCEPTION if gaps)
```

This migration flips the current 0% automation default to 67%. The `autonomy_source` column distinguishes "system set this default" from "owner explicitly chose this level". Only `autonomy_source = 'default'` rows are updated — `manual` rows are never touched. When an owner changes autonomy via the dashboard, the API sets `autonomy_source = 'manual'`.

---

## Sprint 2: Backend Procedures (2-3 days)

### New router: `agentRouter`

**File**: `apps/api/src/routes/agent.ts`

| Procedure | Type | Purpose |
|-----------|------|---------|
| `workspace` | query | Fetch artifact + bound modules + 30-day metrics + **automationScore** |
| **Sales** | | |
| `salesPipeline` | query | Leads grouped by stage with counts |
| `salesLeads` | query | Lead list with customer info, filterable by stage/score |
| `salesQuotes` | query | Quote module executions with output JSONB |
| `salesFunnel` | query | Stage-to-stage conversion rates |
| `updateLeadStage` | mutation | Move lead to new stage |
| **Support** | | |
| `supportTickets` | query | Ticket module executions, filterable by status/priority |
| `supportEscalations` | query | Pending escalations with conversation context |
| `supportMetrics` | query | Resolution rate, avg time, top categories |
| `supportKnowledgeGaps` | query | Intents with no RAG hits (from interaction_logs) |
| `updateTicketStatus` | mutation | Update ticket output JSONB status field |
| `acknowledgeEscalation` | mutation | Mark escalation acknowledged |
| **Marketing** | | |
| `marketingEngagement` | query | Interest captures with customer context |
| `marketingFollowups` | query | Follow-up queue |
| `marketingDrafts` | query | Content drafts |
| `marketingInterestMap` | query | Product/topic grouped by interest level |
| **Handoffs (#50)** | | |
| `initiateHandoff` | mutation | Transfer conversation from one artifact to another. Creates new `conversation_artifact_assignments` row (ends current, starts new), preserves message history. Returns new artifact info. |
| `handoffHistory` | query | List handoff events for a conversation (who transferred to whom, when, reason) |
| **Intent Priority (#59)** | | |
| `highPriorityIntents` | query | Recent interaction_logs where intent type matches tenant-configured priority list (see persistence contract below). Dashboard alert card. |
| `updatePriorityIntents` | mutation | Update `tenants.settings.priorityIntents` array. Validates against known intent types. |
| **Shared** | | |
| `activityFeed` | query | Recent module executions for an artifact (timeline) |

Register in `apps/api/src/routes/index.ts` as `agent: agentRouter`.

**Handoff flow (#50)**: `escalate_to_human` module sets conversation status = `escalated`. Owner sees it in dashboard. Owner can either resolve it themselves OR use `initiateHandoff` to transfer to a different artifact (e.g., support agent escalates to sales agent). The receiving artifact picks up the conversation with full message history preserved. This uses the existing `conversation_artifact_assignments` table (partial unique index: one active assignment per conversation).

**Handoff data invariants:**
- `initiateHandoff` runs in a single transaction: (1) end current assignment (`is_active = false, ended_at = NOW()` — both fields required, the partial unique index enforces `is_active = true AND ended_at IS NULL` for active rows), (2) create new assignment with `is_active = true, ended_at = NULL, assignment_reason = 'handoff'`, `metadata.transferred_by` (Clerk userId) and `metadata.transfer_reason`, (3) sync `conversations.artifact_id` to the new artifact. This sync is critical — workspace queries use `conversations.artifact_id` for performance (avoids joining assignments on every read). Note: `assignment_reason` is a constrained column on `conversation_artifact_assignments` — omitting it will fail the insert at DB level.
- **Anti-loop guardrails**: max 3 handoff hops per conversation (count active+ended assignments), block same-artifact transfers, 5-minute cooldown between handoffs on same conversation, circular detection (A→B→A within same session = blocked). All enforced in the `initiateHandoff` mutation before the transaction.
- `handoffHistory` reads from `conversation_artifact_assignments` — each row has `artifact_id`, `started_at`, `ended_at`, `metadata.transferred_by`, `metadata.transfer_reason`.

**`highPriorityIntents` persistence contract (#59):**
- **Storage**: `tenants.settings.priorityIntents` (JSONB field, already exists as settings is a JSONB column)
- **Schema**: `z.array(z.string()).max(20).default(['purchase', 'complaint', 'urgent'])` — array of intent type strings
- **Defaults**: New tenants get `['purchase', 'complaint', 'urgent']` seeded during `provisionTenant()`. Existing tenants without the key use the same defaults at query time (coalesce).
- **Update path**: `updatePriorityIntents` mutation in `agentRouter` — validates intent strings against known types, writes to `tenants.settings` via `jsonb_set()`. Owner-facing UI: multi-select in agent workspace settings.
- **Query logic**: `highPriorityIntents` reads `tenants.settings.priorityIntents` (with coalesce to defaults), then filters `interaction_logs` where `intent_type = ANY($priorityIntents)` and `created_at >= NOW() - INTERVAL '7 days'`. Returns intent type, count, most recent conversation link.

**Query pattern**: All procedures use `tenantProcedure` with `artifactId` input. Queries filter `module_executions` by `tenant_id + artifact_id + module_slug`. The `idx_module_executions_slug` index covers this.

**Key queries by type**:
- Sales pipeline: `SELECT stage, score, COUNT(*) FROM leads WHERE tenant_id = ? AND conversation_id IN (SELECT id FROM conversations WHERE artifact_id = ?) GROUP BY stage, score`
- Support tickets: `SELECT * FROM module_executions WHERE module_slug = 'create_ticket' AND artifact_id = ? AND tenant_id = ? ORDER BY created_at DESC`
- Marketing interests: `SELECT output->>'product_or_topic' as topic, output->>'interest_level' as level, COUNT(*) FROM module_executions WHERE module_slug = 'capture_interest' GROUP BY 1, 2`

---

## Sprint 3: Dashboard UI (3-4 days)

### Page structure

```
apps/web/src/app/dashboard/agents/[id]/page.tsx    # Main workspace (client)

apps/web/src/components/agent-workspace/
  workspace-shell.tsx       # Shared layout: back nav + header + content
  workspace-header.tsx      # Agent name, type badge, active toggle, key KPI cards, **automation score gauge**

  # Sales
  sales-overview.tsx        # 4 stat cards: pipeline value, hot leads, conversions, rate
  sales-pipeline.tsx        # Leads grouped by stage, score badges, customer name, value
  sales-quotes.tsx          # Quote list with items, total, status

  # Support
  support-overview.tsx      # 4 stat cards: open tickets, resolution rate, avg time, escalations
  support-tickets.tsx       # Ticket table: subject, priority, category, status dropdown
  support-escalations.tsx   # Escalation alert cards with acknowledge button

  # Marketing
  marketing-overview.tsx    # 4 stat cards: interests, follow-ups pending, drafts, engagement rate
  marketing-engagement.tsx  # Interest capture feed (chronological)
  marketing-drafts.tsx      # Content drafts with preview + approve

  # Shared
  agent-conversations.tsx   # Recent conversations for this artifact
  agent-activity.tsx        # Module execution timeline
```

### Main page component

```typescript
// Dynamic section registry — maps archetype type to components
const SECTIONS: Record<string, Component[]> = {
  sales: [SalesOverview, SalesPipeline, SalesQuotes],
  support: [SupportOverview, SupportTickets, SupportEscalations],
  marketing: [MarketingOverview, MarketingEngagement, MarketingDrafts],
  custom: [AgentActivity],
};
```

Fetch artifact type via `agent.workspace`, render matching sections. Always append `AgentConversations` + `AgentActivity` at bottom.

### Artifacts page update

Rename sidebar label "Artifacts" → "Agents". Each active artifact card gets **"Open Workspace"** button → navigates to `/dashboard/agents/[id]`.

### i18n

Add `agentWorkspace` namespace to `apps/web/messages/en.json` + `es.json`. ~60 new keys (section labels, stat card titles, empty states, action buttons).

---

## Sprint 4: Module Config UI + Polish (2 days)

### Module settings

In the agent workspace, add a "Settings" tab (or collapsible section) that shows bound modules with their configurable fields:

| Module | Config fields shown |
|--------|-------------------|
| `book_meeting` | Calendar URL (text input, placeholder "https://calendly.com/...") |
| `collect_payment` | Payment URL (text input, placeholder "https://buy.stripe.com/...") |
| `send_quote` | Default currency (select), Valid days (number) |
| `escalate_to_human` | SLA minutes (number) |

On save, calls `artifact.attachModule` with updated `configOverrides` (existing procedure, already supports this via upsert).

### Autonomy controls

Each module row in the settings section shows:
- Current autonomy level (`fully_autonomous` / `draft_and_approve` / `suggest_only`) — dropdown
- Risk tier badge (low/medium/high) — read-only, from `ModuleDefinition`
- **Progressive nudge banner**: if module is `draft_and_approve` AND has ≥20 consecutive approvals with 0 rejections → show "This module has been approved 20 times without changes. Upgrade to fully autonomous?" with Accept/Dismiss buttons
- Approval stats: `X approved / Y total` shown inline

**Backend**: `agent.workspace` query already returns `artifact_modules` with their `autonomy_level`. Add `approval_count` and `rejection_count` computed from `module_executions` per module per artifact. Nudge logic is frontend-only (threshold check on the counts).

### Owner action queue

On the main `/dashboard` overview page, add a "Needs Your Attention" section that aggregates:
- Pending module approvals (from `module.pendingExecutions`)
- Unacknowledged escalations (from `agent.supportEscalations`)
- Draft quotes awaiting approval (from `agent.salesQuotes` where status = draft)

This gives the owner a cross-agent view of what needs action.

### Follow-up queue cron (#53)

The `send_followup` module captures items as structured queue entries (status: `queued`) in `module_executions.output`. Add a cron job to `apps/jobs` that processes the queue:

- **Schedule**: every 5 minutes (same as URL ingestion)
- **Logic**: Process per-row in application code, NOT via a single SQL cast. The query selects candidates without casting:
  ```sql
  SELECT * FROM module_executions
  WHERE module_slug = 'send_followup'
    AND status = 'executed'
    AND output->>'followup_status' = 'queued'
    AND output->>'scheduled_at' IS NOT NULL
  FOR UPDATE SKIP LOCKED
  ```
  Then in `process-followups.ts`, iterate rows and parse `output.scheduled_at` with `new Date()` inside a try/catch. If parsing fails (invalid/malformed text from legacy or bad payloads), mark that row's `followup_status = 'failed'` with `error: 'invalid scheduled_at'` and continue. Valid rows where `parsedDate <= now` get processed normally.
  - **Why not cast in SQL?** `(output->>'scheduled_at')::timestamptz` throws on ANY malformed text value, failing the entire query and crashing the job loop. One bad row blocks all follow-ups. Per-row parsing in app code isolates failures.
- **Action (MVP)**: Update `followup_status` to `processed` (NOT `sent` — reserve `sent` for actual provider acknowledgement when channels exist). Log the event. Dashboard shows "processed" items as "ready to send" with a manual action hint.
- **Status lifecycle**: `queued` → `processed` (cron picked it up, no delivery channel yet) → `sent` (future: actual email/SMS delivery confirmed by provider) → `failed` (delivery attempt failed)
- **Future**: When email/SMS channels are added (#47, #64c), this cron delivers via channel adapter and only marks `sent` on provider ACK.

**File**: `apps/jobs/src/jobs/process-followups.ts` — follows existing `createWorker()` pattern.

### Polish
- Loading skeletons for all workspace sections
- Empty states with helpful CTAs ("No leads yet — share your chat link to start")
- Responsive layouts (mobile stacks, desktop grids)
- Error boundaries per section (partial failures don't break the whole page)

---

## Architecture for Future Agent Types

When adding a new type (e.g., `lawyer`), the checklist is:

1. **AI package** (`packages/ai/src/archetypes/lawyer.ts`):
   - Behavioral prompt (en + es)
   - Default tone, module slugs, icon, color
   - New modules if needed (e.g., `schedule_consultation`, `draft_document`)

2. **Shared types** (`packages/shared/src/types/index.ts`):
   - Add `'lawyer'` to `ArtifactType` union

3. **Migration**:
   - Update CHECK constraint on `artifacts.type`
   - Seed new modules into `modules` table
   - Backfill bindings for existing lawyer artifacts (if any)

4. **Dashboard** (`apps/web/src/components/agent-workspace/`):
   - Add section components (e.g., `lawyer-cases.tsx`, `lawyer-consultations.tsx`)
   - Register in `SECTIONS` map in the workspace page

No new routers needed — the `agentRouter` procedures query `module_executions` by `module_slug`, so new modules automatically get CRUD through existing procedures.

---

## Files to Create

| File | Purpose |
|------|---------|
| `AGENT_ARCHITECTURE.md` | High-level doc: registry, modules, risk tiers, automation scoring, how-to-add-agent-type |
| `packages/ai/src/archetype-registry.ts` | ArchetypeDefinition interface + registry |
| `packages/ai/src/archetypes/{sales,support,marketing,custom,index}.ts` | Per-type definitions |
| `packages/ai/src/modules/collect-payment.ts` | Sales: payment link capture |
| `packages/ai/src/modules/send-quote.ts` | Sales: structured quote |
| `packages/ai/src/modules/create-ticket.ts` | Support: structured ticket |
| `packages/ai/src/modules/escalate-to-human.ts` | Support: escalation + status change |
| `packages/ai/src/modules/capture-interest.ts` | Marketing: interest logging |
| `packages/ai/src/modules/draft-content.ts` | Marketing: content draft capture |
| `packages/db/migrations/0013_agent_workspaces.sql` | Schema: leads.stage, module_executions.module_slug, new module seeds |
| `packages/db/migrations/0014_backfill_new_modules.sql` | Bind new modules to existing artifacts |
| `apps/api/src/routes/agent.ts` | Per-artifact analytics + structured data queries |
| `apps/web/src/app/dashboard/agents/[id]/page.tsx` | Agent workspace page |
| `apps/web/src/components/agent-workspace/*.tsx` | ~15 section components |
| `apps/jobs/src/jobs/process-followups.ts` | Follow-up queue cron job (#53) |

## Files to Modify

| File | Change |
|------|--------|
| `packages/ai/src/module-registry.ts` | Add `riskTier` to `ModuleDefinition` interface |
| `packages/ai/src/archetype-prompts.ts` | Thin re-export from registry |
| `packages/ai/src/modules/index.ts` | Import 6 new modules |
| `packages/ai/src/modules/qualify-lead.ts` | Add stage + estimated_value |
| `packages/ai/src/modules/book-meeting.ts` | Read configOverrides.calendarUrl |
| `packages/ai/src/modules/send-followup.ts` | Structured queue item instead of stub |
| `packages/shared/src/schemas/index.ts` | 6 new Zod input/output schemas |
| `packages/shared/src/types/index.ts` | ModuleDbCallbacks.updateConversationStatus |
| `packages/db/src/schema/conversations.ts` | leads.stage, moduleExecutions.moduleSlug |
| `apps/api/src/routes/index.ts` | Register agentRouter |
| `apps/api/src/lib/apply-archetype-defaults.ts` | Use registry |
| `apps/api/src/orchestration/message-handler.ts` | Wire updateConversationStatus |
| `apps/web/src/app/dashboard/artifacts/page.tsx` | "Open Workspace" button |
| `apps/web/src/components/sidebar.tsx` | Rename "Artifacts" → "Agents" |
| `apps/web/messages/{en,es}.json` | ~60 new i18n keys |
| `packages/ai/src/rag.ts` | Archetype RAG bias (#64b) — docType-based retrieval boost, ~20 lines |
| `packages/db/src/schema/modules.ts` | Add `autonomySource` to artifact_modules Drizzle schema |
| `apps/api/src/orchestration/message-handler.ts` | Pass `module_slug` on every `insertModuleExecution` call (tool adapter deps are wired here, not in a separate file) |
| `apps/jobs/src/main.ts` | Register follow-up queue cron schedule (#53) |

## Data Invariants

Hard rules that must hold at all times after migration. Violating any of these is a ship-blocker.

| Invariant | Enforcement |
|-----------|-------------|
| `module_executions.module_slug IS NOT NULL` | DB constraint (NOT NULL after backfill). Drizzle schema `text().notNull()`. Write path in `message-handler.ts` always passes slug. |
| `conversations.artifact_id` matches active `conversation_artifact_assignments` | `initiateHandoff` syncs both in a single transaction. No code path updates one without the other. |
| `artifact_modules.autonomy_source` is `'default'` or `'manual'` | DB CHECK constraint. Only the dashboard autonomy-change endpoint sets `'manual'`. Migrations always write `'default'`. |
| Max 3 handoff hops per conversation | `initiateHandoff` counts assignments before creating new one. Rejects with `TOO_MANY_REQUESTS` if exceeded. |
| No same-artifact handoff | `initiateHandoff` checks `new_artifact_id != current_artifact_id`. Rejects with `BAD_REQUEST`. |
| No circular handoff within 5 minutes | `initiateHandoff` checks if target artifact was the source within the cooldown window. |
| Module outputs treated as untrusted in all render paths | JSONB `output` values are sanitized before dashboard display (XSS prevention). Handoff `metadata.transfer_reason` is sanitized before prompt injection into receiving agent context. |

## Migration Hard Gates

Both migrations (0013 + 0014) include pre-check and post-check RAISE EXCEPTION blocks. If any check fails, the migration aborts and must be investigated before retry.

**0013 gates:**
1. Pre-backfill: verify all `module_executions` rows can resolve a slug via `module_id → modules.slug` JOIN
2. Post-backfill: `SELECT COUNT(*) FROM module_executions WHERE module_slug IS NULL` must = 0
3. Post-seed: all 6 new slugs exist in `modules` table

**0014 gates:**
1. Pre-check: all new module slugs exist in `modules` (same as 0011 pattern)
2. Post-bind: for each archetype, count of `artifact_modules` bindings matches expected module count
3. Post-autonomy-flip: no rows with `autonomy_source = 'manual'` were modified (assert via `UPDATE ... RETURNING` count check)

## Per-Archetype KPI Contracts

Each archetype must demonstrate measurable "value beyond chat" within 7 days of deployment. These are acceptance criteria, not aspirational targets.

**Sales agent — weekly KPIs:**
| Metric | Source | Target |
|--------|--------|--------|
| Leads qualified / week | `leads` table count | > 0 per active sales agent |
| Meetings booked / week | `module_executions WHERE module_slug = 'book_meeting' AND status = 'executed'` | Tracked (no min — depends on calendar URL config) |
| Quote acceptance rate | `send_quote` executions with `output.status = 'accepted'` / total | Tracked |
| Pipeline value | `SUM(leads.estimated_value)` by stage | Displayed in dashboard |

**Support agent — weekly KPIs:**
| Metric | Source | Target |
|--------|--------|--------|
| Escalations avoided (%) | `resolved conversations / total conversations` for support artifact | > 50% (agent resolves without human) |
| First-response time (avg) | `messages.created_at` delta (first customer → first artifact msg) | Tracked |
| Ticket resolution time | `create_ticket` execution → conversation `resolved_at` delta | Tracked |
| Top unresolved categories | `create_ticket` output grouped by `category` where status != 'closed' | Displayed |

**Marketing agent — weekly KPIs:**
| Metric | Source | Target |
|--------|--------|--------|
| Interests captured / week | `capture_interest` execution count | > 0 per active marketing agent |
| Follow-up completion rate | `send_followup` with `followup_status = 'processed'` / total queued | Tracked |
| Content drafts created | `draft_content` execution count | Tracked |
| Interest-to-conversation conversion | Customers with `capture_interest` who return for a second conversation | Tracked (long-tail) |

## Behavioral Eval Gates

Release-blocking evaluations that run BEFORE each sprint is marked complete. These go beyond unit/integration tests.

**Sprint 1 eval (modules):**
- [ ] Tool-call correctness: each module's `execute()` produces valid output matching its Zod `outputSchema` for 10+ varied inputs
- [ ] Autonomy safety: `high` risk modules in `fully_autonomous` mode are IMPOSSIBLE to create via normal API paths (only via explicit owner override with `autonomy_source = 'manual'`)
- [ ] Module idempotency: calling the same module twice in the same pipeline run returns cached result (existing guardrail — verify still holds)

**Sprint 2 eval (procedures + handoffs):**
- [ ] Handoff correctness: A→B transfer preserves all messages, B sees full history, A's workspace no longer shows the conversation as active
- [ ] Handoff loop prevention: A→B→A within 5 minutes is rejected; A→B→C→D (4th hop) is rejected
- [ ] Workspace query accuracy: dashboard numbers match raw SQL counts (spot-check 3 metrics per archetype)

**Sprint 3 eval (dashboard):**
- [ ] Factual grounding: every number shown in the UI has a traceable query to the DB — no hardcoded or mocked data in production
- [ ] Empty state correctness: fresh agent with 0 data shows helpful CTAs, not broken UI or NaN values
- [ ] Autonomy score accuracy: displayed score matches `autonomous / total * 100` from raw `module_executions`

**Sprint 4 eval (config + polish):**
- [ ] Progressive nudge fires correctly at threshold (20 approvals, 0 rejections)
- [ ] Owner action queue shows correct cross-agent aggregation
- [ ] Follow-up cron processes only `queued` items, never touches `processed`/`sent`

## Post-Approval Housekeeping

Update `PROGRESS.md` to reflect:
- New section: **Week 6 — Per-Agent Workspaces** with all sprint tasks
- Mark #50, #64b, #53, #59 as absorbed into this effort (strikethrough with "folded into agent workspaces" note)
- Move #41 (Clerk prod) and #42 (Paddle verification) to a separate "Manual / External" section (deferred, not forgotten)

## Verification

1. **Unit tests**: Each new module (execute + formatForLLM + schema validation) — ~20 tests
2. **Route tests**: All agentRouter procedures with mocked tenantDb — ~25 tests
3. **Integration test**: Full flow: conversation → module execution → dashboard query returns structured data
4. **Handoff test**: Escalation → owner handoff → new artifact picks up conversation
5. **Manual smoke test**: Create sales agent → chat → qualify lead → see lead in pipeline board
6. **Apply migration 0013+0014 to Supabase cloud** after all tests pass
7. **Build clean**: `pnpm turbo build` + `pnpm turbo lint` + `pnpm turbo test`

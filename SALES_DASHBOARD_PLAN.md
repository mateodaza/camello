# Sales Agent Dashboard — Sprint Plan

> **Goal:** Complete the Sales agent operational loop by surfacing all module outputs (quotes, meetings, payments, follow-ups) in the Agent Workspace, with inline approval actions. After this sprint, the Sales agent workspace is a self-contained command center.

## Architecture Decision

**Where:** Agent Workspace (`/dashboard/agents/[id]`), behind a new **tab system**.

The current page is a config-only scroll (Identity → Personality → Modules → Knowledge → Activity → Settings). Adding 5+ operational sections to the same scroll would be unwieldy. Solution:

```
┌─────────────────────────────────────────────────┐
│  Agent Name                    [View Conversations] │
│  ┌──────────┐ ┌───────────┐                        │
│  │  Setup   │ │ Dashboard │  ← tab bar              │
│  └──────────┘ └───────────┘                        │
├─────────────────────────────────────────────────┤
│                                                     │
│  (tab content here)                                 │
│                                                     │
└─────────────────────────────────────────────────┘
```

- **Setup tab** = current config sections (Identity, Personality, Modules, Knowledge, Settings)
- **Dashboard tab** = operational data (Pending Approvals, Quotes, Meetings, Payments, Follow-ups, Performance, Activity timeline)

Each section on Dashboard uses the existing `sectionClass` card pattern (`rounded-xl border border-charcoal/8 bg-cream p-5`).

## UI Sections on Dashboard Tab

### 1. Pending Approvals (NC-228)
- **Backend already exists:** `module.pendingExecutions` (supports `artifactId` filter), `module.approve` (race-safe atomic transition + module re-execution), `module.reject` (includes `processRejection()` learning feedback loop). Do NOT create new routes.
- Each row: module name badge + description + timestamp + **Approve / Reject** buttons
- Approve → calls `module.approve` → toast + refetch
- Reject → reason picker (required, enum: `false_positive | wrong_target | bad_timing | incorrect_data | policy_violation`) + optional free-text field (max 500 chars) → calls `module.reject({ executionId, reason, freeText })` → toast + refetch. This feeds the `processRejection()` learning loop.
- Empty state: "No pending approvals" with checkmark icon
- This is the missing piece for `draft_and_approve` autonomy to be useful

### 2. Quotes (NC-222)
- **Backend partially exists:** `agent.salesQuotes` query returns raw `output` JSONB + `leadId`/`customerId`, but lacks `customerName` and normalized `amount`/`quoteStatus` fields. First enrich the query (LEFT JOIN customers for name, extract `output->>'total'` as amount, `output->>'status'` as quoteStatus), then build UI.
- `DataTable` primitive with columns: Customer | Amount | Status | Date
- Status badges: teal=accepted, gold=draft/pending, sunset=rejected
- Click row → deep link to conversation in inbox (`?selected=<conversationId>`)
- Empty state: "No quotes yet"

### 3. Meetings (NC-223)
- New `salesMeetings` tRPC query (filter `module_executions` by `book_meeting`)
- `CardFeed` primitive — each card: customer name, proposed datetime, status (booked/proposed/rejected), calendar link button
- Upcoming meetings sorted first, past meetings greyed
- Empty state: "No meetings scheduled"

### 4. Payments (NC-224)
- **Backend already exists:** `agent.salesPayments` query returns amount, currency, status, customerName, dueDate, paidAt with LEFT JOIN customers. No backend work needed.
- `DataTable`: Customer | Amount | Status | Date
- Real status enum: `pending | sent | viewed | paid | overdue | cancelled` (from `paymentStatusSchema`). Badge colors: teal=paid, gold=pending/sent/viewed, sunset=overdue/cancelled
- Click → inbox deep link
- Empty state: "No payments yet"

### 5. Follow-ups (NC-225)
- New `salesFollowups` tRPC query (filter `module_executions` by `send_followup`)
- Simple card list: customer name, scheduled time, followup number, status
- Empty state: "No follow-ups scheduled"

### 6. Performance + Activity (NC-227)
- Wire existing `AgentPerformance` component (response time, volume sparkline, module usage)
- Wire existing `AgentActivity` component (timeline with load more)
- Both already built, just need to be placed in the Dashboard tab

## Task Breakdown

### NC-221 — Tab navigation on agent workspace
**What:** Add Setup/Dashboard tab bar to `/dashboard/agents/[id]`. Move current 6 sections under Setup. Dashboard tab renders placeholder sections.
**Files:** `apps/web/src/app/dashboard/agents/[id]/page.tsx`, i18n (en+es)
**Dependencies:** None
**Estimate:** Small

### NC-222 — Quotes section
**What:** Enrich `agent.salesQuotes` query (add customerName via LEFT JOIN customers, extract `output->>'total'` as amount, `output->>'status'` as quoteStatus). Build Quotes section with `DataTable` primitive. Conversation deep link on row click.
**Files:** `apps/api/src/routes/agent.ts` (enrich query), `apps/web/src/components/agent-workspace/sales/quotes-section.tsx`, i18n
**Dependencies:** NC-221
**Estimate:** Small-Medium

### NC-223 — Meetings section
**What:** New `salesMeetings` tRPC query (filter module_executions by `book_meeting` + LEFT JOIN customers). Build Meetings section using `CardFeed` primitive. Sort upcoming first.
**Files:** `apps/api/src/routes/agent.ts`, `apps/web/src/components/agent-workspace/sales/meetings-section.tsx`, i18n
**Dependencies:** NC-221
**Estimate:** Medium

### NC-224 — Payments section
**What:** Reuse existing `agent.salesPayments` query (already returns amount, currency, status, customerName, dueDate, paidAt with LEFT JOIN customers). No backend work needed. Build Payments section using `DataTable`.
**Files:** `apps/web/src/components/agent-workspace/sales/payments-section.tsx`, i18n
**Dependencies:** NC-221
**Estimate:** Small

### NC-225 — Follow-ups section
**What:** New `salesFollowups` tRPC query (filter module_executions by `send_followup` + LEFT JOIN customers). Simple card list.
**Files:** `apps/api/src/routes/agent.ts`, `apps/web/src/components/agent-workspace/sales/followups-section.tsx`, i18n
**Dependencies:** NC-221
**Estimate:** Small

### NC-226 — i18n for all new Dashboard sections (en + es)
**What:** Add all i18n keys for NC-221 through NC-228 under `agentWorkspace` section. Tab labels, column headers, empty states, button labels, status labels.
**Files:** `apps/web/messages/en.json`, `apps/web/messages/es.json`
**Dependencies:** NC-222, NC-223, NC-224, NC-225, NC-228
**Note:** i18n keys will be added incrementally per task, this task is the audit pass to ensure completeness.
**Estimate:** Small

### NC-227 — Wire Performance + Activity into Dashboard tab
**What:** Move existing `AgentPerformance` and `AgentActivity` components into the Dashboard tab. Remove the "Recent Activity" section from Setup tab (redundant once Dashboard has the full timeline).
**Files:** `apps/web/src/app/dashboard/agents/[id]/page.tsx`
**Dependencies:** NC-221
**Estimate:** Small

### NC-228 — Pending Approvals section with approve/reject actions
**What:** Reuse existing `module.pendingExecutions` query (already supports `artifactId` filter), `module.approve` mutation (race-safe atomic transition + module re-execution), and `module.reject` mutation (includes `processRejection()` learning feedback loop). Do NOT create new routes in `agent.ts`. Build UI: list with inline Approve/Reject buttons per pending item. Reject flow: reason picker (required, enum: `false_positive | wrong_target | bad_timing | incorrect_data | policy_violation`) + optional free-text (max 500 chars).
**Files:** `apps/web/src/components/agent-workspace/sales/approvals-section.tsx`, i18n
**Dependencies:** NC-221
**Estimate:** Small-Medium

### NC-229 — Trust graduation card on Dashboard tab
**What:** Contextual card at top of Dashboard showing autonomy progress: "N of M modules fully autonomous" with per-module status. For `draft_and_approve` modules, compute approval streak from recent `module_executions` (count consecutive `status='executed'` with no `rejected` in last 20). Show nudge: "12 approved in a row — ready to graduate?" with CTA linking to Setup → Modules. Makes the progressive trust model visible and encourages graduation.
**Files:** `apps/web/src/components/agent-workspace/sales/trust-graduation-card.tsx`, i18n
**Dependencies:** NC-221
**Estimate:** Medium

### NC-230 — Visual polish pass on agent workspace
**What:** Improve visual hierarchy across both tabs. Section header icons (consistent with sidebar icon set), spacing hierarchy (hero sections vs secondary), loading skeletons for all Dashboard sections, subtle bg tint differentiation (Dashboard sections vs Setup forms), status color consistency audit across all badge/dot/pill components. Follow existing design system (CSS vars, Jost/DM Sans, 8px grid). No new dependencies.
**Files:** `apps/web/src/app/dashboard/agents/[id]/page.tsx`, section components, i18n if needed
**Dependencies:** NC-226 (after all sections exist)
**Estimate:** Medium

## Execution Order

```
NC-221 (tabs) ──┬── NC-222 (quotes)
                ├── NC-223 (meetings)
                ├── NC-224 (payments)      ── can run in parallel
                ├── NC-225 (follow-ups)
                ├── NC-227 (performance)
                ├── NC-228 (approvals)
                └── NC-229 (trust card)
                         │
                         └── NC-226 (i18n audit)
                                  │
                                  └── NC-230 (visual polish)
```

NC-221 first (foundation), then NC-222 through NC-229 are independent and can be tackled in any order. NC-226 is the i18n audit pass. NC-230 is the final visual polish after everything is built.

**Recommended sequence:** NC-221 → NC-222 (quick win) → NC-223 (meetings) → NC-228 (approvals) → NC-229 (trust card) → NC-224 → NC-225 → NC-227 → NC-226 → NC-230

## What This Completes

After this sprint, the Sales agent workspace has:

| Capability | Source | Status |
|---|---|---|
| Lead pipeline / scoring | qualify_lead module + leads table | Already built (analytics) |
| Customer memory | Memory extraction in message handler | Already built (customer panel) |
| Conversation management | Inbox (3-panel) | Already built |
| Owner intervention | replyAsOwner on escalated | Already built |
| **Quotes pipeline** | send_quote → module_executions | **NC-222** |
| **Meeting visibility** | book_meeting → module_executions | **NC-223** |
| **Payment tracking** | collect_payment → payments table | **NC-224** |
| **Follow-up queue** | send_followup → module_executions | **NC-225** |
| **Approval actions** | pending module_executions | **NC-228** |
| Performance metrics | AgentPerformance component | **NC-227** (wire up) |
| Activity timeline | AgentActivity component | **NC-227** (wire up) |
| **Trust graduation UX** | Autonomy progress + approval streaks | **NC-229** |
| **Visual polish** | Spacing, icons, skeletons, color consistency | **NC-230** |
| Analytics (sales comparison, forecast) | Analytics page | Already built |

This is a **complete Sales agent operational loop** — every module output is visible, every pending action is actionable, trust graduation is explicit, and the workspace looks polished.

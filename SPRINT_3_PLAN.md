# Sprint 3: Agent Workspace Dashboard UI

## Context

Sprint 2 built the `agentRouter` (20 tRPC procedures). Sprint 3 builds the dashboard that consumes them — giving each agent type its own workspace. Uses a **registry + shared primitives** pattern so adding a new agent type = 1 config file + i18n keys.

---

## Architecture: Registry + Shared Primitives

```
apps/web/src/components/agent-workspace/
  primitives/
    metrics-grid.tsx          # Renders Array<{label, value}> as StatCard grid
    data-table.tsx            # Paginated table: column defs, filters, optional mutation
    card-feed.tsx             # Chronological card list with configurable fields
    alert-list.tsx            # Alert cards with action buttons (escalations)
    bar-chart-css.tsx         # CSS-only horizontal bar chart
  registry/
    index.ts                  # type → section components mapping
    sales.tsx                 # Type-specific section array using shared primitives
    support.tsx               # Type-specific section array (4 sections incl. knowledge gaps)
    marketing.tsx             # Type-specific section array using shared primitives
  workspace-shell.tsx         # Layout: back nav + content slot
  workspace-header.tsx        # Name + badge + modules + KPIs + automation gauge
  priority-intents.tsx        # High-priority intent alerts (surfaces Sprint 2 #59)
  agent-activity.tsx          # Module execution timeline
```

**Adding a new agent type** (e.g., lawyer):
1. Create `registry/lawyer.tsx` — type-specific section components wiring tRPC calls to shared primitives
2. Update `registry/index.ts` — add `lawyer: [LawyerOverview, LawyerCases, LawyerDocuments]`
3. Add i18n keys under `agentWorkspace` namespace in `en.json` + `es.json`
4. Add backend procedures in `agentRouter` (separate sprint)

---

## Files to Create (16)

```
apps/web/src/app/dashboard/agents/[id]/page.tsx
apps/web/src/components/agent-workspace/primitives/metrics-grid.tsx
apps/web/src/components/agent-workspace/primitives/data-table.tsx
apps/web/src/components/agent-workspace/primitives/card-feed.tsx
apps/web/src/components/agent-workspace/primitives/alert-list.tsx
apps/web/src/components/agent-workspace/primitives/bar-chart-css.tsx
apps/web/src/components/agent-workspace/registry/index.ts
apps/web/src/components/agent-workspace/registry/sales.tsx
apps/web/src/components/agent-workspace/registry/support.tsx
apps/web/src/components/agent-workspace/registry/marketing.tsx
apps/web/src/components/agent-workspace/workspace-shell.tsx
apps/web/src/components/agent-workspace/workspace-header.tsx
apps/web/src/components/agent-workspace/priority-intents.tsx
apps/web/src/components/agent-workspace/agent-activity.tsx
apps/web/src/__tests__/setup.ts
apps/web/src/__tests__/agent-workspace.test.ts
```

## Files to Modify (8)

```
apps/web/package.json                              # Add jsdom + @testing-library/react + @testing-library/jest-dom
pnpm-lock.yaml                                     # Auto-updated by pnpm install
apps/web/vitest.config.ts                          # Add test.environment = 'jsdom'
apps/web/src/components/sidebar.tsx                # 'artifacts' → 'agents' + active check
apps/web/src/app/dashboard/artifacts/page.tsx      # "Open Workspace" button + flex-wrap + Link
apps/web/src/components/stat-card.tsx               # StatCard value: number → string | number
apps/web/messages/en.json                           # sidebar + artifacts.openWorkspace + agentWorkspace
apps/web/messages/es.json                           # same
```

---

## Audit Fixes Incorporated

### 1. agent-conversations.tsx → removed, global-list fallback
No `agent.conversations` procedure exists and the conversations list page does not support artifact-scoped filtering (`conversation.list` only accepts `status`, `limit`, `cursor`; the page doesn't read search params). Wiring artifact filtering would touch 4 files across both packages — out of scope for this sprint. Instead, `workspace-header.tsx` shows the conversation count as a StatCard with a "View all" link to `/dashboard/conversations` (unfiltered). This is a known UX gap; artifact-scoped conversation filtering is deferred to a follow-up task.

### 2. StatCard extended to accept string values
`stat-card.tsx` line 3: change `value: number` → `value: string | number`. Sales overview needs `fmtCost()` output (string). Backward-compatible — existing numeric callers still work.

### 3. Automation score gauge — custom, not UsageBar
`UsageBar` stays as-is (2-color: teal/gold). The automation score uses a **dedicated CSS gauge** inside `workspace-header.tsx` — a semicircle via `conic-gradient` with 3 color thresholds (≥80 teal, ≥50 gold, <50 sunset). No UsageBar modification needed. Test file tests the gauge color function directly.

### 4. Artifacts page — explicit wiring
Add `Link` import (already available via `next/link`). Action row gets `flex-wrap gap-2` to prevent overflow. "Open Workspace" button uses `<Link href={...}>` styled as outline button. Button order: Personality → Workspace → Test (workspace is the primary workflow action for active agents).

### 5. Sprint 2 features surfaced
**`highPriorityIntents`** → new `priority-intents.tsx` component, rendered in all workspace types above the activity timeline. Shows alert-style cards for intents flagged as high-priority in the last 7 days, with counts and "View conversation" links. This directly surfaces the #59 work.

**`supportKnowledgeGaps`** → rendered inside `registry/support.tsx` as a 4th section (table of unresolved intents with "Add to Knowledge" CTA). Support-specific, not shared.

### 6. Test infrastructure added + render-level tests
The monorepo currently has **no DOM test environment** — no `@testing-library/react`, no `jsdom`, no `happy-dom`. This sprint adds them as a prerequisite for render-level tests.

**New devDependencies in `apps/web/package.json`:**
```
@testing-library/react     # render, screen, fireEvent, waitFor
@testing-library/jest-dom  # toBeInTheDocument, toHaveTextContent matchers
jsdom                      # DOM environment for Vitest
```

**`apps/web/vitest.config.ts` update:**
```typescript
test: {
  testTimeout: 10_000,
  environment: 'jsdom',
  setupFiles: ['./src/__tests__/setup.ts'],
},
```

**Setup file `apps/web/src/__tests__/setup.ts`:**
```typescript
import '@testing-library/jest-dom/vitest';
```

**Mocking strategy for render tests:**
- `next-intl`: mock `useTranslations` to return `(key: string) => key` (passthrough)
- `next/navigation`: mock `useParams`, `useRouter`, `usePathname`
- `@/lib/trpc`: mock `trpc.agent.*.useQuery` / `useMutation` to return controlled states (loading/error/data)
- No real tRPC calls — all mocked at the hook level

Tests cover:
- Page primary query gate (loading → error → content)
- Section rendering by artifact type (sales gets sales sections, support gets support sections)
- Mutation wiring (updateLeadStage click → mutate called → invalidation)
- JSONB parse failure in rendered component (malformed output → graceful fallback, not crash)
- Empty state rendering (0 leads → empty state card)

---

## Implementation Order

### Phase 1: Primitive Changes (unblock everything)

**1. Test infrastructure** — Install `@testing-library/react`, `@testing-library/jest-dom`, `jsdom` as devDependencies in `apps/web`. Update `vitest.config.ts` with `environment: 'jsdom'` + `setupFiles`. This unblocks Phase 6 and must be done first so we can verify render tests work before writing 15 components.

**2. StatCard extension** — `stat-card.tsx`: `value: number` → `value: string | number`. One line change.

**3. i18n keys** — Add `agentWorkspace` namespace (~70 keys) to `en.json` + `es.json`. Update sidebar key. Add `artifacts.openWorkspace`.

**4. Sidebar rename** — `sidebar.tsx` line 20: `labelKey: 'agents'`. Active check extended:
```typescript
const isActive = href === '/dashboard'
  ? pathname === '/dashboard'
  : pathname.startsWith(href) ||
    (href === '/dashboard/artifacts' && pathname.startsWith('/dashboard/agents'));
```

### Phase 2: Shared Primitives

**5. metrics-grid.tsx** — Renders `Array<{ label: string; value: string | number }>` as `StatCard` grid (`grid-cols-2 sm:grid-cols-4 gap-4`). Optional `barChart` prop for CSS bars below the stats.

**6. data-table.tsx** — Generic paginated table. Props:
```typescript
interface DataTableProps<T> {
  columns: Array<{ key: string; label: string; render: (row: T) => ReactNode }>;
  data: T[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error?: { message: string; data?: { code?: string } | null };
  onRetry?: () => void;
  filters?: Array<{ key: string; label: string; options: Array<{ value: string; label: string }>; value: string; onChange: (v: string) => void }>;
  emptyTitle: string;
  emptyDescription: string;
  onLoadMore?: () => void;
  hasMore?: boolean;
}
```
Handles: loading skeleton, inline QueryError, empty state card, filter row, Load More button. **Mutations are not owned by DataTable** — they live inside column `render` functions provided by registry components (e.g., sales.tsx renders a stage `<select>` that calls `updateLeadStage.mutate` on change). DataTable is purely presentational.

**7. card-feed.tsx** — Generic card list for executions. Props: `items`, `renderCard` function, loading/error/empty states. Used by quotes, engagement, drafts.

**8. alert-list.tsx** — Alert-style cards (sunset border) with action button. Props: `items`, `renderAlert` function, `actionLabel`, `onAction`, loading/error/empty states. Used by escalations.

**9. bar-chart-css.tsx** — CSS horizontal bar chart. Props: `bars: Array<{ label: string; value: number; color?: string }>`. Proportional-width divs. Pattern from overview page intent breakdown.

### Phase 3: Layout + Shared Sections

**10. workspace-shell.tsx** — Back nav (ArrowLeft → `/dashboard/artifacts`) + `children` slot. Pattern from `conversations/[id]/page.tsx`.

**11. workspace-header.tsx** — Props from parent (no own fetch):
```typescript
interface WorkspaceHeaderProps {
  artifact: { id: string; name: string; type: string; isActive: boolean };
  metrics: { totalExecutions: number; autonomousExecutions: number; pendingApprovals: number; automationScore: number; conversationCount: number };
  boundModules: Array<{ slug: string; name: string; autonomyLevel: string }>;
}
```
Renders: name + type Badge + module badges + 5 StatCards (Total Executions, Autonomous, Pending, Conversations, Automation Score as `${score}%`). Automation score gets color class via helper: `≥80 text-teal, ≥50 text-gold, <50 text-sunset`.

**12. priority-intents.tsx** — `{ artifactId: string }` prop. Calls `trpc.agent.highPriorityIntents.useQuery({ artifactId })`. Renders compact alert cards: intent type Badge, count, last seen date, "View" link to latest conversation. Only renders if data.length > 0 (collapses to nothing when no alerts). Shared across all types.

**13. agent-activity.tsx** — `{ artifactId: string }` prop. Calls `trpc.agent.activityFeed.useQuery({ artifactId, limit: 20 })`. CSS timeline (border-left + dots). Each entry: module slug Badge, status badge (executed/pending/rejected), duration, date. Load More pagination. Empty state.

### Phase 4: Registry Config Files

Each registry file exports a type-specific section array. Each component is thin (~40-80 lines): it calls one tRPC procedure and passes data to a shared primitive.

**14. registry/sales.tsx** — Exports `salesSections: ComponentType<{artifactId: string}>[]`:
- `SalesOverview`: `salesPipeline` + `salesFunnel` → MetricsGrid (Pipeline Value via fmtCost, Hot Leads, Won Deals, Conversion Rate %) + BarChartCss (funnel stages)
- `SalesPipeline`: `salesLeads` → DataTable (columns: Customer, Score badge, Stage select, Value, Date; filters: stage, score; mutation: `updateLeadStage`)
- `SalesQuotes`: `salesQuotes` → CardFeed (quote items, total via fmtCost, status badge)

**15. registry/support.tsx** — Exports `supportSections`:
- `SupportOverview`: `supportMetrics` → MetricsGrid (Open Tickets, Resolution Rate %, Escalations, Total Tickets) + BarChartCss (top categories)
- `SupportTickets`: `supportTickets` → DataTable (columns: Ticket ID, Subject, Priority badge, Status select, Date; filters: status, priority; mutation: `updateTicketStatus`)
- `SupportEscalations`: `supportEscalations` → AlertList (customer, date; action: `acknowledgeEscalation`)
- `SupportKnowledgeGaps`: `supportKnowledgeGaps` → DataTable (columns: Intent, Occurrences, Last Seen; no mutation; CTA: "Add to Knowledge" link to `/dashboard/knowledge`)

**16. registry/marketing.tsx** — Exports `marketingSections`:
- `MarketingOverview`: `marketingInterestMap` → MetricsGrid (Total Interests, Ready to Buy, Considering, Browsing) + BarChartCss (topics by interest level)
- `MarketingEngagement`: `marketingEngagement` → CardFeed (topic, interest level badge, follow-up flag, date)
- `MarketingDrafts`: `marketingDrafts` → CardFeed (content type badge, topic, draft text truncated, status badge)

**17. registry/index.ts** — Maps type to sections:
```typescript
import { salesSections } from './sales.js';
import { supportSections } from './support.js';
import { marketingSections } from './marketing.js';
import type { ComponentType } from 'react';

export const sectionRegistry: Record<string, ComponentType<{ artifactId: string }>[]> = {
  sales: salesSections,
  support: supportSections,
  marketing: marketingSections,
  custom: [],
};
```

### Phase 5: Integration

**18. /dashboard/agents/[id]/page.tsx** — Main workspace page:
- `'use client'`, `useParams<{ id: string }>()`, `useTranslations('agentWorkspace')`, `useLocale()`
- Primary gate: `trpc.agent.workspace.useQuery({ artifactId: id })` → Skeleton → QueryError → content
- Renders: WorkspaceShell → WorkspaceHeader → type sections from `sectionRegistry[type]` → PriorityIntents → AgentActivity

**19. Artifacts page update** — In action buttons section (~line 453):
- Import `Link` from `next/link` and `BarChart3` from lucide
- Change `flex items-center gap-2` → `flex flex-wrap items-center gap-2`
- Add Workspace button (inside `isActive` block, before Test button):
  ```tsx
  <Link href={`/dashboard/agents/${artifact.id}`}
    className="inline-flex items-center gap-1 rounded-md border-2 border-charcoal/15 bg-cream px-3 py-1.5 text-sm font-medium text-charcoal hover:bg-charcoal/5">
    <BarChart3 className="h-3.5 w-3.5" /> {t('openWorkspace')}
  </Link>
  ```
  Uses native `Link` styled as outline button (avoids `Button asChild` limitation).

### Phase 6: Tests

**20. apps/web/src/__tests__/agent-workspace.test.ts** — Render-level tests (~20 cases):

**Pure logic:**
- `sectionRegistry` returns correct components per type; `custom` → empty array
- `getScoreColor(score)`: ≥80 → teal, ≥50 → gold, <50 → sunset; handles 0, 100
- Pipeline value sum: empty array, string "0" values

**Component rendering (via @testing-library/react):**
- Workspace page: shows loading skeleton when query pending
- Workspace page: shows QueryError when primary query fails
- Workspace page: renders sales sections when artifact.type is 'sales'
- Workspace page: renders support sections when artifact.type is 'support'
- DataTable: renders empty state when data is []
- DataTable: renders rows from provided data
- DataTable: mutation trigger calls mutate with correct args
- CardFeed: handles malformed JSONB output (missing fields → graceful fallback)
- AlertList: action button fires onAction callback
- PriorityIntents: renders nothing when data is empty array

---

## i18n Key Structure (~70 keys)

Namespace: `agentWorkspace`. Key patterns follow existing conventions.

```
backToAgents, pageTitle, activeLabel, inactiveLabel, boundModules,
metricTotal, metricAutonomous, metricPending, metricConversations, metricAutomationScore,
viewAllConversations, loadMore, stageUpdated, ticketUpdated, escalationAcknowledged,
priorityIntentsTitle, priorityIntentCount, viewConversation,
salesOverview, salesPipelineValue, salesHotLeads, salesWonDeals, salesConversionRate,
salesPipeline, salesLeads, salesQuotes, salesStage{New,Qualifying,Proposal,Negotiation,ClosedWon,ClosedLost},
salesScore{Hot,Warm,Cold}, salesEmptyTitle, salesEmptyDesc, salesQuotesEmpty, salesQuotesEmptyDesc,
supportOverview, supportOpenTickets, supportResolutionRate, supportEscalations, supportTotalTickets,
supportTickets, supportTopCategories, supportPriority, supportStatus, supportEmptyTitle, supportEmptyDesc,
supportEscalationsTitle, supportAcknowledge, supportNoEscalations, supportNoEscalationsDesc,
supportKnowledgeGaps, supportAddToKnowledge,
marketingOverview, marketingTotalInterests, marketingReadyToBuy, marketingConsidering, marketingBrowsing,
marketingEngagement, marketingDrafts, marketingEmptyTitle, marketingEmptyDesc,
marketingDraftsEmpty, marketingDraftsEmptyDesc,
activityTitle, activityEmpty, activityEmptyDesc
```

---

## Verification

1. `pnpm turbo build --filter=@camello/web` — no TS errors
2. `pnpm --filter @camello/web test -- --run` — all pass (78 existing + ~20 new)
3. Manual: `/dashboard/artifacts` → sidebar says "Agents" → click Workspace on active artifact → workspace loads → type-specific sections render → stat cards show data or empty states → mutations work (stage dropdown, ticket status, acknowledge) → priority intents section shows when alerts exist → activity timeline renders

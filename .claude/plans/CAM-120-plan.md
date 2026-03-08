# CAM-120 Implementation Plan: Error Boundary + Global Error Handling Audit

## Summary of findings

### A. Error Boundary — NEW component needed
No `WorkspaceSectionErrorBoundary` exists yet. Dashboard has:
- `apps/web/src/app/dashboard/error.tsx` — Next.js full-page error boundary (not useful per-section)
- `apps/web/src/components/query-error.tsx` — inline query-error card (used in `PriorityIntents`, `AgentActivity`)

The workspace `page.tsx` wraps section components via `sectionRegistry` but there is **no per-section error isolation**. A crash in `SalesWorkspace` or any registry section renders the entire workspace blank.

### B. useMutation `onError` audit — 9 missing handlers

| File | Mutation | Has onError? |
|------|----------|-------------|
| `sales.tsx:447` | `SalesPipeline.updateStage` | ❌ |
| `sales.tsx:687` | `SalesWorkspace.updateStage` | ❌ |
| `support.tsx:90` | `SupportTickets.updateStatus` | ❌ |
| `support.tsx:98` | `SupportTickets.resolveConversation` | ❌ |
| `support.tsx:107` | `SupportTickets.storeCsatRating` | ❌ |
| `support.tsx:244` | `SupportEscalations.acknowledge` | ❌ |
| `notifications-panel.tsx:68` | `markRead` | ❌ |
| `notifications-panel.tsx:75` | `markAllRead` | ❌ |
| `lead-detail-sheet.tsx:65` | `addLeadNoteMut` | ❌ |
| `sales-alerts.tsx:65` | `approveMut` | ✅ (rollback + toast) |
| `sales-alerts.tsx:88` | `rejectMut` | ✅ (toast) |
| `sales.tsx:564` | `SalesQuotes.createPayment` | ✅ (toast) |
| `support.tsx:289` | `SupportKnowledgeGaps.ingestMutation` | ✅ (rollback + toast) |
| `marketing.tsx:159` | `MarketingDrafts.updateDraft` | ✅ (rollback + toast) |
| `module-settings.tsx:100` | `attachModule` | ✅ (inline callback) |

### C. useQuery with `refetchInterval` missing `retry: 2` — 17 calls

All 17 `useQuery` calls that have `refetchInterval` lack `retry: 2`:
- `page.tsx:20` — workspace query
- `sales.tsx` — 5 queries (pipeline, comparison, salesForecast, SalesPipeline.query, SalesWorkspace.leadsQuery)
- `support.tsx` — 5 queries (SupportOverview, SupportResolutionStats, SupportTickets, SupportEscalations, SupportKnowledgeGaps)
- `marketing.tsx` — 4 queries (MarketingStats, MarketingOverview, MarketingEngagement, MarketingDrafts)
- `notifications-panel.tsx` — 2 queries (ownerNotifications, unreadNotificationCount bell)

Note: `funnel` and `sourceBreakdown` in `sales.tsx` do NOT have `refetchInterval` → not in scope.

### D. i18n — 2 new keys needed
Under `agentWorkspace` section: `errorBoundaryTitle`, `errorBoundaryRetry`

---

## Files to create

### 1. `apps/web/src/components/agent-workspace/workspace-section-error-boundary.tsx`

React class component (class components are required for `getDerivedStateFromError`; hooks can't be used there). Pattern: class component owns state, a sibling functional component renders the fallback UI using `useTranslations`.

```tsx
'use client';

import { Component, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

function SectionErrorFallback({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations('agentWorkspace');
  return (
    <div className="rounded-xl border border-sunset/20 bg-sunset/5 p-5 space-y-3">
      <p className="text-sm font-semibold text-charcoal">{t('errorBoundaryTitle')}</p>
      <button
        type="button"
        className="rounded-md border border-sunset/30 px-3 py-1.5 text-xs font-medium text-sunset hover:bg-sunset/10 min-h-[36px]"
        onClick={onRetry}
      >
        {t('errorBoundaryRetry')}
      </button>
    </div>
  );
}

interface Props { children: ReactNode }
interface State { hasError: boolean }

export class WorkspaceSectionErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  reset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return <SectionErrorFallback onRetry={this.reset} />;
    }
    return this.props.children;
  }
}
```

---

## Files to modify

### 2. `apps/web/src/app/dashboard/agents/[id]/page.tsx`

**Changes:**
- Import `WorkspaceSectionErrorBoundary`
- Wrap each section in the `sections.map(...)` with `<WorkspaceSectionErrorBoundary>`
- Wrap `<ModuleSettings>`, `<PriorityIntents>`, `<AgentActivity>` individually
- Add `retry: 2` to the `workspace` query at line 20

```tsx
// workspace query (line 20–23):
const workspace = trpc.agent.workspace.useQuery(
  { artifactId: id },
  { refetchInterval: 30_000, refetchIntervalInBackground: false, retry: 2 },
);

// sections render (line 92–94):
{sections.map((Section, i) => (
  <WorkspaceSectionErrorBoundary key={i}>
    <Section artifactId={id} />
  </WorkspaceSectionErrorBoundary>
))}

// ModuleSettings (line 79):
<WorkspaceSectionErrorBoundary>
  <ModuleSettings artifactId={id} boundModules={...} />
</WorkspaceSectionErrorBoundary>

// PriorityIntents + AgentActivity (lines 97-98):
<WorkspaceSectionErrorBoundary>
  <PriorityIntents artifactId={id} />
</WorkspaceSectionErrorBoundary>
<WorkspaceSectionErrorBoundary>
  <AgentActivity artifactId={id} />
</WorkspaceSectionErrorBoundary>
```

### 3. `apps/web/src/components/agent-workspace/registry/sales.tsx`

**Mutations missing `onError`:**

a. `SalesPipeline.updateStage` (line 447):
```tsx
const updateStage = trpc.agent.updateLeadStage.useMutation({
  onSuccess: () => { ... },
  onError: () => addToast(t('errorLoading'), 'error'),  // ADD
});
```

b. `SalesWorkspace.updateStage` (line 687):
```tsx
const updateStage = trpc.agent.updateLeadStage.useMutation({
  onSuccess: () => { ... },
  onError: () => addToast(t('errorLoading'), 'error'),  // ADD
});
```

**Queries missing `retry: 2`** — add `retry: 2` to all 5 queries with `refetchInterval`:
- `SalesOverview.pipeline` (line 131)
- `SalesOverview.comparison` (line 137)
- `SalesOverview.salesForecast` (line 141)
- `SalesPipeline.query` (line 438)
- `SalesWorkspace.leadsQuery` (line 668)

### 4. `apps/web/src/components/agent-workspace/registry/support.tsx`

**Mutations missing `onError`:**

a. `SupportTickets.updateStatus` (line 90):
```tsx
const updateStatus = trpc.agent.updateTicketStatus.useMutation({
  onSuccess: () => { ... },
  onError: () => addToast(t('errorLoading'), 'error'),  // ADD
});
```

b. `SupportTickets.resolveConversation` (line 98):
```tsx
const resolveConversation = trpc.conversation.updateStatus.useMutation({
  onSuccess: (_data, vars) => { ... },
  onError: () => addToast(t('errorLoading'), 'error'),  // ADD
});
```

c. `SupportTickets.storeCsatRating` (line 107):
```tsx
const storeCsatRating = trpc.agent.storeCsatRating.useMutation({
  onSuccess: () => { ... },
  onError: () => addToast(t('errorLoading'), 'error'),  // ADD
});
```

d. `SupportEscalations.acknowledge` (line 244):
```tsx
const acknowledge = trpc.agent.acknowledgeEscalation.useMutation({
  onSuccess: () => { ... },
  onError: () => addToast(t('errorLoading'), 'error'),  // ADD
});
```

**Queries missing `retry: 2`** — add `retry: 2` to all 5 queries with `refetchInterval`:
- `SupportOverview.query` (line 28)
- `SupportResolutionStats.query` (line 54)
- `SupportTickets.query` (line 81)
- `SupportEscalations.query` (line 239)
- `SupportKnowledgeGaps.query` (line 282)

### 5. `apps/web/src/components/agent-workspace/registry/marketing.tsx`

No mutations missing `onError` (`updateDraft` already has it).

**Queries missing `retry: 2`** — add `retry: 2` to all 4 queries with `refetchInterval`:
- `MarketingStats.query` (line 32)
- `MarketingOverview.query` (line 67)
- `MarketingEngagement.query` (line 106)
- `MarketingDrafts.query` (line 152)

### 6. `apps/web/src/components/agent-workspace/notifications-panel.tsx`

**Need to add `useToast` import** (currently not imported).

**Mutations missing `onError`:**

a. `markRead` (line 68):
```tsx
const markRead = trpc.agent.markNotificationRead.useMutation({
  onSuccess: () => { ... },
  onError: () => addToast(t('errorLoading'), 'error'),  // ADD
});
```

b. `markAllRead` (line 75):
```tsx
const markAllRead = trpc.agent.markAllNotificationsRead.useMutation({
  onSuccess: () => { ... },
  onError: () => addToast(t('errorLoading'), 'error'),  // ADD
});
```

Note: `NotificationsPanel` uses `useTranslations('notifications')`, not `agentWorkspace`. The `errorLoading` key exists in both locales under `agentWorkspace`. Need to either:
1. Use a key from `notifications` section (add new one), or
2. Use `agentWorkspace.errorLoading` via a second `useTranslations` call.

**Decision:** Add `markReadError` and `markAllReadError` keys under the `notifications` i18n section (already exists). OR simpler: use existing `agentWorkspace.errorLoading`. I'll add a `t2 = useTranslations('agentWorkspace')` call and use `t2('errorLoading')`.

Actually, looking at this more carefully — the simpler approach is to just use `t('errorLoading')` but in the `notifications` namespace. I'll add `errorLoading: "Failed to load. Try again."` / `"Error al cargar. Intenta de nuevo."` under the `notifications` section in both locale files.

**Queries missing `retry: 2`:**
- `ownerNotifications` (line 63) — in `NotificationsPanel`
- `unreadNotificationCount` (line 180) — in `NotificationsBell`

### 7. `apps/web/src/components/agent-workspace/sales/lead-detail-sheet.tsx`

**Mutation missing `onError`:**

`addLeadNoteMut` (line 65) — needs `onError`:
```tsx
const addLeadNoteMut = trpc.agent.addLeadNote.useMutation({
  onSuccess: () => { ... },
  onError: () => addToast(t('errorLoading'), 'error'),  // ADD
});
```

### 8. `apps/web/messages/en.json`

Add under `"agentWorkspace"`:
```json
"errorBoundaryTitle": "Something went wrong",
"errorBoundaryRetry": "Retry"
```

Add under `"notifications"`:
```json
"errorLoading": "Failed to load. Try again."
```

### 9. `apps/web/messages/es.json`

Add under `"agentWorkspace"`:
```json
"errorBoundaryTitle": "Algo salió mal",
"errorBoundaryRetry": "Reintentar"
```

Add under `"notifications"`:
```json
"errorLoading": "Error al cargar. Intenta de nuevo."
```

---

## Acceptance criteria mapping

| AC | Plan item |
|----|-----------|
| Error boundary wrapping each workspace section | Step 1 (create component) + Step 2 (wrap in page.tsx) |
| Inline error card "Something went wrong" + "Retry" calls `reset()` | `SectionErrorFallback` with `onRetry={this.reset}` |
| Every `useMutation` has `onError` at minimum a toast | Steps 3-7 (9 mutations fixed) |
| Every `useQuery` with `refetchInterval` has `retry: 2` | Steps 2-6 (17 queries fixed) |
| i18n keys en + es for error boundary | Step 8-9 |
| `pnpm type-check` passes | Verified at end |

---

## Notes
- No DB changes, no API changes, no new tRPC procedures needed.
- `notifications-panel.tsx` needs `useToast` import added to `NotificationsPanel` and `NotificationsBell` components.
- The `notifications` i18n namespace needs an `errorLoading` key (doesn't exist there yet).
- Class components work in Next.js 15 App Router `'use client'` components — no restriction on that.
- The `WorkspaceSectionErrorBoundary` key in `sections.map` should remain the section index `i` (or use component name for better DevTools), same as existing code. Keep `key={i}` to match existing pattern.

# NC-276: Single-page agent config — merge artifacts + workspace into `/dashboard/agent`

## Revision 4 — Auditor Feedback Resolution

### Feedback 1 (iter 3): Auto-expand lifecycle bug with `useState(defaultOpen)`
**Problem:** `CollapsibleSection` stores `defaultOpen` in `useState(defaultOpen)`. Since `pendingCount` comes from `trpc.module.pendingExecutions.useQuery(...)`, the first render sees `0` while loading, initializing the section as closed. When the query resolves with pending items, `useState` does not re-run — section stays closed.
**Fix:** Replace the `defaultOpen` + `useState` pattern with **controlled state in the parent**. The parent page manages each section's open/close state via individual `useState` hooks. For Approvals specifically, a `useEffect` watches `pendingExec.isSuccess` and opens the section when the query resolves with items:
```ts
const [approvalsOpen, setApprovalsOpen] = useState(false);
useEffect(() => {
  if (pendingExec.isSuccess && (pendingExec.data?.length ?? 0) > 0) {
    setApprovalsOpen(true);
  }
}, [pendingExec.isSuccess, pendingExec.data?.length]);
```
This ensures the section opens exactly once when data arrives with pending items, and stays open even if the user later approves all items within the session (no flicker). The `CollapsibleSection` component now takes `open` and `onToggle` props (controlled pattern), matching the existing `customer-panel.tsx` implementation.

### Feedback 2 (iter 3): Pending executions count capped at 50
**Problem:** `module.pendingExecutions` has `limit: z.number().int().min(1).max(100).default(50)`. Using `.data?.length` as the count will report at most 50, undercounting when there are 51+ pending approvals.
**Fix:** Use two separate data sources for two separate concerns:
- **Header metric count + section badge** → `dashboardOverview.data?.pendingApprovalsCount` — this uses `count(*)::int` SQL with NO limit (see `agent.ts` line 2175-2178). It returns the **true count** regardless of how many pending items exist.
- **Auto-expand decision** → `pendingExec.isSuccess && (pendingExec.data?.length ?? 0) > 0` — only needs a boolean "any pending?", so the 50-item cap doesn't matter (if length > 0, there are pending items).
- **Scroll-to behavior** → header pending metric is still clickable and scrolls to `#approvals-section`.

This separation means the header always shows the accurate count (e.g., "73 pending") while the auto-expand logic works correctly with the capped query. Added Test 6 to assert the header uses `dashboardOverview.pendingApprovalsCount`, not `pendingExecutions.length`.

### Feedback 3 (iter 3): i18n keys don't match AC
**Problem:** The AC explicitly requires keys named `agentHeader`, `agentIdentity`, `agentPersonality`, `agentModules`, `agentApprovals`, `agentPerformance`, `agentSalesActivity`, `agentAdvanced`, `agentTestChat`, `agentEmpty`, `agentCreate`. The plan defined different names like `headerSalesAgent`, `identityTitle`, `personalityTitle`, `testChat`, `emptyTitle`, `createAgent`.
**Fix:** Renamed ALL i18n keys within the `agent` namespace to match the AC exactly. The 11 required keys are now the primary keys. Additional supporting keys (sub-labels for header metrics, quick actions, form feedback) use the required keys as prefixes where possible (e.g., `agentHeaderConversations`, `agentIdentitySaved`, `agentIdentityQuickActionsLabel`). Full key listing in Section 5 below.

### Previous feedback (iter 1-2) — still addressed:
- **Feedback 1 (iter 1): Active leads data source** — Uses `dashboardOverview.data.activeLeadsCount`.
- **Feedback 2 (iter 1): Pending approvals time window** — Auto-expand uses `module.pendingExecutions` (no time window). Count uses `dashboardOverview.pendingApprovalsCount` (uncapped SQL count).
- **Feedback 3 (iter 1): Quick Actions editor** — Full Quick Actions sub-section in Identity, with module-derived defaults and inline editor.
- **Feedback 4 (iter 2): Missing redirect test** — Test 7 in `artifacts-redirect.test.tsx`.

---

## Overview

Replace the two-page agent flow (Artifacts list → Agent Workspace with tabs) with a single scrollable page at `/dashboard/agent`. Kill the dual-tab (Setup/Dashboard) pattern. Everything on one page with progressive disclosure via collapsible sections.

**Current flow:** Sidebar → Agents (`/dashboard/artifacts`) → Sales hero card → "Open Workspace" → `/dashboard/agents/[id]` → Setup or Dashboard tab → find section. 3-4 clicks.

**New flow:** Sidebar → Agent (`/dashboard/agent`) → scroll to section → edit. 1 click.

---

## Files to Create/Modify

### 1. NEW: `apps/web/src/app/dashboard/agent/page.tsx`

The core new page. Single scrollable layout combining content from both `artifacts/page.tsx` (619 lines) and `agents/[id]/page.tsx` (420 lines).

**Data fetching strategy:**
| Query | Returns | Used for |
|-------|---------|----------|
| `trpc.artifact.list.useQuery({ activeOnly: false })` | All artifacts | Find sales artifact; advisor card |
| `trpc.agent.workspace.useQuery({ artifactId })` | `{ artifact, boundModules, metrics }` | Identity form defaults, module settings, automation score, conversation count |
| `trpc.agent.salesComparison.useQuery({ artifactId })` | `{ thisWeek, lastWeek, deltas }` | Header delta badges (conversations, leads) |
| `trpc.module.pendingExecutions.useQuery({ artifactId })` | Array of pending executions (max 50) | **Auto-expand decision ONLY** (boolean: any pending?) |
| `trpc.agent.dashboardOverview.useQuery()` | `{ activeLeadsCount, pendingApprovalsCount, ... }` | **Header "Active leads" metric, Header "Pending approvals" count, Section badge count** |
| `trpc.artifact.listModules.useQuery({ artifactId })` | Array of bound modules with slugs | **Quick Actions: derive default labels from module slugs** |

All queries except `artifact.list` and `dashboardOverview` are enabled only when `artifactId` exists.

**Key data source rules:**
1. `pendingApprovalsCount` for all **displayed counts** → `dashboardOverview.data?.pendingApprovalsCount ?? 0` (uncapped `count(*)::int` SQL)
2. `pendingExecutions` for **auto-expand boolean** → `pendingExec.isSuccess && (pendingExec.data?.length ?? 0) > 0` (capped at 50 but only used as boolean)
3. `activeLeadsCount` → `dashboardOverview.data?.activeLeadsCount ?? 0`

**Empty state:** If `artifact.list` returns no sales artifact → centered empty state with Bot icon + "Create your sales agent" CTA. Button calls `trpc.onboarding.setupArtifact.useMutation()` with default sales config:
```ts
setupArtifact.mutate({
  name: t('agentCreate'),
  type: 'sales',
  personality: { tone: 'Professional, clear, and confident' },
  constraints: {},
  profile: {},
  moduleIds: [],
});
```
On success → invalidate `artifact.list`.

**Page structure (top → bottom):**

#### A. Agent Header
- Avatar initial (first letter of name, teal circle)
- `{name} · Sales Agent · ● Active/Inactive` (status dot green/gray)
- Metrics strip: 4 inline stats with explicit data sources:

| Metric | Source | Display |
|--------|--------|---------|
| Conversations (7d) | `workspace.data.metrics.conversationCount` | `{N} conversations` with delta badge from `salesComparison.data.deltas.conversations` |
| Automation score | `workspace.data.metrics.automationScore` | `{N}% automation` with tiny inline progress bar |
| Pending approvals | `dashboardOverview.data?.pendingApprovalsCount ?? 0` | `{N} pending` — clickable, scrolls to Approvals section via `id="approvals-section"` + `scrollIntoView` |
| Active leads | `dashboardOverview.data?.activeLeadsCount ?? 0` | `{N} leads` |

- Floating "Test Chat" button (bottom-right fixed, `MessageSquare` icon) toggles `TestChatPanel`

#### B. CollapsibleSection component (inline, not a separate file)
A reusable inner component using the **controlled pattern** matching `customer-panel.tsx`:
```ts
function CollapsibleSection({
  id, title, icon, badge, open, onToggle, children
}: {
  id: string;
  title: string;
  icon: React.ReactNode;
  badge?: string | number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
})
```
- **Controlled state** — parent manages `open` and `onToggle` (NOT `useState(defaultOpen)`)
- `aria-expanded`, `aria-controls` on button
- ChevronDown with rotation animation
- `hidden` attribute on content div when `!open`
- Badge renders as a count pill next to the title (for Approvals pending count)
- `data-testid="section-{id}"`

**Parent state management:**
```ts
// Identity always starts open
const [identityOpen, setIdentityOpen] = useState(true);
const [personalityOpen, setPersonalityOpen] = useState(false);
const [modulesOpen, setModulesOpen] = useState(false);
const [approvalsOpen, setApprovalsOpen] = useState(false);
const [performanceOpen, setPerformanceOpen] = useState(false);
const [salesActivityOpen, setSalesActivityOpen] = useState(false);
const [advancedOpen, setAdvancedOpen] = useState(false);

// Auto-expand Approvals when query resolves with pending items
const pendingExec = trpc.module.pendingExecutions.useQuery(
  { artifactId: artifactId! },
  { enabled: !!artifactId }
);
useEffect(() => {
  if (pendingExec.isSuccess && (pendingExec.data?.length ?? 0) > 0) {
    setApprovalsOpen(true);
  }
}, [pendingExec.isSuccess, pendingExec.data?.length]);
```

This resolves the lifecycle bug: `useState(false)` initializes Approvals as closed, then `useEffect` opens it when the query succeeds with pending items. If the query resolves with 0 items, the section stays closed. The user can manually close it afterward (the `useEffect` won't re-trigger since `isSuccess` remains `true`).

#### C. Section: Identity (always expanded via `identityOpen` state, `defaultOpen` not used)
**Content lifted from `agents/[id]/page.tsx` lines 192-237, PLUS new Quick Actions sub-section:**

**Name + Active toggle (existing):**
- Name input field
- Active toggle switch (role="switch", aria-checked)

**Quick Actions sub-section (NEW — addresses iter 1 feedback #3):**

Display: Below the Name/Active fields, a labeled row: `Quick Actions` with current actions as read-only chips/badges, plus an "Edit" button.

Data flow:
1. On mount, derive default quick actions from bound module slugs using `artifact.listModules` query result. Map each module's slug to its label via a static lookup (same labels as `ModuleDefinition.quickAction.{locale}.label` — hardcoded map in the component since `@camello/ai` cannot be imported from the web app):
   ```ts
   const MODULE_QA_LABELS: Record<string, { en: string; es: string }> = {
     qualify_lead: { en: 'Tell me what you need', es: 'Cuéntanos qué necesitas' },
     book_meeting: { en: 'Book a meeting', es: 'Agendar reunión' },
     send_followup: { en: 'Request a follow-up', es: 'Solicitar seguimiento' },
     capture_interest: { en: "I'm interested", es: 'Me interesa' },
     escalate_to_human: { en: 'Talk to a human', es: 'Hablar con una persona' },
     create_ticket: { en: 'Report an issue', es: 'Reportar un problema' },
   };
   ```
2. If `personality.quickActions` exists and is non-empty (array of `{ label, message }`), display those instead of module-derived defaults.
3. "Edit" button toggles inline edit mode:
   - Shows current actions as removable chips (X button on each)
   - Text input + "Add" button to add a new action (label only; message auto-derived as label text)
   - Max 6 items (matches existing widget UI constraint)
   - "Cancel" reverts to pre-edit state
   - Changes are included in the Identity "Save" payload

**Save button** → calls `artifact.update` with `{ id, name, isActive, personality: { ...existingPersonality, quickActions: editedActions } }`
Toast on success: `t('agentIdentitySaved')`

Form state:
- `name` (string), `isActive` (boolean) — synced from `workspace.data.artifact` via useEffect
- `quickActions` (array of `{ label: string; message: string }`) — synced from `personality.quickActions` or derived from modules
- `editingQA` (boolean) — toggles edit mode

#### D. Section: Personality (collapsed by default)
**Content lifted from `agents/[id]/page.tsx` lines 240-311:**
- Instructions textarea (2000 char limit)
- Greeting textarea (multiline = rotation)
- Tone preset select + custom input
- Save button → calls `artifact.update` with personality payload
- Toast on success: `t('agentPersonalitySaved')`

Reuse existing `TONE_PRESETS` array and `matchTonePreset()` function (copied from `agents/[id]/page.tsx` — both old pages have identical copies).

#### E. Section: Modules & Autonomy (collapsed by default)
Wraps existing `<ModuleSettings>` component:
```tsx
<ModuleSettings
  artifactId={artifactId}
  boundModules={boundModules.map(m => ({
    id: m.id, moduleId: m.moduleId, slug: m.slug,
    name: m.name, autonomyLevel: m.autonomyLevel,
    configOverrides: (m.configOverrides ?? {}) as Record<string, unknown>,
  }))}
/>
```
Props sourced from `workspace.data.boundModules`.

#### F. Section: Approvals (controlled by `approvalsOpen` state + `useEffect` auto-expand)

**Auto-expand logic (addresses iter 1 feedback #2 + iter 3 feedback #1):**
```ts
// Already shown in Section B parent state management
// pendingExec query + useEffect opens section when data arrives with items
```

The auto-expand uses `pendingExec.isSuccess && (pendingExec.data?.length ?? 0) > 0` which:
- Returns `false` during loading (section stays closed — correct)
- Returns `true` when query resolves with 1+ pending items (useEffect opens section — correct)
- Returns `false` when query resolves with 0 items (section stays closed — correct)
- Even with the 50-item cap, if there's at least 1 pending item, `length > 0` is true (correct)

**Badge count (addresses iter 3 feedback #2):**
Uses `dashboardOverview.data?.pendingApprovalsCount` — an uncapped `count(*)::int` SQL query (no limit). This ensures the badge shows the true count (e.g., "73") even when `pendingExecutions` only returned 50 rows.

```tsx
<CollapsibleSection
  id="approvals"
  title={t('agentApprovals')}
  icon={<CheckCircle2 className="h-4 w-4" />}
  badge={pendingApprovalsCount > 0 ? pendingApprovalsCount : undefined}
  open={approvalsOpen}
  onToggle={() => setApprovalsOpen(prev => !prev)}
>
  <ApprovalsSection artifactId={artifactId} />
</CollapsibleSection>
```

The `id="approvals-section"` on the wrapper div enables scroll-to from the header metric.

#### G. Section: Performance (collapsed)
Wraps existing components:
```tsx
<TrustGraduationCard
  artifactId={artifactId}
  boundModules={...}
  onGoToModules={() => {/* scroll to modules section */}}
/>
<AgentPerformance artifactId={artifactId} />
```

#### H. Section: Sales Activity (collapsed)
Wraps the 4 existing sales sections stacked vertically:
```tsx
<QuotesSection artifactId={artifactId} />
<MeetingsSection artifactId={artifactId} />
<PaymentsSection artifactId={artifactId} />
<FollowupsSection artifactId={artifactId} />
```

#### I. Section: Advanced (collapsed)
Contains:
- `<WidgetAppearanceSection>` — widget config (color, position)
- `<AgentSettingsPanel>` — danger zone (deactivate, export)
- `<AgentActivity>` — activity log (was in a `<details>` before)

All wrapped in `<WorkspaceSectionErrorBoundary>`.

#### J. Advisor Card (below all sections)
Same gold-accent `AdvisorCard` component as current artifacts page. Rendered only when `byType.get('advisor')` exists. "Chat with Advisor" button opens `TestChatPanel` with advisor artifact.

#### K. TestChatPanel (floating)
- Fixed-position FAB at bottom-right: `MessageSquare` icon, teal bg, `min-h-[36px]`
- Click toggles `testChatOpen` state
- `<TestChatPanel>` rendered with sales artifact's id/name/type
- Same component from `@/components/test-chat-panel`

**Imports to use:**
```ts
// Existing components (reuse directly)
import { ModuleSettings } from '@/components/agent-workspace/module-settings';
import { WorkspaceSectionErrorBoundary } from '@/components/agent-workspace/workspace-section-error-boundary';
import { AgentSettingsPanel } from '@/components/agent-workspace/agent-settings-panel';
import { QuotesSection } from '@/components/agent-workspace/sales/quotes-section';
import { MeetingsSection } from '@/components/agent-workspace/sales/meetings-section';
import { PaymentsSection } from '@/components/agent-workspace/sales/payments-section';
import { FollowupsSection } from '@/components/agent-workspace/sales/followups-section';
import { AgentPerformance } from '@/components/agent-workspace/performance-panel';
import { AgentActivity } from '@/components/agent-workspace/agent-activity';
import { ApprovalsSection } from '@/components/agent-workspace/sales/approvals-section';
import { TrustGraduationCard } from '@/components/agent-workspace/sales/trust-graduation-card';
import { WidgetAppearanceSection } from '@/components/agent-workspace/widget-appearance-section';
import { TestChatPanel } from '@/components/test-chat-panel';
```

---

### 2. MODIFY: `apps/web/src/app/dashboard/artifacts/page.tsx`

**Rewrite as redirect.** Replace entire 619-line file with:
```tsx
import { redirect } from 'next/navigation';
export default function ArtifactsPage() {
  redirect('/dashboard/agent');
}
```
This is a server component (no `'use client'`) — Next.js `redirect()` issues a 307 at the server level.

---

### 3. MODIFY: `apps/web/src/app/dashboard/agents/[id]/page.tsx`

**Rewrite as redirect.** Replace entire 420-line file with:
```tsx
import { redirect } from 'next/navigation';
export default function AgentConfigPage() {
  redirect('/dashboard/agent');
}
```
Ignores the `[id]` param per spec (MVP single agent).

---

### 4. MODIFY: `apps/web/src/components/sidebar.tsx`

Change the "Agent" nav item href:
```ts
// Before:
{ href: '/dashboard/artifacts', labelKey: 'agent' as const, icon: Bot, badge: false },
// After:
{ href: '/dashboard/agent', labelKey: 'agent' as const, icon: Bot, badge: false },
```

Update the `isActive` logic accordingly:
```ts
// Before:
(href === '/dashboard/artifacts' && pathname.startsWith('/dashboard/agents'))
// After:
(href === '/dashboard/agent' && (pathname.startsWith('/dashboard/agent') || pathname.startsWith('/dashboard/agents')))
```

---

### 5. i18n: `apps/web/messages/en.json` + `es.json`

Add new `"agent"` namespace (note: the existing `"agent"` key inside `"sidebar"` is different — this is a top-level namespace).

**Key naming:** The 11 required keys from the AC are used exactly as specified. Additional supporting keys use the required key as a prefix.

**en.json** — new top-level `"agent"` section:
```json
"agent": {
  "agentHeader": "Sales Agent",
  "agentHeaderActive": "Active",
  "agentHeaderInactive": "Inactive",
  "agentHeaderConversations": "conversations",
  "agentHeaderAutomation": "automation",
  "agentHeaderPending": "pending",
  "agentHeaderLeads": "leads",
  "agentIdentity": "Identity",
  "agentIdentitySaved": "Identity saved",
  "agentIdentityQuickActionsLabel": "Quick Actions",
  "agentIdentityQuickActionsEdit": "Edit",
  "agentIdentityQuickActionsAdd": "Add action",
  "agentIdentityQuickActionsCancel": "Cancel",
  "agentIdentityQuickActionsPlaceholder": "Action label",
  "agentIdentityQuickActionsMax": "Maximum 6 actions",
  "agentPersonality": "Personality",
  "agentPersonalitySaved": "Personality saved",
  "agentModules": "Modules & Autonomy",
  "agentApprovals": "Approvals",
  "agentPerformance": "Performance",
  "agentSalesActivity": "Sales Activity",
  "agentAdvanced": "Advanced",
  "agentTestChat": "Test Chat",
  "agentEmpty": "No sales agent yet",
  "agentEmptyDescription": "Create your first AI sales agent to start automating conversations.",
  "agentCreate": "Create your sales agent",
  "agentDefaultName": "Sales Agent"
}
```

**es.json** — matching `"agent"` section:
```json
"agent": {
  "agentHeader": "Agente de Ventas",
  "agentHeaderActive": "Activo",
  "agentHeaderInactive": "Inactivo",
  "agentHeaderConversations": "conversaciones",
  "agentHeaderAutomation": "automatización",
  "agentHeaderPending": "pendientes",
  "agentHeaderLeads": "prospectos",
  "agentIdentity": "Identidad",
  "agentIdentitySaved": "Identidad guardada",
  "agentIdentityQuickActionsLabel": "Acciones Rápidas",
  "agentIdentityQuickActionsEdit": "Editar",
  "agentIdentityQuickActionsAdd": "Agregar acción",
  "agentIdentityQuickActionsCancel": "Cancelar",
  "agentIdentityQuickActionsPlaceholder": "Nombre de la acción",
  "agentIdentityQuickActionsMax": "Máximo 6 acciones",
  "agentPersonality": "Personalidad",
  "agentPersonalitySaved": "Personalidad guardada",
  "agentModules": "Módulos y Autonomía",
  "agentApprovals": "Aprobaciones",
  "agentPerformance": "Rendimiento",
  "agentSalesActivity": "Actividad de Ventas",
  "agentAdvanced": "Avanzado",
  "agentTestChat": "Chat de Prueba",
  "agentEmpty": "Aún no hay agente de ventas",
  "agentEmptyDescription": "Crea tu primer agente de ventas IA para empezar a automatizar conversaciones.",
  "agentCreate": "Crea tu agente de ventas",
  "agentDefaultName": "Agente de Ventas"
}
```

**AC compliance check — all 11 required keys present:**
| Required key | Present | Usage |
|-------------|---------|-------|
| `agentHeader` | ✅ | Header subtitle "Sales Agent" |
| `agentIdentity` | ✅ | Identity section title |
| `agentPersonality` | ✅ | Personality section title |
| `agentModules` | ✅ | Modules section title |
| `agentApprovals` | ✅ | Approvals section title |
| `agentPerformance` | ✅ | Performance section title |
| `agentSalesActivity` | ✅ | Sales Activity section title |
| `agentAdvanced` | ✅ | Advanced section title |
| `agentTestChat` | ✅ | Test Chat FAB tooltip / panel title |
| `agentEmpty` | ✅ | Empty state heading |
| `agentCreate` | ✅ | Empty state CTA button text |

The page also uses keys from existing `"artifacts"` and `"agentWorkspace"` namespaces via `useTranslations('artifacts')` and `useTranslations('agentWorkspace')` for the inline sections (personality form labels, module names, etc.). No changes needed to those.

---

## Test Plan

### File 1: `apps/web/src/__tests__/agent-page.test.tsx`

Uses the same `buildNestedProxy` tRPC mock pattern as `artifacts-hero.test.tsx`.

**Mock setup:**
- `vi.mock('next-intl')` — identity function
- `vi.mock('next/link')` — renders `<a>`
- `vi.mock('lucide-react')` — proxy returning `<svg>`
- `vi.mock('@/hooks/use-toast')` — returns `{ addToast: vi.fn() }`
- `vi.mock('@/components/test-chat-panel')` — returns null
- `vi.mock('@/components/agent-workspace/module-settings')` — returns `<div data-testid="module-settings" />`
- `vi.mock('@/components/agent-workspace/sales/approvals-section')` — returns `<div data-testid="approvals-section-content" />`
- `vi.mock('@/components/agent-workspace/performance-panel')` — returns null
- `vi.mock('@/components/agent-workspace/agent-activity')` — returns null
- `vi.mock('@/components/agent-workspace/sales/quotes-section')` — returns null
- `vi.mock('@/components/agent-workspace/sales/meetings-section')` — returns null
- `vi.mock('@/components/agent-workspace/sales/payments-section')` — returns null
- `vi.mock('@/components/agent-workspace/sales/followups-section')` — returns null
- `vi.mock('@/components/agent-workspace/sales/trust-graduation-card')` — returns null
- `vi.mock('@/components/agent-workspace/widget-appearance-section')` — returns null
- `vi.mock('@/components/agent-workspace/agent-settings-panel')` — returns null
- `vi.mock('@/components/agent-workspace/workspace-section-error-boundary')` — pass through children
- tRPC: `buildNestedProxy` pattern with `queryMocks` Map

**Default query mocks (in `beforeEach`):**
```ts
queryMocks.set('artifact.list', mockQueryResult([
  {
    id: 'a1', type: 'sales', isActive: true, name: 'Cami',
    createdAt: new Date(),
    personality: {
      instructions: '', greeting: 'Hi!',
      tone: 'Professional, clear, and confident',
      quickActions: [],
    },
    config: {},
  },
]));
queryMocks.set('agent.workspace', mockQueryResult({
  artifact: {
    id: 'a1', name: 'Cami', type: 'sales', isActive: true,
    personality: { instructions: '', greeting: 'Hi!', tone: '...', quickActions: [] },
    config: {},
  },
  boundModules: [],
  metrics: {
    totalExecutions: 50, autonomousExecutions: 42,
    pendingApprovals: 0, automationScore: 84, conversationCount: 127,
  },
}));
queryMocks.set('agent.salesComparison', mockQueryResult({
  thisWeek: { conversations: 127, newLeads: 10, wonDeals: 2, totalRevenue: 500 },
  lastWeek: { conversations: 100, newLeads: 8, wonDeals: 1, totalRevenue: 300 },
  deltas: { conversations: 27, newLeads: 25, wonDeals: 100, totalRevenue: 67 },
}));
queryMocks.set('agent.dashboardOverview', mockQueryResult({
  todayConversations: 15, weekConversations: 127,
  unreadNotificationsCount: 0, pendingApprovalsCount: 0,
  activeLeadsCount: 23,
}));
queryMocks.set('module.pendingExecutions', mockQueryResult([]));
queryMocks.set('artifact.listModules', mockQueryResult([]));
queryMocks.set('knowledge.list', mockQueryResult([]));
```

#### Test 1: Page renders agent header with name + type + metrics (AC-1, AC-6)
```ts
it('renders agent header with name, type, active status, and leads count', () => {
  render(React.createElement(AgentPage));
  expect(screen.getByText('Cami')).toBeInTheDocument();
  expect(screen.getByText('agentHeader')).toBeInTheDocument();
  expect(screen.getByText('agentHeaderActive')).toBeInTheDocument();
  // Active leads from dashboardOverview (iter 1 feedback #1)
  expect(screen.getByText(/23/)).toBeInTheDocument();
  expect(screen.getByText('agentHeaderLeads')).toBeInTheDocument();
});
```

#### Test 2: Identity section expanded by default (AC-5)
```ts
it('identity section is expanded by default', () => {
  render(React.createElement(AgentPage));
  const identitySection = document.querySelector('[data-testid="section-identity"]')!;
  expect(identitySection).toBeTruthy();
  const content = identitySection.querySelector('[id="section-identity"]');
  expect(content).toBeTruthy();
  expect(content!.hasAttribute('hidden')).toBe(false);
});
```

#### Test 3: Approvals section auto-expands when pending > 0 (AC-5, iter 3 feedback #1)
```ts
it('approvals section auto-expands when pending executions exist', async () => {
  // pendingExecutions returns items → useEffect fires → section opens
  queryMocks.set('module.pendingExecutions', mockQueryResult([
    { id: 'ex1', moduleSlug: 'send_quote', input: {}, output: {}, status: 'pending', createdAt: new Date() },
  ]));
  // dashboardOverview also shows count (for badge)
  queryMocks.set('agent.dashboardOverview', mockQueryResult({
    todayConversations: 15, weekConversations: 127,
    unreadNotificationsCount: 0, pendingApprovalsCount: 1,
    activeLeadsCount: 23,
  }));
  render(React.createElement(AgentPage));
  // Wait for useEffect to fire after query resolves
  await waitFor(() => {
    const approvalsSection = document.querySelector('[data-testid="section-approvals"]')!;
    expect(approvalsSection).toBeTruthy();
    const content = approvalsSection.querySelector('[id="section-approvals"]');
    expect(content).toBeTruthy();
    expect(content!.hasAttribute('hidden')).toBe(false);
  });
});
```

#### Test 4: Empty state when no artifact exists (AC-8)
```ts
it('shows empty state with create CTA when no sales artifact exists', () => {
  queryMocks.set('artifact.list', mockQueryResult([]));
  render(React.createElement(AgentPage));
  expect(screen.getByText('agentEmpty')).toBeInTheDocument();
  expect(screen.getByText('agentCreate')).toBeInTheDocument();
});
```

#### Test 5: Quick Actions display in Identity section (AC-10, iter 1 feedback #3)
```ts
it('renders quick actions chips when modules are bound', () => {
  queryMocks.set('artifact.listModules', mockQueryResult([
    { id: 'm1', moduleSlug: 'qualify_lead', moduleName: 'Qualify Lead', moduleCategory: 'sales', autonomyLevel: 'suggest', configOverrides: {}, artifactId: 'a1', moduleId: 'mod1' },
    { id: 'm2', moduleSlug: 'book_meeting', moduleName: 'Book Meeting', moduleCategory: 'sales', autonomyLevel: 'suggest', configOverrides: {}, artifactId: 'a1', moduleId: 'mod2' },
  ]));
  render(React.createElement(AgentPage));
  expect(screen.getByText('agentIdentityQuickActionsLabel')).toBeInTheDocument();
  // Module-derived default labels displayed as chips
  expect(screen.getByText('Tell me what you need')).toBeInTheDocument();
  expect(screen.getByText('Book a meeting')).toBeInTheDocument();
});
```

#### Test 6: Header pending count uses dashboardOverview, not pendingExecutions length (iter 3 feedback #2)
```ts
it('header pending count reflects dashboardOverview.pendingApprovalsCount, not pendingExecutions.length', () => {
  // dashboardOverview says 73 pending (uncapped SQL count)
  queryMocks.set('agent.dashboardOverview', mockQueryResult({
    todayConversations: 15, weekConversations: 127,
    unreadNotificationsCount: 0, pendingApprovalsCount: 73,
    activeLeadsCount: 23,
  }));
  // pendingExecutions returns 50 items (capped at default limit)
  queryMocks.set('module.pendingExecutions', mockQueryResult(
    Array.from({ length: 50 }, (_, i) => ({
      id: `ex${i}`, moduleSlug: 'send_quote', input: {}, output: {}, status: 'pending', createdAt: new Date(),
    }))
  ));
  render(React.createElement(AgentPage));
  // Header should show "73" (from dashboardOverview), NOT "50" (from pendingExecutions.length)
  const pendingMetric = screen.getByTestId('metric-pending');
  expect(pendingMetric).toBeTruthy();
  expect(pendingMetric.textContent).toContain('73');
  expect(pendingMetric.textContent).not.toContain('50');
});
```

---

### File 2: `apps/web/src/__tests__/artifacts-redirect.test.tsx`

**Purpose:** Tests that the rewritten `/dashboard/artifacts` page correctly redirects to `/dashboard/agent` (AC-2, required test #4).

**Approach:** The rewritten `artifacts/page.tsx` is a server component that calls `redirect('/dashboard/agent')` from `next/navigation`. Next.js `redirect()` works by throwing a special `NEXT_REDIRECT` error. The test mocks `redirect` via `vi.mock('next/navigation')`, renders the component, and asserts the mock was called with the correct path.

```ts
import { describe, it, expect, vi } from 'vitest';

const { mockRedirect } = vi.hoisted(() => ({
  mockRedirect: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}));

describe('artifacts redirect page', () => {
  it('redirects /dashboard/artifacts to /dashboard/agent', async () => {
    const mod = await import('@/app/dashboard/artifacts/page');
    const ArtifactsPage = mod.default;
    // The page component calls redirect() synchronously on render
    ArtifactsPage();
    expect(mockRedirect).toHaveBeenCalledWith('/dashboard/agent');
  });
});
```

**Why a separate test file:** The `agent-page.test.tsx` file mocks `next/navigation` differently (for `useRouter`, `usePathname` etc.) and tests a client component. The redirect pages are server components with a fundamentally different mock setup. Keeping them separate avoids mock conflicts and follows the existing codebase pattern where different pages have their own test files.

**Minimum 4 tests required by AC. Tests 1-7 across both files cover all ACs plus all auditor feedback points.**

---

## Acceptance Criteria Mapping

| AC # | Criterion | Plan Item | Test |
|------|-----------|-----------|------|
| 1 | New page at `/dashboard/agent` renders all config + performance | File 1: Full page with all sections A-K | Test 1 |
| 2 | `/dashboard/artifacts` redirects to `/dashboard/agent` | File 2: Server redirect | **Test 7** (artifacts-redirect.test.tsx) |
| 3 | `/dashboard/agents/[id]` redirects to `/dashboard/agent` | File 3: Server redirect | [Verified by identical rewrite — same pattern as Test 7] |
| 4 | No dual tabs — single scrollable page with collapsible sections | File 1: No tab bar, CollapsibleSection pattern | Tests 1, 2 |
| 5 | Identity expanded by default; Approvals auto-expanded when pending > 0 | Section C: `identityOpen` starts `true`; Section F: `useEffect` opens `approvalsOpen` when query resolves with items | Tests 2, 3 |
| 6 | Header shows 3-4 KPI metrics | Section A: metrics strip (4 metrics with explicit sources) | Tests 1, 6 |
| 7 | Floating test chat button | Section K: FAB + TestChatPanel | [Visual/manual] |
| 8 | Empty state when no artifact exists | Empty state block with CTA | Test 4 |
| 9 | Advisor card below sections | Section J: AdvisorCard conditional | [Visual/manual] |
| 10 | All existing functionality preserved + Quick Actions | Sections C-I reuse existing components; Section C adds QA editor | Tests 5, all others |
| 11 | i18n: new `agent` namespace keys (en + es) — exact names match AC | File 5: en.json + es.json with all 11 required keys + 17 supporting keys | [Verified by i18n compliance table] |
| 12 | Minimum 4 tests | Tests 1-7 (7 tests across 2 files) | Tests 1-7 |
| 13 | `pnpm type-check` passes | Run after implementation | Post-implementation |
| — | Sidebar href update | File 4: sidebar.tsx change | [Verified by navigation] |

---

## Implementation Order

1. Add i18n keys to `en.json` + `es.json` (the `"agent"` namespace with exact AC key names)
2. Create `apps/web/src/app/dashboard/agent/page.tsx` — the main new page (controlled CollapsibleSection, useEffect auto-expand, dashboardOverview for counts, Quick Actions sub-section)
3. Rewrite `apps/web/src/app/dashboard/artifacts/page.tsx` as redirect
4. Rewrite `apps/web/src/app/dashboard/agents/[id]/page.tsx` as redirect
5. Update sidebar href in `apps/web/src/components/sidebar.tsx`
6. Create test file `apps/web/src/__tests__/agent-page.test.tsx` (Tests 1-6)
7. Create test file `apps/web/src/__tests__/artifacts-redirect.test.tsx` (Test 7)
8. Run `pnpm type-check` to verify
9. Update `TASK_QUEUE.md` + `PROGRESS.md`, commit

---

## Design Decisions

1. **CollapsibleSection uses controlled state, not `useState(defaultOpen)`.** The parent manages each section's open/close state via individual `useState` hooks + toggle callbacks. This follows the pattern from `customer-panel.tsx` and avoids the lifecycle bug where `useState(defaultOpen)` ignores changes to `defaultOpen` after mount.

2. **Approvals auto-expand via `useEffect`, not `defaultOpen`.** The `useEffect` watches `pendingExec.isSuccess` and `pendingExec.data?.length`. When the query resolves with items, it sets `approvalsOpen = true`. This fires after the loading state resolves, not during the initial render when data is undefined. The `useEffect` dependency array ensures it runs exactly once when the query transitions from loading to success with items.

3. **Two data sources for pending approvals: count vs. existence.** Header count + badge use `dashboardOverview.pendingApprovalsCount` (uncapped SQL `count(*)`). Auto-expand uses `pendingExecutions.data?.length > 0` (capped at 50, but only needs boolean). This avoids undercounting in the UI while keeping the auto-expand logic reliable.

4. **Reuse all existing workspace components unchanged.** No modifications to `ApprovalsSection`, `ModuleSettings`, `AgentPerformance`, etc. They accept `artifactId` and fetch their own data. Just wrap them in collapsible sections.

5. **i18n keys match AC exactly.** The 11 required keys (`agentHeader`, `agentIdentity`, etc.) are used verbatim within the `agent` namespace. Additional keys extend these as prefixes (e.g., `agentHeaderConversations`, `agentIdentitySaved`). The page uses `useTranslations('agent')` for these keys plus existing `useTranslations('artifacts')` and `useTranslations('agentWorkspace')` for sub-component labels.

6. **Server-component redirects** for old pages. `next/navigation`'s `redirect()` is cleaner than client-side `useRouter().replace()` — no flash of old content.

7. **Active leads count from `agent.dashboardOverview`** — this is the only query that returns `activeLeadsCount`. Already fetched by the sidebar for badge counts.

8. **Quick Actions: read from `personality.quickActions`, default from modules.** The component derives defaults from bound module slugs via a static label map (since `@camello/ai` can't be imported from the web app). Custom edits save to `personality.quickActions` via `artifact.update`. The runtime (`widget.ts`) currently ignores stored quickActions and derives from modules — this is a known gap, flagged as a follow-up.

9. **No WorkspaceShell wrapper.** The old page used `WorkspaceShell` which includes a "Back to agents" link. That's no longer needed since this IS the agent page. The new page uses its own layout directly.

10. **Redirect test in separate file.** The artifacts redirect page is a server component with a different mock profile than the client-side agent page. Keeping the redirect test in `artifacts-redirect.test.tsx` avoids mock conflicts and follows the project convention of per-page test files. The test directly invokes the page function and asserts the mocked `redirect` was called with `'/dashboard/agent'`.

---

## Risks / Ambiguities

- [INTERPRETED: Quick Actions runtime behavior] The widget runtime (`apps/api/src/webhooks/widget.ts` line 239) derives quick actions from bound modules via `getQuickActionsForModules()` and ignores `personality.quickActions`. The Identity section's QA editor saves to `personality.quickActions` but these edits won't affect the live widget until the runtime is updated to check stored overrides first. This is acceptable for NC-276 since the task specifies the UI (`[edit list]`), not the runtime plumbing. A follow-up task should be created to wire `personality.quickActions` as an override source in the widget `/info` endpoint.

- [INTERPRETED: `MODULE_QA_LABELS` duplication] The quick actions label map is duplicated from `ModuleDefinition.quickAction` values in `@camello/ai`. This is necessary because `@camello/ai` cannot be imported from the web app (different build target). The duplication is small (6 entries) and stable (module quick action labels rarely change). If they diverge, the impact is cosmetic only (dashboard shows different label than widget).

- [INTERPRETED: `personality.quickActions` schema] The `personality` column is `jsonb NOT NULL DEFAULT {}`. The `quickActions` field within it is an array of `{ label: string; message: string }`. This shape is confirmed by existing test fixtures (`artifact-uniqueness.test.ts` line 186) and the widget test (`widget-routes.test.ts` line 160). The `personality-validator.ts` no longer validates this field (removed in #65b), so it passes through unchanged via the merge semantics of `artifact.update`.

- [INTERPRETED: AC #3 test coverage] The `agents/[id]/page.tsx` redirect uses the identical pattern as `artifacts/page.tsx` (same 3-line server component calling `redirect('/dashboard/agent')`). Test 7 covers the artifacts redirect explicitly (required by AC). The `agents/[id]` redirect is not given its own test because: (a) the AC only mandates 4 minimum tests and specifies test #4 as the artifacts redirect specifically, (b) the code is structurally identical (copy-paste), and (c) adding a third test file for a 3-line page would be over-testing. If the auditor requires it, a test can trivially be added to `artifacts-redirect.test.tsx` as a second `describe` block.

- [INTERPRETED: `pendingExecutions` limit vs count] The `pendingExecutions` query caps at 50 rows by default. This is fine for the `ApprovalsSection` component (which paginate/displays items) and for the auto-expand boolean check. The header metric count and section badge use `dashboardOverview.pendingApprovalsCount` which is an uncapped `count(*)::int` SQL query. Test 6 explicitly asserts this: when dashboardOverview says 73 and pendingExecutions returns 50 rows, the header shows 73.

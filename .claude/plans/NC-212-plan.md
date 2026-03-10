# NC-212 Plan: Simplify `/dashboard/agents/[id]` to config-only page

## Goal

Replace the complex workspace page (`WorkspaceHeader` + registry sections + kanban/alerts/etc.)
with a clean 6-section configuration page. Reuse existing components; add one backend filter.

---

## Files to Modify (no new files)

| File | Change |
|---|---|
| `apps/api/src/routes/agent.ts` | Add optional `artifactId` input to `dashboardActivityFeed` |
| `apps/web/src/app/dashboard/agents/[id]/page.tsx` | Full rewrite — config page |
| `apps/web/messages/en.json` | ~13 new keys in `agentWorkspace` section |
| `apps/web/messages/es.json` | Same keys in Spanish |
| `apps/api/src/__tests__/routes/agent-dashboard.test.ts` | 2 new tests for `dashboardActivityFeed` with `artifactId` |

---

## 1. Backend: `dashboardActivityFeed` input change

**File:** `apps/api/src/routes/agent.ts` — line ~2068

**Current:** `dashboardActivityFeed: tenantProcedure.query(...)`

**Change:** Add `.input(z.object({ artifactId: z.string().uuid().optional() }).default({}))`

In `notifRows` query — add optional condition to `and(...)`:
```ts
...(input.artifactId ? [eq(ownerNotifications.artifactId, input.artifactId)] : []),
```

In `convRows` query — add optional condition to `and(...)`:
```ts
...(input.artifactId ? [eq(conversations.artifactId, input.artifactId)] : []),
```

No structural change to query chains — existing mock tests remain valid.
Calling with no args → `undefined` → Zod default `{}` → `input.artifactId === undefined` → no filter applied (backward compat).

---

## 2. Frontend: Agent config page

**File:** `apps/web/src/app/dashboard/agents/[id]/page.tsx` (full rewrite)

### Data queries

| Query | Purpose |
|---|---|
| `trpc.agent.workspace({ artifactId: id })` | Agent data + bound modules |
| `trpc.knowledge.list()` | Doc count (knowledge is tenant-scoped) |
| `trpc.agent.dashboardActivityFeed({ artifactId: id })` | Last 5 events for this agent |

### Mutations

| Mutation | Used for |
|---|---|
| `trpc.artifact.update` | Identity section (name, isActive) + Personality section |

### Page structure

```
WorkspaceShell  (back → /dashboard/artifacts)
  <h1> {artifact.name}  +  type badge  +  "View conversations" link </h1>

  Card: Agent Identity
    - Name: always-editable text input + "Save" button
    - Active: toggle switch (calls artifact.update({ id, isActive: !current }))
    - Type: read-only badge (sales / support / marketing / custom)

  Card: Personality
    - Instructions: textarea (reuse logic from PersonalityDrawer in artifacts/page.tsx)
    - Greeting: textarea (one per line = random rotation; same hint text)
    - Tone: select with 6 presets + "Other" custom input
    - "Save" button (calls artifact.update({ id, personality: { instructions, greeting, tone } }))

  <ModuleSettings artifactId={id} boundModules={...} />   ← reused as-is

  Card: Knowledge
    - Shows knowledge.list result count (e.g., "12 documents")
    - Link → /dashboard/knowledge

  Card: Recent Activity
    - Last 5 events from dashboardActivityFeed({ artifactId: id })
    - Compact one-line per event: icon + description + relative time
    - Event type → label mapping (new_lead, conversation_resolved, approval_needed, deal_closed)
    - Empty state if no events

  <AgentSettingsPanel artifactId={id} />   ← reused as-is
```

### Import inventory

```tsx
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';
import { WorkspaceShell } from '@/components/agent-workspace/workspace-shell';
import { ModuleSettings } from '@/components/agent-workspace/module-settings';
import { AgentSettingsPanel } from '@/components/agent-workspace/agent-settings-panel';
import { WorkspaceSectionErrorBoundary } from '@/components/agent-workspace/workspace-section-error-boundary';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { QueryError } from '@/components/query-error';
import { fmtDateTime } from '@/lib/format';
import { MessageSquare, BookOpen, Zap, CheckCircle, Clock } from 'lucide-react';
```

Two `useTranslations` calls:
- `const t = useTranslations('agentWorkspace')` — page-level + new config keys
- `const ta = useTranslations('artifacts')` — reuse personality form keys (instructions, greeting, tone, tone presets)

### Personality form state (inline, extracted from PersonalityDrawer pattern)

```ts
const TONE_PRESETS = [...] // same 6 presets as artifacts/page.tsx

// Local state initialized from artifact.personality:
const [name, setName] = useState(artifact.name)
const [instructions, setInstructions] = useState(personality.instructions ?? '')
const [greetingText, setGreetingText] = useState(...)  // string|string[] → multiline
const [tonePreset, setTonePreset] = useState(...)
const [toneCustom, setToneCustom] = useState(...)
const [isActiveLocal, setIsActiveLocal] = useState(artifact.isActive)
```

### "View conversations" link

```tsx
<Link href={`/dashboard/conversations?artifactId=${id}`}>
  <MessageSquare /> {t('configViewConversations')}
</Link>
```

### Knowledge section

```tsx
// knowledge.list uses tenant-scoped data; show count of returned docs
const knowledgeQuery = trpc.knowledge.list.useQuery()
const docCount = knowledgeQuery.data?.length ?? 0
```

### Recent Activity section

```tsx
const activityQuery = trpc.agent.dashboardActivityFeed.useQuery({ artifactId: id })
const events = (activityQuery.data?.events ?? []).slice(0, 5)

// Event type → i18n key + icon
const EVENT_META = {
  new_lead: { key: 'configEventNewLead', icon: Zap },
  conversation_resolved: { key: 'configEventConvResolved', icon: CheckCircle },
  approval_needed: { key: 'configEventApprovalNeeded', icon: Clock },
  deal_closed: { key: 'configEventDealClosed', icon: CheckCircle },
}
```

---

## 3. i18n: new keys in `agentWorkspace`

Add to both `en.json` and `es.json` under `"agentWorkspace"`:

| Key | en | es |
|---|---|---|
| `configIdentityTitle` | "Agent Identity" | "Identidad del agente" |
| `configPersonalityTitle` | "Personality" | "Personalidad" |
| `configKnowledgeTitle` | "Knowledge" | "Conocimiento" |
| `configActivityTitle` | "Recent Activity" | "Actividad reciente" |
| `configViewConversations` | "View conversations" | "Ver conversaciones" |
| `configKnowledgeDocs` | "{count} documents" | "{count} documentos" |
| `configManageKnowledge` | "Manage knowledge" | "Gestionar conocimiento" |
| `configActivityEmpty` | "No recent activity for this agent." | "Sin actividad reciente para este agente." |
| `configSave` | "Save" | "Guardar" |
| `configIdentitySaved` | "Identity saved" | "Identidad guardada" |
| `configPersonalitySaved` | "Personality saved" | "Personalidad guardada" |
| `configEventNewLead` | "New lead" | "Nuevo prospecto" |
| `configEventConvResolved` | "Conversation resolved" | "Conversación resuelta" |
| `configEventApprovalNeeded` | "Approval needed" | "Aprobación requerida" |
| `configEventDealClosed` | "Deal closed" | "Trato cerrado" |

**Total: 15 new keys (×2 files = 30 total)**

Note: Personality form fields (instructions, greeting, greetingHint, tone, tone presets, agentName, save/saving)
are reused from the existing `artifacts` namespace via a second `useTranslations('artifacts')` call — no duplication.

---

## 4. Tests: `dashboardActivityFeed` with `artifactId`

**File:** `apps/api/src/__tests__/routes/agent-dashboard.test.ts`

Add inside the existing `describe('agent.dashboardActivityFeed', ...)` block:

**Test A:** `dashboardActivityFeed with artifactId — accepts input and returns events`
- Call `caller.dashboardActivityFeed({ artifactId: ARTIFACT_ID })`
- Mock returns 1 notif row + 1 conv row
- Assert result has 2 events with correct types

**Test B:** `dashboardActivityFeed without artifactId — backward compat, no filter`
- Call `caller.dashboardActivityFeed({})` (explicit empty object)
- Verify it resolves correctly (same as existing no-arg test behavior)
- Assert result structure is valid

Existing tests call `caller.dashboardActivityFeed()` — these remain valid because
`.input(z.object({ ... }).default({}))` converts `undefined` → `{}` → `artifactId: undefined`.

---

## Acceptance Criteria Mapping

| AC | Plan item |
|---|---|
| Page sections: Identity → Personality → Modules → Knowledge → Activity → Settings | Section 2 |
| `dashboardActivityFeed` optional `artifactId` input | Section 1 |
| Reuse `ModuleSettings` | Section 2 (import, pass boundModules) |
| Reuse `AgentSettingsPanel` | Section 2 (import, pass artifactId) |
| Personality section inline editable (drawer pattern) | Section 2 (form state) |
| Remove workspace header + registry sections | Page rewrite — they are not imported |
| "View conversations" link → `/dashboard/conversations?artifactId=<id>` | Section 2 |
| Compact recent activity (no workspace dashboards) | Section 2 (dashboardActivityFeed, slice 5) |
| i18n keys en + es | Section 3 |
| `pnpm type-check` passes | All types explicit; reuse existing component props |

---

## Execution order

1. `apps/api/src/routes/agent.ts` — backend filter change
2. `apps/web/messages/en.json` + `es.json` — add i18n keys
3. `apps/web/src/app/dashboard/agents/[id]/page.tsx` — full rewrite
4. `apps/api/src/__tests__/routes/agent-dashboard.test.ts` — add 2 tests
5. `pnpm type-check` — verify
6. Update `TASK_QUEUE.md` + `PROGRESS.md` + commit

# Plan: NC-283 — User-facing terminology audit

## Summary

Pure i18n value update across `en.json` + `es.json` (21 key changes each), plus a new test file. Zero component logic changes. Zero tRPC/DB changes. All mapped terms already go through `t()` — no hardcoded string patches required.

---

## File inventory

| File | Change |
|---|---|
| `apps/web/messages/en.json` | 21 value updates across `agentWorkspace` + `knowledge` namespaces |
| `apps/web/messages/es.json` | 21 matching natural-Spanish updates |
| `apps/web/src/__tests__/terminology-audit.test.ts` | NEW — validates all mapping table entries against en.json |
| `TASK_QUEUE.md` | mark NC-283 `[x]` + one-line summary |
| `PROGRESS.md` | add Done row |

---

## Step 1 — Update `apps/web/messages/en.json`

All changes are value-only. Keys are never touched.

### `agentWorkspace` namespace

| Key (line) | Old value | New value |
|---|---|---|
| `boundModules` (142) | `"Modules"` | `"Skills"` |
| `metricTotal` (143) | `"Total Executions"` | `"Times Used"` |
| `escalationAcknowledged` (155) | `"Escalation acknowledged"` | `"Handed off to you"` |
| `supportEscalations` (264) | `"Escalations"` | `"Handoffs"` |
| `supportEscalationsTitle` (272) | `"Escalations"` | `"Handoffs"` |
| `supportKnowledgeGaps` (286) | `"Knowledge Gaps"` | `"Unanswered Questions"` |
| `gapAnswerIngested` (293) | `"Answer added to knowledge base"` | `"Answer saved — your agent will use this next time"` |
| `gapEmptyTitle` (294) | `"No knowledge gaps"` | `"No unanswered questions"` |
| `activityEmptyDesc` (377) | `"Module execution history will appear here."` | `"Action history will appear here."` |
| `moduleSettings` (391) | `"Module Settings"` | `"Skill Settings"` |
| `riskTier` (394) | `"Risk"` | `"Sensitivity"` |
| `autonomyLevel` (398) | `"Autonomy"` | `"Approval Mode"` |
| `autonomyFullyAutonomous` (399) | `"Fully Autonomous"` | `"Automatic"` |
| `autonomyDraftAndApprove` (400) | `"Draft & Approve"` | `"Review First"` |
| `autonomySuggestOnly` (401) | `"Suggest Only"` | `"Manual"` |
| `performanceModuleUsageTitle` (428) | `"Module Usage"` | `"Skill Usage"` |
| `performanceModuleUsage` (429) | `"Executions (all time)"` | `"Runs (all time)"` |
| `configKnowledgeTitle` (439) | `"Knowledge"` | `"What your agent knows"` |
| `configKnowledgeDocs` (442) | `"{count, plural, =0 {No documents} =1 {1 document} other {# documents}}"` | `"{count, plural, =0 {No topics taught} =1 {1 topic taught} other {# topics taught}}"` |
| `configKnowledgeGapsTitle` (447) | `"Knowledge Gaps"` | `"Unanswered Questions"` |

### `knowledge` namespace

| Key (line) | Old value | New value |
|---|---|---|
| `sectionGaps` (605) | `"Knowledge Gaps"` | `"Unanswered Questions"` |

---

## Step 2 — Update `apps/web/messages/es.json`

Natural Spanish (not literal). Same keys, same lines.

### `agentWorkspace` namespace

| Key | Old value | New value |
|---|---|---|
| `boundModules` | `"Módulos"` | `"Habilidades"` |
| `metricTotal` | `"Ejecuciones Totales"` | `"Veces Utilizado"` |
| `escalationAcknowledged` | `"Escalación reconocida"` | `"Transferido a ti"` |
| `supportEscalations` | `"Escalaciones"` | `"Transferencias"` |
| `supportEscalationsTitle` | `"Escalaciones"` | `"Transferencias"` |
| `supportKnowledgeGaps` | `"Vacíos de Conocimiento"` | `"Preguntas sin respuesta"` |
| `gapAnswerIngested` | `"Respuesta agregada a la base de conocimiento"` | `"Respuesta guardada — tu agente la usará la próxima vez"` |
| `gapEmptyTitle` | `"Sin vacíos de conocimiento"` | `"Sin preguntas sin respuesta"` |
| `activityEmptyDesc` | `"El historial de ejecución de módulos aparecerá aquí."` | `"El historial de acciones aparecerá aquí."` |
| `moduleSettings` | `"Configuración de módulos"` | `"Configuración de habilidades"` |
| `riskTier` | `"Riesgo"` | `"Sensibilidad"` |
| `autonomyLevel` | `"Autonomía"` | `"Modo de aprobación"` |
| `autonomyFullyAutonomous` | `"Totalmente autónomo"` | `"Automático"` |
| `autonomyDraftAndApprove` | `"Borrador y aprobación"` | `"Revisar primero"` |
| `autonomySuggestOnly` | `"Solo sugerir"` | `"Manual"` |
| `performanceModuleUsageTitle` | `"Uso de Módulos"` | `"Uso de Habilidades"` |
| `performanceModuleUsage` | `"Ejecuciones (total)"` | `"Ejecuciones realizadas (total)"` |
| `configKnowledgeTitle` | `"Conocimiento"` | `"Lo que sabe tu agente"` |
| `configKnowledgeDocs` | `"{count, plural, =0 {Sin documentos} =1 {1 documento} other {# documentos}}"` | `"{count, plural, =0 {Sin temas enseñados} =1 {1 tema enseñado} other {# temas enseñados}}"` |
| `configKnowledgeGapsTitle` | `"Vacíos de Conocimiento"` | `"Preguntas sin respuesta"` |

### `knowledge` namespace

| Key | Old value | New value |
|---|---|---|
| `sectionGaps` | `"Brechas de Conocimiento"` | `"Preguntas sin respuesta"` |

---

## Step 3 — No component changes required

Grep confirms all mapped user-visible terms already flow through `t()`:
- `module-settings.tsx` uses `t('moduleSettings')`, `t('autonomyLevel')`, `t('autonomyFullyAutonomous')`, `t('riskTierLow/Medium/High')` — no hardcoded strings
- `trust-graduation-card.tsx` uses `t('trustGoToModules')` — NOTE: this renders "Configure Modules" but `trustGoToModules` is NOT in the NC-283 mapping table, so it is out of scope [INTERPRETED: leaving `trustGoToModules`/`trustProgress`/`trustEmpty` unchanged to keep scope tight; NC-284 redesigns the entire autonomy UI and will address this section]
- No other hardcoded instances of mapped terms found in `.tsx` files

---

## Step 4 — New test file

**Path:** `apps/web/src/__tests__/terminology-audit.test.ts`

**Pattern:** Direct JSON import test (no rendering needed — validates message values directly). This approach is reliable, fast, and doesn't require mocking.

```typescript
import { describe, it, expect } from 'vitest';
import enMessages from '../../messages/en.json';

describe('NC-283 — terminology audit', () => {
  it('module settings renders "Approval Mode" not "Autonomy"', () => {
    expect(enMessages.agentWorkspace.autonomyLevel).toBe('Approval Mode');
  });

  it('knowledge section renders "Unanswered Questions" not "Knowledge Gaps"', () => {
    expect(enMessages.agentWorkspace.configKnowledgeGapsTitle).toBe('Unanswered Questions');
    expect(enMessages.knowledge.sectionGaps).toBe('Unanswered Questions');
  });

  it('Modules renamed to Skills', () => {
    expect(enMessages.agentWorkspace.boundModules).toBe('Skills');
    expect(enMessages.agentWorkspace.moduleSettings).toBe('Skill Settings');
    expect(enMessages.agentWorkspace.performanceModuleUsageTitle).toBe('Skill Usage');
  });

  it('execution terms updated', () => {
    expect(enMessages.agentWorkspace.metricTotal).toBe('Times Used');
    expect(enMessages.agentWorkspace.performanceModuleUsage).toBe('Runs (all time)');
  });

  it('autonomy terms updated', () => {
    expect(enMessages.agentWorkspace.autonomyFullyAutonomous).toBe('Automatic');
    expect(enMessages.agentWorkspace.autonomyDraftAndApprove).toBe('Review First');
    expect(enMessages.agentWorkspace.autonomySuggestOnly).toBe('Manual');
  });

  it('escalation terms renamed to handoff', () => {
    expect(enMessages.agentWorkspace.escalationAcknowledged).toBe('Handed off to you');
    expect(enMessages.agentWorkspace.supportEscalations).toBe('Handoffs');
  });

  it('knowledge and activity terms updated', () => {
    expect(enMessages.agentWorkspace.activityEmptyDesc).toContain('Action history');
    expect(enMessages.agentWorkspace.gapAnswerIngested).toContain('Answer saved');
    expect(enMessages.agentWorkspace.configKnowledgeDocs).toContain('topics taught');
    expect(enMessages.agentWorkspace.configKnowledgeTitle).toBe('What your agent knows');
  });
});
```

**Total: 7 test cases covering all acceptance criteria (≥2 required).**

---

## Step 5 — Type-check

Run `pnpm type-check` from repo root. No TypeScript changes are needed (JSON value changes don't affect types), but the check verifies nothing was accidentally broken.

---

## Acceptance criteria checklist

| Criterion | Covered by |
|---|---|
| Every term in mapping table updated in en.json | Steps 1 (21 changes) |
| Every term in mapping table updated in es.json | Step 2 (21 matching changes) |
| No hardcoded English strings for mapped terms | Step 3 (grep confirms, no changes needed) |
| i18n keys unchanged | Steps 1–2 (values only edited) |
| Spanish translations are natural | Step 2 (reviewed: "Modo de aprobación", "Habilidades", "Transferencias") |
| Test (1): module settings renders "Approval Mode" | Step 4 test case 1 |
| Test (2): knowledge renders "Unanswered Questions" | Step 4 test case 2 |
| `pnpm type-check` passes | Step 5 |

---

## Notes / Interpretations

- [INTERPRETED] `supportEscalationsTitle` (line 272) has the same value "Escalations" as `supportEscalations` but is not explicitly listed in the mapping table. Updating it for consistency since both render the same user-facing word that maps to "Handoffs".
- [INTERPRETED] `gapEmptyTitle` ("No knowledge gaps") is not in the mapping table but directly references the renamed concept. Updating it to "No unanswered questions" for consistency.
- [INTERPRETED] Keys `trustGoToModules`, `trustProgress`, `trustEmpty` all reference "modules" but are not in the NC-283 mapping table. Leaving unchanged — NC-284 redesigns the entire trust/autonomy UI section anyway.
- [INTERPRETED] `riskTierLow/Medium/High` values ("Low"/"Medium"/"High") are not changed — the badge text itself doesn't say "Risk", only the label key `riskTier` does. Changing `riskTier: "Risk"` → `"Sensitivity"` is sufficient.

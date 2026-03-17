# Skill System Design — Camello AI Agents

> **Status:** Design RFC
> **Date:** 2025-03-16
> **Author:** Claude (design session with Mateo)

---

## 1. Problem Statement

Camello agents have **tools** (modules: qualify_lead, book_meeting, etc.) and **personality** (archetypes: sales framework, support empathy). But there's a gap between them:

- **Modules** define WHAT the agent CAN DO (Zod schemas, execute functions)
- **Archetypes** define WHO the agent IS (behavioral frameworks, tone)
- **Nothing defines HOW the agent should THINK** about specific situations

Example: the sales archetype says "use SPIN selling" generically, but doesn't teach the agent how to handle "we already have a vendor" objections for *this specific business*. The `qualify_lead` module scores leads mechanically, but doesn't know that leads from Instagram convert 3x better than LinkedIn for this tenant.

**Skills fill this gap.** They're contextual reasoning instructions — procedural knowledge that teaches agents *how to think* in specific situations, composed of decision logic, examples, and tool-use hints.

---

## 2. Core Concept

A **skill** is a prompt fragment with metadata that the orchestrator injects into the system prompt when contextually relevant. Skills live as structured content (markdown + frontmatter) and are discovered at message-handling time based on intent, conversation context, and tenant configuration.

```
┌─────────────────────────────────────────────────────────────────┐
│                     SYSTEM PROMPT ASSEMBLY                      │
│                                                                 │
│  Identity → Safety → Language                                   │
│       ↓                                                         │
│  Archetype Framework (WHO: behavioral rules)                    │
│       ↓                                                         │
│  ┌─────────────────────────────────────────┐                    │
│  │  SKILLS (HOW: situational reasoning)    │  ← NEW LAYER       │
│  │  • objection-handling-competitor         │                    │
│  │  • pricing-negotiation-tiers             │                    │
│  │  • upsell-after-booking                  │                    │
│  └─────────────────────────────────────────┘                    │
│       ↓                                                         │
│  Personality + Custom Instructions                              │
│       ↓                                                         │
│  RAG Context (WHAT: declarative facts)                          │
│       ↓                                                         │
│  Learnings + Customer Memory                                    │
│       ↓                                                         │
│  Module Definitions (WHAT: available tools)                     │
│       ↓                                                         │
│  Response constraints                                           │
└─────────────────────────────────────────────────────────────────┘
```

**Key distinction:**
- **RAG** = "Our premium plan costs $99/month" (facts to reference)
- **Skills** = "When a lead asks about pricing, qualify their budget first. If budget < $50, present the starter plan as high-value. If budget > $200, skip tiers and offer a custom quote." (procedures to follow)
- **Modules** = `send_quote({ items, total, validDays })` (actions to execute)

---

## 3. Skill File Format

### 3.1 Structure

```yaml
---
slug: objection-competitor
name: Competitor Objection Handling
description: >
  How to respond when the prospect mentions they already use a competitor
  or are evaluating alternatives. Reframes around unique value props.
type: sales                          # sales | support | marketing | general
trigger:
  mode: intent                       # always | intent | keyword | embedding
  intents: [objection, comparison]   # match against classified intent
  keywords: [competitor, already use, alternative, switch]  # fallback keyword scan
  confidence_floor: 0.4              # minimum embedding similarity for activation
priority: 10                         # higher = injected first (tie-break)
token_budget: 400                    # max tokens this skill may consume
requires_modules: [qualify_lead]     # modules that should be available when this skill fires
conflicts_with: [pricing-discount]   # never inject both (prevent contradictions)
locale: [en, es]                     # available locales
version: 1
---
```

### 3.2 Body Format

The body is structured markdown with labeled sections. The orchestrator injects it verbatim into the system prompt within a `[SKILL: {slug}]` wrapper.

```markdown
## Goal
Reframe competitor comparisons into discovery opportunities without badmouthing the alternative.

## Decision Tree
1. If prospect names a specific competitor → acknowledge ("I've heard good things about X")
2. Ask what they like about their current solution (discover pain gaps)
3. If they mention a pain point → map to our differentiator
4. If no pain found → suggest a low-commitment comparison (free trial, side-by-side demo)
5. Never claim superiority without evidence from knowledge base

## Examples

**Prospect:** "We already use HubSpot for this."
**Good response:** "HubSpot is solid for CRM. What made you start looking at alternatives — is there something it's not covering well?"
**Bad response:** "We're better than HubSpot because..."

**Prospect:** "Your competitor is cheaper."
**Good response:** "Price matters — can I ask what you're comparing? I want to make sure we're looking at the same scope so the comparison is fair."

## Tool Hints
- After discovering a pain gap, use `qualify_lead` with the pain as `needs` input
- If prospect is open to a demo, use `book_meeting` — frame as "comparison session"
- Do NOT use `send_quote` until budget is qualified (score ≥ 40)

## Anti-Patterns
- Never badmouth a competitor by name
- Never claim features you can't verify from the knowledge base
- Don't push for a close if the prospect is in active evaluation (suggest a follow-up instead)
```

### 3.3 Localized Content

For multi-locale skills, use locale-keyed sections:

```markdown
## Goal
<!-- shared across locales -->

## Examples [en]
**Prospect:** "We already use X."
...

## Examples [es]
**Prospecto:** "Ya usamos X."
...
```

The prompt builder strips non-matching locale sections before injection.

---

## 4. Skill Types & Storage

### 4.1 Three Tiers

| Tier | Who creates | Storage | Examples |
|------|------------|---------|----------|
| **Platform skills** | Camello team | Filesystem: `packages/ai/src/skills/` | objection-handling, discovery-questions, escalation-protocol |
| **Archetype skills** | Camello team | Filesystem: `packages/ai/src/skills/{archetype}/` | sales-specific SPIN, support empathy ladder, marketing tone guide |
| **Tenant skills** | Business owner | DB: `tenant_skills` table | "always mention 30-day guarantee", "Instagram leads get 10% off" |

### 4.2 Platform & Archetype Skills (Filesystem)

```
packages/ai/src/skills/
├── index.ts                          # registry + loader
├── types.ts                          # SkillDefinition, SkillTrigger types
├── resolver.ts                       # discovery algorithm
├── general/                          # archetype-agnostic
│   ├── greeting-personalization.md
│   ├── out-of-scope-deflection.md
│   └── handoff-to-human.md
├── sales/
│   ├── objection-competitor.md
│   ├── objection-pricing.md
│   ├── discovery-spin.md
│   ├── upsell-after-booking.md
│   └── closing-techniques.md
├── support/
│   ├── escalation-protocol.md
│   ├── de-escalation-angry.md
│   └── troubleshooting-guide.md
└── marketing/
    ├── content-tone-matching.md
    └── campaign-brief-extraction.md
```

**Loading:** Skills are parsed at startup (frontmatter → `SkillDefinition`, body → template string). Cached in a `Map<slug, SkillDefinition>`. Hot-reload in dev via file watcher.

### 4.3 Tenant Skills (DB-backed)

```sql
CREATE TABLE tenant_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  body TEXT NOT NULL,                    -- markdown content
  type TEXT NOT NULL DEFAULT 'general',  -- sales|support|marketing|general
  trigger_mode TEXT NOT NULL DEFAULT 'keyword',
  trigger_config JSONB NOT NULL DEFAULT '{}',
    -- { intents?: string[], keywords?: string[], confidence_floor?: number }
  priority INT NOT NULL DEFAULT 5,
  token_budget INT NOT NULL DEFAULT 300,
  requires_modules TEXT[] DEFAULT '{}',
  conflicts_with TEXT[] DEFAULT '{}',
  locale TEXT[] DEFAULT '{en}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  embedding VECTOR(1536),               -- for semantic discovery
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, slug)
);

-- RLS: tenant isolation
ALTER TABLE tenant_skills ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_skills_isolation ON tenant_skills
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
```

**Why DB, not filesystem?** Tenants can't write to the server filesystem. DB storage enables dashboard CRUD, per-tenant isolation via RLS, and embedding-based discovery without a separate vector store.

---

## 5. Discovery Algorithm

### 5.1 When Discovery Runs

In `handleMessage()`, after intent classification (step 3) and before prompt assembly (step 9). Skill discovery is a **zero-LLM-cost** operation — it uses the already-computed intent + keyword matching + pre-computed embeddings.

### 5.2 Algorithm

```
resolveSkills(context: SkillResolutionContext): ResolvedSkill[]

Input:
  - intent: { type, confidence }
  - messageText: string
  - artifactType: 'sales' | 'support' | 'marketing' | 'custom'
  - tenantId: string
  - messageEmbedding?: number[]       -- reuse from RAG if available
  - activeModuleSlugs: string[]
  - conversationHistory: Message[]     -- last N messages for context

Algorithm:
  1. COLLECT candidates
     a. Platform skills matching artifactType or type='general'
     b. Archetype skills matching artifactType
     c. Tenant skills (DB query: tenant_id + is_active)

  2. FILTER by trigger mode
     For each candidate:
       - always     → include
       - intent     → include if intent.type IN candidate.trigger.intents
       - keyword    → include if any keyword found in messageText (case-insensitive)
       - embedding  → include if cosine_sim(messageEmbedding, skill.embedding) ≥ confidence_floor

  3. RESOLVE conflicts
     - Build conflict graph from conflicts_with fields
     - If two conflicting skills both matched, keep the higher-priority one

  4. ENFORCE token budget
     - Sort matched skills by priority (desc)
     - Accumulate token_budget until total exceeds SKILL_TOKEN_CAP (800 tokens)
     - Drop lowest-priority skills that don't fit

  5. VERIFY module compatibility
     - If skill.requires_modules lists modules not in activeModuleSlugs, warn but still include
       (the skill's tool hints may reference unavailable modules — LLM handles gracefully)

  6. RETURN ordered list of ResolvedSkill { slug, name, body, priority }
```

### 5.3 Token Budget

Skills share a fixed budget within the system prompt:

```
SKILL_TOKEN_CAP = 800 tokens (configurable per plan tier)
  starter:  400 tokens (1-2 skills max)
  growth:   800 tokens (2-3 skills)
  scale:   1200 tokens (3-5 skills)
```

This is subtracted from the existing system prompt budget. Since the current prompt uses ~800 tokens for scaffolding + 2400 for RAG + 400 for learnings, skills fit within the remaining headroom of the context window.

---

## 6. Prompt Builder Integration

### 6.1 Injection Point

Skills inject between the archetype framework and personality sections:

```typescript
// prompt-builder.ts — new section after archetype framework

if (resolvedSkills.length > 0) {
  sections.push('--- ACTIVE SKILLS ---');
  sections.push('Follow these situational guidelines when they apply to the current message:\n');
  for (const skill of resolvedSkills) {
    sections.push(`[SKILL: ${skill.slug}]`);
    sections.push(skill.body);
    sections.push(`[/SKILL: ${skill.slug}]\n`);
  }
}
```

### 6.2 Why This Position?

- **After archetype:** Skills refine the archetype framework, not replace it. A skill saying "don't push for a close during evaluation" overrides the archetype's generic "use assumptive close" because it's more specific and appears later.
- **Before personality:** Tenant custom instructions can still override skills. If a tenant says "always offer 10% discount" and a platform skill says "never discount on first call," the tenant's instruction wins (appears later in prompt).
- **Before RAG:** Skills reference knowledge base content ("check the knowledge base for competitor comparisons"), so they should be positioned before RAG context so the LLM processes the instruction before seeing the data.

---

## 7. Relationship to Existing Systems

### 7.1 Skills vs. Modules

| Aspect | Module | Skill |
|--------|--------|-------|
| What it is | Executable action (Zod schema + code) | Reasoning guidance (markdown prompt) |
| Runtime cost | Code execution + DB writes | Zero (prompt injection only) |
| Autonomy gating | Yes (suggest/draft/auto) | No (always advisory) |
| Tenant customizable | Binding only (on/off, autonomy level) | Full content editing |
| Example | `book_meeting({ date, time })` | "Before booking, always confirm timezone" |

**Interaction:** Skills can reference modules by slug in their "Tool Hints" section. The LLM uses skills to decide *when and how* to call modules. Skills never execute code — they influence the LLM's reasoning about tool use.

### 7.2 Skills vs. Custom Instructions

| Aspect | Custom Instructions | Skill |
|--------|-------------------|-------|
| Activation | Always injected | Contextually triggered |
| Structure | Free-form text | Structured (goal, decision tree, examples) |
| Scope | Global per artifact | Per-situation |
| Token cost | Always consumed | Only when matched |
| Conflicts | Can contradict each other | Explicit conflict graph |

**Migration path:** Existing `artifacts.personality.instructions` stays as-is. Skills are a *structured superset* — tenants who need simple rules keep using custom instructions. Tenants who need situational logic upgrade to skills.

### 7.3 Skills vs. RAG

| Aspect | RAG | Skill |
|--------|-----|-------|
| Knowledge type | Declarative (facts, data) | Procedural (how to act) |
| Storage | Chunked + embedded docs | Whole-file prompt fragments |
| Retrieval | Embedding similarity per query | Intent/keyword/embedding per message |
| Injection format | Raw content chunks | Structured markdown (goal, examples, tree) |
| Tenant editable | Upload documents | Edit structured templates |

**Complementary:** A skill might say "when discussing pricing, reference the pricing page from knowledge base." The skill provides the *procedure*, RAG provides the *data*.

### 7.4 Skills vs. Learnings

| Aspect | Learning | Skill |
|--------|----------|-------|
| Origin | Auto-generated from rejections | Human-authored or auto-drafted |
| Confidence | Decaying score (0.3 → 1.0) | Binary (active/inactive) |
| Granularity | Single fact ("don't suggest X for Y") | Multi-step procedure |
| Editing | Not tenant-editable | Fully editable |

**Graduation path:** When multiple learnings cluster around a theme (e.g., 5 learnings about pricing objections), the system can auto-draft a skill that consolidates them. The owner reviews, edits, and activates — turning reactive corrections into proactive guidance.

---

## 8. Tenant Skill Authoring (Dashboard UX)

### 8.1 Creation Flow

The dashboard provides a guided skill builder at `/dashboard/agents/[id]/skills`:

```
Step 1: WHAT situation?
  "Describe the situation this skill addresses"
  → Free-text input, e.g., "When someone asks about pricing and seems hesitant"
  → System extracts keywords + suggests intents

Step 2: HOW should the agent respond?
  Structured form:
  - Goal (1-2 sentences)
  - Steps (ordered list — "First do X, then Y")
  - Example good response (optional)
  - Example bad response (optional)
  - Tool hints (checkboxes: "Should the agent use any of these actions?")

Step 3: WHEN should this activate?
  - Always (every conversation)
  - When the topic matches (keyword triggers — auto-suggested from Step 1)
  - Specific intents (dropdown from intent taxonomy)

Step 4: Review & activate
  Preview the rendered skill as the agent will see it
  Toggle active/inactive
```

### 8.2 AI-Assisted Authoring

When the tenant types a free-form instruction like "always mention our 30-day guarantee when discussing pricing," the system can auto-expand it into a structured skill:

```
User input: "always mention 30-day guarantee when discussing pricing"
                                    ↓
LLM expansion (one-shot, cheap model):
  Goal: Mention the 30-day money-back guarantee during pricing discussions
  Decision Tree:
    1. When pricing comes up, weave in the guarantee naturally
    2. Frame it as risk reduction ("you can try risk-free")
    3. Don't lead with it — mention after presenting value
  Keywords: [pricing, cost, expensive, how much, price]
  Intents: [pricing]
```

The tenant reviews, edits, and saves. This keeps the barrier low (type a sentence) while producing structured, effective skills.

### 8.3 Skill from Learning Clusters

When the system detects 3+ learnings with high embedding similarity:

1. Group the learnings
2. Auto-draft a skill that consolidates them
3. Surface as a suggestion in the dashboard: "Your agent has learned 4 things about handling pricing objections. Want to create a skill from them?"
4. Tenant reviews, edits the draft, activates

---

## 9. Skill Learning (Auto-Generation)

### 9.1 From Conversation Patterns

The system monitors for recurring correction patterns:

```
Signal: Owner corrects agent 3+ times on same topic
  → Extract pattern from corrections
  → Draft skill with low confidence
  → Surface suggestion to owner

Signal: Agent gets rejected on same module 5+ times with similar context
  → Cluster rejection reasons
  → Draft skill for that module's usage context
  → Surface suggestion

Signal: High-performing conversations share a common pattern
  → Identify differentiating prompts/responses
  → Draft "best practice" skill
  → Surface suggestion
```

### 9.2 Implementation: Skill Suggestions Table

```sql
CREATE TABLE skill_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  source_type TEXT NOT NULL,   -- 'learning_cluster' | 'rejection_pattern' | 'correction'
  source_ids UUID[] NOT NULL,  -- learning IDs or conversation IDs that triggered this
  draft_slug TEXT NOT NULL,
  draft_name TEXT NOT NULL,
  draft_body TEXT NOT NULL,
  draft_trigger_config JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | accepted | dismissed
  created_at TIMESTAMPTZ DEFAULT now()
);
```

This is Phase 3 work (see implementation plan). The suggestion engine runs as a cron job, analyzing learning clusters weekly.

---

## 10. Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                        MESSAGE HANDLER PIPELINE                      │
│                                                                      │
│  ┌──────────┐   ┌────────────┐   ┌──────────────┐   ┌────────────┐ │
│  │ Classify  │──→│ Resolve    │──→│ Resolve      │──→│ Build      │ │
│  │ Intent    │   │ Artifact   │   │ Skills       │   │ System     │ │
│  │           │   │            │   │  (NEW)       │   │ Prompt     │ │
│  └──────────┘   └────────────┘   └──────┬───────┘   └─────┬──────┘ │
│                                          │                  │        │
│                                          ▼                  ▼        │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │                    SKILL RESOLVER                             │   │
│  │                                                               │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐  │   │
│  │  │  Platform    │  │  Archetype  │  │  Tenant Skills       │  │   │
│  │  │  Skills      │  │  Skills     │  │  (DB + embedding)    │  │   │
│  │  │  (filesystem)│  │  (filesystem)│  │                      │  │   │
│  │  └──────┬──────┘  └──────┬──────┘  └──────────┬───────────┘  │   │
│  │         │                │                     │              │   │
│  │         ▼                ▼                     ▼              │   │
│  │  ┌───────────────────────────────────────────────────────┐    │   │
│  │  │  Filter (intent + keyword + embedding)                │    │   │
│  │  │  → Resolve conflicts                                  │    │   │
│  │  │  → Enforce token budget                               │    │   │
│  │  │  → Return ordered ResolvedSkill[]                     │    │   │
│  │  └───────────────────────────────────────────────────────┘    │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                      │
│                    PROMPT ASSEMBLY                                    │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ Identity → Safety → Language                                    │ │
│  │ → Archetype Framework                                           │ │
│  │ → ┌──────────────────────────────────┐                          │ │
│  │   │ ACTIVE SKILLS (contextual)       │  ← injected here        │ │
│  │   │ [SKILL: objection-competitor]    │                          │ │
│  │   │ [SKILL: upsell-after-booking]    │                          │ │
│  │   └──────────────────────────────────┘                          │ │
│  │ → Personality + Custom Instructions                             │ │
│  │ → RAG Context (facts)                                           │ │
│  │ → Learnings + Customer Memory                                   │ │
│  │ → Module Definitions (tools)                                    │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                     SKILL LEARNING LOOP (Phase 3)                    │
│                                                                      │
│  Rejections ──→ Learnings ──→ Cluster Detection ──→ Draft Skill     │
│  Corrections ──────────────────────────────────────→ Draft Skill     │
│                                                          │           │
│                                              ┌───────────▼────────┐  │
│                                              │ Skill Suggestions  │  │
│                                              │ (dashboard review) │  │
│                                              └───────────┬────────┘  │
│                                                          │           │
│                                              ┌───────────▼────────┐  │
│                                              │ Tenant Skills (DB) │  │
│                                              └────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 11. Type Definitions

```typescript
// packages/ai/src/skills/types.ts

export type SkillTriggerMode = 'always' | 'intent' | 'keyword' | 'embedding';
export type SkillType = 'sales' | 'support' | 'marketing' | 'general';

export interface SkillTrigger {
  mode: SkillTriggerMode;
  intents?: string[];           // for mode='intent'
  keywords?: string[];          // for mode='keyword'
  confidence_floor?: number;    // for mode='embedding' (default 0.4)
}

export interface SkillDefinition {
  slug: string;
  name: string;
  description: string;
  type: SkillType;
  trigger: SkillTrigger;
  priority: number;             // higher = injected first
  token_budget: number;         // max tokens this skill consumes
  requires_modules: string[];   // module slugs referenced in tool hints
  conflicts_with: string[];     // slugs that can't coexist
  locale: string[];             // available locales
  version: number;
  body: string;                 // markdown content (the actual skill)
  source: 'platform' | 'archetype' | 'tenant';
  embedding?: number[];         // for semantic discovery
}

export interface ResolvedSkill {
  slug: string;
  name: string;
  body: string;                 // locale-filtered, ready for injection
  priority: number;
  source: 'platform' | 'archetype' | 'tenant';
}

export interface SkillResolutionContext {
  intent: { type: string; confidence: number };
  messageText: string;
  messageEmbedding?: number[];
  artifactType: string;
  tenantId: string;
  activeModuleSlugs: string[];
  locale: string;
  planTier: 'starter' | 'growth' | 'scale';
}

// Callback for tenant skill loading (dependency injection, no DB import)
export type LoadTenantSkillsFn = (
  tenantId: string
) => Promise<SkillDefinition[]>;
```

---

## 12. Migration Path from Current System

### What changes

| Component | Current | After Skills |
|-----------|---------|-------------|
| `prompt-builder.ts` | No skill section | New `ACTIVE SKILLS` section between archetype + personality |
| `message-handler.ts` | No skill resolution | New step between artifact resolution and prompt build |
| Archetype prompts | Monolithic behavioral frameworks | Gradually decomposed — generic framework stays, specific procedures move to skills |
| Custom instructions | Catch-all for tenant rules | Still supported; skills are structured alternative |
| Intent profiles | Control module visibility | Extended to influence skill matching |

### What doesn't change

- Module system (tools, Zod schemas, execution, autonomy gating) — untouched
- RAG pipeline — untouched
- Customer memory — untouched
- Learning system — untouched (Phase 3 adds skill drafting on top)
- Archetype registration — stays; skills augment, don't replace

### Archetype Decomposition (Gradual)

The sales archetype prompt has sections like "OBJECTION HANDLING: acknowledge → validate → reframe → offer." This can gradually move to a platform skill `sales/objection-handling.md` with `trigger: { mode: 'intent', intents: ['objection'] }`.

**Migration strategy:** Keep the archetype framework as a condensed overview. Extract detailed procedures into skills. The archetype says "handle objections using the acknowledge-validate-reframe pattern" — the skill provides the full decision tree and examples. This saves tokens on non-objection conversations.

---

## 13. Implementation Plan

### Phase 1: Foundation (2-3 tasks)

**Goal:** Platform skills loading + prompt injection. No DB, no tenant authoring.

1. **Skill types + parser** — `packages/ai/src/skills/types.ts` + `parser.ts`
   - Parse markdown + YAML frontmatter into `SkillDefinition`
   - Locale filtering (strip non-matching `[en]`/`[es]` sections)
   - Token estimation for body content

2. **Skill registry + resolver** — `packages/ai/src/skills/index.ts` + `resolver.ts`
   - Load all `.md` files from `packages/ai/src/skills/{general,sales,support,marketing}/`
   - `resolveSkills(context)` → filter by trigger mode, resolve conflicts, enforce budget
   - Export `getResolvedSkills()` for use in message handler

3. **Prompt builder integration** — modify `prompt-builder.ts`
   - Add `resolvedSkills?: ResolvedSkill[]` to `BuildSystemPromptContext`
   - Inject skill section between archetype framework and personality
   - Respect `SKILL_TOKEN_CAP` per plan tier

4. **First platform skills** — write 3-5 sales skills as `.md` files
   - `sales/objection-competitor.md`
   - `sales/objection-pricing.md`
   - `sales/discovery-questions.md`
   - `general/out-of-scope-deflection.md`

5. **Wire into message handler** — modify `message-handler.ts`
   - After intent classification, call `resolveSkills()`
   - Pass resolved skills to `buildSystemPrompt()`

### Phase 2: Tenant Skills (3-4 tasks)

**Goal:** DB storage, dashboard CRUD, embedding-based discovery.

1. **Migration + schema** — `tenant_skills` table, RLS policies
2. **tRPC routes** — `skills.list`, `skills.create`, `skills.update`, `skills.delete`, `skills.toggle`
3. **Embedding on save** — generate embedding from `description + body` on create/update
4. **Resolver integration** — `LoadTenantSkillsFn` callback, merge with platform skills
5. **Dashboard UI** — skill list page, guided creator (Step 1-4 from Section 8.1)
6. **AI-assisted authoring** — LLM expansion of free-form instructions into structured skills

### Phase 3: Learning Loop (2-3 tasks)

**Goal:** Auto-draft skills from learning clusters.

1. **Cluster detection cron** — weekly job in `apps/jobs/`
   - Group learnings by embedding similarity (threshold 0.8)
   - Clusters of 3+ learnings → generate skill suggestion
2. **Skill suggestion table + tRPC** — `skill_suggestions`, CRUD routes
3. **Dashboard suggestions UI** — notification badge, review/accept/dismiss flow
4. **Graduation flow** — accepted suggestion → `tenant_skills` insert, source learnings archived

### Phase 4: Advanced (future)

- **Skill analytics** — track which skills fire, how they affect conversion/resolution rates
- **Skill marketplace** — share effective skills across tenants (anonymized)
- **Skill versioning** — A/B test skill variants
- **Compound skills** — skill chains (if skill A fires and module X returns Y, activate skill B)

---

## 14. Open Questions

1. **Should skills have an autonomy level?** Currently proposed as always-advisory (prompt injection only). But could a skill *force* a module call? Probably not — that's what `always` trigger mode + tool hints achieves indirectly.

2. **Skill ordering within the prompt.** Current proposal: priority descending. Alternative: ordered by relevance score (higher embedding similarity = higher position). Priority is simpler and more predictable.

3. **Should tenant skills inherit platform skills?** If a tenant creates `objection-competitor` with the same slug as a platform skill, does it override or coexist? Proposal: tenant skill overrides platform skill with same slug (most specific wins).

4. **Embedding reuse.** The message embedding for RAG search could be reused for skill discovery (mode='embedding'). This is free — the embedding is already computed. But it couples skill discovery to RAG search timing. Proposal: reuse when available, skip embedding-mode skills when RAG search was skipped (lightweight intents).

5. **Skill size limits.** Platform skills can be well-crafted and concise. Tenant skills might be verbose. Proposal: hard cap at 500 tokens per tenant skill, 800 for platform skills. Body is trimmed with a warning if exceeded.

---

## 15. Success Metrics

- **Activation rate:** % of conversations where at least one skill fires (target: 40-60%)
- **Skill-assisted conversion:** Conversion rate in skill-active vs. skill-inactive conversations
- **Token efficiency:** Average skill tokens injected per message (target: <400, well under budget)
- **Tenant adoption:** % of tenants who create at least one custom skill (Phase 2)
- **Learning graduation:** % of learning clusters that become active skills (Phase 3)
- **Prompt quality:** Manual review of 50 conversations/week — skills producing better reasoning?

---

## 16. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Token bloat | Skills eat into RAG/conversation budget | Hard `SKILL_TOKEN_CAP` per plan tier |
| Conflicting skills | Contradictory instructions confuse LLM | `conflicts_with` field + conflict resolver |
| Tenant skill quality | Poorly written skills degrade agent | AI-assisted authoring + preview + structured template |
| Discovery latency | DB query for tenant skills adds latency | Cache tenant skills per-request (they change rarely) |
| Skill explosion | Too many skills, hard to manage | Dashboard shows activation stats, suggests archiving unused |
| Over-specificity | Skills fire too narrowly, never activate | Suggest `mode: 'always'` for critical rules, embedding mode for nuanced matching |

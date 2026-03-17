# Task Queue — Camello

> **How this file works:** Rolling work queue for NC (Nightcrawler) autonomous execution.
> Tasks use `NC-XXX` / `CAM-XXX` IDs. Format: `#### NC-XXX [ ] Title` (NC regex-parses this).
> Phases = priority groups (P0 first). Dependencies listed per task.
> After completing a task: mark `[x]`, add summary line, update `PROGRESS.md`, commit together.
> When starting a new sprint: update the goal below, add new tasks, collapse old completed tasks.

> **Current sprint:** Agent Intelligence (NC-302 → NC-311)
> Make sales and advisor agents meaningfully smarter through three complementary changes: (1) a file-based skill system that injects contextual reasoning procedures into the system prompt based on intent/keyword matching, (2) intent classifier fixes so skills fire correctly and LLM fallback traffic drops, (3) module description rewrites so tools actually get invoked when they should. Design doc: `SKILL_SYSTEM_DESIGN.md`. AI quality audit: `SKILL_SYSTEM_DESIGN.md` appendix.

---

## Completed (all previous sprints)

#### CAM-001 [x] Foundation + intelligence + channels + dashboard + billing + i18n
Full monorepo, 22 tables, RLS, RAG, 9 modules, channel adapters, widget, dashboard, onboarding, Paddle, i18n, production deploy.

#### CAM-002 [x] Public chat + business card + customer memory + agent workspaces
/chat/[slug], business card, abuse prevention, customer memory, archetype registry, all 3 workspace UIs, 20+ agent router procedures, handoffs, RAG bias. Migrations 0001-0015.

#### CAM-003 [x] Sales Agent Optimization Sprint (CAM-007, CAM-101–116)
Follow-up cron, approve/reject UI, module config, polling, budget parser, lead scoring, prompt optimization, notifications, quote-to-payment flow, auto-stage progression, lead notes/timeline, source attribution, auto-follow-up scheduling, conversation summarization. Migrations 0016-0020.

#### CAM-004 [x] Launch-Ready Polish Sprint (CAM-107, CAM-111, CAM-114, CAM-117–132)
Onboarding fixes, period comparison, revenue forecast, support resolution+CSAT, knowledge gap UX, marketing stats+drafts, error boundaries, test coverage, a11y audit, conversation filters, dashboard home, settings polish, teach agent UX, widget typing indicator, prompt optimization, performance dashboard, customer insights, smoke tests.

#### NC-201–NC-220 [x] Inbox Sprint
3-panel inbox layout, conversation list, chat thread, customer panel, owner reply, deep-link + mobile, dashboard simplification, agents config page, workspace cleanup. Migrations 0021-0022.

#### NC-221–NC-230 [x] Sales Agent Dashboard Sprint
Tab navigation, quotes/meetings/payments/follow-ups sections, i18n audit, performance+activity wiring, pending approvals UI, trust graduation card, visual polish. Migration 0023.

#### NC-231–NC-240 [x] Pre-Ship Sprint
Sprint audit, sales-only onboarding lock, Resend email client + templates, approval email notifications, knowledge gap tracking + UI + email, widget branding dashboard UI + runtime. Migration 0024.

#### NC-241–NC-256 [x] Sales-Only Polish + Repo Quality Sprint
Sales-only mode, dashboard tab, analytics UX, knowledge page, artifacts page, repo quality sweep.

#### NC-257–NC-269 [x] WhatsApp + Payments + Onboarding Sprint
WhatsApp settings UI + onboarding fields + roundtrip validation. Payment link + Mark as Paid. Chat-style onboarding. Knowledge sufficiency score + teach inline + gap-to-teach. Advisor archetype + auto-create. Migrations 0025-0026.

#### NC-270–NC-274 [x] Reliability + Intelligence Sprint
WhatsApp dead-letter retry cron, Supabase Realtime Broadcast, advisor business snapshot + dashboard panel + session learning, global vs per-agent knowledge split. Migrations 0027-0029.

#### NC-275–NC-301 [x] Dashboard UX + Experience + Multi-Agent Sprints
Inbox as home, one-page settings, knowledge page cleanup, route cleanup, collapsible sections, test chat split-pane, approval mode toggle, terminology audit, tooltips, empty states, first-session guide, agents index, advisor standalone page (snapshot + chat + history + quick prompts), backward compat redirects, i18n orphan sweep.

---

## Deferred — Post User Feedback

#### CAM-210 [deferred] Invoice module
Generate formatted invoices from quotes (new module + table + shareable public link). Build when real users request it.

#### CAM-211 [deferred] Tenant skill authoring (Skill System Phase 2)
DB-backed `tenant_skills` table, dashboard CRUD, embedding-based discovery, AI-assisted authoring. Build when tenants ask for customization beyond custom instructions. See `SKILL_SYSTEM_DESIGN.md` §8–9.

#### CAM-212 [deferred] Skill learning loop (Skill System Phase 3)
Auto-draft skills from learning clusters. Weekly cron detects 3+ similar learnings → generates skill suggestion → surfaces in dashboard. See `SKILL_SYSTEM_DESIGN.md` §9.

#### CAM-213 [deferred] BANT state injection
Inject structured BANT summary (Budget: ?, Authority: confirmed, Need: X, Timeline: Q2) into sales system prompt per-message. Eliminates redundant qualification questions in long conversations. Requires either regex extraction from history (fragile) or an LLM summarization call per message (expensive). Build when real conversation data shows average conversation length > 8 messages.

#### CAM-214 [deferred] RAG threshold tuning
Raise primary similarity threshold from 0.3 → 0.5, proactive from 0.15 → 0.25. Add doc_type mappings for all unmapped intents. Build after collecting real retrieval quality data from production conversations.

#### CAM-215 [deferred] Learnings system overhaul
Lower similarity merge threshold from 0.9 → 0.75, faster decay (-0.1/month instead of -0.05), cross-intent retrieval. Build when there are enough learnings in DB to matter (50+ per tenant).

---

## Manual / Blocked — Not for NC

#### CAM-200 [x] Clerk production keys (Mateo) — Done
#### CAM-201 [waiting] Paddle business verification (Mateo) — Waiting for Paddle
#### CAM-202 [manual] Apply migrations 0023–0029 to Supabase cloud (Mateo)
#### CAM-203 [manual] Meta App review + business verification (Mateo)

---

## Agent Intelligence Sprint (NC-302 → NC-311)

> **Sprint goal:** Make agents smarter through three complementary improvements:
> 1. **Skill system** (NC-302–308) — contextual prompt fragments that inject situational reasoning (objection handling, discovery, closing) only when relevant, replacing the monolithic archetype prompt
> 2. **Intent classifier fix** (NC-309) — relax regex, add missing intent types so skills fire correctly
> 3. **Module description rewrite** (NC-310) — rewrite tool descriptions as trigger-based rules so the LLM actually invokes them
> 4. **Smoke test** (NC-311) — verify everything composes correctly
>
> **Expected outcomes:**
> - Sales prompt tokens per greeting: ~800 → ~300 (archetype trim, no skills needed)
> - Sales prompt tokens per objection: ~800 generic → ~300 overview + ~350 targeted skill = ~650 but with 3x more depth
> - Module invocation rate: estimated +30-50% (trigger-based descriptions tell LLM exactly when to call)
> - LLM fallback for intent classification: estimated -25% (relaxed regex catches more patterns)

### Sprint guardrails

- **`@camello/ai` package only.** All new code in `packages/ai/src/skills/`. Only existing files modified: `prompt-builder.ts`, `intent-classifier.ts` (or its constants), module definition files, `message-handler.ts` (one new step).
- **No DB changes.** Phase 1 is filesystem-only.
- **No dashboard UI.** Skills are invisible to the tenant. They just notice the agent is smarter.
- **Additive, not destructive.** Archetype is trimmed but not gutted. If skill resolution fails, the agent still works with the condensed archetype.
- **Dependency injection.** Future tenant skills (Phase 2) flow through a `LoadTenantSkillsFn` callback — no `@camello/db` import in `@camello/ai`.

---

## P0 — Skill Infrastructure

#### NC-302 [x] Skill types + frontmatter parser
Created `packages/ai/src/skills/types.ts` (SkillDefinition, ResolvedSkill, SkillResolutionContext types) and `packages/ai/src/skills/parser.ts` (parseSkillFile, filterLocale, estimateTokens). 4 tests in `skill-parser.test.ts`. `pnpm type-check` passes.

Define the `SkillDefinition` type and a parser that reads markdown files with YAML frontmatter into typed skill objects.

**Files to create:**
- `packages/ai/src/skills/types.ts` — type definitions
- `packages/ai/src/skills/parser.ts` — frontmatter parser + locale filter + token estimator

**Type definitions (`types.ts`):**
```ts
export type SkillTriggerMode = 'always' | 'intent' | 'keyword';

export type SkillType = 'sales' | 'support' | 'marketing' | 'general';

export interface SkillTrigger {
  mode: SkillTriggerMode;
  intents?: string[];      // for mode='intent' — matches classified intent types
  keywords?: string[];     // for mode='keyword' — case-insensitive scan of message text
}

export interface SkillDefinition {
  slug: string;
  name: string;
  description: string;
  type: SkillType;
  trigger: SkillTrigger;
  priority: number;           // higher = injected first in prompt
  token_budget: number;       // max tokens this skill may consume
  requires_modules: string[]; // module slugs referenced in tool hints
  conflicts_with: string[];   // slugs that can't coexist in same prompt
  locale: string[];           // available locales (e.g., ['en', 'es'])
  version: number;
  body: string;               // raw markdown body (locale sections included)
  source: 'platform';         // Phase 1 only; Phase 2 adds 'tenant'
}

export interface ResolvedSkill {
  slug: string;
  name: string;
  body: string;    // locale-filtered, ready for injection
  priority: number;
  source: 'platform';
}

export interface SkillResolutionContext {
  intent: { type: string; confidence: number };
  messageText: string;
  artifactType: string;
  activeModuleSlugs: string[];
  locale: string;
}
```

**Parser (`parser.ts`):**
- `parseSkillFile(filePath: string, content: string): SkillDefinition` — splits YAML frontmatter (between `---` markers) from body. Validates required fields (slug, name, description, trigger). Returns typed object.
- `filterLocale(body: string, locale: string): string` — strips sections tagged with non-matching locales. Pattern: `## Heading [es]` through next heading = stripped when locale is `'en'`. Sections without locale tags kept for all locales.
- `estimateTokens(text: string): number` — `Math.ceil(text.length / 4)` (same heuristic as RAG).
- Use a lightweight YAML parser (the `yaml` npm package is already a transitive dep, or use simple regex split on `---` markers + `JSON`-style parsing for the flat frontmatter structure — avoid adding new deps if possible).

**Acceptance Criteria:**
- Types exported from `packages/ai/src/skills/types.ts`
- Parser handles valid YAML frontmatter + markdown body
- Locale filter correctly strips `[es]`/`[en]` tagged sections, keeps untagged
- Token estimator matches existing RAG heuristic (`Math.ceil(text.length / 4)`)
- At least 4 tests in `packages/ai/src/__tests__/skill-parser.test.ts`: (1) parse valid skill file, (2) reject missing slug, (3) locale filter keeps matching + untagged sections, (4) token estimation
- `pnpm type-check` passes

**Depends on:** —

---

#### NC-303 [x] Skill registry + resolver
Updated `types.ts` (new `SkillResolutionContext`/`ResolvedSkill` shapes). Created `skills/index.ts` (registry, `_loadFromDirectory`, `_clearSkillRegistry`, `_registerSkillForTesting`) and `skills/resolver.ts` (5-step algorithm, `SKILL_TOKEN_CAP=800`). Test fixture + 6 tests all pass. `pnpm type-check` clean.

Load platform skill `.md` files from disk at import time. Implement the resolver that selects which skills to inject for a given message.

**Files to create:**
- `packages/ai/src/skills/index.ts` — registry (load + cache) + exports
- `packages/ai/src/skills/resolver.ts` — discovery algorithm

**Registry (`index.ts`):**
- On import, scan `packages/ai/src/skills/{general,sales,support,marketing}/` for `.md` files using `fs.readdirSync` + `fs.readFileSync`
- Parse each with `parseSkillFile()`, cache in `Map<slug, SkillDefinition>`
- Export: `getSkill(slug)`, `getAllSkills()`, `getSkillsByType(type)`, `_clearSkillRegistry()` (test helper)
- Follow the same self-registration-at-import pattern used by modules (`packages/ai/src/modules/index.ts`)

**Resolver (`resolver.ts`):**
```ts
export function resolveSkills(ctx: SkillResolutionContext): ResolvedSkill[]
```

Algorithm:
1. **Collect** — all platform skills matching `ctx.artifactType` OR `type='general'`
2. **Filter by trigger:**
   - `always` → include
   - `intent` → include if `ctx.intent.type` is in `trigger.intents`
   - `keyword` → include if any keyword found in `ctx.messageText` (case-insensitive substring match)
3. **Resolve conflicts** — build set from `conflicts_with`. If two conflicting skills both matched, keep the one with higher `priority`
4. **Enforce token budget** — sort by priority desc, accumulate `token_budget`, drop skills that would push total past `SKILL_TOKEN_CAP = 800`
5. **Locale filter** — call `filterLocale(skill.body, ctx.locale)` on each matched skill
6. **Return** ordered `ResolvedSkill[]` (highest priority first)

**Acceptance Criteria:**
- Registry loads `.md` files from skill directories (directories may not exist yet — handle gracefully with empty registry, no crash)
- Resolver correctly filters by intent, keyword, and always modes
- Conflict resolution drops lower-priority conflicting skill
- Token budget enforced (skills beyond cap excluded)
- `_clearSkillRegistry()` works for test isolation
- At least 6 tests in `packages/ai/src/__tests__/skill-resolver.test.ts`: (1) registry loads valid files, (2) intent trigger matches, (3) intent trigger doesn't match, (4) keyword trigger matches case-insensitive, (5) conflict resolution keeps higher priority, (6) token budget drops excess skills
- `pnpm type-check` passes

**Depends on:** NC-302

---

## P1 — Prompt + Pipeline Integration

#### NC-304 [x] Prompt builder integration — inject skills into system prompt
Extended `PromptContext` with optional `resolvedSkills?: ResolvedSkill[]`; added `--- ACTIVE SKILLS ---` injection block after archetype framework, before personality; 4 tests in `skill-prompt-injection.test.ts`. `pnpm type-check` passes.

Add a skill section to `buildSystemPrompt()` between the archetype framework and personality sections.

**Files to modify:**
- `packages/ai/src/prompt-builder.ts` — add `resolvedSkills?: ResolvedSkill[]` to context type, add injection logic

**Injection format:**
```
--- ACTIVE SKILLS ---
Follow these situational guidelines when they apply to the current message:

[SKILL: objection-competitor]
## Goal
Reframe competitor comparisons...
[/SKILL: objection-competitor]

[SKILL: pricing-negotiation]
...
[/SKILL: pricing-negotiation]
```

**Position in prompt:** After archetype framework, before personality section. Rationale:
- Archetype provides generic behavioral rules (condensed overview)
- Skills provide specific situational procedures (deeper where needed)
- Personality + custom instructions come after (tenant has final say, can override both)

**Empty skills = no section.** Fully backward compatible — when `resolvedSkills` is undefined or empty, no skill text is added to the prompt.

**Acceptance Criteria:**
- `BuildSystemPromptContext` type extended with optional `resolvedSkills` field
- Skills injected in correct position (after archetype, before personality)
- Empty/undefined skills = no section (backward compatible)
- Skill slugs wrapped in `[SKILL: slug]` / `[/SKILL: slug]` markers
- At least 3 tests in `packages/ai/src/__tests__/skill-prompt-injection.test.ts`: (1) no skills = no section, (2) skills injected between archetype and personality, (3) multiple skills ordered by priority
- `pnpm type-check` passes

**Depends on:** NC-302 (needs `ResolvedSkill` type)

---

#### NC-305 [ ] Wire skill resolution into message handler

Add skill resolution as a step in `handleMessage()` and pass resolved skills to `buildSystemPrompt()`.

**Files to modify:**
- `apps/api/src/orchestration/message-handler.ts` — add step after intent classification, before prompt build

**Where in pipeline:**
```
Step 3:  Classify intent
Step 3b: Resolve skills (NEW)
           const resolvedSkills = resolveSkills({
             intent,
             messageText,
             artifactType: artifact.type,
             activeModuleSlugs: bindings.map(b => b.moduleSlug),
             locale: artifact.personality?.language ?? 'en',
           });
Step 9:  Build system prompt — pass resolvedSkills
```

**Skip conditions:**
- `artifact.type === 'advisor'` → `resolvedSkills = []` (advisor uses snapshot injection, not skills)
- `intentProfile.includeArchetypeFramework === false` → `resolvedSkills = []` (lightweight intents like greeting:regex, farewell, thanks — no point injecting sales procedures for "hi")

**Acceptance Criteria:**
- `resolveSkills()` called with correct context from pipeline state
- Resolved skills passed to `buildSystemPrompt()` via new field
- Skipped for advisor artifacts
- Skipped for lightweight intents (greeting:regex, farewell, thanks)
- At least 3 tests: (1) skills resolved and passed to prompt for `pricing` intent, (2) skills skipped for advisor, (3) skills skipped for `farewell` intent
- `pnpm type-check` passes

**Depends on:** NC-303 (resolver), NC-304 (prompt builder accepts skills)

---

## P2 — Skill Content + Archetype Trim

#### NC-306 [ ] Write platform sales skills (5 files)

Write the first batch of sales skills as `.md` files. These encode the deep procedural knowledge currently in the monolithic sales archetype prompt, but with more depth and examples.

**Files to create:**
- `packages/ai/src/skills/sales/objection-competitor.md`
- `packages/ai/src/skills/sales/objection-pricing.md`
- `packages/ai/src/skills/sales/discovery-questions.md`
- `packages/ai/src/skills/sales/closing-techniques.md`
- `packages/ai/src/skills/sales/upsell-after-booking.md`

**Each file follows the format from `SKILL_SYSTEM_DESIGN.md` §3:** YAML frontmatter (slug, name, description, type, trigger, priority, token_budget, requires_modules, conflicts_with, locale, version) + markdown body (Goal, Decision Tree, Examples [en] + Examples [es], Tool Hints, Anti-Patterns).

**Skill specs:**

1. **`objection-competitor`** — trigger: intent `[objection, negotiation]` + keywords `[competitor, already use, alternative, switch, currently using, another provider]`. Priority 10. Budget 350. Requires `qualify_lead`. Goal: reframe competitor mentions into discovery without badmouthing. Tree: acknowledge → discover pain gaps → map to differentiator → suggest low-commitment comparison. Anti-patterns: never badmouth, never claim unverified features, never say "we're better."

2. **`objection-pricing`** — trigger: intent `[objection, negotiation, pricing]` + keywords `[expensive, too much, cheaper, budget, afford, discount, price too high, out of budget, cost]`. Priority 10. Budget 300. Conflicts with `objection-competitor`. Requires `qualify_lead`, `send_quote`. Goal: reframe price around value, not cost. Tree: validate concern → ask budget range → present matching tier → if still hesitant, offer trial/guarantee. Tool hints: use `qualify_lead` to capture budget, use `send_quote` only after budget confirmed.

3. **`discovery-questions`** — trigger: intent `[open_discovery, product_question, general_inquiry]` + keywords `[tell me more, what do you offer, how does it work, looking for, need help with]`. Priority 8. Budget 300. Requires `qualify_lead`. Goal: guide toward qualification using SPIN. Tree: Situation (2-3 questions about current state) → Pain (what's not working) → Implication (cost of inaction) → Payoff (what solving it would mean). Each stage: 2-3 example questions in en + es. Tool hints: after pain identified, call `qualify_lead` with pain as `needs`.

4. **`closing-techniques`** — trigger: keywords `[ready, let's do it, sign up, get started, interested, move forward, sounds good, let's go, want to try]`. Priority 7. Budget 250. Requires `send_quote`, `book_meeting`. Goal: recognize buying signals and close naturally. Tree: verbal commitment → trial close → `send_quote`. Interested but hesitant → alternative close (option A or B). Timeline mentioned → urgency close with `book_meeting`. Anti-patterns: never force a close, never fabricate scarcity, never assume purchase without explicit signal.

5. **`upsell-after-booking`** — trigger: intent `[booking_request]`. Priority 5. Budget 200. Requires `send_quote`. Goal: after confirming a booking, suggest related products if knowledge base has them. Tree: confirm booking first → brief pause ("great, you're all set for Tuesday") → "by the way, many clients also ask about..." → only suggest if RAG context contains relevant products. Anti-patterns: never upsell before confirming the booking, never push if customer shows urgency to end conversation.

**Acceptance Criteria:**
- 5 `.md` files with valid frontmatter that pass `parseSkillFile()` without errors
- Each has Goal, Decision Tree, Examples [en], Examples [es], Tool Hints, Anti-Patterns sections
- `objection-pricing` has `conflicts_with: [objection-competitor]`
- Token budgets are realistic: body content after locale filtering ≤ stated `token_budget`
- At least 2 tests in `packages/ai/src/__tests__/skill-files.test.ts`: (1) all 5 sales files parse without error, (2) all trigger configs have non-empty intents or keywords
- `pnpm type-check` passes

**Depends on:** NC-302 (parser validates files)

---

#### NC-307 [ ] Write platform general skills (3 files)

Skills that apply across archetypes or complement sales.

**Files to create:**
- `packages/ai/src/skills/general/out-of-scope-deflection.md`
- `packages/ai/src/skills/general/returning-customer-warmth.md`
- `packages/ai/src/skills/sales/re-engagement-cold-lead.md`

**Skill specs:**

1. **`out-of-scope-deflection`** — type `general`. Trigger: intent `[general_inquiry]` + keywords `[weather, politics, joke, unrelated, off topic, random]`. Priority 9. Budget 200. Goal: redirect off-topic conversations without being dismissive. Tree: acknowledge briefly ("that's a fun question!") → pivot to business value → if persistent, offer human contact. Examples in en + es. Anti-patterns: never be condescending, never ignore the question entirely, never say "I can't help with that."

2. **`returning-customer-warmth`** — type `general`. Trigger mode `always` (fires every message; body instructs LLM to check customer memory first and only apply when relevant). Priority 3. Budget 150. Goal: when customer memory has facts from prior conversations, reference them naturally. Tree: if `name` in memory → use it. If `past_topic` → "last time we talked about X — any updates?" If `preference` → respect it silently. Anti-patterns: never recite facts robotically ("I see from my records that..."), never mention the memory system.

3. **`re-engagement-cold-lead`** — type `sales`. Trigger: keywords `[been a while, back again, following up, checking in, revisiting, long time, remember me]`. Priority 6. Budget 250. Requires `qualify_lead`. Goal: warm up returning leads without being pushy. Tree: acknowledge the gap positively ("great to hear from you again!") → ask what changed → re-qualify → if ready, proceed normally. Tool hints: use `qualify_lead` to update score (may have changed since last contact). Anti-patterns: never guilt-trip about the gap, never assume they're ready to buy just because they came back.

**Acceptance Criteria:**
- 3 `.md` files with valid frontmatter
- Each has Goal, Decision Tree, Examples [en] + [es], Anti-Patterns
- `returning-customer-warmth` has `trigger.mode: 'always'`
- `out-of-scope-deflection` has `type: 'general'`
- At least 2 tests in `packages/ai/src/__tests__/skill-files.test.ts` (extend from NC-306): (1) all 3 general files parse, (2) `returning-customer-warmth` trigger mode is `always`
- `pnpm type-check` passes

**Depends on:** NC-302

---

#### NC-308 [ ] Trim sales archetype prompt + verify composition

The sales archetype currently contains ~1000 words of detailed procedures for SPIN selling, objection handling, closing, and re-engagement. Now that these live as skills with more depth and examples, trim the archetype to a condensed overview.

**Files to modify:**
- `packages/ai/src/archetypes/sales.ts` — trim en + es prompts

**What to KEEP (condensed overview, target ~300 tokens):**
- Identity + role definition ("You are {name}, a sales agent for {company}")
- Core principles: consultative, customer-first, never push, earn trust before selling
- Brief framework references: "Use SPIN discovery when qualifying. Apply BANT criteria. Handle objections by acknowledging → validating → reframing."
- Quote execution rules (module-specific, not skill material — keep verbatim)
- NEVER DO list (safety-critical, stays in archetype verbatim)
- Business context usage rules

**What to REMOVE (now covered by skills):**
- Detailed SPIN question examples (4 stages with 2-3 questions each) → `discovery-questions.md`
- Full objection handling decision tree → `objection-competitor.md`, `objection-pricing.md`
- Closing technique descriptions (trial, summary, alternative, assumptive) → `closing-techniques.md`
- Re-engagement tactics → `re-engagement-cold-lead.md`
- Proactive engagement rules (these are generic enough to stay, but trim examples)

**Key principle:** The trimmed archetype MUST still produce reasonable sales conversations on its own (if skill resolution fails). It's a safety net, not a stub. A greeting with the trimmed archetype and zero skills should still feel like a competent sales agent.

**Verification (in tests):**
- `buildSystemPrompt()` with `pricing` intent + resolved skills = archetype overview + `objection-pricing` skill + `discovery-questions` skill
- Total tokens for a `pricing` intent prompt < total tokens for old monolithic prompt (same scenario, fewer tokens, more depth)
- `buildSystemPrompt()` with `greeting:regex` intent = trimmed archetype only, no skills → still coherent

**Acceptance Criteria:**
- Sales archetype `prompts.en` trimmed from ~1000 words to ~300-400 words
- Sales archetype `prompts.es` trimmed proportionally
- NEVER DO list preserved verbatim
- Quote execution rules preserved verbatim
- Existing archetype tests updated if they assert on prompt content
- At least 3 tests: (1) trimmed prompt contains NEVER DO list, (2) trimmed prompt + skills for `pricing` intent uses fewer total tokens than old monolithic prompt, (3) `buildSystemPrompt()` with no skills still produces valid, self-contained output
- `pnpm type-check` passes

**Depends on:** NC-304 (prompt builder integration), NC-306 (sales skills exist)

---

## P3 — Classifier + Module Fixes

#### NC-309 [ ] Intent classifier: relax regex + add missing intent types

The regex patterns are too strict (miss common variations) and the intent taxonomy is missing types that skills need to trigger correctly.

**Files to modify:**
- `packages/ai/src/constants/index.ts` (or wherever `REGEX_INTENTS` lives) — relax patterns
- `packages/ai/src/intent-classifier.ts` — add new intent types to LLM prompt taxonomy
- `packages/ai/src/intent-profiles.ts` — add profiles for new intent types
- `packages/ai/src/schemas/index.ts` — add new types to intent enum

**Regex changes:**

Current (too strict — requires exact match):
```js
greeting: [/^(hi|hello|hey|hola)\s*[!?.,]*\s*$/i]
farewell: [/^(bye|goodbye|see you|thanks|thank you)\s*[!?.,]*\s*$/i]
```

New (relaxed — matches common variations):
```js
greeting: [
  /^(hi|hello|hey|hola|buenos días|buenas tardes|buenas noches|good morning|good afternoon|good evening)\b[^?]*$/i,
  /^(hi|hello|hey|hola)\s+(there|everyone|team|guys)[!?.,\s]*$/i,
]
farewell: [
  /^(bye|goodbye|see you|thanks|thank you|gracias|hasta luego|chao|adiós)\b[^?]*$/i,
  /^(thanks|thank you|gracias)\s*(so much|a lot|mucho|for your help|por tu ayuda)?[!?.,\s]*$/i,
]
```

Key changes: `\b` word boundary instead of `$` anchor. Allow trailing words ("hello there", "thanks for your help"). Add Spanish greetings/farewells. Still reject questions ("hello?", "hi, can you help?" — the `[^?]*$` excludes question marks so those fall through to LLM for proper classification).

**New intent types (3):**

Add to LLM prompt taxonomy, Zod enum, and intent profiles:

1. **`objection`** — "Customer pushes back on price, timing, competitor preference, or general resistance. Examples: 'that's too expensive', 'we already use X', 'not sure this is right for us', 'I need to think about it'."
   - Profile: `{ includeArchetypeFramework: true, includeModules: true, allowedModuleSlugs: ['qualify_lead', 'send_quote', 'book_meeting'], maxSteps: 3, maxResponseTokens: 390, maxSentences: 5, skipGrounding: false }`

2. **`comparison`** — "Customer explicitly compares to another product or asks how you differ. Examples: 'how are you different from X?', 'why should I choose you over Y?', 'what makes you better?'."
   - Profile: `{ includeArchetypeFramework: true, includeModules: true, allowedModuleSlugs: ['qualify_lead'], maxSteps: 3, maxResponseTokens: 390, maxSentences: 5, skipGrounding: false }`

3. **`open_discovery`** — "Customer is exploring, asking broad questions, or in early research. Examples: 'tell me more', 'what do you offer?', 'how does this work?', 'I'm looking for solutions'. Distinct from `product_question` (which asks about a specific feature) — this is wide-open exploration."
   - Profile: `{ includeArchetypeFramework: true, includeModules: true, allowedModuleSlugs: undefined, maxSteps: 5, maxResponseTokens: 440, maxSentences: 6, skipGrounding: false }`

**Update LLM prompt distinctions** to help classifier differentiate:
- "We already use X" / "X is cheaper" → `objection` (NOT `negotiation` — objection is pre-interest, negotiation is post-interest)
- "How are you different from X?" → `comparison` (NOT `product_question`)
- "Tell me more" / "What do you offer?" → `open_discovery` (NOT `general_inquiry`)
- Keep existing: "How much does X cost?" → `pricing`
- Keep existing: "Schedule a meeting" → `booking_request`

**Acceptance Criteria:**
- Relaxed regex matches: "hello there", "hi team", "thanks for your help", "buenos días", "gracias" — verified via test
- Relaxed regex still rejects: "hi, can you help me?", "hello, I need a quote" — these should fall through to LLM
- 3 new intent types added to Zod enum + LLM prompt + profiles
- `objection` profile allows `qualify_lead`, `send_quote`, `book_meeting`
- `comparison` profile allows `qualify_lead` only
- `open_discovery` profile allows all modules with 5 maxSteps
- Existing intent tests updated (no regressions on the 14 original types)
- At least 6 tests: (1) "hello there" → greeting:regex, (2) "hi, can you help?" → NOT regex (falls to LLM), (3) "buenos días" → greeting:regex, (4) new intent types exist in Zod enum, (5) `objection` profile has correct module whitelist, (6) `open_discovery` profile allows all modules
- `pnpm type-check` passes

**Depends on:** — (no dependency, but should land before NC-311 smoke test)

---

#### NC-310 [ ] Module descriptions rewrite — trigger-based invocation rules

The current module descriptions are generic ("Collect lead qualification info"). The LLM doesn't know WHEN to call them, so it under-invokes. Rewrite every module description as a trigger-based rule.

**Files to modify:**
- `packages/ai/src/modules/qualify-lead.ts` — rewrite `description`
- `packages/ai/src/modules/book-meeting.ts` — rewrite `description`
- `packages/ai/src/modules/send-quote.ts` — rewrite `description`
- `packages/ai/src/modules/collect-payment.ts` — rewrite `description`
- `packages/ai/src/modules/send-followup.ts` — rewrite `description`
- `packages/ai/src/modules/create-ticket.ts` — rewrite `description`
- `packages/ai/src/modules/escalate-to-human.ts` — rewrite `description`
- `packages/ai/src/modules/capture-interest.ts` — rewrite `description`
- `packages/ai/src/modules/draft-content.ts` — rewrite `description`

**Rewrite pattern:** Change from "what it does" to "CALL THIS WHEN [trigger]. It will [outcome]."

**New descriptions:**

| Module | Current | New |
|--------|---------|-----|
| `qualify_lead` | "Score and tag a lead based on conversation signals (budget, timeline, needs). Call this when you identify buying signals or the customer shares qualification info." | "CALL THIS when the customer mentions budget, timeline, team size, decision-making authority, specific needs, or shows buying signals (asks about pricing, requests a demo, compares options). Captures BANT qualification data and scores the lead. Call EARLY — don't wait for all signals, qualify incrementally as info emerges." |
| `book_meeting` | "Book a meeting with the customer. Specify preferred date, time, and topic. Call this when the customer wants to schedule a call or demo." | "CALL THIS when the customer agrees to a meeting, asks to schedule, mentions a date/time, or says 'let's set up a call/demo'. Also call when YOU want to propose a meeting as a next step (e.g., after qualifying a warm lead). Requires: preferred_date and topic. Time is optional — suggest a slot if they don't specify." |
| `send_quote` | "Generate and email a structured quote with line items. Call this when the customer requests a quote, pricing summary, or asks for prices to be sent. Use prices already discussed in the conversation or from the knowledge base — do NOT ask for information you already have..." | "CALL THIS when the customer asks for a quote, says 'send me pricing', requests a proposal, or after you've discussed specific products/services and the customer seems interested. You MUST have: at least one line item with description and price (from conversation or knowledge base). Do NOT call if you haven't discussed specific products yet — qualify first." |
| `collect_payment` | "Collect payment via a configured payment link. Capture amount and description. Call this when the customer is ready to pay or requests a payment link." | "CALL THIS when the customer explicitly says they want to pay, asks for a payment link, or confirms a quote/invoice and is ready to proceed. Do NOT call speculatively — only when the customer has confirmed intent to pay. Requires: amount and description." |
| `send_followup` | "Send a follow-up message to a customer who has not responded. Choose a template: gentle_reminder, value_add, or last_chance." | "CALL THIS when the conversation has stalled (customer hasn't responded to your last 2+ messages) or when you want to schedule a future check-in. Choose template based on relationship stage: gentle_reminder (first follow-up), value_add (share relevant info), last_chance (final attempt before archiving)." |
| `create_ticket` | "Create a support ticket from the conversation. Capture subject, description, priority, and category." | "CALL THIS when the customer reports a problem, bug, or issue that needs tracking. Also call when a request can't be resolved in this conversation and needs to be escalated to a specialist. Captures: subject, description, priority (low/medium/high), category." |
| `escalate_to_human` | "Escalate the conversation to a human agent. Provide the reason, urgency, and a summary." | "CALL THIS when: (1) you've failed to resolve after 2+ attempts, (2) the customer explicitly asks for a human, (3) the issue involves billing disputes or account access, or (4) the customer is visibly frustrated (multiple negative messages). Provide: reason, urgency level, and a brief summary so the human has context." |
| `capture_interest` | "Log customer interest in a product or topic. Capture the interest level and contact info if available." | "CALL THIS when the customer expresses interest in a specific product, service, or feature — even casually ('that sounds interesting', 'tell me more about X'). Captures interest for follow-up by the team. Don't wait for strong intent — capture early signals too." |
| `draft_content` | "Draft marketing content based on conversation context. Specify content type, topic, and key points." | "CALL THIS when the conversation reveals content opportunities: a customer success story, a common question that would make a good FAQ, or a feature request that could be a blog post. Specify: content_type (social_post/email/blog), topic, key_points from conversation." |

**Acceptance Criteria:**
- All 9 module `description` fields updated
- New descriptions follow "CALL THIS WHEN [trigger]" pattern
- Descriptions include what data is required (prevent incomplete invocations)
- Descriptions include negative guidance ("do NOT call if...")
- No changes to `inputSchema`, `outputSchema`, `execute`, or any other field — description only
- At least 2 tests: (1) all 9 modules have descriptions starting with "CALL THIS" (convention check), (2) `qualify_lead` description mentions "budget" and "timeline" (trigger keywords present)
- `pnpm type-check` passes

**Depends on:** — (no dependency, but should land before NC-311 smoke test)

---

## P4 — Verification

#### NC-311 [ ] Sprint smoke test — skill system + classifier + modules compose correctly

End-to-end verification that all sprint changes work together: skills fire for the right intents, module descriptions are picked up, classifier handles new patterns, and the composed prompt is coherent.

**Files to create:**
- `packages/ai/src/__tests__/agent-intelligence-smoke.test.ts`

**Test scenarios (at least 10 tests across 4 describe blocks):**

**1. Skill resolution for common scenarios:**
- `pricing` intent → `objection-pricing` + `discovery-questions` skills fire
- `objection` intent (new) + message "we already use HubSpot" → `objection-competitor` fires
- `booking_request` intent → `upsell-after-booking` fires
- `greeting:regex` intent → zero skills (lightweight, skipped)
- `farewell` intent → zero skills
- Always-on skill `returning-customer-warmth` fires for `general_inquiry` intent

**2. Intent classifier regex:**
- "hello there" → `greeting:regex` (not LLM fallback)
- "buenos días" → `greeting:regex`
- "hi, I need help with pricing" → NOT regex (falls to LLM — contains question content)
- "thanks for your help" → `farewell:regex`

**3. Composed prompt quality:**
- `buildSystemPrompt()` with `objection` intent + resolved skills: prompt contains `[SKILL: objection-competitor]` AND the trimmed archetype NEVER DO list
- `buildSystemPrompt()` with no skills (empty array): no `--- ACTIVE SKILLS ---` section
- Total tokens for `pricing` intent with skills < total tokens for old monolithic archetype (same intent, fewer tokens or same tokens but with more depth)

**4. Module descriptions:**
- All 9 modules have descriptions starting with "CALL THIS"
- `qualify_lead` description contains "budget", "timeline", "BANT"
- `send_quote` description contains "Do NOT call if"

**Smoke commands (run manually, assert pass):**
- `pnpm type-check` — full monorepo
- `pnpm build` — root build
- `pnpm --filter @camello/ai test` — all AI package tests (existing + new)

**Acceptance Criteria:**
- At least 10 tests covering all 4 describe blocks
- All existing AI tests pass (0 regressions)
- `pnpm type-check` passes
- `pnpm build` passes
- Test file follows existing test patterns (Vitest, `vi.mock`, `describe`/`it`)

**Depends on:** NC-302–NC-310 (all prior tasks)

---

import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../prompt-builder.js';
import { ARCHETYPE_PROMPTS } from '../archetype-prompts.js';
import { getSkill } from '../skills/index.js';
import { filterLocale, estimateTokens } from '../skills/parser.js';
import type { RagChunk } from '@camello/shared/types';
import type { ResolvedSkill } from '../skills/types.js';

// Pre-trim baseline: verbatim content of salesArchetype.prompts.en before NC-308 modification.
// Captured in Step A — do not update this after the trim.
const OLD_ARCHETYPE_EN = `BEHAVIORAL FRAMEWORK — SALES AGENT:

IDENTITY: Consultative expert — curious, helpful, outcome-driven. Collect name + contact early. Present value before price. Be transparent about costs.

PROACTIVE ENGAGEMENT (never be passive):
- On greeting: introduce yourself (name + role), then ask ONE open discovery question. Example: "What challenge are you trying to solve today?"
- On vague messages ("ok", "I don't know"): redirect with a discovery question or a relevant insight — never mirror passivity.
- Every response must advance toward: understanding need → presenting value → proposing next step.

DISCOVERY FRAMEWORK — ask ONE question at a time, weave naturally into conversation:
1. Situation: Establish context. "What are you currently using for X?" / "How does your team handle Y?"
2. Pain: Surface the problem. "What's the biggest frustration with that?" / "What's not working well?"
3. Implication: Deepen the cost. "How does that affect your team / revenue / timeline?"
4. Payoff: Let them sell themselves. "If that were solved, what would that mean for you?"
Never interrogate — one question per response, conversationally phrased.

QUALIFICATION (BANT — collect across the conversation, never as a form):
- Budget: "Roughly what investment range are you working with?" — accept soft/unclear answers.
- Authority: "Are you evaluating this solo or looping in others?"
- Need: Confirmed when they name a specific pain point (via Situation + Pain questions).
- Timeline: "Is there a deadline, or are you still in the exploring phase?" — if urgent, prioritize fast path.

OBJECTION HANDLING — acknowledge → validate → reframe → offer:
- Always fully acknowledge before reframing. "That's a real concern" must land before any pivot.
- Validate: "A lot of teams hesitate on that at first."
- Reframe: connect their concern to the business outcome they described.
- Price objection: restate the value in their own terms before offering a smaller plan or trial.

RE-ENGAGEMENT (when they go cold):
- "just browsing": "No pressure — is there a specific problem you were hoping to solve?"
- "not sure": "What would help you get more clarity on that?"
- "maybe later": "Totally fine — want me to send a quick summary you can revisit?"
- After 3+ vague messages: "Sounds like the timing might not be right — feel free to reach back out." (This often re-engages; if not, the conversation wasn't ready.)
- One gentle nudge maximum. Never pressure.

CONVERSATIONAL CLOSES — non-pushy, advance toward a decision:
- Trial close: "Does this seem to address what you described?"
- Summary close: "Based on what you told me, [X] looks like the best fit — want to take the next step?"
- Alternative close: "Would you prefer to start small and expand, or go straight to the full setup?"
- Assumptive close: "Let's get something on the calendar — mornings or afternoons work better?"

BUSINESS CONTEXT — USE IT to personalize every response:
- Read your company description, services, and target audience from your profile.
- Tailor discovery questions to the business type: consulting → ask about team size and bottlenecks; physical products → ask about quantity and delivery timeline; SaaS → ask about current tools and integrations.
- Reference specific services by name. Never pitch generically.
- If the knowledge base has ROI data or case studies relevant to this prospect, lead with that insight before listing features.

QUOTE EXECUTION — use what you already know:
- If the customer asks for a quote, proposal, or pricing summary by email/message, call send_quote immediately using prices already discussed in this conversation or in the knowledge base. Do NOT ask for information you already have.
- Populate line items from: (1) prices mentioned in your previous messages, (2) knowledge base service catalog, (3) the plan the customer expressed interest in. Use quantity 1 if not specified.
- If you have partial information, make a best-effort quote with what you have and note it is an estimate. Never say "I'll send you a quote" without calling the tool.

NEVER DO:
- No fake scarcity, manufactured urgency, or guilt ("I thought you were serious").
- Never invent products, prices, or features not in the knowledge base.
- Close every conversation with a clear next step.`;

const baseCtx = {
  artifact: {
    name: 'Sofia',
    role: 'sales assistant',
    type: 'sales' as const,
    personality: { tone: 'friendly', language: 'en' },
    constraints: {},
    config: {},
    companyName: 'Acme Corp',
  },
  ragContext: [] as RagChunk[],
  learnings: [],
};

describe('NC-308: archetype trim', () => {
  it('T1a: trimmed prompts.en preserves NEVER DO header and all three items', () => {
    const en = ARCHETYPE_PROMPTS.sales!.en;
    expect(en).toContain('NEVER DO');
    expect(en).toContain('No fake scarcity, manufactured urgency, or guilt ("I thought you were serious").');
    expect(en).toContain('Never invent products, prices, or features not in the knowledge base.');
    expect(en).toContain('Close every conversation with a clear next step.');
  });

  it('T1b: trimmed prompts.es preserves Spanish NEVER DO block', () => {
    const es = ARCHETYPE_PROMPTS.sales!.es;
    expect(es).toContain('NUNCA HAGAS:');
    expect(es).toContain('No uses escasez falsa, urgencia manufacturada o culpa ("pensé que eras serio").');
  });

  it('T2: pricing intent with objection-pricing + discovery-questions composes correctly and uses fewer total prompt tokens than old monolithic', () => {
    const objPricingDef = getSkill('objection-pricing');
    const discQuestionsDef = getSkill('discovery-questions');
    expect(objPricingDef).toBeDefined();
    expect(discQuestionsDef).toBeDefined();

    const resolvedSkills: ResolvedSkill[] = [
      {
        slug: objPricingDef!.slug,
        name: objPricingDef!.name,
        body: filterLocale(objPricingDef!.body, 'en'),
        priority: objPricingDef!.priority,   // 10 — injected first
        source: objPricingDef!.source,
      },
      {
        slug: discQuestionsDef!.slug,
        name: discQuestionsDef!.name,
        body: filterLocale(discQuestionsDef!.body, 'en'),
        priority: discQuestionsDef!.priority, // 8 — injected second
        source: discQuestionsDef!.source,
      },
    ];

    const pricingIntent = {
      type: 'pricing' as const,
      source: 'llm' as const,
      confidence: 0.9,
      complexity: 'medium' as const,
      requires_knowledge_base: false,
      sentiment: 'neutral' as const,
    };

    const pricingCtx = { ...baseCtx, intent: pricingIntent, resolvedSkills };

    // ── Sub-assertion A: Composition and injection order ──────────────────────
    const composedPrompt = buildSystemPrompt(pricingCtx);

    expect(composedPrompt).toContain('[SKILL: objection-pricing]');
    expect(composedPrompt).toContain('[SKILL: discovery-questions]');

    // Priority order: objection-pricing (priority 10) before discovery-questions (priority 8)
    expect(composedPrompt.indexOf('[SKILL: objection-pricing]'))
      .toBeLessThan(composedPrompt.indexOf('[SKILL: discovery-questions]'));

    // Archetype framework precedes skills section
    expect(composedPrompt.indexOf('BEHAVIORAL FRAMEWORK'))
      .toBeLessThan(composedPrompt.indexOf('--- ACTIVE SKILLS ---'));

    // ── Sub-assertion B: Total actual token comparison ────────────────────────
    // Temporarily substitute OLD_ARCHETYPE_EN, build baseline with no skills, restore.
    const trimmedEn = ARCHETYPE_PROMPTS.sales!.en;
    ARCHETYPE_PROMPTS.sales!.en = OLD_ARCHETYPE_EN;
    const oldBaselinePrompt = buildSystemPrompt({ ...pricingCtx, resolvedSkills: [] });
    ARCHETYPE_PROMPTS.sales!.en = trimmedEn; // restore

    expect(estimateTokens(composedPrompt)).toBeLessThan(estimateTokens(oldBaselinePrompt));
  });

  it('T3: greeting (source: regex) with modules in ctx suppresses skills section and module text via intent profile', () => {
    const greetingCtx = {
      ...baseCtx,
      intent: {
        type: 'greeting' as const,
        source: 'regex' as const,
        confidence: 1.0,
        complexity: 'simple' as const,
        requires_knowledge_base: false,
        sentiment: 'neutral' as const,
      },
      resolvedSkills: [] as ResolvedSkill[],
      // Modules explicitly provided — their absence in output proves the profile gate fired
      modules: [
        { name: 'Send Quote',   slug: 'send_quote',   description: 'Send a quote',   autonomyLevel: 'fully_autonomous' as const },
        { name: 'Book Meeting', slug: 'book_meeting', description: 'Book a meeting', autonomyLevel: 'fully_autonomous' as const },
        { name: 'Qualify Lead', slug: 'qualify_lead', description: 'Qualify lead',   autonomyLevel: 'fully_autonomous' as const },
      ],
    };

    const prompt = buildSystemPrompt(greetingCtx);

    // Identity survives
    expect(prompt).toContain('You are Sofia');

    // No skills section (resolvedSkills is empty)
    expect(prompt).not.toContain('--- ACTIVE SKILLS ---');

    // Module list entries absent: greeting:regex has includeModules: false in intent-profiles.ts:48.
    // The module list injects slugs in bracket format "- Name [slug]: ..." (prompt-builder.ts:235).
    // We check for [slug] to target the module list specifically, not the archetype framework text.
    expect(prompt).not.toContain('[send_quote]');
    expect(prompt).not.toContain('[book_meeting]');
    expect(prompt).not.toContain('[qualify_lead]');

    // Archetype framework IS present for greeting:regex (includeArchetypeFramework: true at intent-profiles.ts:47)
    expect(prompt.length).toBeGreaterThan(200);
  });
});

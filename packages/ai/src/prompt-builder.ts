import type { AutonomyLevel, Channel, Intent, RagChunk } from '@camello/shared/types';
import type { ResolvedSkill } from './skills/types.js';
import type { PromptTemplates } from './prompts/types.js';
import { en } from './prompts/en.js';
import { es } from './prompts/es.js';
import { ARCHETYPE_PROMPTS } from './archetype-prompts.js';
import { sanitizeFactValue, MAX_INJECTED_FACTS } from './memory-extractor.js';
import { getIntentProfile, type IntentProfile } from './intent-profiles.js';

const templates: Record<string, PromptTemplates> = { en, es };

function getTemplates(locale?: string): PromptTemplates {
  return (locale && templates[locale]) ? templates[locale] : templates.en;
}

interface PromptContext {
  artifact: {
    name: string;
    role: string;
    type?: string;
    personality: Record<string, unknown>;
    constraints: Record<string, unknown>;
    config: Record<string, unknown>;
    companyName: string;
  };
  channel?: Channel;
  ragContext: RagChunk[];
  proactiveContext?: RagChunk[];
  learnings: string[];
  modules?: Array<{
    name: string;
    slug: string;
    description: string;
    autonomyLevel: AutonomyLevel;
  }>;
  locale?: string;
  /** True when RAG search was executed (not skipped by intent gate). */
  ragSearchAttempted?: boolean;
  /** Customer memory facts — untrusted, user-reported. Capped + re-sanitized at injection. */
  customerMemory?: Array<{ key: string; value: string }>;
  /** Classified intent — drives context curation (prompt trimming, length rules). */
  intent?: Intent;
  /** Resolved skills for this message — injected after archetype framework, before personality. */
  resolvedSkills?: ResolvedSkill[];
}

/** Per-channel overrides from artifact config YAML */
interface ChannelOverride {
  tone?: string;
  greeting?: string;
  style?: string;
}

export function buildSystemPrompt(ctx: PromptContext): string {
  const { artifact, channel, ragContext, proactiveContext, learnings } = ctx;
  // Always use English templates for system prompt scaffolding — models
  // comprehend English instructions most reliably. The LANGUAGE RULE
  // instruction (injected right after safety) controls response language.
  const t = getTemplates('en');

  const isAdvisor = artifact.type === 'advisor';

  // Resolve intent profile for context curation decisions
  const profile: IntentProfile | undefined = ctx.intent
    ? getIntentProfile(ctx.intent)
    : undefined;

  // Resolve channel-specific overrides from artifact.config.channel_overrides
  const channelOverride = resolveChannelOverride(artifact.config, channel);

  const parts: string[] = [];

  // Identity — advisor gets a tailored framing instead of the customer-facing one
  if (isAdvisor) {
    parts.push(`You are ${artifact.name}, the internal business advisor for ${artifact.companyName}. You are speaking to the business owner, NOT a customer.`);
  } else {
    parts.push(t.identity(artifact.name, artifact.role, artifact.companyName));
    parts.push(t.noOtherCompanies);
  }

  // Safety
  parts.push(t.safety);

  // Language — placed right after safety for high priority.
  // Use artifact personality.language if set, otherwise 'en' default.
  const langValue = (artifact.personality as Record<string, unknown>)?.language as string | undefined;
  parts.push(t.language(langValue || 'en'));

  // Archetype-specific behavioral framework (skipped for lightweight intents)
  const includeFramework = profile?.includeArchetypeFramework ?? true;
  const artifactType = artifact.type;
  if (includeFramework && artifactType && artifactType !== 'custom') {
    const archetypePrompt = ARCHETYPE_PROMPTS[artifactType as keyof typeof ARCHETYPE_PROMPTS];
    if (archetypePrompt) {
      const framework = archetypePrompt.en;
      parts.push(t.archetypeFramework(framework));
    }
  }

  // Active skills — situational guidelines (after archetype, before personality)
  if (ctx.resolvedSkills && ctx.resolvedSkills.length > 0) {
    parts.push('--- ACTIVE SKILLS ---\nFollow these situational guidelines when they apply to the current message:');
    for (const skill of ctx.resolvedSkills) {
      parts.push(`\n[SKILL: ${skill.slug}]\n${skill.body}\n[/SKILL: ${skill.slug}]`);
    }
  }

  // Personality (channel override tone takes priority)
  if (artifact.personality) {
    const p = artifact.personality as Record<string, unknown>;
    const tone = channelOverride?.tone ?? p.tone;
    if (tone) parts.push(t.tone(tone as string));
    // Language instruction already injected above (after safety rules).
    if (channelOverride?.style) {
      parts.push(t.channelStyle(channelOverride.style));
    }
    if (p.style_notes) {
      parts.push(t.styleNotes);
      for (const note of p.style_notes as string[]) {
        parts.push(`- ${note}`);
      }
    }
    // Custom instructions from the tenant's team
    if (p.instructions && typeof p.instructions === 'string' && p.instructions.trim()) {
      parts.push(t.customInstructions(p.instructions.trim()));
    }
    if (p.hours && typeof p.hours === 'string') {
      parts.push(`Business hours: ${p.hours}.\nIMPORTANT: NEVER accept, confirm, or suggest meeting times outside these hours. If a customer requests a time outside business hours, decline and offer a time within business hours instead.`);
    }
  }

  // Channel-specific greeting instruction
  if (channelOverride?.greeting) {
    parts.push(t.channelGreeting(channelOverride.greeting));
  }

  // Constraints
  if (artifact.constraints) {
    const c = artifact.constraints as Record<string, unknown>;
    if (c.hard_rules) {
      parts.push(t.hardRules);
      for (const rule of c.hard_rules as string[]) {
        parts.push(`- ${rule}`);
      }
    }
  }

  // RAG context — split into role-aware lead/support blocks.
  // Proactive chunks are always forced to 'support' regardless of classifyChunkRole
  // result, because they came from a broader, lower-threshold search and should
  // never be promoted to PRIMARY KNOWLEDGE.
  const allChunks = [
    ...ragContext,
    ...(proactiveContext ?? []).map(c => ({ ...c, role: 'support' as const })),
  ];
  const leadChunks = allChunks.filter((c) => c.role === 'lead');
  const supportChunks = allChunks.filter((c) => c.role === 'support');

  if (leadChunks.length > 0 || supportChunks.length > 0) {
    // Primary (lead) knowledge
    if (leadChunks.length > 0) {
      parts.push(t.primaryKnowledgeStart);
      parts.push(leadChunks.map((c) => c.content).join('\n\n'));
      parts.push(t.primaryKnowledgeEnd);
    }

    // Supporting knowledge
    if (supportChunks.length > 0) {
      parts.push(t.supportingKnowledgeStart);
      parts.push(supportChunks.map((c) => c.content).join('\n\n'));
      parts.push(t.supportingKnowledgeEnd);
    }

    // Extraction hint — tells the LLM how to weight the two blocks
    parts.push(t.knowledgeExtractionHint);
  }

  // Empty-RAG warning: search ran but returned nothing (both direct + proactive empty)
  const hasNoKnowledge = ragContext.length === 0 && (!proactiveContext || proactiveContext.length === 0);
  if (hasNoKnowledge && ctx.ragSearchAttempted) {
    parts.push(t.emptyRagWarning);
  }

  // Learnings
  if (learnings.length > 0) {
    parts.push(t.learningsStart);
    parts.push(learnings.join('\n'));
    parts.push(t.learningsEnd);
  }

  // Customer memory — untrusted, user-reported facts (skip for advisor — owner is not a customer)
  if (!isAdvisor && ctx.customerMemory && ctx.customerMemory.length > 0) {
    // Filter out facts that match the agent's own name (the LLM sometimes emits
    // [MEMORY:name=Sofía] from its own self-introduction, polluting customer memory).
    const agentNameLower = artifact.name.toLowerCase().trim();
    const capped = ctx.customerMemory
      .filter((fact) => {
        if (fact.key === 'name') {
          const valLower = fact.value.toLowerCase().trim();
          if (valLower === agentNameLower) return false;
        }
        return true;
      })
      .slice(0, MAX_INJECTED_FACTS);

    if (capped.length > 0) {
      parts.push(t.customerMemoryStart);
      parts.push('This is a returning customer. Known facts:');
      for (const fact of capped) {
        // Re-sanitize at injection time (defense-in-depth)
        const safeValue = sanitizeFactValue(fact.value);
        if (safeValue) {
          parts.push(`- ${fact.key}: ${safeValue}`);
        }
      }
      parts.push(t.customerMemoryInstruction);
      parts.push(t.customerMemoryEnd);
    }
  }

  // Module instructions (skipped or filtered by intent profile)
  const includeModules = profile?.includeModules ?? true;
  if (includeModules && ctx.modules && ctx.modules.length > 0) {
    // Filter to allowed slugs if the profile restricts them
    const allowedSlugs = profile?.allowedModuleSlugs;
    const visibleModules = allowedSlugs
      ? ctx.modules.filter((m) => allowedSlugs.includes(m.slug))
      : ctx.modules;

    if (visibleModules.length > 0) {
      parts.push(t.modulesStart);
      parts.push(t.modulesInstruction);
      for (const mod of visibleModules) {
        const autonomyNote = t.autonomy[mod.autonomyLevel] ?? t.autonomy.suggest_only;
        parts.push(`- ${mod.name} [${mod.slug}]: ${mod.description} ${autonomyNote}`);
      }
      parts.push(t.modulesRules);
      parts.push(t.modulesEnd);
    }
  }

  // Response length rule (intent-aware conciseness constraint)
  if (profile) {
    parts.push(t.responseLengthRule(profile.maxSentences));
  }

  // Memory extraction — piggyback on the existing LLM call (skip for advisor)
  if (!isAdvisor) {
    parts.push(t.memoryExtraction);
  }

  return parts.join('\n');
}

/**
 * Resolve channel-specific overrides from artifact config.
 * Config shape: { channel_overrides: { whatsapp: { tone, greeting, style }, webchat: { ... } } }
 */
function resolveChannelOverride(
  config: Record<string, unknown>,
  channel?: Channel,
): ChannelOverride | null {
  if (!channel || !config.channel_overrides) return null;

  const overrides = config.channel_overrides as Record<string, ChannelOverride>;
  return overrides[channel] ?? null;
}

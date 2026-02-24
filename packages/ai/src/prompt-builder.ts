import type { AutonomyLevel, Channel } from '@camello/shared/types';
import type { PromptTemplates } from './prompts/types.js';
import { en } from './prompts/en.js';
import { es } from './prompts/es.js';
import { ARCHETYPE_PROMPTS } from './archetype-prompts.js';

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
  ragContext: string[];
  proactiveContext?: string[];
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
}

/** Per-channel overrides from artifact config YAML */
interface ChannelOverride {
  tone?: string;
  greeting?: string;
  style?: string;
}

export function buildSystemPrompt(ctx: PromptContext): string {
  const { artifact, channel, ragContext, proactiveContext, learnings } = ctx;
  const t = getTemplates(ctx.locale);

  // Resolve channel-specific overrides from artifact.config.channel_overrides
  const channelOverride = resolveChannelOverride(artifact.config, channel);

  const parts: string[] = [];

  // Identity
  parts.push(t.identity(artifact.name, artifact.role, artifact.companyName));
  parts.push(t.noOtherCompanies);

  // Safety
  parts.push(t.safety);

  // Language — placed right after safety for high priority.
  // Use artifact personality.language if set, otherwise 'en' default.
  const langValue = (artifact.personality as Record<string, unknown>)?.language as string | undefined;
  parts.push(t.language(langValue || 'en'));

  // Archetype-specific behavioral framework
  const artifactType = artifact.type;
  if (artifactType && artifactType !== 'custom') {
    const archetypePrompt = ARCHETYPE_PROMPTS[artifactType as keyof typeof ARCHETYPE_PROMPTS];
    if (archetypePrompt) {
      const framework = ctx.locale === 'es' ? archetypePrompt.es : archetypePrompt.en;
      parts.push(t.archetypeFramework(framework));
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

  // RAG context (direct, trusted knowledge)
  if (ragContext.length > 0) {
    parts.push(t.knowledgeStart);
    parts.push(ragContext.join('\n\n'));
    parts.push(t.knowledgeEnd);
  }

  // Proactive context (tangentially relevant — weave in naturally if useful)
  if (proactiveContext && proactiveContext.length > 0) {
    parts.push(t.proactiveStart);
    parts.push(t.proactiveInstruction);
    parts.push(proactiveContext.join('\n\n'));
    parts.push(t.proactiveEnd);
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

  // Module instructions
  if (ctx.modules && ctx.modules.length > 0) {
    parts.push(t.modulesStart);
    parts.push(t.modulesInstruction);
    for (const mod of ctx.modules) {
      const autonomyNote = t.autonomy[mod.autonomyLevel] ?? t.autonomy.suggest_only;
      parts.push(`- ${mod.name} [${mod.slug}]: ${mod.description} ${autonomyNote}`);
    }
    parts.push(t.modulesRules);
    parts.push(t.modulesEnd);
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

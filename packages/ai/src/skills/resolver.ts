import { getAllSkills } from './index.js';
import { filterLocale, estimateTokens } from './parser.js';
import type { SkillResolutionContext, ResolvedSkill } from './types.js';

export const SKILL_TOKEN_CAP = 800;

export function resolveSkills(ctx: SkillResolutionContext): ResolvedSkill[] {
  // Step 1: Collect candidates by type
  const candidates = getAllSkills().filter(
    (s) => s.type === ctx.artifactType || s.type === 'general',
  );

  // Step 2: Filter by trigger
  const triggered = candidates.filter((s) => {
    switch (s.trigger.mode) {
      case 'always':
        return true;
      case 'intent':
        return (s.trigger.intents ?? []).includes(ctx.intent.type);
      case 'keyword': {
        const lowerText = ctx.messageText.toLowerCase();
        return (s.trigger.keywords ?? []).some((kw) =>
          lowerText.includes(kw.toLowerCase()),
        );
      }
      default:
        return false;
    }
  });

  // Step 3: Conflict resolution — sort by priority desc, greedy excluded-set pass
  const sorted = [...triggered].sort((a, b) => b.priority - a.priority);
  const excluded = new Set<string>();
  const resolved: typeof sorted = [];

  for (const skill of sorted) {
    if (excluded.has(skill.slug)) continue;
    resolved.push(skill);
    for (const conflicting of skill.conflicts_with) {
      excluded.add(conflicting);
    }
  }

  // Step 4: Token budget — accumulate, skip any that push past cap
  let tokenAccum = 0;
  const budgeted: typeof resolved = [];

  for (const skill of resolved) {
    if (tokenAccum + skill.token_budget > SKILL_TOKEN_CAP) continue;
    tokenAccum += skill.token_budget;
    budgeted.push(skill);
  }

  // Step 5: Map to ResolvedSkill with locale filtering
  return budgeted.map((skill) => ({
    slug: skill.slug,
    name: skill.name,
    body: filterLocale(skill.body, ctx.locale),
    priority: skill.priority,
    source: skill.source,
  }));
}

// Re-export for convenience
export { estimateTokens };

import type { SkillDefinition, SkillTrigger, SkillTriggerMode, SkillType } from './types.js';

type ParsedFrontmatter = Record<string, string | string[] | Record<string, string | string[]>>;

function parseInlineArray(value: string): string[] {
  const inner = value.trim().replace(/^\[/, '').replace(/\]$/, '');
  return inner.split(',').map((s) => s.trim()).filter(Boolean);
}

function parseFrontmatter(yaml: string): ParsedFrontmatter {
  const result: ParsedFrontmatter = {};
  const lines = yaml.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line || !line.trim()) { i++; continue; }

    const topLevelMatch = line.match(/^([a-z_]+):\s*(.*)/);
    if (!topLevelMatch) { i++; continue; }

    const key = topLevelMatch[1];
    const rest = topLevelMatch[2].trim();

    if (rest === '') {
      // Block start — collect indented sub-lines
      const nested: Record<string, string | string[]> = {};
      i++;
      while (i < lines.length) {
        const subLine = lines[i];
        if (!subLine || !subLine.match(/^\s+\S/)) break;
        const subMatch = subLine.match(/^\s+([a-z_]+):\s*(.*)/);
        if (subMatch) {
          const subKey = subMatch[1];
          const subRest = subMatch[2].trim();
          if (subRest.startsWith('[')) {
            nested[subKey] = parseInlineArray(subRest);
          } else {
            nested[subKey] = subRest.replace(/^['"]|['"]$/g, '');
          }
        }
        i++;
      }
      result[key] = nested;
    } else if (rest.startsWith('[')) {
      result[key] = parseInlineArray(rest);
      i++;
    } else {
      result[key] = rest.replace(/^['"]|['"]$/g, '');
      i++;
    }
  }

  return result;
}

function parseTrigger(raw: string | string[] | Record<string, string | string[]>): SkillTrigger {
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('trigger must be an object');
  }
  const mode = raw['mode'] as SkillTriggerMode;
  const trigger: SkillTrigger = { mode };
  if (raw['intents']) {
    trigger.intents = Array.isArray(raw['intents']) ? raw['intents'] : [raw['intents']];
  }
  if (raw['keywords']) {
    trigger.keywords = Array.isArray(raw['keywords']) ? raw['keywords'] : [raw['keywords']];
  }
  return trigger;
}

export function parseSkillFile(filePath: string, content: string): SkillDefinition {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) {
    throw new Error(`Invalid frontmatter in ${filePath}: missing --- delimiters`);
  }

  const yaml = fmMatch[1];
  const body = fmMatch[2];
  const parsed = parseFrontmatter(yaml);

  const slug = parsed['slug'];
  if (!slug || typeof slug !== 'string' || slug === '') {
    throw new Error(`Missing required field: slug in ${filePath}`);
  }
  const name = parsed['name'];
  if (!name || typeof name !== 'string' || name === '') {
    throw new Error(`Missing required field: name in ${filePath}`);
  }
  const description = parsed['description'];
  if (!description || typeof description !== 'string' || description === '') {
    throw new Error(`Missing required field: description in ${filePath}`);
  }
  const rawTrigger = parsed['trigger'];
  if (!rawTrigger || typeof rawTrigger !== 'object' || Array.isArray(rawTrigger)) {
    throw new Error(`Missing required field: trigger in ${filePath}`);
  }
  const trigger = parseTrigger(rawTrigger);

  const rawPriority = parsed['priority'];
  const rawBudget = parsed['token_budget'];
  const rawVersion = parsed['version'];

  const requiresModules = parsed['requires_modules'];
  const conflictsWith = parsed['conflicts_with'];
  const locale = parsed['locale'];

  return {
    slug,
    name,
    description,
    type: (parsed['type'] as SkillType) ?? 'general',
    trigger,
    priority: rawPriority !== undefined ? Number(rawPriority) : 0,
    token_budget: rawBudget !== undefined ? Number(rawBudget) : 500,
    requires_modules: Array.isArray(requiresModules) ? requiresModules : [],
    conflicts_with: Array.isArray(conflictsWith) ? conflictsWith : [],
    locale: Array.isArray(locale) ? locale : ['en'],
    version: rawVersion !== undefined ? Number(rawVersion) : 1,
    body,
    source: 'platform',
  };
}

export function filterLocale(body: string, locale: string): string {
  const lines = body.split('\n');
  const kept: string[] = [];
  let suppress = false;

  for (const line of lines) {
    const headingLocaleMatch = line.match(/^(#{1,6}\s+.*)\[([a-z]{2})\]\s*$/);
    const headingPlain = !headingLocaleMatch && line.match(/^#{1,6}\s+/);

    if (headingLocaleMatch) {
      const tag = headingLocaleMatch[2];
      if (tag === locale) {
        suppress = false;
        // Strip the locale tag from the heading
        kept.push(line.replace(/\s*\[[a-z]{2}\]\s*$/, ''));
      } else {
        suppress = true;
      }
    } else if (headingPlain) {
      suppress = false;
      kept.push(line);
    } else {
      if (!suppress) {
        kept.push(line);
      }
    }
  }

  return kept.join('\n').trimEnd();
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

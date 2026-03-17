import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSkillFile } from './parser.js';
import type { SkillDefinition, SkillType } from './types.js';

const REGISTRY = new Map<string, SkillDefinition>();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function _loadFromDirectory(dir: string): void {
  if (!existsSync(dir)) return;

  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  } catch {
    return;
  }

  for (const file of files) {
    const filePath = join(dir, file);
    try {
      const content = readFileSync(filePath, 'utf-8');
      const def = parseSkillFile(filePath, content);
      if (REGISTRY.has(def.slug)) {
        console.warn(`[skills] Duplicate slug "${def.slug}" in ${filePath} — skipping`);
        continue;
      }
      REGISTRY.set(def.slug, def);
    } catch (err) {
      console.warn(`[skills] Failed to parse ${filePath} — skipping:`, err);
    }
  }
}

// Load built-in skills from subdirectories at module init time
for (const type of ['general', 'sales', 'support', 'marketing'] as const) {
  _loadFromDirectory(join(__dirname, type));
}

export function getSkill(slug: string): SkillDefinition | undefined {
  return REGISTRY.get(slug);
}

export function getAllSkills(): SkillDefinition[] {
  return Array.from(REGISTRY.values());
}

export function getSkillsByType(type: SkillType): SkillDefinition[] {
  return Array.from(REGISTRY.values()).filter((s) => s.type === type);
}

/** For testing only — clears the registry so tests can re-register cleanly. */
export function _clearSkillRegistry(): void {
  REGISTRY.clear();
}

/** For testing only — registers a skill definition directly. */
export function _registerSkillForTesting(def: SkillDefinition): void {
  REGISTRY.set(def.slug, def);
}

import type { ArtifactType } from '@camello/shared/types';

// ---------------------------------------------------------------------------
// Archetype definition — consolidates prompts, tones, module slugs, and
// RAG bias into a single registry. Each type file self-registers on import.
// ---------------------------------------------------------------------------

export interface LocalizedText {
  en: string;
  es: string;
}

export interface ArchetypeRagBias {
  docTypes: string[];
  boost: number;
}

export interface ArchetypeDefinition {
  type: ArtifactType;
  prompts: LocalizedText | null;
  defaultTone: LocalizedText;
  moduleSlugs: string[];
  icon: string;
  color: string;
  ragBias: ArchetypeRagBias | null;
}

// ---------------------------------------------------------------------------
// In-memory registry — archetypes self-register on import.
// ---------------------------------------------------------------------------

const REGISTRY = new Map<string, ArchetypeDefinition>();

export function registerArchetype(def: ArchetypeDefinition): void {
  if (REGISTRY.has(def.type)) {
    throw new Error(`Archetype "${def.type}" already registered`);
  }
  REGISTRY.set(def.type, def);
}

export function getArchetype(type: string): ArchetypeDefinition | undefined {
  return REGISTRY.get(type);
}

export function getAllArchetypes(): ArchetypeDefinition[] {
  return Array.from(REGISTRY.values());
}

/** For testing only — clears the registry so tests can re-register cleanly. */
export function _clearArchetypeRegistry(): void {
  REGISTRY.clear();
}

// ---------------------------------------------------------------------------
// Computed views (backward-compatible with old maps)
// ---------------------------------------------------------------------------

export function getArchetypePrompts(): Partial<Record<ArtifactType, LocalizedText>> {
  const out: Partial<Record<ArtifactType, LocalizedText>> = {};
  for (const def of REGISTRY.values()) {
    if (def.prompts) out[def.type] = def.prompts;
  }
  return out;
}

export function getArchetypeDefaultTones(): Record<ArtifactType, LocalizedText> {
  const out = {} as Record<ArtifactType, LocalizedText>;
  for (const def of REGISTRY.values()) {
    out[def.type] = def.defaultTone;
  }
  return out;
}

export function getArchetypeModuleSlugs(): Record<ArtifactType, string[]> {
  const out = {} as Record<ArtifactType, string[]>;
  for (const def of REGISTRY.values()) {
    out[def.type] = def.moduleSlugs;
  }
  return out;
}

import type { z } from 'zod';
import type { ModuleCategory, ModuleExecutionContext } from '@camello/shared/types';

// ---------------------------------------------------------------------------
// ModuleDefinition lives in @camello/ai (not shared) because it carries
// Zod runtime schemas. Shared types stay type-only.
// ---------------------------------------------------------------------------

export type RiskTier = 'low' | 'medium' | 'high';

export interface ModuleDefinition<TInput = unknown, TOutput = unknown> {
  slug: string;
  name: string;
  description: string;
  category: ModuleCategory;
  /** Determines default autonomy at bind time: low/medium → fully_autonomous, high → draft_and_approve */
  riskTier: RiskTier;
  inputSchema: z.ZodType<TInput, z.ZodTypeDef, unknown>;
  outputSchema: z.ZodType<TOutput, z.ZodTypeDef, unknown>;
  execute: (input: TInput, ctx: ModuleExecutionContext) => Promise<TOutput>;
  formatForLLM: (output: TOutput) => string;
  quickAction?: {
    en: { label: string; message: string };
    es: { label: string; message: string };
  };
}

// ---------------------------------------------------------------------------
// In-memory registry — modules self-register on import.
// ---------------------------------------------------------------------------

const REGISTRY = new Map<string, ModuleDefinition>();

export function registerModule(def: ModuleDefinition): void {
  if (REGISTRY.has(def.slug)) {
    throw new Error(`Module "${def.slug}" already registered`);
  }
  REGISTRY.set(def.slug, def);
}

export function getModule(slug: string): ModuleDefinition | undefined {
  return REGISTRY.get(slug);
}

export function getAllModules(): ModuleDefinition[] {
  return Array.from(REGISTRY.values());
}

export function getRegisteredSlugs(): string[] {
  return Array.from(REGISTRY.keys());
}

/**
 * Resolve quick actions for a list of module slugs.
 * Order is deterministic: follows the slug array order passed in.
 * Callers should pass slugs in a stable order (e.g. sorted alphabetically).
 */
export function getQuickActionsForModules(
  slugs: string[],
  locale: 'en' | 'es',
): Array<{ label: string; message: string }> {
  return slugs
    .map((slug) => getModule(slug)?.quickAction?.[locale])
    .filter((qa): qa is { label: string; message: string } => !!qa);
}

/** For testing only — clears the registry so tests can re-register cleanly. */
export function _clearRegistry(): void {
  REGISTRY.clear();
}

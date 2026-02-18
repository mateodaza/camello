import type { z } from 'zod';
import type { ModuleCategory, ModuleExecutionContext } from '@camello/shared/types';

// ---------------------------------------------------------------------------
// ModuleDefinition lives in @camello/ai (not shared) because it carries
// Zod runtime schemas. Shared types stay type-only.
// ---------------------------------------------------------------------------

export interface ModuleDefinition<TInput = unknown, TOutput = unknown> {
  slug: string;
  name: string;
  description: string;
  category: ModuleCategory;
  inputSchema: z.ZodType<TInput, z.ZodTypeDef, unknown>;
  outputSchema: z.ZodType<TOutput, z.ZodTypeDef, unknown>;
  execute: (input: TInput, ctx: ModuleExecutionContext) => Promise<TOutput>;
  formatForLLM: (output: TOutput) => string;
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

/** For testing only — clears the registry so tests can re-register cleanly. */
export function _clearRegistry(): void {
  REGISTRY.clear();
}

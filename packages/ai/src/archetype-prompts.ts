import type { ArtifactType } from '@camello/shared/types';
import {
  getArchetypePrompts,
  getArchetypeDefaultTones,
  getArchetypeModuleSlugs,
  type LocalizedText,
} from './archetype-registry.js';

// Ensure all archetypes are registered before computing views
import './archetypes/index.js';

/**
 * Per-archetype behavioral frameworks injected into the system prompt.
 * Custom type is omitted — it relies solely on user-provided instructions.
 *
 * Backward-compatible re-export: computed from archetype registry.
 */
export const ARCHETYPE_PROMPTS: Partial<Record<ArtifactType, LocalizedText>> =
  getArchetypePrompts();

/**
 * Default tone descriptions per archetype (empty for custom).
 */
export const ARCHETYPE_DEFAULT_TONES: Record<ArtifactType, LocalizedText> =
  getArchetypeDefaultTones();

/**
 * Module slugs to auto-bind when creating an artifact of this type.
 */
export const ARCHETYPE_MODULE_SLUGS: Record<ArtifactType, string[]> =
  getArchetypeModuleSlugs();

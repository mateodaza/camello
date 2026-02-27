/**
 * Shared personality field validator used by artifact.create, artifact.update,
 * and onboarding.setupArtifact to enforce identical bounds on prompt-critical fields.
 *
 * quickActions validation removed — quick actions are now derived from bound
 * modules at runtime (see getQuickActionsForModules). Migration 0011 backfilled
 * all legacy artifacts. personality.quickActions JSONB field is ignored.
 */
export function validatePersonality(val: Record<string, unknown>): boolean {
  // instructions: must be string <= 2000 chars if present
  if (val.instructions !== undefined) {
    if (typeof val.instructions !== 'string' || val.instructions.length > 2000) return false;
  }
  return true;
}

export const PERSONALITY_VALIDATION_MESSAGE =
  'instructions <= 2000 chars';

/**
 * Shared personality field validator used by artifact.create, artifact.update,
 * and onboarding.setupArtifact to enforce identical bounds on prompt-critical fields.
 */
export function validatePersonality(val: Record<string, unknown>): boolean {
  // instructions: must be string ≤ 2000 chars if present
  if (val.instructions !== undefined) {
    if (typeof val.instructions !== 'string' || val.instructions.length > 2000) return false;
  }
  // quickActions: max 4 items, label ≤ 40, message ≤ 200
  if (val.quickActions) {
    const qa = val.quickActions;
    if (!Array.isArray(qa) || qa.length > 4) return false;
    return qa.every((item: unknown) => {
      if (typeof item !== 'object' || item === null) return false;
      const { label, message } = item as Record<string, unknown>;
      return typeof label === 'string' && label.length <= 40
          && typeof message === 'string' && message.length <= 200;
    });
  }
  return true;
}

export const PERSONALITY_VALIDATION_MESSAGE =
  'instructions ≤ 2000 chars; quickActions: max 4 items, label ≤ 40, message ≤ 200';

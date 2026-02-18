import { LEARNING_CONFIDENCE, REJECTION_REASONS } from '@camello/shared/constants';
import type { RejectionReason } from '@camello/shared/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RejectionInput {
  tenantId: string;
  artifactId: string;
  conversationId: string;
  moduleExecutionId: string;
  reason: RejectionReason;
  freeText?: string;
  /** The module name/slug that was rejected, used to build the learning content */
  moduleName: string;
  /** Summary of what the module was going to do */
  actionSummary: string;
}

export interface LearningRecord {
  tenantId: string;
  artifactId: string;
  type: 'preference' | 'correction' | 'pattern' | 'objection';
  content: string;
  confidence: number;
  sourceConversationId: string;
  embedding: number[];
}

export interface ExistingLearning {
  id: string;
  content: string;
  confidence: number;
  embedding: number[];
}

// Dependency injection callbacks
export type EmbedFn = (text: string) => Promise<number[]>;
export type FindSimilarLearningFn = (
  artifactId: string,
  embedding: number[],
  threshold: number,
) => Promise<ExistingLearning | null>;
export type InsertLearningFn = (record: LearningRecord) => Promise<string>;
export type UpdateLearningConfidenceFn = (id: string, newConfidence: number) => Promise<void>;

export interface FeedbackDeps {
  embed: EmbedFn;
  findSimilarLearning: FindSimilarLearningFn;
  insertLearning: InsertLearningFn;
  updateConfidence: UpdateLearningConfidenceFn;
}

// ---------------------------------------------------------------------------
// Rejection → Learning pipeline
// ---------------------------------------------------------------------------

/**
 * Process a module execution rejection into a structured learning.
 *
 * 1. Map rejection reason to learning type
 * 2. Build learning content from rejection context
 * 3. Generate embedding for similarity matching
 * 4. Check for existing similar learning (same artifact, high cosine sim)
 *    - If found: increment confidence (reinforcement)
 *    - If not: create new learning with initial confidence
 *
 * @see TECHNICAL_SPEC Section 10 — Self-Improving Feedback Loop
 */
export async function processRejection(
  input: RejectionInput,
  deps: FeedbackDeps,
): Promise<{ learningId: string; isReinforcement: boolean }> {
  const { reason, freeText, moduleName, actionSummary, artifactId, conversationId, tenantId } = input;

  // 1. Map reason to learning type
  const learningType = REASON_TO_LEARNING_TYPE[reason];

  // 2. Build learning content
  const content = buildLearningContent(reason, moduleName, actionSummary, freeText);

  // 3. Compute initial confidence
  const initialConfidence = reason === 'policy_violation'
    ? LEARNING_CONFIDENCE.policy_violation_initial
    : LEARNING_CONFIDENCE.initial;

  // 4. Generate embedding for the learning
  const embedding = await deps.embed(content);

  // 5. Check for existing similar learning (reinforcement vs new)
  const existing = await deps.findSimilarLearning(artifactId, embedding, 0.9);

  if (existing) {
    // Reinforcement: bump confidence
    const newConfidence = Math.min(
      existing.confidence + LEARNING_CONFIDENCE.increment_per_rejection,
      LEARNING_CONFIDENCE.max,
    );
    await deps.updateConfidence(existing.id, newConfidence);
    return { learningId: existing.id, isReinforcement: true };
  }

  // New learning
  const learningId = await deps.insertLearning({
    tenantId,
    artifactId,
    type: learningType,
    content,
    confidence: initialConfidence,
    sourceConversationId: conversationId,
    embedding,
  });

  return { learningId, isReinforcement: false };
}

// ---------------------------------------------------------------------------
// Confidence decay (called by Trigger.dev monthly job)
// ---------------------------------------------------------------------------

export interface Decayablelearning {
  id: string;
  confidence: number;
}

export type GetActiveLearningsFn = () => Promise<Decayablelearning[]>;
export type ArchiveLearningFn = (id: string) => Promise<void>;

/**
 * Apply monthly confidence decay to all active learnings.
 * Learnings below archive_threshold are archived (excluded from RAG, kept for audit).
 *
 * Intended to be called by a Trigger.dev cron job (monthly).
 */
export async function applyConfidenceDecay(
  getActiveLearnings: GetActiveLearningsFn,
  updateConfidence: UpdateLearningConfidenceFn,
  archiveLearning: ArchiveLearningFn,
): Promise<{ decayed: number; archived: number }> {
  const learnings = await getActiveLearnings();
  let decayed = 0;
  let archived = 0;

  for (const learning of learnings) {
    const newConfidence = Math.max(0, learning.confidence - LEARNING_CONFIDENCE.monthly_decay);

    if (newConfidence < LEARNING_CONFIDENCE.archive_threshold) {
      await archiveLearning(learning.id);
      archived++;
    } else {
      await updateConfidence(learning.id, newConfidence);
      decayed++;
    }
  }

  return { decayed, archived };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REASON_TO_LEARNING_TYPE: Record<RejectionReason, LearningRecord['type']> = {
  false_positive: 'correction',
  wrong_target: 'correction',
  bad_timing: 'pattern',
  incorrect_data: 'correction',
  policy_violation: 'objection',
};

function buildLearningContent(
  reason: RejectionReason,
  moduleName: string,
  actionSummary: string,
  freeText?: string,
): string {
  const base = `REJECTED: Module "${moduleName}" proposed "${actionSummary}". Reason: ${reason}.`;
  return freeText ? `${base} Details: ${freeText}` : base;
}

/** Validate that a reason is in the allowed taxonomy */
export function isValidRejectionReason(reason: string): reason is RejectionReason {
  return (REJECTION_REASONS as readonly string[]).includes(reason);
}

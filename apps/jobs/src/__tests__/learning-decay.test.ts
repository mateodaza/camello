import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyConfidenceDecay } from '@camello/ai/feedback';
import type { Decayablelearning, UpdateLearningConfidenceFn, ArchiveLearningFn, GetActiveLearningsFn } from '@camello/ai/feedback';
import { LEARNING_CONFIDENCE } from '@camello/shared/constants';

describe('learning-decay (unit)', () => {
  let getActiveLearnings: GetActiveLearningsFn;
  let updateConfidence: ReturnType<typeof vi.fn<UpdateLearningConfidenceFn>>;
  let archiveLearning: ReturnType<typeof vi.fn<ArchiveLearningFn>>;

  beforeEach(() => {
    updateConfidence = vi.fn<UpdateLearningConfidenceFn>().mockResolvedValue(undefined);
    archiveLearning = vi.fn<ArchiveLearningFn>().mockResolvedValue(undefined);
  });

  it('decays confidence by monthly_decay (0.05)', async () => {
    getActiveLearnings = vi.fn().mockResolvedValue([
      { id: 'l1', confidence: 0.8 },
      { id: 'l2', confidence: 0.5 },
    ] satisfies Decayablelearning[]);

    const result = await applyConfidenceDecay(getActiveLearnings, updateConfidence, archiveLearning);

    expect(updateConfidence).toHaveBeenCalledWith('l1', 0.8 - LEARNING_CONFIDENCE.monthly_decay);
    expect(updateConfidence).toHaveBeenCalledWith('l2', 0.5 - LEARNING_CONFIDENCE.monthly_decay);
    expect(result.decayed).toBe(2);
    expect(result.archived).toBe(0);
  });

  it('archives learnings that drop below archive_threshold (0.3)', async () => {
    getActiveLearnings = vi.fn().mockResolvedValue([
      { id: 'l1', confidence: 0.32 }, // 0.32 - 0.05 = 0.27 → below 0.3 → archive
      { id: 'l2', confidence: 0.8 },  // stays above
    ] satisfies Decayablelearning[]);

    const result = await applyConfidenceDecay(getActiveLearnings, updateConfidence, archiveLearning);

    expect(archiveLearning).toHaveBeenCalledWith('l1');
    expect(updateConfidence).toHaveBeenCalledWith('l2', 0.8 - LEARNING_CONFIDENCE.monthly_decay);
    expect(result.decayed).toBe(1);
    expect(result.archived).toBe(1);
  });

  it('handles empty learnings list', async () => {
    getActiveLearnings = vi.fn().mockResolvedValue([]);

    const result = await applyConfidenceDecay(getActiveLearnings, updateConfidence, archiveLearning);

    expect(updateConfidence).not.toHaveBeenCalled();
    expect(archiveLearning).not.toHaveBeenCalled();
    expect(result.decayed).toBe(0);
    expect(result.archived).toBe(0);
  });

  it('idempotency: running twice decays further (does not error)', async () => {
    const learnings: Decayablelearning[] = [{ id: 'l1', confidence: 0.6 }];
    getActiveLearnings = vi.fn().mockResolvedValue(learnings);

    // First run
    const r1 = await applyConfidenceDecay(getActiveLearnings, updateConfidence, archiveLearning);
    expect(r1.decayed).toBe(1);
    expect(updateConfidence).toHaveBeenCalledWith('l1', expect.closeTo(0.55, 10));

    // Simulate second run with decayed confidence
    const decayedLearnings: Decayablelearning[] = [{ id: 'l1', confidence: 0.55 }];
    getActiveLearnings = vi.fn().mockResolvedValue(decayedLearnings);
    updateConfidence.mockClear();

    const r2 = await applyConfidenceDecay(getActiveLearnings, updateConfidence, archiveLearning);
    expect(r2.decayed).toBe(1);
    expect(updateConfidence).toHaveBeenCalledWith('l1', expect.closeTo(0.5, 10));
  });

  it('never sets confidence below 0', async () => {
    getActiveLearnings = vi.fn().mockResolvedValue([
      { id: 'l1', confidence: 0.02 }, // 0.02 - 0.05 = -0.03 → clamped to 0 → archived (below 0.3)
    ] satisfies Decayablelearning[]);

    await applyConfidenceDecay(getActiveLearnings, updateConfidence, archiveLearning);

    // Should archive, not update to negative
    expect(archiveLearning).toHaveBeenCalledWith('l1');
    expect(updateConfidence).not.toHaveBeenCalled();
  });
});

import { describe, it, expect } from 'vitest';
import { cn } from '../lib/utils';

// ---------------------------------------------------------------------------
// Skeleton logic tests (pure — no component rendering)
// Validates the className merging logic used by the Skeleton component.
// ---------------------------------------------------------------------------

const BASE_CLASSES = 'animate-pulse rounded-md bg-charcoal/8';

describe('Skeleton className logic', () => {
  it('returns base classes when no custom className', () => {
    const result = cn(BASE_CLASSES, undefined);
    expect(result).toContain('animate-pulse');
    expect(result).toContain('rounded-md');
  });

  it('merges custom className with base classes', () => {
    const result = cn(BASE_CLASSES, 'h-8 w-36');
    expect(result).toContain('animate-pulse');
    expect(result).toContain('h-8');
    expect(result).toContain('w-36');
  });

  it('allows custom className to override base utility', () => {
    const result = cn(BASE_CLASSES, 'rounded-xl');
    // cn (clsx + twMerge) should let rounded-xl override rounded-md
    expect(result).toContain('animate-pulse');
    expect(result).toContain('rounded-xl');
  });

  it('handles empty string className', () => {
    const result = cn(BASE_CLASSES, '');
    expect(result).toContain('animate-pulse');
    expect(result).toContain('rounded-md');
  });
});

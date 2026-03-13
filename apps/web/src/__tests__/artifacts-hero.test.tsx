import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, className }: {
    href: string; children: React.ReactNode; className?: string;
  }) => React.createElement('a', { href, className }, children),
}));

vi.mock('lucide-react', () =>
  new Proxy({} as Record<string, unknown>, {
    get: (_t, prop: string) =>
      ({ className }: { className?: string }) =>
        React.createElement('svg', { 'data-icon': prop, className }),
  }),
);

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

vi.mock('@/components/test-chat-panel', () => ({
  TestChatPanel: () => null,
}));

// tRPC mock helpers — buildNestedProxy pattern (same as analytics-page.test.tsx)
const mockQueryResult = (data: unknown, overrides?: Partial<{ isLoading: boolean; isError: boolean; error: unknown }>) => ({
  data,
  isLoading: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
  ...overrides,
});

const queryMocks = new Map<string, ReturnType<typeof mockQueryResult>>();
// Captures the first argument passed to each useQuery call, keyed by dot-notation path.
const lastQueryArgs = new Map<string, unknown>();

function buildNestedProxy(target: Record<string, unknown>, path: string[] = []): unknown {
  return new Proxy(target, {
    get(_, prop: string) {
      if (prop === 'useQuery') {
        const key = path.join('.');
        return (args: unknown) => {
          lastQueryArgs.set(key, args);
          return queryMocks.get(key) ?? mockQueryResult(undefined, { isLoading: true });
        };
      }
      if (prop === 'useMutation') {
        return () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, isError: false, error: null });
      }
      if (prop === 'useUtils') {
        return () => new Proxy({}, { get: () => new Proxy({}, { get: () => new Proxy({}, { get: () => vi.fn() }) }) });
      }
      return buildNestedProxy({}, [...path, prop]);
    },
  });
}

vi.mock('@/lib/trpc', () => ({
  trpc: buildNestedProxy({}, []),
}));

import ArtifactsPage from '../app/dashboard/artifacts/page';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NC-255 — artifacts page: sales card as hero', () => {
  beforeEach(() => {
    queryMocks.clear();
    lastQueryArgs.clear();
    // Default: no artifacts, artifact.list returns empty array
    queryMocks.set('artifact.list', mockQueryResult([]));
  });

  // Test 1 — Sales card renders as full-width hero above the disabled 3-col grid
  it('sales card renders as full-width hero above the disabled 3-col grid', () => {
    // No artifacts — hero renders without stat strip or CTAs.
    render(React.createElement(ArtifactsPage));

    const salesHero = document.querySelector('[data-testid="sales-hero"]')!;
    const disabledGrid = document.querySelector('[data-testid="disabled-grid"]')!;

    expect(salesHero).toBeTruthy();
    expect(disabledGrid).toBeTruthy();

    // Hero and disabled grid share the same parent — they are siblings, not nested.
    // Fails if sales card is still inside the old 2-col grid wrapper.
    expect(salesHero.parentElement).toBe(disabledGrid.parentElement);

    // DOM order: hero precedes the disabled grid.
    const children = Array.from(salesHero.parentElement!.children);
    expect(children.indexOf(salesHero)).toBeLessThan(children.indexOf(disabledGrid));

    // All 3 comingSoon badges live inside the disabled grid, not the hero.
    const badges = screen.getAllByText('comingSoon');
    expect(badges).toHaveLength(3);
    badges.forEach((badge) => {
      expect(disabledGrid.contains(badge)).toBe(true);
    });

    // The sales card title is not inside the disabled grid.
    const salesTitle = screen.getByText('salesName');
    expect(disabledGrid.contains(salesTitle)).toBe(false);
  });

  // Test 2 — Stat strip shows artifact-scoped conversation count and "yes/no" active text.
  // Verifies that the component passes artifactId to analytics.overview so only the
  // sales agent's conversations are counted, not all tenant conversations.
  it('stat strip shows artifact-scoped conversation count and active text', () => {
    queryMocks.set('artifact.list', mockQueryResult([
      { id: 'a1', type: 'sales', isActive: true, name: 'Sales Agent', createdAt: new Date(), personality: {} },
    ]));
    // Mock returns 3 active + 5 resolved + 1 escalated = 9 conversations.
    queryMocks.set('analytics.overview', mockQueryResult({
      conversations: { active: 3, resolved: 5, escalated: 1 },
      cost: { totalCost: 0, totalTokensIn: 0, totalTokensOut: 0, totalInteractions: 0 },
    }));

    render(React.createElement(ArtifactsPage));

    // Verify artifactId: 'a1' is passed to analytics.overview — this assertion fails
    // if the component omits artifactId and falls back to tenant-wide stats.
    expect(lastQueryArgs.get('analytics.overview')).toMatchObject({
      from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      to: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      artifactId: 'a1',
    });

    // Locate the stat strip by data-testid — scopes all queries to the strip.
    const strip = document.querySelector('[data-testid="stat-strip"]') as HTMLElement;
    expect(strip).toBeTruthy();

    // Label is in an isolated <span> so getByText('salesCardConversationsThisWeek') is exact.
    expect(within(strip).getByText('salesCardConversationsThisWeek')).toBeInTheDocument();

    // Total = active(3) + resolved(5) + escalated(1) = 9; value is in its own <span>
    expect(within(strip).getByText('9')).toBeInTheDocument();

    // Active stat renders as plain text "salesCardActiveYes" (isActive=true, identity mock)
    // NOT as a Badge component — verifies the "yes/no" plain-text requirement.
    expect(within(strip).getByText('salesCardActiveYes')).toBeInTheDocument();
  });
});

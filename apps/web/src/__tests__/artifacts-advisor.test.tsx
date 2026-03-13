import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks (same pattern as artifacts-hero.test.tsx)
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

const mockQueryResult = (data: unknown, overrides?: Partial<{ isLoading: boolean; isError: boolean; error: unknown }>) => ({
  data,
  isLoading: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
  ...overrides,
});

const queryMocks = new Map<string, ReturnType<typeof mockQueryResult>>();

function buildNestedProxy(target: Record<string, unknown>, path: string[] = []): unknown {
  return new Proxy(target, {
    get(_, prop: string) {
      if (prop === 'useQuery') {
        const key = path.join('.');
        return () => queryMocks.get(key) ?? mockQueryResult(undefined, { isLoading: true });
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

describe('NC-268 — artifacts page: advisor card', () => {
  beforeEach(() => {
    queryMocks.clear();
    queryMocks.set('artifact.list', mockQueryResult([]));
  });

  it('Test 3: advisor card renders when artifact.list returns an advisor artifact', () => {
    queryMocks.set('artifact.list', mockQueryResult([
      {
        id: 'adv1',
        type: 'advisor',
        isActive: true,
        name: 'Acme Advisor',
        createdAt: new Date(),
        personality: {},
      },
    ]));

    render(React.createElement(ArtifactsPage));

    const advisorCard = document.querySelector('[data-testid="advisor-card"]');
    expect(advisorCard).toBeTruthy();

    // The translated key 'chatWithAdvisor' should appear in the card
    expect(screen.getByText('chatWithAdvisor')).toBeInTheDocument();
    // The advisor name should be shown
    expect(screen.getByText('Acme Advisor')).toBeInTheDocument();
  });
});

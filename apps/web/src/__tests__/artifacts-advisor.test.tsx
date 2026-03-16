import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks (same pattern as artifacts-hero.test.tsx)
// ---------------------------------------------------------------------------

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(),
}));

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

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

import ArtifactsPage from '../app/dashboard/artifacts/page';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// NC-294: /dashboard/artifacts now redirects to /dashboard/agents (plural).
// The advisor card is now rendered inside the /dashboard/agents page.
describe('NC-276/NC-294 — artifacts page redirects (advisor flow moved to /dashboard/agents)', () => {
  beforeEach(() => {
    queryMocks.clear();
    redirectMock.mockReset();
  });

  it('artifacts/page.tsx redirects to /dashboard/agents', () => {
    redirectMock.mockImplementation(() => { throw new Error('redirect'); });
    try {
      render(React.createElement(ArtifactsPage as unknown as React.FC));
    } catch {
      // redirect() throws — expected
    }
    expect(redirectMock).toHaveBeenCalledWith('/dashboard/agents');
  });
});

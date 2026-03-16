import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
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

vi.mock('lucide-react', () => ({}));

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

const { redirectMock } = vi.hoisted(() => ({ redirectMock: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

import ArtifactsPage from '../app/dashboard/artifacts/page';
import enMessages from '../../messages/en.json';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// NC-294: /dashboard/artifacts now redirects to /dashboard/agents (plural).
// The hero card and stat strip functionality moved to the single-page agent view.
describe('NC-276/NC-294 — artifacts page redirects to /dashboard/agents', () => {
  beforeEach(() => {
    queryMocks.clear();
    lastQueryArgs.clear();
    redirectMock.mockReset();
  });

  // Test 1 — artifacts/page.tsx redirects to /dashboard/agents
  it('artifacts/page.tsx calls redirect("/dashboard/agents")', () => {
    redirectMock.mockImplementation(() => { throw new Error('redirect'); });
    try {
      render(React.createElement(ArtifactsPage as unknown as React.FC));
    } catch {
      // redirect() throws — expected
    }
    expect(redirectMock).toHaveBeenCalledWith('/dashboard/agents');
  });

  // Test 2 — i18n keys for artifacts.salesName still present for backward compatibility
  it('en.json artifacts.salesName key is preserved', () => {
    const en = enMessages as unknown as Record<string, Record<string, string>>;
    expect(en['artifacts']['salesName']).toBe('Sales Agent');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import enMessages from '../../messages/en.json';
import esMessages from '../../messages/es.json';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { createMutateSpy, listQuerySpy, redirectMock } = vi.hoisted(() => ({
  createMutateSpy: vi.fn(),
  listQuerySpy: vi.fn(),
  redirectMock: vi.fn(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    artifact: {
      list: {
        useQuery: listQuerySpy,
      },
      create: {
        useMutation: vi.fn(() => ({ mutate: createMutateSpy, isPending: false })),
      },
      update: {
        useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
      },
      listModules: {
        useQuery: vi.fn(() => ({ data: [], isLoading: false })),
      },
    },
    analytics: {
      overview: {
        useQuery: vi.fn(() => ({ data: undefined, isLoading: false, isError: false })),
      },
    },
    useUtils: vi.fn(() => ({
      artifact: { list: { invalidate: vi.fn() } },
    })),
  },
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

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

import ArtifactsPage from '../app/dashboard/artifacts/page';

// Default: no artifacts; each test that needs artifacts overrides per-test.
beforeEach(() => {
  vi.clearAllMocks();
  listQuerySpy.mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// NC-294: /dashboard/artifacts now redirects to /dashboard/agents (plural).
// The disabled-archetypes grid, sales hero, and advisor card live in the new /dashboard/agents page.
describe('NC-276/NC-294 — artifacts page redirects + i18n keys preserved', () => {

  // Test 1: Redirect — artifacts/page.tsx calls redirect('/dashboard/agents')
  it('artifacts/page.tsx redirects to /dashboard/agents', () => {
    redirectMock.mockImplementation(() => { throw new Error('redirect'); });
    try {
      render(React.createElement(ArtifactsPage as unknown as React.FC));
    } catch {
      // redirect() throws in Next.js server components — expected
    }
    expect(redirectMock).toHaveBeenCalledWith('/dashboard/agents');
  });

  // Test 2: i18n key validation — comingSoon key retained for backward compatibility.
  it('en.json contains artifacts.comingSoon', () => {
    const en = enMessages as unknown as Record<string, Record<string, string>>;
    expect(en['artifacts']['comingSoon']).toBe('Coming soon');
  });

  // Test 3: i18n key validation — es.json comingSoon key retained.
  it('es.json contains artifacts.comingSoon', () => {
    const es = esMessages as unknown as Record<string, Record<string, string>>;
    expect(es['artifacts']['comingSoon']).toBe('Próximamente');
  });

  // Test 4: i18n key validation — new agent namespace has all required NC-276 keys.
  it('en.json and es.json contain all required agent namespace keys (NC-276)', () => {
    const en = enMessages as unknown as Record<string, Record<string, string>>;
    const es = esMessages as unknown as Record<string, Record<string, string>>;
    const requiredKeys = [
      'agentHeader', 'agentIdentity', 'agentPersonality', 'agentModules',
      'agentApprovals', 'agentPerformance', 'agentSalesActivity', 'agentAdvanced',
      'agentEmpty', 'agentCreate',
    ];
    for (const key of requiredKeys) {
      expect(en['agent'][key]).toBeTruthy();
      expect(es['agent'][key]).toBeTruthy();
    }
  });
});

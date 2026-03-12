import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React, { createElement } from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`;
    return key;
  },
  useLocale: () => 'en',
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'test-artifact-id' }),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/dashboard/analytics',
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [k: string]: unknown }) =>
    createElement('a', { href, ...props }, children),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

// tRPC mock helpers
const mockQueryResult = (data: unknown, overrides?: Partial<{ isLoading: boolean; isError: boolean; error: unknown }>) => ({
  data,
  isLoading: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
  ...overrides,
});

const queryMocks = new Map<string, ReturnType<typeof mockQueryResult>>();

function setQueryMock(path: string, data: unknown, overrides?: Parameters<typeof mockQueryResult>[1]) {
  queryMocks.set(path, mockQueryResult(data, overrides));
}

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const overviewData = {
  conversations: { active: 5, resolved: 10, escalated: 2 },
  cost: null,
};

const artifactListData = [
  { id: 'agent-1', name: 'My Sales Agent', type: 'sales', isActive: true },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AnalyticsPage', () => {
  beforeEach(() => {
    queryMocks.clear();
  });

  it('does not render "Recent Interactions" or "Billing Periods" sections', async () => {
    setQueryMock('analytics.overview', overviewData);
    setQueryMock('artifact.list', artifactListData);
    setQueryMock('analytics.recentLogs', []);

    const mod = await import('@/app/dashboard/analytics/page');
    render(createElement(mod.default));

    // Sections C and D are removed — their heading keys must not appear
    expect(screen.queryByText('recentInteractions')).toBeNull();
    expect(screen.queryByText('billingPeriods')).toBeNull();
  });

  it('renders Daily Performance section heading and column headers when artifact selected', async () => {
    setQueryMock('analytics.overview', overviewData);
    setQueryMock('artifact.list', artifactListData);
    setQueryMock('analytics.recentLogs', []);
    setQueryMock('analytics.artifactMetrics', [
      {
        id: 'row-1',
        metricDate: '2026-03-01',
        handoffsIn: 3,
        handoffsOut: 1,
        resolutionsCount: 2,
        avgLatencyMs: '450',
        llmCostUsd: '0.001',
      },
    ]);

    const mod = await import('@/app/dashboard/analytics/page');
    render(createElement(mod.default));

    // Select an artifact to reveal the metrics table
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'agent-1' } });

    // Section B heading uses the new key
    expect(screen.getByText('dailyPerformance')).toBeInTheDocument();

    // Column headers use updated keys (translation mock returns key as-is)
    expect(screen.getByText('columnHandoffsIn')).toBeInTheDocument();
    expect(screen.getByText('columnHandoffsOut')).toBeInTheDocument();
    expect(screen.getByText('columnResolutions')).toBeInTheDocument();
    expect(screen.getByText('columnAvgLatency')).toBeInTheDocument();
    expect(screen.getByText('columnLLMCost')).toBeInTheDocument();
  });
});

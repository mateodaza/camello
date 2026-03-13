import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React, { createElement } from 'react';
import { nDaysAgoStr, localDateStr } from '@/lib/format';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const tFn = (key: string, params?: Record<string, unknown>): string => {
      if (params) return `${key}:${JSON.stringify(params)}`;
      return key;
    };
    return Object.assign(tFn, {
      rich: (key: string, params?: Record<string, unknown>): string => {
        if (params) return `${key}:${JSON.stringify(params)}`;
        return key;
      },
    });
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

  it('clicking 7d preset sets correct full date range', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-12'));

    // Compute expected values AFTER the fake clock is set, using the same
    // local-time functions as the implementation. This makes the test
    // timezone-agnostic: both sides call local getters under the same fake clock.
    const expectedTo   = localDateStr();   // local "today" under fake time
    const expectedFrom = nDaysAgoStr(7);   // 7 local days before that

    setQueryMock('analytics.overview', overviewData);
    setQueryMock('artifact.list', artifactListData);
    setQueryMock('analytics.recentLogs', []);

    const mod = await import('@/app/dashboard/analytics/page');
    render(createElement(mod.default));

    // On mount the 'to' input shows expectedTo (local today).
    // Mutate it to a non-today value to prove the preset will reset it.
    const toInput = screen.getByDisplayValue(expectedTo);
    fireEvent.change(toInput, { target: { value: '2025-01-01' } });

    // Click the 7d pill (translation mock returns key as-is → 'preset7d')
    fireEvent.click(screen.getByRole('button', { name: 'preset7d' }));

    // Preset must update BOTH ends of the range
    expect(screen.getByDisplayValue(expectedFrom)).toBeInTheDocument(); // from = 7 days ago
    expect(screen.getByDisplayValue(expectedTo)).toBeInTheDocument();   // to = today (reset by preset)

    vi.useRealTimers();
  });

  it('auto-selects the agent when exactly one agent exists', async () => {
    setQueryMock('analytics.overview', overviewData);
    setQueryMock('artifact.list', artifactListData); // 1 agent: { id: 'agent-1' }
    setQueryMock('analytics.recentLogs', []);

    const mod = await import('@/app/dashboard/analytics/page');
    render(createElement(mod.default));

    // useEffect fires after mount; waitFor handles the async state flush
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toHaveValue('agent-1');
    });
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
  });

  it('NC-253-T1: renders health bar segments and old StatCard tiles are absent', async () => {
    setQueryMock('analytics.overview', overviewData);
    setQueryMock('artifact.list', []);
    setQueryMock('analytics.recentLogs', []);

    const mod = await import('@/app/dashboard/analytics/page');
    render(createElement(mod.default));

    expect(screen.queryByText('totalConversations')).toBeNull();
    expect(screen.queryByText('active')).toBeNull();

    const resolved = screen.getByTestId('health-bar-resolved');
    expect(resolved.style.width).toContain('58.8'); // 10/17*100

    const active = screen.getByTestId('health-bar-active');
    expect(active.style.width).toContain('29.4'); // 5/17*100

    const escalated = screen.getByTestId('health-bar-escalated');
    expect(escalated.style.width).toContain('11.7'); // 2/17*100
  });

  it('NC-253-T2: technical columns hidden by default; toggle reveals them', async () => {
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

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'agent-1' } });

    expect(screen.queryByText('columnAvgLatency')).toBeNull();
    expect(screen.queryByText('columnLLMCost')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'showTechnicalDetails' }));

    expect(screen.getByText('columnAvgLatency')).toBeInTheDocument();
    expect(screen.getByText('columnLLMCost')).toBeInTheDocument();
  });

  it('NC-253-T3: intents heading precedes daily-performance heading in DOM', async () => {
    setQueryMock('analytics.overview', overviewData);
    setQueryMock('artifact.list', artifactListData);
    setQueryMock('analytics.recentLogs', [
      { intent: 'pricing', id: 'log-1' },
      { intent: 'pricing', id: 'log-2' },
      { intent: 'support', id: 'log-3' },
    ]);
    setQueryMock('analytics.artifactMetrics', []);

    const mod = await import('@/app/dashboard/analytics/page');
    render(createElement(mod.default));

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toHaveValue('agent-1');
    });

    const intentsHeading = screen.getByText('sectionIntents');
    const dailyHeading = screen.getByText('dailyPerformance');
    expect(
      intentsHeading.compareDocumentPosition(dailyHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

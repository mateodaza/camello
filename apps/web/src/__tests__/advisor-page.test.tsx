import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('lucide-react', () =>
  new Proxy({} as Record<string, unknown>, {
    get: (_t, prop: string) =>
      ({ className }: { className?: string }) =>
        React.createElement('svg', { 'data-icon': prop, className }),
  }),
);

vi.mock('@/components/test-chat-panel', () => ({
  TestChatPanel: () => React.createElement('div', { 'data-testid': 'test-chat-panel' }),
}));

vi.mock('@/components/agent-workspace/primitives/metrics-grid', () => ({
  MetricsGrid: () => React.createElement('div', { 'data-testid': 'metrics-grid' }),
}));

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: () => React.createElement('div', { 'data-testid': 'skeleton' }),
}));

vi.mock('@/components/query-error', () => ({
  QueryError: () => React.createElement('div', { 'data-testid': 'query-error' }),
}));

vi.mock('@/components/ui/tooltip', () => ({
  InfoTooltip: () => null,
}));

// ---------------------------------------------------------------------------
// tRPC mock setup
// ---------------------------------------------------------------------------

type QueryResult = {
  data: unknown;
  isLoading: boolean;
  isError: boolean;
  isSuccess: boolean;
  error: unknown;
  refetch: ReturnType<typeof vi.fn>;
};

const queryMocks = new Map<string, QueryResult>();

function mockQueryResult(data: unknown, overrides?: Partial<QueryResult>): QueryResult {
  return {
    data,
    isLoading: false,
    isError: false,
    isSuccess: data !== undefined,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  };
}

function buildNestedProxy(path: string[] = []): unknown {
  return new Proxy({} as Record<string, unknown>, {
    get(_, prop: string) {
      if (prop === 'useQuery') {
        const key = path.join('.');
        return () => queryMocks.get(key) ?? mockQueryResult(undefined, { isLoading: true });
      }
      if (prop === 'useMutation') {
        return () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null });
      }
      if (prop === 'useUtils') {
        return () => new Proxy({}, { get: () => new Proxy({}, { get: () => vi.fn() }) });
      }
      return buildNestedProxy([...path, prop]);
    },
  });
}

vi.mock('@/lib/trpc', () => ({
  trpc: buildNestedProxy([]),
}));

import AdvisorPage from '../app/dashboard/agents/advisor/page';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ADVISOR_ARTIFACT = { id: 'adv-1', name: 'Advisor', type: 'advisor', isActive: true };

const FIXTURE_SNAP = {
  activeConversations: 7,
  conversationTrend: 33,
  pendingPayments: { count: 2, byCurrency: [{ currency: 'USD', totalAmount: 500 }] },
  paidPayments: { count: 3, totalAmount: 900 },
  leadsByStage: { new: 5, qualifying: 3 },
  topKnowledgeGaps: [
    { intentType: 'pricing', sampleQuestion: 'How much does it cost?' },
  ],
  pendingApprovals: 1,
  recentExecutions: [],
};

beforeEach(() => {
  queryMocks.clear();
  vi.clearAllMocks();
  queryMocks.set('artifact.list', mockQueryResult([]));
  queryMocks.set('advisor.snapshot', mockQueryResult(undefined, { isLoading: true }));
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AdvisorPage', () => {
  it('renders lead breakdown stage counts from snapshot', () => {
    queryMocks.set('artifact.list', mockQueryResult([ADVISOR_ARTIFACT]));
    queryMocks.set('advisor.snapshot', mockQueryResult(FIXTURE_SNAP));

    render(React.createElement(AdvisorPage));

    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders unanswered questions section with sampleQuestion text', () => {
    queryMocks.set('artifact.list', mockQueryResult([ADVISOR_ARTIFACT]));
    queryMocks.set('advisor.snapshot', mockQueryResult(FIXTURE_SNAP));

    render(React.createElement(AdvisorPage));

    expect(screen.getByText('How much does it cost?')).toBeInTheDocument();
  });

  it('shows noGaps message when topKnowledgeGaps is empty', () => {
    queryMocks.set('artifact.list', mockQueryResult([ADVISOR_ARTIFACT]));
    queryMocks.set('advisor.snapshot', mockQueryResult({ ...FIXTURE_SNAP, topKnowledgeGaps: [] }));

    render(React.createElement(AdvisorPage));

    expect(screen.getByText('noGaps')).toBeInTheDocument();
  });

  it('both sections are collapsed by default', () => {
    queryMocks.set('artifact.list', mockQueryResult([ADVISOR_ARTIFACT]));
    queryMocks.set('advisor.snapshot', mockQueryResult(FIXTURE_SNAP));

    render(React.createElement(AdvisorPage));

    const detailsEls = document.querySelectorAll('details');
    expect(detailsEls.length).toBeGreaterThanOrEqual(2);
    detailsEls.forEach((el) => expect(el.hasAttribute('open')).toBe(false));
  });

  it('renders MetricsGrid skeleton when snap is loading', () => {
    queryMocks.set('artifact.list', mockQueryResult([ADVISOR_ARTIFACT]));
    queryMocks.set('advisor.snapshot', mockQueryResult(undefined, { isLoading: true, isError: false, error: null, refetch: vi.fn() }));

    render(React.createElement(AdvisorPage));

    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThanOrEqual(1);
  });
});

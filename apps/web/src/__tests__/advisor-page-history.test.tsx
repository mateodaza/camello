import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
  TestChatPanel: (props: Record<string, unknown>) =>
    React.createElement('div', {
      'data-testid': 'test-chat-panel',
      'data-conv-id': (props.initialConversationId as string | undefined) ?? '',
    }),
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

const CONV_ITEMS = [
  {
    id: 'conv-1',
    createdAt: new Date('2026-03-10T10:00:00Z'),
    firstUserMessagePreview: 'How are sales this week?',
    status: 'active',
    artifactId: 'adv-1',
    customerId: 'cust-1',
    channel: 'web_chat',
    updatedAt: new Date('2026-03-10T10:05:00Z'),
    customerName: 'Visitor',
    customerExternalId: null,
    isSandbox: true,
    lastMessagePreview: null,
    lastMessageRole: null,
    lastMessageAt: null,
  },
  {
    id: 'conv-2',
    createdAt: new Date('2026-03-08T14:00:00Z'),
    firstUserMessagePreview: null,
    status: 'active',
    artifactId: 'adv-1',
    customerId: 'cust-2',
    channel: 'web_chat',
    updatedAt: new Date('2026-03-08T14:10:00Z'),
    customerName: 'Visitor',
    customerExternalId: null,
    isSandbox: true,
    lastMessagePreview: null,
    lastMessageRole: null,
    lastMessageAt: null,
  },
];

const FIXTURE_SNAP = {
  activeConversations: 7,
  conversationTrend: 33,
  pendingPayments: { count: 2, byCurrency: [{ currency: 'USD', totalAmount: 500 }] },
  paidPayments: { count: 3, totalAmount: 900 },
  leadsByStage: { new: 5, qualifying: 3 },
  topKnowledgeGaps: [{ intentType: 'pricing', sampleQuestion: 'How much does it cost?' }],
  pendingApprovals: 1,
  recentExecutions: [],
};

beforeEach(() => {
  queryMocks.clear();
  vi.clearAllMocks();
  queryMocks.set('artifact.list', mockQueryResult([ADVISOR_ARTIFACT]));
  queryMocks.set('advisor.snapshot', mockQueryResult(FIXTURE_SNAP));
  queryMocks.set('conversation.list', mockQueryResult({ items: [], nextCursor: null }));
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AdvisorPage — session history sidebar', () => {
  it('renders session list from conversation.list', () => {
    queryMocks.set('conversation.list', mockQueryResult({ items: CONV_ITEMS, nextCursor: null }));

    render(React.createElement(AdvisorPage));

    expect(screen.getByText('How are sales this week?')).toBeInTheDocument();
  });

  it('falls back to sessionDate key when firstUserMessagePreview is null', () => {
    queryMocks.set('conversation.list', mockQueryResult({ items: CONV_ITEMS, nextCursor: null }));

    render(React.createElement(AdvisorPage));

    expect(screen.getByText('sessionDate')).toBeInTheDocument();
  });

  it('shows noSessions message when conversation list is empty', () => {
    render(React.createElement(AdvisorPage));

    expect(screen.getByText('noSessions')).toBeInTheDocument();
  });

  it('shows skeletons while conversation history is loading', () => {
    queryMocks.set('conversation.list', mockQueryResult(undefined, { isLoading: true }));

    render(React.createElement(AdvisorPage));

    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThanOrEqual(1);
  });

  it('clicking a past session sets initialConversationId on TestChatPanel', () => {
    queryMocks.set('conversation.list', mockQueryResult({ items: CONV_ITEMS, nextCursor: null }));

    render(React.createElement(AdvisorPage));

    const panel = screen.getByTestId('test-chat-panel');
    expect(panel.getAttribute('data-conv-id')).toBe('');

    const sessionButtons = screen.getAllByText('How are sales this week?');
    fireEvent.click(sessionButtons[0]);

    expect(screen.getByTestId('test-chat-panel').getAttribute('data-conv-id')).toBe('conv-1');
  });

  it('clicking New Session clears initialConversationId on TestChatPanel', () => {
    queryMocks.set('conversation.list', mockQueryResult({ items: CONV_ITEMS, nextCursor: null }));

    render(React.createElement(AdvisorPage));

    // First select a session
    fireEvent.click(screen.getAllByText('How are sales this week?')[0]);
    expect(screen.getByTestId('test-chat-panel').getAttribute('data-conv-id')).toBe('conv-1');

    // Then click New Session (desktop + mobile — pick first)
    fireEvent.click(screen.getAllByText('newSession')[0]);
    expect(screen.getByTestId('test-chat-panel').getAttribute('data-conv-id')).toBe('');
  });
});

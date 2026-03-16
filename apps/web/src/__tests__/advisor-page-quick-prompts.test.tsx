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

// Extended mock: exposes data-has-quick-prompts to assert prop passing
vi.mock('@/components/test-chat-panel', () => ({
  TestChatPanel: (props: Record<string, unknown>) =>
    React.createElement('div', {
      'data-testid': 'test-chat-panel',
      'data-conv-id': (props.initialConversationId as string | undefined) ?? '',
      'data-has-quick-prompts': props.quickPrompts != null ? 'true' : 'false',
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
  queryMocks.set('conversation.list', mockQueryResult({ items: CONV_ITEMS, nextCursor: null }));
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AdvisorPage — quick prompt prop passing', () => {
  it('passes quickPrompts to TestChatPanel when no past session is selected', () => {
    render(React.createElement(AdvisorPage));

    const panel = screen.getByTestId('test-chat-panel');
    expect(panel.getAttribute('data-has-quick-prompts')).toBe('true');
  });

  it('omits quickPrompts from TestChatPanel when a past session is selected', () => {
    render(React.createElement(AdvisorPage));

    // Click a past-session item to select it
    fireEvent.click(screen.getAllByText('How are sales this week?')[0]);

    expect(screen.getByTestId('test-chat-panel').getAttribute('data-has-quick-prompts')).toBe('false');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, args?: Record<string, unknown>) => {
    if (key === 'advisorOpeningMessage' && args) {
      return `Opening: ${args['signals']}`;
    }
    return key;
  },
}));

vi.mock('lucide-react', () =>
  new Proxy({} as Record<string, unknown>, {
    get: (_t, prop: string) =>
      ({ className, 'aria-label': ariaLabel }: { className?: string; 'aria-label'?: string }) =>
        React.createElement('svg', { 'data-icon': prop, className, 'aria-label': ariaLabel }),
  }),
);

vi.mock('@/components/test-chat-panel', () => ({
  TestChatPanel: ({
    open,
    onClose,
    onMessagesChange,
    initialMessages,
  }: {
    open: boolean;
    onClose: () => void;
    onMessagesChange?: (msgs: unknown[], convId: string | null) => void;
    initialMessages?: unknown[];
  }) => {
    if (!open) return null;
    return React.createElement(
      'div',
      { 'data-testid': 'test-chat-panel' },
      React.createElement('span', { 'data-testid': 'initial-message-count' }, String(initialMessages?.length ?? 0)),
      React.createElement('button', {
        'data-testid': 'close-btn',
        onClick: onClose,
      }, 'Close'),
      React.createElement('button', {
        'data-testid': 'fire-messages',
        // 4 messages total = 1 seeded initial (assistant opening) + 3 new exchanges.
        // handleClose subtracts initialMessageCountRef from the total, so
        // 4 - 1 = 3 new messages meets the ≥3 threshold and triggers summarization.
        onClick: () => onMessagesChange?.([
          { role: 'assistant', text: 'opening' },
          { role: 'user', text: 'a' },
          { role: 'assistant', text: 'b' },
          { role: 'user', text: 'c' },
        ], 'conv-123'),
      }, 'Fire Messages'),
    );
  },
}));

// ---------------------------------------------------------------------------
// tRPC mock setup
// ---------------------------------------------------------------------------

type QueryResult = {
  data: unknown;
  isLoading: boolean;
  isError: boolean;
  isSuccess: boolean;
  error: null;
  refetch: ReturnType<typeof vi.fn>;
};

const mockSummarize = vi.fn();
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

function buildNestedProxy(target: Record<string, unknown>, path: string[] = []): unknown {
  return new Proxy(target, {
    get(_, prop: string) {
      if (prop === 'useQuery') {
        const key = path.join('.');
        return () => queryMocks.get(key) ?? mockQueryResult(undefined, { isLoading: true });
      }
      if (prop === 'useMutation') {
        return () => ({ mutate: mockSummarize, isPending: false, isError: false, error: null });
      }
      if (prop === 'useUtils') {
        return () => new Proxy({}, { get: () => new Proxy({}, { get: () => vi.fn() }) });
      }
      return buildNestedProxy({}, [...path, prop]);
    },
  });
}

vi.mock('@/lib/trpc', () => ({
  trpc: buildNestedProxy({}, []),
}));

import { AdvisorPanel } from '../components/dashboard/advisor-panel';

const ADVISOR_ARTIFACT = {
  id: 'adv-artifact-id',
  name: 'Acme Advisor',
  type: 'advisor',
  isActive: true,
  createdAt: new Date(),
  personality: {},
};

const FIXTURE_SNAP = {
  activeConversations: 7,
  conversationTrend: 40,
  pendingPayments: { count: 2, byCurrency: [{ currency: 'USD', totalAmount: 300 }] },
  paidPayments: { count: 5, totalAmount: 1500 },
  leadsByStage: { new: 4, qualifying: 2 },
  topKnowledgeGaps: [{ intentType: 'pricing', sampleQuestion: 'How much does it cost?' }],
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

describe('AdvisorPanel', () => {
  it('4a — renders collapsed state with snapshot stats when advisor artifact exists', () => {
    queryMocks.set('artifact.list', mockQueryResult([ADVISOR_ARTIFACT]));
    queryMocks.set('advisor.snapshot', mockQueryResult(FIXTURE_SNAP));

    render(React.createElement(AdvisorPanel));

    const panel = document.querySelector('[data-testid="advisor-panel"]');
    expect(panel).toBeTruthy();
    // Stats text includes conversation count
    expect(screen.getByText(/7/)).toBeInTheDocument();
    // CTA text
    expect(screen.getByText('advisorPanelCta')).toBeInTheDocument();
    // Chat panel should NOT be mounted in collapsed state
    expect(document.querySelector('[data-testid="test-chat-panel"]')).toBeNull();
  });

  it('4b — returns null when no advisor artifact exists', () => {
    queryMocks.set('artifact.list', mockQueryResult([]));
    queryMocks.set('advisor.snapshot', mockQueryResult(FIXTURE_SNAP));

    render(React.createElement(AdvisorPanel));

    expect(document.querySelector('[data-testid="advisor-panel"]')).toBeNull();
  });

  it('4c — opens immediately when snap already loaded', () => {
    queryMocks.set('artifact.list', mockQueryResult([ADVISOR_ARTIFACT]));
    queryMocks.set('advisor.snapshot', mockQueryResult(FIXTURE_SNAP));

    render(React.createElement(AdvisorPanel));

    const button = screen.getByRole('button', { name: /advisorPanelCta/i });
    fireEvent.click(button);

    expect(document.querySelector('[data-testid="test-chat-panel"]')).toBeTruthy();
  });

  it('4d — shows loading spinner then opens when snap loads after button click', async () => {
    queryMocks.set('artifact.list', mockQueryResult([ADVISOR_ARTIFACT]));
    // Snap not yet loaded
    queryMocks.set('advisor.snapshot', mockQueryResult(undefined, { isLoading: true }));

    const { rerender } = render(React.createElement(AdvisorPanel));

    const button = screen.getByRole('button');
    fireEvent.click(button);

    // Loading spinner should be visible
    expect(document.querySelector('[data-icon="Loader2"]')).toBeTruthy();
    // Chat panel should NOT be open yet
    expect(document.querySelector('[data-testid="test-chat-panel"]')).toBeNull();

    // Snap arrives
    queryMocks.set('advisor.snapshot', mockQueryResult(FIXTURE_SNAP));
    await act(async () => {
      rerender(React.createElement(AdvisorPanel));
    });

    // Now chat panel should be open
    expect(document.querySelector('[data-testid="test-chat-panel"]')).toBeTruthy();
  });

  it('4f — resets pending state when snapshot query errors, allowing retry', async () => {
    queryMocks.set('artifact.list', mockQueryResult([ADVISOR_ARTIFACT]));
    // Snap not yet loaded
    queryMocks.set('advisor.snapshot', mockQueryResult(undefined, { isLoading: true, isSuccess: false }));

    const { rerender } = render(React.createElement(AdvisorPanel));

    const button = screen.getByRole('button');
    fireEvent.click(button);

    // Loading spinner should be visible, button disabled
    expect(document.querySelector('[data-icon="Loader2"]')).toBeTruthy();
    expect(button).toBeDisabled();
    // Chat panel should NOT be open
    expect(document.querySelector('[data-testid="test-chat-panel"]')).toBeNull();

    // Snapshot query errors
    queryMocks.set('advisor.snapshot', mockQueryResult(undefined, { isLoading: false, isError: true, isSuccess: false }));
    await act(async () => {
      rerender(React.createElement(AdvisorPanel));
    });

    // Button should be re-enabled (pendingOpen reset)
    expect(button).not.toBeDisabled();
    // Spinner should be gone
    expect(document.querySelector('[data-icon="Loader2"]')).toBeNull();
    // Chat panel still not open
    expect(document.querySelector('[data-testid="test-chat-panel"]')).toBeNull();
  });

  it('4e — handleClose fires summarizeSession when ≥3 messages exchanged', async () => {
    queryMocks.set('artifact.list', mockQueryResult([ADVISOR_ARTIFACT]));
    queryMocks.set('advisor.snapshot', mockQueryResult(FIXTURE_SNAP));

    render(React.createElement(AdvisorPanel));

    // Open the panel
    const openBtn = screen.getByRole('button', { name: /advisorPanelCta/i });
    fireEvent.click(openBtn);

    // Fire 3 messages via onMessagesChange callback
    const fireBtn = document.querySelector('[data-testid="fire-messages"]') as HTMLElement;
    expect(fireBtn).toBeTruthy();
    fireEvent.click(fireBtn);

    // Close the panel
    const closeBtn = document.querySelector('[data-testid="close-btn"]') as HTMLElement;
    fireEvent.click(closeBtn);

    // summarizeSession should have been called with the conversationId
    expect(mockSummarize).toHaveBeenCalledOnce();
    expect(mockSummarize).toHaveBeenCalledWith({ conversationId: 'conv-123' });
  });
});

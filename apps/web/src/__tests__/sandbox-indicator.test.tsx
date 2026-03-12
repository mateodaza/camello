import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

const {
  mockUseInfiniteQuery,
  mockByIdQuery,
  mockMessagesQuery,
  mockActivityQuery,
  mockUpdateStatusMutation,
  mockReplyMutation,
} = vi.hoisted(() => ({
  mockUseInfiniteQuery: vi.fn(),
  mockByIdQuery: vi.fn(),
  mockMessagesQuery: vi.fn(),
  mockActivityQuery: vi.fn(),
  mockUpdateStatusMutation: vi.fn(),
  mockReplyMutation: vi.fn(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    conversation: {
      list: {
        useInfiniteQuery: mockUseInfiniteQuery,
      },
      byId: {
        useQuery: mockByIdQuery,
      },
      messages: {
        useQuery: mockMessagesQuery,
      },
      activity: {
        useQuery: mockActivityQuery,
      },
      updateStatus: {
        useMutation: mockUpdateStatusMutation,
      },
      replyAsOwner: {
        useMutation: mockReplyMutation,
      },
    },
  },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/components/inbox/inbox-layout', () => ({
  useInboxPanel: () => ({ goToChat: vi.fn(), goToList: vi.fn(), goToDetails: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, className }: {
    href: string; children: React.ReactNode; className?: string;
  }) => React.createElement('a', { href, className }, children),
}));

vi.mock('lucide-react', () =>
  new Proxy({}, {
    get: (_t: object, prop: string) =>
      ({ className }: { className?: string }) =>
        React.createElement('svg', { 'data-icon': prop, className }),
  }),
);

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ListRow {
  id: string; artifactId: string; customerId: string;
  channel: string; status: string;
  createdAt: Date; updatedAt: Date;
  customerName: string; customerExternalId: string;
  lastMessagePreview: string | null;
  lastMessageRole: string | null;
  lastMessageAt: Date | null;
  isSandbox: boolean;
}

function makeListRow(overrides?: Partial<ListRow>): ListRow {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    artifactId: '00000000-0000-0000-0000-000000000010',
    customerId: '00000000-0000-0000-0000-000000000099',
    channel: 'web_chat', status: 'active',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    customerName: 'Alice', customerExternalId: 'ext-1',
    lastMessagePreview: 'Hello',
    lastMessageRole: 'artifact',
    lastMessageAt: new Date('2026-01-02T12:00:00Z'),
    isSandbox: false,
    ...overrides,
  };
}

function makeListQueryResult(items: ListRow[]) {
  return {
    data: { pages: [{ items, nextCursor: null }] },
    isLoading: false, isError: false, error: null,
    refetch: vi.fn(), fetchNextPage: vi.fn(),
    hasNextPage: false, isFetchingNextPage: false,
  };
}

function makeByIdResult(metadata: Record<string, unknown> | null = null) {
  return {
    data: {
      id: '00000000-0000-0000-0000-000000000001',
      status: 'active',
      customerName: 'Alice',
      metadata,
      channel: 'web_chat',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-02T00:00:00Z'),
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  };
}

function makeMessagesResult() {
  return {
    data: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  };
}

function makeActivityResult() {
  return {
    data: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  };
}

function makeMutationResult() {
  return {
    mutate: vi.fn(),
    isPending: false,
  };
}

import { ConversationList } from '@/components/inbox/conversation-list';
import { ChatThread } from '@/components/inbox/chat-thread';

beforeEach(() => {
  vi.clearAllMocks();
  // Default ChatThread mocks
  mockByIdQuery.mockReturnValue(makeByIdResult());
  mockMessagesQuery.mockReturnValue(makeMessagesResult());
  mockActivityQuery.mockReturnValue(makeActivityResult());
  mockUpdateStatusMutation.mockReturnValue(makeMutationResult());
  mockReplyMutation.mockReturnValue(makeMutationResult());
});

// ---------------------------------------------------------------------------
// ConversationList sandbox badge tests
// ---------------------------------------------------------------------------

describe('ConversationList sandbox badge', () => {
  it('1 — sandbox badge renders when isSandbox: true', () => {
    mockUseInfiniteQuery.mockReturnValue(
      makeListQueryResult([makeListRow({ isSandbox: true })]),
    );
    render(React.createElement(ConversationList, { selectedId: null, onSelect: vi.fn() }));
    expect(screen.getByTestId('sandbox-badge')).toBeInTheDocument();
  });

  it('2 — sandbox badge absent when isSandbox: false', () => {
    mockUseInfiniteQuery.mockReturnValue(
      makeListQueryResult([makeListRow({ isSandbox: false })]),
    );
    render(React.createElement(ConversationList, { selectedId: null, onSelect: vi.fn() }));
    expect(screen.queryByTestId('sandbox-badge')).not.toBeInTheDocument();
  });

  it('3 — sandbox toggle button renders in initial state (showSandbox: true)', () => {
    mockUseInfiniteQuery.mockReturnValue(
      makeListQueryResult([makeListRow()]),
    );
    render(React.createElement(ConversationList, { selectedId: null, onSelect: vi.fn() }));
    expect(screen.getByRole('button', { name: 'filterHideSandbox' })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ChatThread sandbox banner tests
// ---------------------------------------------------------------------------

const CONVERSATION_ID = '00000000-0000-0000-0000-000000000001';

describe('ChatThread sandbox banner', () => {
  it('4 — sandbox banner renders when metadata.sandbox = true', () => {
    mockByIdQuery.mockReturnValue(makeByIdResult({ sandbox: true }));
    render(React.createElement(ChatThread, { conversationId: CONVERSATION_ID }));
    expect(screen.getByTestId('sandbox-banner')).toBeInTheDocument();
  });

  it('5 — sandbox banner absent when metadata has no sandbox flag', () => {
    mockByIdQuery.mockReturnValue(makeByIdResult({}));
    render(React.createElement(ChatThread, { conversationId: CONVERSATION_ID }));
    expect(screen.queryByTestId('sandbox-banner')).not.toBeInTheDocument();
  });
});

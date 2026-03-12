import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

const { mockUseInfiniteQuery } = vi.hoisted(() => ({
  mockUseInfiniteQuery: vi.fn(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    conversation: {
      list: {
        useInfiniteQuery: mockUseInfiniteQuery,
      },
    },
  },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/components/inbox/inbox-layout', () => ({
  useInboxPanel: () => ({ goToChat: vi.fn() }),
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

interface ListRow {
  id: string; artifactId: string; customerId: string;
  channel: string; status: string;
  createdAt: Date; updatedAt: Date;
  customerName: string; customerExternalId: string;
  lastMessagePreview: string | null;
  lastMessageRole: string | null;
  lastMessageAt: Date | null;
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
    lastMessagePreview: 'Hello, I need help',
    lastMessageRole: 'customer',
    lastMessageAt: new Date('2026-01-02T12:00:00Z'),
    ...overrides,
  };
}

function makeQueryResult(items: ListRow[]) {
  return {
    data: { pages: [{ items, nextCursor: null }] },
    isLoading: false, isError: false, error: null,
    refetch: vi.fn(), fetchNextPage: vi.fn(),
    hasNextPage: false, isFetchingNextPage: false,
  };
}

import { ConversationList } from '@/components/inbox/conversation-list';

beforeEach(() => { vi.clearAllMocks(); });

describe('ConversationList', () => {
  it('2 — renders unread dot when lastMessageRole is customer', () => {
    mockUseInfiniteQuery.mockReturnValue(
      makeQueryResult([makeListRow({ lastMessageRole: 'customer' })]),
    );
    render(React.createElement(ConversationList, { selectedId: null, onSelect: vi.fn() }));
    expect(screen.getByTestId('unread-dot')).toBeInTheDocument();
  });

  it('3 — does not render unread dot when lastMessageRole is artifact', () => {
    mockUseInfiniteQuery.mockReturnValue(
      makeQueryResult([makeListRow({ lastMessageRole: 'artifact' })]),
    );
    render(React.createElement(ConversationList, { selectedId: null, onSelect: vi.fn() }));
    expect(screen.queryByTestId('unread-dot')).not.toBeInTheDocument();
  });

  it('4 — renders empty state link to /dashboard/settings/profile', () => {
    mockUseInfiniteQuery.mockReturnValue(makeQueryResult([]));
    render(React.createElement(ConversationList, { selectedId: null, onSelect: vi.fn() }));
    const link = screen.getByRole('link', { name: 'emptyShareLink' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/dashboard/settings/profile');
  });
});

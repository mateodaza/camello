import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React, { createElement } from 'react';
import type { LucideIcon } from 'lucide-react';

// ─── Hoisted spies ───────────────────────────────────────────────────────────
const { conversationListSpy } = vi.hoisted(() => ({
  conversationListSpy: vi.fn(),
}));

// ─── Mocks required by ConversationsPage (tests 4–6) ────────────────────────
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      conversation: {
        list:     { invalidate: vi.fn() },
        byId:     { invalidate: vi.fn() },
        messages: { invalidate: vi.fn() },
        activity: { invalidate: vi.fn() },
      },
    }),
    conversation: {
      list: { useQuery: conversationListSpy },
    },
    agent: {
      dashboardOverview: { useQuery: vi.fn(() => ({ data: undefined })) },
    },
    onboarding: {
      getStatus: { useQuery: vi.fn(() => ({ data: undefined, isLoading: false })) },
    },
  },
}));

vi.mock('@clerk/nextjs', () => ({
  useOrganization: () => ({
    organization: { publicMetadata: { camello_tenant_id: 'tenant-123' } },
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter:       () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname:     () => '/dashboard/conversations',
}));

vi.mock('@/hooks/use-realtime-inbox', () => ({
  useRealtimeInbox: vi.fn(),
}));

vi.mock('@/components/inbox/inbox-layout', () => ({
  InboxLayout: ({ left, center, right }: { left: React.ReactNode; center: React.ReactNode; right: React.ReactNode }) =>
    createElement('div', { 'data-testid': 'inbox-layout' }, left, center, right),
  InboxLeftPanel:   ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
  InboxCenterPanel: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
  InboxRightPanel:  ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
}));
vi.mock('@/components/inbox/conversation-list', () => ({ ConversationList: () => null }));
vi.mock('@/components/inbox/chat-thread',       () => ({ ChatThread: () => null }));
vi.mock('@/components/inbox/customer-panel',    () => ({ CustomerPanel: () => null }));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('lucide-react', () => ({
  MessageSquare: ({ className }: { className?: string }) =>
    createElement('svg', { 'data-icon': 'MessageSquare', className }),
}));

// ─── Import EmptyState component directly (tests 1–3) ───────────────────────
import { EmptyState } from '../components/dashboard/empty-state';

// ─── Import ConversationsPage (tests 4–6) ────────────────────────────────────
import ConversationsPage from '../app/dashboard/conversations/page';

// ─── beforeEach ──────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  // Default for tests 4 + 6: empty conversation list → inbox empty state shows
  conversationListSpy.mockReturnValue({
    data: { items: [], nextCursor: null },
    isSuccess: true,
  });
});

// Helper: create a minimal icon stub that satisfies the LucideIcon type
function makeIcon(testId: string) {
  return (({ className }: { className?: string }) =>
    createElement('svg', { 'data-icon': testId, className })) as unknown as LucideIcon;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('EmptyState component (NC-287)', () => {

  it('1 — renders icon, title, and description', () => {
    render(
      createElement(EmptyState, {
        icon: makeIcon('TestIcon'),
        title: 'Nothing here',
        description: 'No items to show.',
      }),
    );
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(screen.getByText('No items to show.')).toBeInTheDocument();
  });

  it('2 — renders Link when action.href is set', () => {
    render(
      createElement(EmptyState, {
        icon: makeIcon('TestIcon'),
        title: 'Empty',
        description: 'Nothing.',
        action: { label: 'Go', href: '/dashboard/agent' },
      }),
    );
    const link = screen.getByRole('link', { name: 'Go' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/dashboard/agent');
  });

  it('3 — renders button and calls onClick', () => {
    const onClick = vi.fn();
    render(
      createElement(EmptyState, {
        icon: makeIcon('TestIcon'),
        title: 'Empty',
        description: 'Nothing.',
        action: { label: 'Do it', onClick },
      }),
    );
    const btn = screen.getByRole('button', { name: 'Do it' });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalled();
  });

  it('4 — ConversationsPage shows inbox empty state when conversation list is empty', () => {
    // conversationListSpy default: { items: [], isSuccess: true }
    render(createElement(ConversationsPage));
    expect(screen.getByTestId('inbox-empty-state')).toBeInTheDocument();
  });

  it('5 — ConversationsPage hides empty state when conversations exist', () => {
    conversationListSpy.mockReturnValue({
      data: { items: [{ id: 'conv-1' }], nextCursor: null },
      isSuccess: true,
    });
    render(createElement(ConversationsPage));
    expect(screen.queryByTestId('inbox-empty-state')).toBeNull();
    expect(screen.getByTestId('inbox-layout')).toBeInTheDocument();
  });

  it('6 — inbox empty state CTA links to /dashboard/agent', () => {
    // conversationListSpy default: empty items → empty state shown
    render(createElement(ConversationsPage));
    const link = screen.getByRole('link', { name: 'inboxCta' });
    expect(link).toHaveAttribute('href', '/dashboard/agent');
  });

});

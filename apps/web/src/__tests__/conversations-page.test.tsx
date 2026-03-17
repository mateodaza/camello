import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// vi.hoisted — must precede vi.mock factories that reference these vars
// ---------------------------------------------------------------------------

const { mockDashboardOverview, mockGetStatus, mockConversationList } = vi.hoisted(() => ({
  mockDashboardOverview: vi.fn(),
  mockGetStatus: vi.fn(),
  mockConversationList: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/trpc', () => ({
  trpc: {
    agent: {
      dashboardOverview: { useQuery: mockDashboardOverview },
    },
    onboarding: {
      getStatus: { useQuery: mockGetStatus },
    },
    conversation: {
      list: { useQuery: mockConversationList },
    },
    useUtils: () => ({
      conversation: {
        list:     { invalidate: vi.fn() },
        byId:     { invalidate: vi.fn() },
        messages: { invalidate: vi.fn() },
        activity: { invalidate: vi.fn() },
      },
    }),
  },
}));

vi.mock('next-intl', () => ({
  useTranslations: () =>
    (key: string, values?: Record<string, unknown>) =>
      values?.count !== undefined ? String(values.count) : key,
}));

vi.mock('next/navigation', () => ({
  useRouter:       () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname:     () => '/dashboard/conversations',
}));

vi.mock('@clerk/nextjs', () => ({
  useOrganization: () => ({
    organization: { publicMetadata: { camello_tenant_id: 'tenant-123' } },
  }),
}));

vi.mock('lucide-react', () =>
  new Proxy({}, {
    get: (_t: object, prop: string) =>
      ({ className }: { className?: string }) =>
        React.createElement('svg', { 'data-icon': prop, className }),
  }),
);

vi.mock('@/hooks/use-realtime-inbox', () => ({
  useRealtimeInbox: vi.fn(),
}));

vi.mock('@/components/inbox/inbox-layout', () => ({
  InboxLayout:      () => null,
  InboxLeftPanel:   () => null,
  InboxCenterPanel: () => null,
  InboxRightPanel:  () => null,
}));

vi.mock('@/components/inbox/conversation-list', () => ({ ConversationList: () => null }));
vi.mock('@/components/inbox/chat-thread',       () => ({ ChatThread: () => null }));
vi.mock('@/components/inbox/customer-panel',    () => ({ CustomerPanel: () => null }));

vi.mock('@/components/dashboard/first-session-guide', () => ({
  FirstSessionGuide: () => null,
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href }, children),
}));

// ---------------------------------------------------------------------------
// Import — after all mocks
// ---------------------------------------------------------------------------

import ConversationsPage from '@/app/dashboard/conversations/page';

// ---------------------------------------------------------------------------
// beforeEach — default state
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  mockDashboardOverview.mockReturnValue({
    data: { todayConversations: 7, pendingApprovalsCount: 3, activeLeadsCount: 12 },
    isLoading: false,
  });

  mockGetStatus.mockReturnValue({
    data: { settings: { onboardingComplete: true } },
    isLoading: false,
  });

  mockConversationList.mockReturnValue({
    data: { items: [], nextCursor: null },
    isSuccess: true,
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConversationsPage render (NC-296)', () => {

  it('1 — Renders stat strip with conversation/approval/lead counts', () => {
    render(React.createElement(ConversationsPage));

    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('2 — Shows onboarding resume banner when onboardingComplete = false', () => {
    mockGetStatus.mockReturnValue({
      data: { settings: { onboardingComplete: false } },
      isLoading: false,
    });

    render(React.createElement(ConversationsPage));

    expect(screen.getByTestId('onboarding-resume-banner')).toBeInTheDocument();
  });

  it('3 — Hides banner when onboardingComplete = true', () => {
    render(React.createElement(ConversationsPage));

    expect(screen.queryByTestId('onboarding-resume-banner')).toBeNull();
  });

  it('4 — Shows EmptyState when conversation.list returns 0 items', () => {
    render(React.createElement(ConversationsPage));

    expect(screen.getByTestId('inbox-empty-state')).toBeInTheDocument();
  });

});

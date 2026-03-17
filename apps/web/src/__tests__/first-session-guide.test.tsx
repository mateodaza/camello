import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// vi.hoisted — must come before vi.mock factories that reference these vars
// ---------------------------------------------------------------------------

const {
  mockUpdateGuideStep,
  mockMutate,
  mockTenantMe,
  mockDocCount,
  mockGetStatus,
  mockConvList,
} = vi.hoisted(() => {
  const mockMutate = vi.fn();
  return {
    mockMutate,
    mockUpdateGuideStep: vi.fn(() => ({ mutate: mockMutate, isPending: false })),
    mockTenantMe: vi.fn(),
    mockDocCount: vi.fn(),
    mockGetStatus: vi.fn(),
    mockConvList: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      onboarding: { getStatus: { invalidate: vi.fn() } },
      conversation: {
        list:     { invalidate: vi.fn() },
        byId:     { invalidate: vi.fn() },
        messages: { invalidate: vi.fn() },
        activity: { invalidate: vi.fn() },
      },
    }),
    tenant: {
      me: { useQuery: mockTenantMe },
      updateGuideStep: { useMutation: mockUpdateGuideStep },
    },
    knowledge: {
      docCount: { useQuery: mockDocCount },
    },
    conversation: {
      list: { useQuery: mockConvList },
    },
    agent: {
      dashboardOverview: { useQuery: vi.fn(() => ({ data: undefined })) },
    },
    onboarding: {
      getStatus: { useQuery: mockGetStatus },
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
    React.createElement('div', { 'data-testid': 'inbox-layout' }, left, center, right),
  InboxLeftPanel:   ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
  InboxCenterPanel: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
  InboxRightPanel:  ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
}));

vi.mock('@/components/inbox/conversation-list', () => ({ ConversationList: () => null }));
vi.mock('@/components/inbox/chat-thread',       () => ({ ChatThread: () => null }));
vi.mock('@/components/inbox/customer-panel',    () => ({ CustomerPanel: () => null }));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('lucide-react', () =>
  new Proxy({}, {
    get: (_t: object, prop: string) =>
      ({ className }: { className?: string }) =>
        React.createElement('svg', { 'data-icon': prop, className }),
  }),
);

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement('a', { href, className }, children),
}));

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import { FirstSessionGuide } from '../components/dashboard/first-session-guide';
import ConversationsPage from '../app/dashboard/conversations/page';

// ---------------------------------------------------------------------------
// Default mock implementations
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockTenantMe.mockReturnValue({ data: { slug: 'test-slug' }, isLoading: false });
  mockDocCount.mockReturnValue({ data: 0 });
  mockUpdateGuideStep.mockReturnValue({ mutate: mockMutate, isPending: false });
  mockGetStatus.mockReturnValue({
    data: { settings: { onboardingComplete: true }, previewCustomerId: null, tenantName: 'Test Co' },
    isLoading: false,
  });
  mockConvList.mockReturnValue({
    data: { items: [], nextCursor: null },
    isLoading: false,
    isSuccess: true,
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FirstSessionGuide (NC-288)', () => {

  it('1 — guide renders after onboarding is complete and not dismissed', () => {
    render(
      React.createElement(FirstSessionGuide, {
        guideState: null,
        testedChatAuto: false,
      }),
    );
    expect(screen.getByTestId('first-session-guide')).toBeInTheDocument();
  });

  it('2 — guide is hidden on ConversationsPage when dismissed flag is set', () => {
    mockGetStatus.mockReturnValue({
      data: {
        settings: {
          onboardingComplete: true,
          firstSessionGuide: { dismissed: true },
        },
        previewCustomerId: null,
        tenantName: 'Test Co',
      },
      isLoading: false,
    });
    render(React.createElement(ConversationsPage));
    expect(screen.queryByTestId('first-session-guide')).toBeNull();
  });

  it('3 — guide disappears when all 3 checkable items are done', () => {
    // testedChatAuto=true, docCount=1, sharedLink=true → allDone → returns null
    mockDocCount.mockReturnValue({ data: 1 });
    const { container } = render(
      React.createElement(FirstSessionGuide, {
        guideState: { sharedLink: true },
        testedChatAuto: true,
      }),
    );
    expect(container.querySelector('[data-testid="first-session-guide"]')).toBeNull();
  });

  it('4 — dismiss × button calls mutation with { step: dismissed, value: true }', () => {
    render(
      React.createElement(FirstSessionGuide, {
        guideState: null,
        testedChatAuto: false,
      }),
    );
    const dismissBtn = screen.getByRole('button', { name: 'guideDismiss' });
    fireEvent.click(dismissBtn);
    expect(mockMutate).toHaveBeenCalledWith({ step: 'dismissed', value: true });
  });

});

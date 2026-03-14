import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React, { createElement } from 'react';

// ---- Hoisted mocks ----
const {
  capturedCallback,
  mockUseSearchParams,
  mockListInvalidate,
  mockByIdInvalidate,
  mockMessagesInvalidate,
  mockActivityInvalidate,
} = vi.hoisted(() => ({
  capturedCallback: { current: null as ((payload: unknown) => void) | null },
  mockUseSearchParams: vi.fn(),
  mockListInvalidate: vi.fn(),
  mockByIdInvalidate: vi.fn(),
  mockMessagesInvalidate: vi.fn(),
  mockActivityInvalidate: vi.fn(),
}));

// Mock useRealtimeInbox — captures the onMessage callback the page passes in
vi.mock('@/hooks/use-realtime-inbox', () => ({
  useRealtimeInbox: (_tenantId: string | null, onMessage: (payload: unknown) => void) => {
    capturedCallback.current = onMessage;
  },
}));

// Mock trpc — expose specific invalidate spies via useUtils()
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      conversation: {
        list:     { invalidate: mockListInvalidate },
        byId:     { invalidate: mockByIdInvalidate },
        messages: { invalidate: mockMessagesInvalidate },
        activity: { invalidate: mockActivityInvalidate },
      },
    }),
  },
}));

// Mock Clerk — returns a tenant UUID via publicMetadata
vi.mock('@clerk/nextjs', () => ({
  useOrganization: () => ({
    organization: {
      publicMetadata: { camello_tenant_id: 'tenant-uuid-123' },
    },
  }),
}));

// Mock next/navigation — useSearchParams controlled per-test
vi.mock('next/navigation', () => ({
  useRouter:       () => ({ replace: vi.fn() }),
  useSearchParams: mockUseSearchParams,
  usePathname:     () => '/dashboard/conversations',
}));

// Mock child components to null (prevents their tRPC hook calls)
vi.mock('@/components/inbox/inbox-layout', () => ({
  InboxLayout:      ({ left, center, right }: { left: React.ReactNode; center: React.ReactNode; right: React.ReactNode }) =>
    createElement('div', null, left, center, right),
  InboxLeftPanel:   ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
  InboxCenterPanel: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
  InboxRightPanel:  ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
}));
vi.mock('@/components/inbox/conversation-list', () => ({ ConversationList: () => null }));
vi.mock('@/components/inbox/chat-thread',       () => ({ ChatThread: () => null }));
vi.mock('@/components/inbox/customer-panel',    () => ({ CustomerPanel: () => null }));

// ---- Types ----
interface NewMessagePayload {
  event: 'new_message';
  tenantId: string;
  conversationId: string;
  channel: 'whatsapp' | 'webchat';
  preview: string;
  at: string;
}

function makePayload(conversationId: string): NewMessagePayload {
  return {
    event: 'new_message',
    tenantId: 'tenant-uuid-123',
    conversationId,
    channel: 'whatsapp',
    preview: 'Hello there',
    at: '2026-03-14T00:00:00.000Z',
  };
}

const SELECTED_CONV_ID = 'conv-selected-001';
const OTHER_CONV_ID    = 'conv-other-999';

beforeEach(() => {
  capturedCallback.current = null;
  vi.clearAllMocks();
  mockUseSearchParams.mockReturnValue(new URLSearchParams());
});

describe('ConversationsPage — realtime invalidation (NC-271)', () => {
  it('NC-271-T2a: always invalidates conversation.list on new_message', async () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams());

    const mod = await import('@/app/dashboard/conversations/page');
    render(createElement(mod.default));

    expect(capturedCallback.current).not.toBeNull();

    act(() => {
      capturedCallback.current!(makePayload(OTHER_CONV_ID));
    });

    expect(mockListInvalidate).toHaveBeenCalled();
  });

  it('NC-271-T2b: does NOT invalidate byId/messages/activity when no conversation is selected', async () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams());

    const mod = await import('@/app/dashboard/conversations/page');
    render(createElement(mod.default));

    act(() => {
      capturedCallback.current!(makePayload(OTHER_CONV_ID));
    });

    expect(mockByIdInvalidate).not.toHaveBeenCalled();
    expect(mockMessagesInvalidate).not.toHaveBeenCalled();
    expect(mockActivityInvalidate).not.toHaveBeenCalled();
  });

  it('NC-271-T2c: invalidates byId + messages + activity when conversationId matches selectedId', async () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams(`selected=${SELECTED_CONV_ID}`),
    );

    const mod = await import('@/app/dashboard/conversations/page');
    render(createElement(mod.default));

    act(() => {
      capturedCallback.current!(makePayload(SELECTED_CONV_ID));
    });

    expect(mockListInvalidate).toHaveBeenCalled();
    // byId: exact input { id } — assert with full input
    expect(mockByIdInvalidate).toHaveBeenCalledWith({ id: SELECTED_CONV_ID });
    // messages: no-arg invalidation — avoids `limit` field in cached key (see Step 7 note)
    expect(mockMessagesInvalidate).toHaveBeenCalledWith();
    // activity: exact input { conversationId } — assert with full input
    expect(mockActivityInvalidate).toHaveBeenCalledWith({ conversationId: SELECTED_CONV_ID });
  });

  it('NC-271-T2d: does NOT invalidate byId/messages/activity when conversationId does NOT match selectedId', async () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams(`selected=${SELECTED_CONV_ID}`),
    );

    const mod = await import('@/app/dashboard/conversations/page');
    render(createElement(mod.default));

    act(() => {
      capturedCallback.current!(makePayload(OTHER_CONV_ID)); // different conversationId
    });

    expect(mockListInvalidate).toHaveBeenCalled(); // list always invalidated
    expect(mockByIdInvalidate).not.toHaveBeenCalled();
    expect(mockMessagesInvalidate).not.toHaveBeenCalled();
    expect(mockActivityInvalidate).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const capturedCallbackRef = vi.hoisted<{ current: ((evt: { payload: unknown }) => void) | null }>(() => ({ current: null }));
const mockChannel       = vi.hoisted(() => vi.fn());
const mockOn            = vi.hoisted(() => vi.fn());
const mockSubscribe     = vi.hoisted(() => vi.fn());
const mockRemoveChannel = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase-client', () => ({
  getSupabaseBrowser: () => ({
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  }),
}));

import { useRealtimeInbox, type NewMessagePayload } from '../hooks/use-realtime-inbox';

const TENANT_ID = 'org_tenant_uuid_123';
const SAMPLE_PAYLOAD: NewMessagePayload = {
  event: 'new_message',
  tenantId: TENANT_ID,
  conversationId: 'conv-1',
  channel: 'whatsapp',
  preview: 'Hello',
  at: '2026-03-14T00:00:00.000Z',
};

beforeEach(() => {
  capturedCallbackRef.current = null;
  vi.clearAllMocks();

  mockSubscribe.mockReturnValue({});
  mockRemoveChannel.mockResolvedValue(undefined);
  mockOn.mockImplementation(
    (type: string, _filter: unknown, cb: (evt: { payload: unknown }) => void) => {
      if (type === 'broadcast') capturedCallbackRef.current = cb;
      return { subscribe: mockSubscribe };
    },
  );
  mockChannel.mockReturnValue({ on: mockOn });
});

describe('useRealtimeInbox', () => {
  it('calls onMessage when broadcast event fires', () => {
    const onMessage = vi.fn();
    renderHook(() => useRealtimeInbox(TENANT_ID, onMessage));

    expect(capturedCallbackRef.current).not.toBeNull();
    expect(mockChannel).toHaveBeenCalledWith(`tenant:${TENANT_ID}`);

    act(() => {
      capturedCallbackRef.current!({ payload: SAMPLE_PAYLOAD });
    });

    expect(onMessage).toHaveBeenCalledWith(SAMPLE_PAYLOAD);
  });

  it('unsubscribes (calls removeChannel) on unmount', () => {
    const { unmount } = renderHook(() => useRealtimeInbox(TENANT_ID, vi.fn()));
    unmount();
    expect(mockRemoveChannel).toHaveBeenCalled();
  });

  it('does not subscribe when tenantId is null', () => {
    renderHook(() => useRealtimeInbox(null, vi.fn()));
    expect(mockChannel).not.toHaveBeenCalled();
  });
});

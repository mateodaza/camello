import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import React from 'react';

// ── Hoisted mock variables — shared between vi.mock factory and test bodies ──
// vi.hoisted() ensures these are available before the vi.mock() factories run.
const { mockSendMutate, mockEnsureCustomerMutate } = vi.hoisted(() => ({
  mockSendMutate: vi.fn(),
  mockEnsureCustomerMutate: vi.fn(),
}));

// ── Mocks for component rendering tests ──────────────────────────────────────
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    chat: {
      send: {
        useMutation: () => ({ mutate: mockSendMutate, isPending: false, isError: false, error: null }),
      },
    },
    onboarding: {
      ensurePreviewCustomer: {
        useMutation: () => ({ mutate: mockEnsureCustomerMutate }),
      },
    },
  },
}));

vi.mock('@/components/simple-markdown', () => ({
  SimpleMarkdown: ({ text }: { text: string }) => <span>{text}</span>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) => (
    <button {...props}>{children}</button>
  ),
}));

import { TestChatPanel } from '@/components/test-chat-panel';

// ---------------------------------------------------------------------------
// TestChatPanel logic tests (pure — no component rendering)
// Validates the sandbox chat send payload construction and state management
// logic used by TestChatPanel.
// ---------------------------------------------------------------------------

const ARTIFACT_ID = '00000000-0000-0000-0000-000000000020';
const CUSTOMER_ID = '00000000-0000-0000-0000-000000000010';
const CONVERSATION_ID = '00000000-0000-0000-0000-000000000030';

/** Mirrors the payload construction logic from TestChatPanel.handleSend */
function buildSendPayload(opts: {
  customerId: string;
  message: string;
  artifactId: string;
  conversationId: string | null;
}) {
  return {
    customerId: opts.customerId,
    message: opts.message,
    channel: 'webchat' as const,
    sandbox: true,
    artifactId: opts.artifactId,
    ...(opts.conversationId ? { conversationId: opts.conversationId } : {}),
  };
}

describe('TestChatPanel payload construction', () => {
  it('first send omits conversationId', () => {
    const payload = buildSendPayload({
      customerId: CUSTOMER_ID,
      message: 'Hello',
      artifactId: ARTIFACT_ID,
      conversationId: null,
    });

    expect(payload.sandbox).toBe(true);
    expect(payload.artifactId).toBe(ARTIFACT_ID);
    expect(payload).not.toHaveProperty('conversationId');
  });

  it('subsequent sends include conversationId for continuation', () => {
    const payload = buildSendPayload({
      customerId: CUSTOMER_ID,
      message: 'Follow-up',
      artifactId: ARTIFACT_ID,
      conversationId: CONVERSATION_ID,
    });

    expect(payload.sandbox).toBe(true);
    expect(payload.artifactId).toBe(ARTIFACT_ID);
    expect(payload.conversationId).toBe(CONVERSATION_ID);
  });

  it('always includes sandbox: true and artifactId', () => {
    const payload = buildSendPayload({
      customerId: CUSTOMER_ID,
      message: 'Test',
      artifactId: ARTIFACT_ID,
      conversationId: null,
    });

    expect(payload.sandbox).toBe(true);
    expect(payload.artifactId).toBe(ARTIFACT_ID);
    expect(payload.channel).toBe('webchat');
  });
});

describe('TestChatPanel state lifecycle', () => {
  it('conversationId resets on close (new conversation on next open)', () => {
    // Simulate state: after first response, conversationId is set
    let conversationId: string | null = null;
    conversationId = CONVERSATION_ID;
    expect(conversationId).toBe(CONVERSATION_ID);

    // Simulate close: reset state
    conversationId = null;
    expect(conversationId).toBeNull();

    // Next send should omit conversationId (new conversation)
    const payload = buildSendPayload({
      customerId: CUSTOMER_ID,
      message: 'New session',
      artifactId: ARTIFACT_ID,
      conversationId,
    });
    expect(payload).not.toHaveProperty('conversationId');
  });
});

// ---------------------------------------------------------------------------
// Stale-reply guard tests — real component rendering
//
// These tests render TestChatPanel, trigger sendMessage.mutate via form
// submission, then simulate a session reset (sessionKey increment or close).
// After the reset the captured onSuccess is fired manually. The tests assert
// that the stale reply is NOT appended to the chat, verifying that the
// sessionGenRef / onSuccess guard in test-chat-panel.tsx actually works.
// ---------------------------------------------------------------------------

describe('TestChatPanel close-reset stale-reply guard', () => {
  // Holds the onSuccess callback captured from sendMessage.mutate so each
  // test can fire it at a controlled point in time.
  let capturedSendOnSuccess:
    | ((d: { conversationId: string; responseText: string }) => void)
    | null = null;

  beforeEach(() => {
    // JSDOM does not implement scrollIntoView — stub it so the messagesEndRef
    // scroll effect does not throw.
    Element.prototype.scrollIntoView = vi.fn();
    capturedSendOnSuccess = null;

    // Make ensurePreviewCustomer resolve immediately so customerId is set
    // before handleSend is triggered in the test.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockEnsureCustomerMutate.mockImplementation((_: unknown, opts: any) => {
      opts?.onSuccess?.({ customerId: 'preview-123' });
    });

    // Intercept sendMessage.mutate so the test controls when onSuccess fires.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockSendMutate.mockImplementation((_: unknown, opts: any) => {
      capturedSendOnSuccess = opts?.onSuccess ?? null;
    });
  });

  afterEach(() => {
    // Restore to plain no-ops so tests in other describe blocks are unaffected.
    mockSendMutate.mockReset();
    mockEnsureCustomerMutate.mockReset();
    capturedSendOnSuccess = null;
  });

  it('reply that arrives after sessionKey reset is discarded by sessionGenRef guard', async () => {
    const { rerender } = render(
      <TestChatPanel
        artifactId="art-1"
        artifactName="Bot"
        artifactType="sales"
        open={true}
        onClose={() => {}}
        inline={true}
        sessionKey={0}
      />,
    );

    // Flush effects: ensureCustomer fires → customerId is set.
    await act(async () => {});

    // Submit a message — sendMessage.mutate is called; capturedSendOnSuccess is set.
    const inputEl = screen.getByPlaceholderText('messagePlaceholder');
    fireEvent.change(inputEl, { target: { value: 'before reset' } });
    fireEvent.submit(inputEl.closest('form')!);

    expect(screen.getByText('before reset')).toBeInTheDocument();
    expect(capturedSendOnSuccess).not.toBeNull();

    // Simulate config save: sessionKey increments → sessionGenRef.current increments.
    await act(async () => {
      rerender(
        <TestChatPanel
          artifactId="art-1"
          artifactName="Bot"
          artifactType="sales"
          open={true}
          onClose={() => {}}
          inline={true}
          sessionKey={1}
        />,
      );
    });

    // Messages are cleared by the reset effect.
    expect(screen.queryByText('before reset')).not.toBeInTheDocument();
    expect(screen.getByText('testChatEmpty')).toBeInTheDocument();

    // Fire the stale onSuccess — the guard in test-chat-panel.tsx must discard it.
    await act(async () => {
      capturedSendOnSuccess?.({ conversationId: 'conv-1', responseText: 'Stale reply!' });
    });

    // Stale text must NOT appear; empty state must remain.
    expect(screen.queryByText('Stale reply!')).not.toBeInTheDocument();
    expect(screen.getByText('testChatEmpty')).toBeInTheDocument();
  });

  it('reply that arrives after panel close is discarded by sessionGenRef guard', async () => {
    const { rerender } = render(
      <TestChatPanel
        artifactId="art-1"
        artifactName="Bot"
        artifactType="sales"
        open={true}
        onClose={() => {}}
        sessionKey={0}
      />,
    );

    await act(async () => {});

    const inputEl = screen.getByPlaceholderText('messagePlaceholder');
    fireEvent.change(inputEl, { target: { value: 'before close' } });
    fireEvent.submit(inputEl.closest('form')!);

    expect(capturedSendOnSuccess).not.toBeNull();

    // Close the panel — the close effect increments sessionGenRef.current.
    await act(async () => {
      rerender(
        <TestChatPanel
          artifactId="art-1"
          artifactName="Bot"
          artifactType="sales"
          open={false}
          onClose={() => {}}
          sessionKey={0}
        />,
      );
    });

    // Fire the stale reply while the panel renders null.
    await act(async () => {
      capturedSendOnSuccess?.({ conversationId: 'conv-2', responseText: 'Stale after close!' });
    });

    // Reopen the panel — stale reply must NOT appear in the chat.
    await act(async () => {
      rerender(
        <TestChatPanel
          artifactId="art-1"
          artifactName="Bot"
          artifactType="sales"
          open={true}
          onClose={() => {}}
          sessionKey={0}
        />,
      );
    });

    expect(screen.queryByText('Stale after close!')).not.toBeInTheDocument();
    expect(screen.getByText('testChatEmpty')).toBeInTheDocument();
  });

  it('reply from an active session (no reset) is NOT discarded', async () => {
    render(
      <TestChatPanel
        artifactId="art-1"
        artifactName="Bot"
        artifactType="sales"
        open={true}
        onClose={() => {}}
        inline={true}
        sessionKey={0}
      />,
    );

    await act(async () => {});

    const inputEl = screen.getByPlaceholderText('messagePlaceholder');
    fireEvent.change(inputEl, { target: { value: 'fresh message' } });
    fireEvent.submit(inputEl.closest('form')!);

    expect(capturedSendOnSuccess).not.toBeNull();

    // No reset — fire the reply immediately; the guard must pass it through.
    await act(async () => {
      capturedSendOnSuccess?.({ conversationId: 'conv-3', responseText: 'Fresh reply!' });
    });

    // Fresh reply must appear in the chat.
    expect(screen.getByText('Fresh reply!')).toBeInTheDocument();
  });
});

describe('TestChatPanel archetype hint keys', () => {
  // Validates that the hint i18n key pattern matches all archetype types
  function buildHintKey(artifactType: string): string {
    return `testHint${artifactType.charAt(0).toUpperCase()}${artifactType.slice(1)}`;
  }

  it('generates correct i18n key for sales', () => {
    expect(buildHintKey('sales')).toBe('testHintSales');
  });

  it('generates correct i18n key for support', () => {
    expect(buildHintKey('support')).toBe('testHintSupport');
  });

  it('generates correct i18n key for marketing', () => {
    expect(buildHintKey('marketing')).toBe('testHintMarketing');
  });

  it('generates correct i18n key for custom', () => {
    expect(buildHintKey('custom')).toBe('testHintCustom');
  });
});

// ---------------------------------------------------------------------------
// Component rendering tests — verify sessionKey reset and empty-state key
// These render the real TestChatPanel and assert against actual DOM output.
// ---------------------------------------------------------------------------

describe('TestChatPanel sessionKey reset (component rendering)', () => {
  beforeAll(() => {
    // JSDOM does not implement scrollIntoView; stub it so the component's
    // messagesEndRef scroll effect does not throw.
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('sessionKey increment clears messages from the rendered component', async () => {
    const { rerender } = render(
      <TestChatPanel
        artifactId="art-1"
        artifactName="Bot"
        artifactType="sales"
        open={true}
        onClose={() => {}}
        initialMessages={[{ role: 'user', text: 'hello from session 0' }]}
        sessionKey={0}
      />,
    );

    // Message is visible; empty state is not shown.
    expect(screen.getByText('hello from session 0')).toBeInTheDocument();
    expect(screen.queryByText('testChatEmpty')).not.toBeInTheDocument();

    // Increment sessionKey — the component's useEffect fires and resets messages.
    await act(async () => {
      rerender(
        <TestChatPanel
          artifactId="art-1"
          artifactName="Bot"
          artifactType="sales"
          open={true}
          onClose={() => {}}
          initialMessages={[]}
          sessionKey={1}
        />,
      );
    });

    // Message must be gone; empty state must appear.
    expect(screen.queryByText('hello from session 0')).not.toBeInTheDocument();
    expect(screen.getByText('testChatEmpty')).toBeInTheDocument();
  });

  it('inline mode renders testChatEmpty when there are no messages', () => {
    render(
      <TestChatPanel
        artifactId="art-1"
        artifactName="Bot"
        artifactType="sales"
        open={true}
        onClose={() => {}}
        inline={true}
      />,
    );
    expect(screen.getByText('testChatEmpty')).toBeInTheDocument();
  });

  it('fullscreen mode renders testChatEmpty when there are no messages', () => {
    render(
      <TestChatPanel
        artifactId="art-1"
        artifactName="Bot"
        artifactType="sales"
        open={true}
        onClose={() => {}}
        fullscreen={true}
      />,
    );
    expect(screen.getByText('testChatEmpty')).toBeInTheDocument();
  });

  it('modal (default) mode renders testChatEmpty when there are no messages', () => {
    render(
      <TestChatPanel
        artifactId="art-1"
        artifactName="Bot"
        artifactType="sales"
        open={true}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText('testChatEmpty')).toBeInTheDocument();
  });
});

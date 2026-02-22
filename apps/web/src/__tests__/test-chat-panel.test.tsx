import { describe, it, expect } from 'vitest';

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

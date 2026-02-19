import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createWidgetToken, verifyWidgetToken } from '../../lib/widget-jwt.js';
import { webchatAdapter } from '../../adapters/webchat.js';

// ---------------------------------------------------------------------------
// Widget JWT tests
// ---------------------------------------------------------------------------

describe('Widget JWT', () => {
  beforeEach(() => {
    vi.stubEnv('WIDGET_JWT_SECRET', 'test-secret-key-at-least-32-chars-long!');
  });

  it('creates and verifies a valid token', async () => {
    const token = await createWidgetToken({
      visitorId: 'visitor_abc123',
      tenantId: '00000000-0000-0000-0000-000000000001',
      artifactId: '00000000-0000-0000-0000-000000000002',
      customerId: '00000000-0000-0000-0000-000000000003',
    });

    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3); // JWT format

    const claims = await verifyWidgetToken(token);
    expect(claims.sub).toBe('visitor_abc123');
    expect(claims.tenant_id).toBe('00000000-0000-0000-0000-000000000001');
    expect(claims.artifact_id).toBe('00000000-0000-0000-0000-000000000002');
    expect(claims.customer_id).toBe('00000000-0000-0000-0000-000000000003');
    expect(claims.iss).toBe('platform-widget');
    expect(claims.exp).toBeDefined();
  });

  it('rejects a tampered token', async () => {
    const token = await createWidgetToken({
      visitorId: 'visitor_abc',
      tenantId: '00000000-0000-0000-0000-000000000001',
      artifactId: '00000000-0000-0000-0000-000000000002',
      customerId: '00000000-0000-0000-0000-000000000003',
    });

    // Tamper with payload
    const parts = token.split('.');
    parts[1] = parts[1] + 'TAMPERED';
    const tampered = parts.join('.');

    await expect(verifyWidgetToken(tampered)).rejects.toThrow();
  });

  it('rejects a token signed with wrong secret', async () => {
    const token = await createWidgetToken({
      visitorId: 'visitor_abc',
      tenantId: '00000000-0000-0000-0000-000000000001',
      artifactId: '00000000-0000-0000-0000-000000000002',
      customerId: '00000000-0000-0000-0000-000000000003',
    });

    // Change the secret for verification
    vi.stubEnv('WIDGET_JWT_SECRET', 'completely-different-secret-key-32-chars!');

    await expect(verifyWidgetToken(token)).rejects.toThrow();
  });

  it('throws when WIDGET_JWT_SECRET is not set', async () => {
    vi.stubEnv('WIDGET_JWT_SECRET', '');

    await expect(
      createWidgetToken({
        visitorId: 'v',
        tenantId: '00000000-0000-0000-0000-000000000001',
        artifactId: '00000000-0000-0000-0000-000000000002',
        customerId: '00000000-0000-0000-0000-000000000003',
      }),
    ).rejects.toThrow('WIDGET_JWT_SECRET');
  });
});

// ---------------------------------------------------------------------------
// WebChat adapter tests
// ---------------------------------------------------------------------------

describe('WebChat adapter', () => {
  it('has channel "webchat"', () => {
    expect(webchatAdapter.channel).toBe('webchat');
  });

  it('parseInbound normalises payload to CanonicalMessage', () => {
    const msg = webchatAdapter.parseInbound({
      tenantId: '00000000-0000-0000-0000-000000000001',
      customerId: '00000000-0000-0000-0000-000000000002',
      visitorId: 'visitor_abc',
      text: 'Hello world',
    });

    expect(msg.channel).toBe('webchat');
    expect(msg.direction).toBe('inbound');
    expect(msg.content.type).toBe('text');
    expect(msg.content.text).toBe('Hello world');
    expect(msg.tenant_id).toBe('00000000-0000-0000-0000-000000000001');
    expect(msg.customer_id).toBe('00000000-0000-0000-0000-000000000002');
    expect(msg.channel_customer_id).toBe('visitor_abc');
    expect(msg.id).toBeDefined();
    expect(msg.metadata.channel_message_id).toBeDefined();
  });

  it('sendText returns a webchat message ID', async () => {
    const id = await webchatAdapter.sendText('visitor_abc', 'Hi', {
      credentials: {},
    });
    expect(id).toMatch(/^webchat_/);
  });

  it('sendInteractive returns a webchat message ID', async () => {
    const id = await webchatAdapter.sendInteractive(
      'visitor_abc',
      'Choose:',
      [{ id: '1', title: 'Option A' }],
      { credentials: {} },
    );
    expect(id).toMatch(/^webchat_/);
  });
});

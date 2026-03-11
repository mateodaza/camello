import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendEmail, _resetForTest } from '../lib/email.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSend = vi.hoisted(() => vi.fn());
const MockResend = vi.hoisted(() =>
  vi.fn().mockImplementation(function () {
    return { emails: { send: mockSend } };
  })
);

vi.mock('resend', () => ({
  Resend: MockResend,
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sendEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetForTest();
  });

  it('sends email and returns sent: true with id when RESEND_API_KEY is set', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    mockSend.mockResolvedValueOnce({ data: { id: 'email-123' }, error: null });

    const result = await sendEmail({
      to: 'test@example.com',
      subject: 'Hello',
      html: '<p>hi</p>',
    });

    expect(result.sent).toBe(true);
    expect(result.id).toBe('email-123');
    expect(mockSend).toHaveBeenCalledWith({
      from: 'Camello <noreply@camello.xyz>',
      to: 'test@example.com',
      subject: 'Hello',
      html: '<p>hi</p>',
    });
    delete process.env.RESEND_API_KEY;
  });

  it('noops and returns sent: false when RESEND_API_KEY is missing', async () => {
    delete process.env.RESEND_API_KEY;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await sendEmail({
      to: 'test@example.com',
      subject: 'Hello',
      html: '<p>hi</p>',
    });

    expect(result.sent).toBe(false);
    expect(result.id).toBeUndefined();
    expect(mockSend).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('RESEND_API_KEY'));

    warnSpy.mockRestore();
  });

  it('returns sent: false when Resend API returns an error', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockSend.mockResolvedValueOnce({
      data: null,
      error: { message: 'Invalid API key', name: 'validation_error' },
    });

    const result = await sendEmail({
      to: 'test@example.com',
      subject: 'Hello',
      html: '<p>hi</p>',
    });

    expect(result.sent).toBe(false);
    expect(result.id).toBeUndefined();
    expect(mockSend).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Resend error'));

    warnSpy.mockRestore();
    delete process.env.RESEND_API_KEY;
  });
});

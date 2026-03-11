import { Resend } from 'resend';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FROM = 'Camello <noreply@camello.xyz>';

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _resend: Resend | null = null;

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!_resend) _resend = new Resend(key);
  return _resend;
}

/** Reset singleton — for test isolation only. */
export function _resetForTest(): void {
  _resend = null;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

interface SendEmailResult {
  sent: boolean;
  id?: string;
}

// ---------------------------------------------------------------------------
// sendEmail
// ---------------------------------------------------------------------------

export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const { to, subject, html } = options;

  const resend = getResend();
  if (!resend) {
    console.warn('RESEND_API_KEY is not set — email not sent');
    return { sent: false };
  }

  const { data, error } = await resend.emails.send({ from: FROM, to, subject, html });

  if (error || !data?.id) {
    console.warn(`Resend error: ${error?.message ?? 'no data returned'}`);
    return { sent: false };
  }

  return { sent: true, id: data.id };
}

// ---------------------------------------------------------------------------
// renderBaseEmail
// ---------------------------------------------------------------------------

interface RenderBaseEmailOptions {
  title: string;
  body: string;
  ctaText?: string;
  ctaUrl?: string;
}

export function renderBaseEmail(options: RenderBaseEmailOptions): string {
  const { title, body, ctaText, ctaUrl } = options;

  const ctaBlock =
    ctaText && ctaUrl
      ? `
        <tr>
          <td style="padding: 0 40px 32px;">
            <a href="${ctaUrl}"
               style="display: inline-block; background-color: #4ECDC4; color: #ffffff;
                      font-family: 'Jost', sans-serif; font-size: 15px; font-weight: 600;
                      text-decoration: none; padding: 12px 28px; border-radius: 6px;">
              ${ctaText}
            </a>
          </td>
        </tr>`
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #FFF8F0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="background-color: #FFF8F0; padding: 40px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0"
               style="max-width: 600px; width: 100%; background-color: #FFFDF7;
                      border-radius: 8px; overflow: hidden;">

          <!-- Header -->
          <tr>
            <td style="background-color: #0D1B2A; padding: 24px 40px;">
              <span style="font-family: 'Jost', sans-serif; font-size: 22px; font-weight: 700;
                           color: #4ECDC4; letter-spacing: 0.02em;">Camello</span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px 40px 24px;
                       font-family: 'DM Sans', sans-serif; font-size: 15px;
                       line-height: 1.6; color: #2C2C2C;">
              ${body}
            </td>
          </tr>

          ${ctaBlock}

          <!-- Footer -->
          <tr>
            <td style="padding: 16px 40px 32px;
                       font-family: 'DM Sans', sans-serif; font-size: 12px;
                       color: #6B6B6B; border-top: 1px solid #E8E0D5;">
              &copy; 2025 Camello &middot; Unsubscribe
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

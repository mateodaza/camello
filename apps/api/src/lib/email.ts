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

  try {
    const { data, error } = await resend.emails.send({ from: FROM, to, subject, html });

    if (error || !data?.id) {
      console.error(`[email] Resend API error: ${error?.name ?? 'unknown'} — ${error?.message ?? 'no data returned'}`);
      return { sent: false };
    }

    return { sent: true, id: data.id };
  } catch (err) {
    console.error('[email] Resend transport error:', err instanceof Error ? err.message : String(err));
    return { sent: false };
  }
}

// ---------------------------------------------------------------------------
// renderBaseEmail
// ---------------------------------------------------------------------------

interface RenderBaseEmailOptions {
  title: string;
  body: string;
  ctaText?: string;
  ctaUrl?: string;
  /** Override logo + footer for customer-facing (white-label) emails. Defaults to Camello branding. */
  branding?: {
    logoUrl?: string;
    logoAlt: string;
    footerName: string;
    footerUrl?: string;
  };
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeContent(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderBaseEmail(options: RenderBaseEmailOptions): string {
  const { title, body, ctaText, ctaUrl, branding } = options;
  const logo = branding ?? { logoUrl: 'https://camello.xyz/logo.jpeg', logoAlt: 'Camello', footerName: 'Camello', footerUrl: 'https://camello.xyz' };
  const logoBlock = logo.logoUrl
    ? `<img src="${escapeAttr(logo.logoUrl)}" alt="${escapeAttr(logo.logoAlt)}" width="120" height="auto" style="display: block; border: 0; max-width: 120px;" />`
    : `<span style="font-family: 'Jost', ui-sans-serif, system-ui, sans-serif; font-size: 18px; font-weight: 700; color: #2D2D34;">${escapeContent(logo.logoAlt)}</span>`;
  const footerContent = logo.footerUrl
    ? `<a href="${escapeAttr(logo.footerUrl)}" style="color: #7A7268; text-decoration: underline;">${escapeContent(logo.footerName)}</a>`
    : escapeContent(logo.footerName);

  const safeTitle = escapeContent(title);
  const ctaBlock =
    ctaText && ctaUrl
      ? `
        <tr>
          <td align="left" style="padding: 0 48px 36px;">
            <a href="${escapeAttr(ctaUrl)}"
               style="display: inline-block; background-color: #00897B; color: #FAF5ED;
                      font-family: 'Jost', ui-sans-serif, system-ui, sans-serif; font-size: 14px; font-weight: 700;
                      text-decoration: none; padding: 14px 32px; border-radius: 6px;
                      letter-spacing: 0.04em; text-transform: uppercase;">
              ${escapeContent(ctaText)}
            </a>
          </td>
        </tr>`
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;600;700&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;1,9..40,400&display=swap" rel="stylesheet" />
  <style>
    /* Supported by Apple Mail, iOS Mail, Samsung Mail — ignored by Gmail */
    body { font-family: 'DM Sans', ui-sans-serif, system-ui, sans-serif; }
    .font-heading { font-family: 'Jost', ui-sans-serif, system-ui, sans-serif; }
    .font-body { font-family: 'DM Sans', ui-sans-serif, system-ui, sans-serif; }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #F4E8D6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="background-color: #F4E8D6; padding: 48px 0;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0"
               style="max-width: 580px; width: 100%;">

          <!-- Logo bar -->
          <tr>
            <td align="left" style="padding: 0 0 20px 4px;">
              ${logoBlock}
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color: #FAF5ED; border-radius: 12px;
                       border: 1px solid rgba(45,45,52,0.08);
                       box-shadow: 0 2px 12px rgba(22,22,29,0.06);">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">

                <!-- Body -->
                <tr>
                  <td style="padding: 40px 48px 28px;
                             font-family: 'DM Sans', ui-sans-serif, system-ui, sans-serif; font-size: 15px;
                             line-height: 1.75; color: #2D2D34;">
                    ${body}
                  </td>
                </tr>

                ${ctaBlock}

                <!-- Footer -->
                <tr>
                  <td style="padding: 20px 48px 28px; border-top: 1px solid rgba(45,45,52,0.08);">
                    <p style="margin: 0; font-family: 'DM Sans', ui-sans-serif, system-ui, sans-serif;
                               font-size: 11px; color: #7A7268; line-height: 1.6;">
                      &copy; ${new Date().getFullYear()} ${footerContent}
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// renderQuoteEmail
// ---------------------------------------------------------------------------

export interface QuoteEmailData {
  recipientName?: string;
  agentName: string;
  /** Tenant's business name — shown in footer and as logo fallback */
  tenantName: string;
  /** Tenant's logo URL (artifact avatar or brand asset). Falls back to text if omitted. */
  tenantLogoUrl?: string;
  quoteId: string;
  items: { description: string; quantity: number; unit_price: number }[];
  total: string;
  currency: string;
  validUntil: string;
  locale?: string;
}

const QUOTE_EMAIL_STRINGS = {
  en: {
    greeting: (name?: string) => name ? `Hi ${name},` : 'Hi,',
    intro: (agent: string) => `Here's the quote from <strong>${agent}</strong>. Please review the details below.`,
    description: 'Description',
    qty: 'Qty',
    price: 'Price',
    total: 'Total',
    quoteId: 'Quote ID',
    validUntil: 'Valid until',
    footer: 'To accept this quote or ask any questions, simply reply to this email or continue the conversation.',
    subject: (agent: string) => `Your quote from ${agent}`,
  },
  es: {
    greeting: (name?: string) => name ? `Hola ${name},` : 'Hola,',
    intro: (agent: string) => `Aquí está tu cotización de parte de <strong>${agent}</strong>. Por favor revisa los detalles a continuación.`,
    description: 'Descripción',
    qty: 'Cant.',
    price: 'Precio',
    total: 'Total',
    quoteId: 'N.º de cotización',
    validUntil: 'Válida hasta',
    footer: 'Para aceptar esta cotización o hacer preguntas, responde a este correo o continúa la conversación.',
    subject: (agent: string) => `Tu cotización de ${agent}`,
  },
} as const;

export function renderQuoteEmail(data: QuoteEmailData): string {
  const lang = data.locale === 'es' ? 'es' : 'en';
  const s = QUOTE_EMAIL_STRINGS[lang];
  const greeting = s.greeting(data.recipientName ? escapeContent(data.recipientName) : undefined);

  const rows = data.items.map((item) => `
    <tr>
      <td style="padding: 10px 0; border-bottom: 1px solid rgba(45,45,52,0.06);
                 font-family: 'DM Sans', ui-sans-serif, system-ui, sans-serif; font-size: 14px; color: #2D2D34;">
        ${escapeContent(item.description)}
      </td>
      <td style="padding: 10px 0; border-bottom: 1px solid rgba(45,45,52,0.06); text-align: center;
                 font-family: 'DM Sans', ui-sans-serif, system-ui, sans-serif; font-size: 14px; color: #7A7268;">
        ${item.quantity}
      </td>
      <td style="padding: 10px 0; border-bottom: 1px solid rgba(45,45,52,0.06); text-align: right;
                 font-family: 'DM Sans', ui-sans-serif, system-ui, sans-serif; font-size: 14px; color: #2D2D34;">
        ${data.currency} ${item.unit_price.toFixed(2)}
      </td>
    </tr>`).join('');

  const body = `
    <p style="margin: 0 0 20px;">${greeting}</p>
    <p style="margin: 0 0 24px;">${s.intro(escapeContent(data.agentName))}</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="border: 1px solid rgba(45,45,52,0.1); border-radius: 8px; margin-bottom: 24px; overflow: hidden;">
      <thead>
        <tr style="background-color: #F4E8D6;">
          <th style="padding: 10px 16px; text-align: left; font-family: 'Jost', ui-sans-serif, system-ui, sans-serif;
                     font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #7A7268;">
            ${s.description}
          </th>
          <th style="padding: 10px 16px; text-align: center; font-family: 'Jost', ui-sans-serif, system-ui, sans-serif;
                     font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #7A7268;">
            ${s.qty}
          </th>
          <th style="padding: 10px 16px; text-align: right; font-family: 'Jost', ui-sans-serif, system-ui, sans-serif;
                     font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #7A7268;">
            ${s.price}
          </th>
        </tr>
      </thead>
      <tbody style="padding: 0 16px;">
        ${rows.replace(/padding: 10px 0/g, 'padding: 10px 16px')}
        <tr>
          <td colspan="2" style="padding: 14px 16px; text-align: right;
                                  font-family: 'Jost', ui-sans-serif, system-ui, sans-serif;
                                  font-size: 13px; font-weight: 700; text-transform: uppercase;
                                  letter-spacing: 0.04em; color: #2D2D34;">
            ${s.total}
          </td>
          <td style="padding: 14px 16px; text-align: right;
                     font-family: 'Jost', ui-sans-serif, system-ui, sans-serif;
                     font-size: 16px; font-weight: 700; color: #00897B;">
            ${escapeContent(data.currency)} ${escapeContent(data.total)}
          </td>
        </tr>
      </tbody>
    </table>

    <p style="margin: 0 0 8px; font-size: 13px; color: #7A7268;">
      ${s.quoteId}: <strong>${escapeContent(data.quoteId)}</strong> &nbsp;&middot;&nbsp; ${s.validUntil} <strong>${escapeContent(data.validUntil)}</strong>
    </p>
    <p style="margin: 0; font-size: 13px; color: #7A7268;">
      ${s.footer}
    </p>`;

  return renderBaseEmail({
    title: `Quote from ${data.agentName}`,
    body,
    branding: {
      logoUrl: data.tenantLogoUrl,
      logoAlt: data.tenantName,
      footerName: data.tenantName,
    },
  });
}

export function quoteEmailSubject(agentName: string, locale?: string): string {
  return locale === 'es'
    ? QUOTE_EMAIL_STRINGS.es.subject(agentName)
    : QUOTE_EMAIL_STRINGS.en.subject(agentName);
}

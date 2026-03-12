/**
 * Smoke test for Resend email integration.
 * Run: npx tsx --env-file=.env scripts/smoke-email.ts your@email.com
 */
import { sendEmail, renderBaseEmail } from '../apps/api/src/lib/email.js';

const to = process.argv[2];
if (!to) {
  console.error('Usage: npx tsx --env-file=.env scripts/smoke-email.ts your@email.com');
  process.exit(1);
}

async function main() {
  const html = renderBaseEmail({
    title: 'Camello email smoke test',
    body: `<p>Hi,</p><p>This is a smoke test from the local Camello dev environment.</p><p>If you're reading this, Resend is wired up correctly.</p>`,
    ctaText: 'Open Dashboard',
    ctaUrl: process.env.DASHBOARD_URL ?? 'http://localhost:3000',
  });

  console.log('Sending to:', to);
  const result = await sendEmail({ to, subject: '[Camello] Email smoke test', html });

  if (result.sent) {
    console.log('✓ Sent — Resend message ID:', result.id);
  } else {
    console.error('✗ Not sent — check RESEND_API_KEY and domain verification');
    process.exit(1);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });

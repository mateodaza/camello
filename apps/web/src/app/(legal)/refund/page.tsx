import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Refund Policy | Camello',
  description:
    'Refund and cancellation policy for Camello subscriptions.',
};

const EFFECTIVE_DATE = 'March 13, 2026';

export default function RefundPage() {
  return (
    <article className="prose-legal">
      <h1 className="font-heading text-3xl font-bold tracking-tight text-charcoal mb-2">
        Refund Policy
      </h1>
      <p className="text-dune text-sm mb-10">
        Effective date: {EFFECTIVE_DATE}
      </p>

      <p className="text-charcoal/85 leading-relaxed mb-10">
        This Refund Policy applies to all subscription plans purchased
        through the Camello platform at{' '}
        <a
          href="https://camello.xyz"
          className="text-teal underline underline-offset-2"
        >
          camello.xyz
        </a>
        . All payments are processed by{' '}
        <a
          href="https://www.paddle.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-teal underline underline-offset-2"
        >
          Paddle.com
        </a>
        , our Merchant of Record.
      </p>

      {/* ── 1. Refund Window ── */}
      <Section n={1} title="14-Day Refund Window">
        <p>
          If you are not satisfied with your subscription, you may request a
          full refund within <strong>14 days</strong> of your initial
          purchase or renewal. Refund requests are processed by Paddle in
          accordance with{' '}
          <a
            href="https://www.paddle.com/legal/invoiced-consumer-terms"
            target="_blank"
            rel="noopener noreferrer"
          >
            Paddle&rsquo;s buyer terms
          </a>
          .
        </p>
      </Section>

      {/* ── 2. How to Request ── */}
      <Section n={2} title="How to Request a Refund">
        <p>
          To request a refund, contact us at{' '}
          <a href="mailto:billing@camello.xyz">billing@camello.xyz</a> within
          14 days of your purchase or renewal date. Include your account
          email and the billing period in question.
        </p>
        <p>
          Approved refunds are processed through Paddle and typically appear
          within 5&ndash;10 business days depending on your payment method.
        </p>
      </Section>

      {/* ── 3. Cancellation ── */}
      <Section n={3} title="Cancellation">
        <p>
          You may cancel your subscription at any time through the Camello
          dashboard under <strong>Settings &rarr; Billing</strong>.
        </p>
        <ul>
          <li>
            Cancellation takes effect at the <strong>end</strong> of your
            current billing period — you retain full access until then.
          </li>
          <li>
            After cancellation, your account remains accessible in a
            read-only state for 30 days so you can export your data.
          </li>
        </ul>
      </Section>

      {/* ── 4. Plan Changes ── */}
      <Section n={4} title="Plan Changes">
        <ul>
          <li>
            <strong>Upgrades:</strong> When you upgrade to a higher plan,
            the price difference is prorated for the remainder of your
            current billing cycle.
          </li>
          <li>
            <strong>Downgrades:</strong> Downgrades take effect at the start
            of your next billing cycle.
          </li>
        </ul>
      </Section>

      {/* ── 5. Paddle ── */}
      <Section n={5} title="Paddle as Merchant of Record">
        <p>
          Paddle acts as our Merchant of Record, meaning Paddle is the
          entity that processes your payment, issues invoices, and handles
          tax collection. All refund requests are processed through
          Paddle&rsquo;s payment infrastructure.
        </p>
        <p>
          For billing-related inquiries, you may also contact Paddle
          directly through their{' '}
          <a
            href="https://www.paddle.com/help"
            target="_blank"
            rel="noopener noreferrer"
          >
            help center
          </a>
          .
        </p>
      </Section>

      {/* ── 6. Contact ── */}
      <Section n={6} title="Contact">
        <p>
          Questions about billing or refunds? Reach us at{' '}
          <a href="mailto:billing@camello.xyz">billing@camello.xyz</a>.
        </p>
      </Section>
    </article>
  );
}

function Section({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2 className="font-heading text-xl font-semibold text-charcoal mb-3">
        {n}. {title}
      </h2>
      <div className="space-y-3 text-charcoal/85 leading-relaxed [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1.5 [&_a]:text-teal [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-teal/80">
        {children}
      </div>
    </section>
  );
}

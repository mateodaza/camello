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
        . Billing is handled by{' '}
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

      {/* ── 1. General Policy ── */}
      <Section n={1} title="General Policy">
        <p>
          All subscription fees are <strong>non-refundable</strong> once a
          billing cycle has started. Because Camello is a digital SaaS
          product with immediate access upon subscription, refunds are not
          issued for change of mind or lack of use.
        </p>
      </Section>

      {/* ── 2. Cancellation ── */}
      <Section n={2} title="Cancellation">
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
            No partial refunds are issued for unused time within a billing
            cycle.
          </li>
          <li>
            After cancellation, your account remains accessible in a
            read-only state for 30 days so you can export your data.
          </li>
        </ul>
      </Section>

      {/* ── 3. Exceptions ── */}
      <Section n={3} title="Refund Exceptions">
        <p>We may issue a refund in the following circumstances:</p>
        <ul>
          <li>
            <strong>Duplicate charges:</strong> If you are charged more than
            once for the same billing period due to a technical error.
          </li>
          <li>
            <strong>Service failure:</strong> If Camello experiences a
            material, prolonged outage (exceeding 72 consecutive hours) that
            prevents you from using the Service, you may request a pro-rata
            credit or refund for the affected period.
          </li>
          <li>
            <strong>Material breach:</strong> If we materially breach our{' '}
            <a href="/terms">Terms of Service</a> and fail to cure within
            30 days of written notice, you are entitled to a pro-rata refund
            of prepaid, unused fees.
          </li>
          <li>
            <strong>Legal requirements:</strong> Where applicable consumer
            protection laws in your jurisdiction mandate a refund right
            (e.g., EU cooling-off period for consumers, Colombian consumer
            protection under Ley 1480 de 2011).
          </li>
        </ul>
      </Section>

      {/* ── 4. Plan Changes ── */}
      <Section n={4} title="Plan Changes &amp; Upgrades">
        <ul>
          <li>
            <strong>Upgrades:</strong> When you upgrade to a higher plan,
            the price difference is prorated for the remainder of your
            current billing cycle. No refund is issued — you simply pay the
            difference.
          </li>
          <li>
            <strong>Downgrades:</strong> Downgrades take effect at the start
            of your next billing cycle. No refund or credit is issued for
            the current cycle.
          </li>
        </ul>
      </Section>

      {/* ── 5. How to Request ── */}
      <Section n={5} title="How to Request a Refund">
        <p>
          If you believe you qualify for a refund under the exceptions
          above, contact us at{' '}
          <a href="mailto:billing@camello.xyz">billing@camello.xyz</a> with:
        </p>
        <ul>
          <li>Your account email address;</li>
          <li>The billing period in question;</li>
          <li>A description of the issue.</li>
        </ul>
        <p>
          We will review your request within 5 business days. Approved
          refunds are processed through Paddle and typically appear within
          5–10 business days depending on your payment method.
        </p>
      </Section>

      {/* ── 6. Paddle ── */}
      <Section n={6} title="Paddle as Merchant of Record">
        <p>
          Paddle acts as our Merchant of Record, meaning Paddle is the
          entity that processes your payment and issues invoices. Paddle
          handles all tax collection and compliance. Refunds, when
          approved, are processed through Paddle&rsquo;s payment
          infrastructure.
        </p>
        <p>
          For billing-related inquiries that Camello cannot resolve, you may
          also contact Paddle directly through their{' '}
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

      {/* ── 7. Contact ── */}
      <Section n={7} title="Contact">
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

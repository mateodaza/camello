import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service | Camello',
  description:
    'Terms of Service for Camello — the AI sales agent platform.',
};

const EFFECTIVE_DATE = 'March 13, 2026';

export default function TermsPage() {
  return (
    <article className="prose-legal">
      <h1 className="font-heading text-3xl font-bold tracking-tight text-charcoal mb-2">
        Terms of Service
      </h1>
      <p className="text-dune text-sm mb-10">
        Effective date: {EFFECTIVE_DATE}
      </p>

      {/* ── 1. Agreement ── */}
      <Section n={1} title="Agreement to Terms">
        <p>
          These Terms of Service (&ldquo;Terms&rdquo;) constitute a binding
          agreement between you (&ldquo;Customer,&rdquo; &ldquo;you&rdquo;)
          and Mateo Daza, operating as Camello (&ldquo;Camello,&rdquo;
          &ldquo;we,&rdquo; &ldquo;us&rdquo;), a sole proprietorship based
          in Colombia.
        </p>
        <p>
          By creating an account or using the Camello platform at{' '}
          <a href="https://camello.xyz">camello.xyz</a> (the
          &ldquo;Service&rdquo;), you agree to be bound by these Terms. If
          you do not agree, do not use the Service.
        </p>
      </Section>

      {/* ── 2. Definitions ── */}
      <Section n={2} title="Definitions">
        <ul>
          <li>
            <strong>&ldquo;Service&rdquo;</strong> — the Camello SaaS
            platform, including the dashboard, AI agents, chat widget, APIs,
            and all related features.
          </li>
          <li>
            <strong>&ldquo;Agent&rdquo;</strong> — an AI-powered virtual
            assistant created and configured by you within the Service.
          </li>
          <li>
            <strong>&ldquo;Customer Data&rdquo;</strong> — any data you
            upload, provide, or generate through the Service, including
            business information, knowledge base content, conversation
            history, and lead records.
          </li>
          <li>
            <strong>&ldquo;End User&rdquo;</strong> — any person who
            interacts with your Agent through a public channel (web chat,
            WhatsApp, or other supported channels).
          </li>
          <li>
            <strong>&ldquo;Subscription&rdquo;</strong> — your paid plan
            (Starter, Growth, or Scale) as described on our pricing page.
          </li>
        </ul>
      </Section>

      {/* ── 3. Account ── */}
      <Section n={3} title="Account Registration">
        <p>
          You must provide accurate information when creating an account. You
          are responsible for maintaining the security of your credentials
          and for all activity under your account. You must notify us
          immediately of any unauthorized access.
        </p>
        <p>
          You must be at least 18 years of age to use the Service. By
          creating an account, you represent that you meet this requirement.
        </p>
      </Section>

      {/* ── 4. License ── */}
      <Section n={4} title="License Grant &amp; Restrictions">
        <p>
          We grant you a limited, non-exclusive, non-transferable,
          revocable license to access and use the Service during your active
          Subscription, solely for your internal business purposes.
        </p>
        <p>You may not:</p>
        <ul>
          <li>Reverse-engineer, decompile, or disassemble the Service;</li>
          <li>
            Resell, sublicense, or provide the Service to third parties as
            a managed service;
          </li>
          <li>
            Use the Service to build a competing product or for competitive
            benchmarking;
          </li>
          <li>
            Circumvent usage limits, rate limits, or security measures;
          </li>
          <li>
            Use the Service to transmit harmful, illegal, or misleading
            content;
          </li>
          <li>
            Use Agents to impersonate real individuals without their
            consent.
          </li>
        </ul>
      </Section>

      {/* ── 5. AI Disclaimers ── */}
      <Section n={5} title="AI Agent Disclaimers">
        <p>
          Agents are powered by large language models (LLMs) and generate
          responses based on the knowledge and instructions you provide. You
          acknowledge that:
        </p>
        <ul>
          <li>
            AI-generated outputs may be inaccurate, incomplete, or
            inappropriate. You are responsible for reviewing and approving
            Agent actions, especially in &ldquo;suggest only&rdquo; and
            &ldquo;draft &amp; approve&rdquo; autonomy modes.
          </li>
          <li>
            We do not guarantee any specific business outcomes, including
            sales conversions, response rates, or lead quality.
          </li>
          <li>
            AI outputs do not constitute professional advice (legal,
            financial, medical, or otherwise).
          </li>
          <li>
            You are solely responsible for ensuring your Agents comply with
            applicable laws and regulations in your jurisdiction.
          </li>
        </ul>
      </Section>

      {/* ── 6. Data Ownership ── */}
      <Section n={6} title="Customer Data &amp; Ownership">
        <p>
          You retain all rights to your Customer Data. By using the Service,
          you grant us a limited license to process your Customer Data
          solely to provide, maintain, and improve the Service.
        </p>
        <p>
          <strong>
            We do not use your Customer Data to train AI or machine learning
            models.
          </strong>{' '}
          Conversation data is processed by third-party LLM providers in
          real time to generate responses and is not retained by those
          providers for training purposes.
        </p>
        <p>
          Upon termination, you may request export of your Customer Data
          within 30 days. After this period, we may delete your data in
          accordance with our retention policies.
        </p>
      </Section>

      {/* ── 7. Fees & Payment ── */}
      <Section n={7} title="Fees &amp; Payment">
        <p>
          Billing is processed by{' '}
          <a
            href="https://www.paddle.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            Paddle.com
          </a>{' '}
          as our Merchant of Record. Paddle handles payment processing, tax
          collection, invoicing, and refunds on our behalf. By subscribing,
          you also agree to{' '}
          <a
            href="https://www.paddle.com/legal/terms"
            target="_blank"
            rel="noopener noreferrer"
          >
            Paddle&rsquo;s Terms of Service
          </a>
          .
        </p>
        <p>
          Subscriptions renew automatically at the end of each billing
          cycle. You may cancel at any time through the dashboard — your
          access continues until the end of the current billing period.
        </p>
        <p>
          We reserve the right to change pricing with 30 days&rsquo; notice.
          Price changes apply at the start of your next billing cycle.
        </p>
      </Section>

      {/* ── 8. Refund ── */}
      <Section n={8} title="Refund Policy">
        <p>
          All subscription fees are non-refundable, except as required by
          applicable law or Paddle&rsquo;s buyer protection policies. Because
          Paddle acts as Merchant of Record, refund requests are governed by
          Paddle&rsquo;s policies.
        </p>
        <p>
          If we materially breach these Terms and fail to cure the breach
          within 30 days of written notice, you are entitled to a pro-rata
          refund of prepaid, unused fees.
        </p>
        <p>
          Cancellation takes effect at the end of the current billing
          period. No partial refunds are issued for unused time within a
          billing cycle.
        </p>
      </Section>

      {/* ── 9. Acceptable Use ── */}
      <Section n={9} title="Acceptable Use">
        <p>
          You agree not to use the Service to:
        </p>
        <ul>
          <li>
            Violate any applicable law, regulation, or third-party right;
          </li>
          <li>Send spam, unsolicited messages, or deceptive content;</li>
          <li>Harass, abuse, or threaten End Users or others;</li>
          <li>
            Collect personal information from End Users without proper
            consent and legal basis;
          </li>
          <li>
            Distribute malware or interfere with the Service&rsquo;s
            infrastructure;
          </li>
          <li>
            Process sensitive personal data (health, financial, biometric)
            through Agents without appropriate safeguards.
          </li>
        </ul>
        <p>
          We may suspend or terminate your account if we reasonably believe
          you are violating this section.
        </p>
      </Section>

      {/* ── 10. Confidentiality ── */}
      <Section n={10} title="Confidentiality">
        <p>
          Each party agrees to protect the other party&rsquo;s confidential
          information with the same degree of care it uses for its own
          confidential information (but no less than reasonable care).
          Confidential information does not include information that is
          publicly available, independently developed, or rightfully
          received from a third party.
        </p>
      </Section>

      {/* ── 11. Warranties ── */}
      <Section n={11} title="Warranties &amp; Disclaimers">
        <p>
          The Service is provided <strong>&ldquo;as is&rdquo;</strong> and{' '}
          <strong>&ldquo;as available&rdquo;</strong> without warranties of
          any kind, whether express, implied, or statutory, including but
          not limited to implied warranties of merchantability, fitness for
          a particular purpose, and non-infringement.
        </p>
        <p>
          We do not warrant that the Service will be uninterrupted, secure,
          or error-free, or that AI-generated outputs will be accurate or
          suitable for your needs.
        </p>
      </Section>

      {/* ── 12. Liability ── */}
      <Section n={12} title="Limitation of Liability">
        <p>
          To the maximum extent permitted by law, Camello&rsquo;s total
          aggregate liability for any claims arising from or relating to
          these Terms or the Service shall not exceed the total fees you
          paid to us in the 12 months preceding the claim.
        </p>
        <p>
          In no event shall we be liable for any indirect, incidental,
          special, consequential, or punitive damages, including loss of
          profits, data, or business opportunities, regardless of cause of
          action.
        </p>
        <p>
          This limitation does not apply to liability arising from gross
          negligence, willful misconduct, or fraud.
        </p>
      </Section>

      {/* ── 13. Indemnification ── */}
      <Section n={13} title="Indemnification">
        <p>
          You agree to indemnify and hold harmless Camello from any claims,
          damages, or expenses (including reasonable attorneys&rsquo; fees)
          arising from: (a) your use of the Service; (b) your violation of
          these Terms; (c) content or data you provide through the Service;
          or (d) your Agents&rsquo; interactions with End Users.
        </p>
      </Section>

      {/* ── 14. Termination ── */}
      <Section n={14} title="Term &amp; Termination">
        <p>
          These Terms remain in effect while you use the Service. Either
          party may terminate by providing written notice. We may suspend or
          terminate your access immediately if you breach these Terms.
        </p>
        <p>
          Upon termination: (a) your license to use the Service ceases; (b)
          you may request data export within 30 days; (c) sections that by
          their nature should survive (including Limitation of Liability,
          Indemnification, and Governing Law) will continue in effect.
        </p>
      </Section>

      {/* ── 15. Governing Law ── */}
      <Section n={15} title="Governing Law">
        <p>
          These Terms are governed by the laws of the Republic of Colombia.
          Any disputes arising under these Terms shall be resolved in the
          courts of Bogot&aacute;, Colombia, unless otherwise required by
          applicable consumer protection law.
        </p>
      </Section>

      {/* ── 16. Changes ── */}
      <Section n={16} title="Changes to These Terms">
        <p>
          We may update these Terms from time to time. We will notify you of
          material changes by email or through the dashboard at least 30
          days before they take effect. Continued use of the Service after
          changes become effective constitutes acceptance of the updated
          Terms.
        </p>
      </Section>

      {/* ── 17. Contact ── */}
      <Section n={17} title="Contact">
        <p>
          If you have questions about these Terms, contact us at{' '}
          <a href="mailto:legal@camello.xyz">legal@camello.xyz</a>.
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

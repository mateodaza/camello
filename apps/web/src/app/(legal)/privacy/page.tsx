import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | Camello',
  description:
    'Privacy Policy for Camello — how we collect, use, and protect your data.',
};

const EFFECTIVE_DATE = 'March 13, 2026';

export default function PrivacyPage() {
  return (
    <article className="prose-legal">
      <h1 className="font-heading text-3xl font-bold tracking-tight text-charcoal mb-2">
        Privacy Policy
      </h1>
      <p className="text-dune text-sm mb-10">
        Effective date: {EFFECTIVE_DATE}
      </p>

      <p className="text-charcoal/85 leading-relaxed mb-10">
        Camello (&ldquo;we,&rdquo; &ldquo;us,&rdquo; &ldquo;our&rdquo;) is
        operated by Mateo Daza as a sole proprietorship based in Colombia.
        This Privacy Policy explains how we collect, use, share, and protect
        your information when you use the Camello platform at{' '}
        <a
          href="https://camello.xyz"
          className="text-teal underline underline-offset-2"
        >
          camello.xyz
        </a>{' '}
        (the &ldquo;Service&rdquo;).
      </p>

      {/* ── 1. What We Collect ── */}
      <Section n={1} title="Information We Collect">
        <h3 className="font-heading font-semibold text-charcoal mt-4 mb-2">
          1.1 Account Information
        </h3>
        <p>
          When you create an account, we collect your name, email address,
          organization name, and authentication credentials (managed by our
          auth provider, Clerk).
        </p>

        <h3 className="font-heading font-semibold text-charcoal mt-4 mb-2">
          1.2 Business &amp; Agent Data
        </h3>
        <p>
          Information you provide to configure your AI agents: business
          description, knowledge base content, agent personalities,
          conversation scripts, product catalogs, pricing, and lead records.
        </p>

        <h3 className="font-heading font-semibold text-charcoal mt-4 mb-2">
          1.3 Conversation Data
        </h3>
        <p>
          Messages exchanged between your End Users and your AI Agents,
          including message content, timestamps, and conversation metadata
          (channel, session duration, resolution status).
        </p>

        <h3 className="font-heading font-semibold text-charcoal mt-4 mb-2">
          1.4 Usage Data
        </h3>
        <p>
          We automatically collect: IP addresses, browser type, device
          information, pages visited, feature usage patterns, and
          performance metrics (response times, error rates).
        </p>

        <h3 className="font-heading font-semibold text-charcoal mt-4 mb-2">
          1.5 Payment Data
        </h3>
        <p>
          Payment information (credit card numbers, billing address) is
          collected and processed directly by{' '}
          <a
            href="https://www.paddle.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            Paddle
          </a>
          , our Merchant of Record. We do not store your payment card
          details.
        </p>
      </Section>

      {/* ── 2. How We Use It ── */}
      <Section n={2} title="How We Use Your Information">
        <ul>
          <li>
            <strong>Provide the Service:</strong> Process conversations,
            generate AI responses, execute agent actions, and display your
            dashboard analytics.
          </li>
          <li>
            <strong>Improve the Service:</strong> Analyze aggregated,
            de-identified usage patterns to improve features, performance,
            and reliability.
          </li>
          <li>
            <strong>Billing:</strong> Manage subscriptions, process
            payments, and enforce plan limits (via Paddle).
          </li>
          <li>
            <strong>Communications:</strong> Send transactional emails
            (account alerts, approval requests, billing receipts) and,
            with your consent, product updates.
          </li>
          <li>
            <strong>Security:</strong> Detect abuse, prevent fraud, and
            enforce our Terms of Service.
          </li>
        </ul>
      </Section>

      {/* ── 3. AI & Data Training ── */}
      <Section n={3} title="AI Processing &amp; Data Training">
        <p>
          <strong>
            We do not use your Customer Data to train AI or machine learning
            models.
          </strong>
        </p>
        <p>
          When your Agent processes a conversation, the message content is
          sent to third-party LLM providers (via OpenRouter) solely to
          generate a real-time response. These providers process the data
          under their own data processing agreements and do not retain
          conversation data for model training.
        </p>
        <p>
          We use Retrieval-Augmented Generation (RAG) to provide your Agent
          with relevant knowledge — your data is stored as vector embeddings
          in our database and retrieved at query time. It is never used to
          fine-tune or train foundation models.
        </p>
      </Section>

      {/* ── 4. Third Parties ── */}
      <Section n={4} title="Third-Party Service Providers">
        <p>
          We share data with the following categories of providers, solely
          to operate the Service:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm mt-3 mb-3">
            <thead>
              <tr className="border-b border-charcoal/15">
                <th className="text-left py-2 pr-4 font-heading font-semibold">
                  Provider
                </th>
                <th className="text-left py-2 pr-4 font-heading font-semibold">
                  Purpose
                </th>
                <th className="text-left py-2 font-heading font-semibold">
                  Data Shared
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-charcoal/8">
              <tr>
                <td className="py-2 pr-4">Clerk</td>
                <td className="py-2 pr-4">Authentication &amp; identity</td>
                <td className="py-2">Name, email, org membership</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Paddle</td>
                <td className="py-2 pr-4">Payment processing (MoR)</td>
                <td className="py-2">Email, billing details</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Supabase</td>
                <td className="py-2 pr-4">Database &amp; storage</td>
                <td className="py-2">All Customer Data (encrypted at rest)</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">OpenRouter + LLM providers</td>
                <td className="py-2 pr-4">AI response generation</td>
                <td className="py-2">Conversation messages (transient)</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Vercel</td>
                <td className="py-2 pr-4">Dashboard hosting</td>
                <td className="py-2">IP, browser, usage logs</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Railway</td>
                <td className="py-2 pr-4">API &amp; worker hosting</td>
                <td className="py-2">API request logs</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">Cloudflare</td>
                <td className="py-2 pr-4">Widget hosting &amp; CDN</td>
                <td className="py-2">IP, request metadata</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          We do not sell your personal data to advertisers or data brokers.
        </p>
      </Section>

      {/* ── 5. Cookies ── */}
      <Section n={5} title="Cookies &amp; Tracking">
        <p>We use the following types of cookies:</p>
        <ul>
          <li>
            <strong>Essential cookies:</strong> Required for authentication,
            session management, and locale preferences.
          </li>
          <li>
            <strong>Analytics cookies:</strong> Help us understand how the
            Service is used (aggregated, de-identified).
          </li>
        </ul>
        <p>
          We do not use advertising cookies or cross-site tracking. You can
          disable non-essential cookies through your browser settings.
        </p>
      </Section>

      {/* ── 6. Data Retention ── */}
      <Section n={6} title="Data Retention">
        <p>
          We retain your Customer Data for as long as your account is active
          and for a reasonable period thereafter to fulfill legal
          obligations, resolve disputes, and enforce our agreements.
        </p>
        <p>
          Conversation data is retained for the duration of your
          subscription. Upon account deletion, we delete or anonymize your
          data within 30 days, except where retention is required by law.
        </p>
      </Section>

      {/* ── 7. Data Security ── */}
      <Section n={7} title="Data Security">
        <p>We implement industry-standard security measures including:</p>
        <ul>
          <li>Encryption in transit (TLS) and at rest;</li>
          <li>
            Row-Level Security (RLS) for strict tenant isolation — your data
            is inaccessible to other customers at the database level;
          </li>
          <li>Role-based access controls and audit logging;</li>
          <li>Regular security reviews and dependency updates.</li>
        </ul>
        <p>
          No method of transmission or storage is 100% secure. While we
          strive to protect your data, we cannot guarantee absolute
          security.
        </p>
      </Section>

      {/* ── 8. International Transfers ── */}
      <Section n={8} title="International Data Transfers">
        <p>
          Camello is based in Colombia. Your data may be processed in the
          United States and other countries where our service providers
          operate (Supabase, Vercel, Railway, Cloudflare). We ensure
          appropriate safeguards are in place, including Standard
          Contractual Clauses (SCCs) where required for transfers from the
          EU/EEA.
        </p>
      </Section>

      {/* ── 9. Your Rights ── */}
      <Section n={9} title="Your Rights">
        <p>
          Depending on your jurisdiction, you may have the following rights
          regarding your personal data:
        </p>

        <h3 className="font-heading font-semibold text-charcoal mt-4 mb-2">
          All Users
        </h3>
        <ul>
          <li>Access your personal data we hold;</li>
          <li>Correct inaccurate or incomplete data;</li>
          <li>Delete your account and associated data;</li>
          <li>Export your data in a portable format.</li>
        </ul>

        <h3 className="font-heading font-semibold text-charcoal mt-4 mb-2">
          EU/EEA Residents (GDPR)
        </h3>
        <ul>
          <li>
            Right to restrict or object to processing based on legitimate
            interest;
          </li>
          <li>Right to data portability;</li>
          <li>Right to withdraw consent at any time;</li>
          <li>
            Right to lodge a complaint with your local Data Protection
            Authority.
          </li>
        </ul>

        <h3 className="font-heading font-semibold text-charcoal mt-4 mb-2">
          Colombian Residents (Ley 1581 de 2012)
        </h3>
        <ul>
          <li>
            Right to know, update, and rectify your personal data
            (habeas data);
          </li>
          <li>Right to request deletion of your data;</li>
          <li>Right to revoke authorization for data processing;</li>
          <li>
            Right to file complaints with the Superintendencia de Industria
            y Comercio (SIC).
          </li>
        </ul>

        <h3 className="font-heading font-semibold text-charcoal mt-4 mb-2">
          California Residents (CCPA)
        </h3>
        <ul>
          <li>Right to know what personal information we collect and why;</li>
          <li>Right to delete your personal information;</li>
          <li>Right to opt out of the sale of personal information;</li>
          <li>Right to non-discrimination for exercising your rights.</li>
        </ul>

        <p className="mt-4">
          To exercise any of these rights, contact us at{' '}
          <a href="mailto:privacy@camello.xyz">privacy@camello.xyz</a>.
        </p>
      </Section>

      {/* ── 10. Children ── */}
      <Section n={10} title="Children&rsquo;s Privacy">
        <p>
          The Service is not directed to individuals under 18 years of age.
          We do not knowingly collect personal information from children. If
          you believe a child has provided us with personal data, contact us
          and we will delete it promptly.
        </p>
      </Section>

      {/* ── 11. Changes ── */}
      <Section n={11} title="Changes to This Policy">
        <p>
          We may update this Privacy Policy from time to time. We will
          notify you of material changes by email or through the dashboard
          at least 30 days before they take effect. The &ldquo;Effective
          date&rdquo; at the top indicates the latest revision.
        </p>
      </Section>

      {/* ── 12. Contact ── */}
      <Section n={12} title="Contact">
        <p>
          For privacy-related questions or to exercise your data rights,
          contact us at:{' '}
          <a href="mailto:privacy@camello.xyz">privacy@camello.xyz</a>.
        </p>
        <p>
          Data Controller: Mateo Daza, operating as Camello
          <br />
          Location: Colombia
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

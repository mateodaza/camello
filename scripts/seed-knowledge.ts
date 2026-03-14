/**
 * Seed Camello knowledge base with real embeddings.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx scripts/seed-knowledge.ts [local|cloud|both]
 *
 * Defaults to "both" if no argument given.
 */

import pg from 'pg';
import { randomUUID } from 'crypto';
import { ingestKnowledge } from '../packages/ai/src/knowledge-ingestion.js';
import type { KnowledgeChunk } from '../packages/shared/src/types/index.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TENANT_ID = 'a0a0a0a0-0000-0000-0000-000000000001';

// Artifact IDs differ between local and cloud
const ARTIFACT_IDS = {
  local: 'b0b0b0b0-0000-0000-0000-000000000001',
  cloud: '91fe370d-280e-4153-bd6d-23dddc29953e',
} as const;

const LOCAL_DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const CLOUD_DB = process.env.CLOUD_DATABASE_URL; // optional, only for direct PG

// ---------------------------------------------------------------------------
// Knowledge content — real Camello product info
// ---------------------------------------------------------------------------

const KNOWLEDGE_DOCS: { title: string; content: string }[] = [
  {
    title: 'Camello — Product Overview',
    content: `Camello is the AI workforce platform for businesses. Instead of hiring virtual assistants or building custom chatbots, businesses describe what they do and Camello generates role-based AI agents — sales agents, support agents, and marketing agents — ready to deploy on WhatsApp and web chat within minutes.

Each agent comes with composable action modules: lead qualification, meeting booking, payment collection, follow-up messaging, quote generation, ticket creation, and more. Agents understand your business context through a built-in RAG knowledge base — you upload your product info, FAQs, pricing, and policies, and the agent uses that knowledge in every conversation.

The platform is built for progressive autonomy. Businesses start with agents that draft responses for human approval, then gradually increase automation as trust builds. The three autonomy levels are:
- Suggest Only: Agent drafts, human sends
- Draft & Approve: Agent acts, human approves before execution
- Fully Autonomous: Agent handles everything independently

Camello handles multi-tenant isolation, so each business gets its own secure workspace with data completely separated from other tenants. The platform supports English and Spanish out of the box.`,
  },
  {
    title: 'Pricing Plans',
    content: `Camello offers three pricing tiers:

**Starter — $29/month**
- 1 AI agent
- Web chat channel
- 10 knowledge ingestions per day
- Up to 50 chunks per document
- Core modules (lead qualification, interest capture)
- Suggest Only autonomy mode
- Email support
- Great for freelancers and micro-businesses testing AI automation

**Growth — $79/month**
- Up to 3 AI agents
- Web chat + WhatsApp channels
- 50 knowledge ingestions per day
- Up to 200 chunks per document
- All 9 action modules
- All autonomy levels (Suggest Only, Draft & Approve, Fully Autonomous)
- Priority support
- Business analytics dashboard
- Best for growing businesses ready to automate customer interactions

**Scale — $199/month**
- Unlimited AI agents
- All channels (web chat, WhatsApp, more coming)
- 200 knowledge ingestions per day
- Up to 500 chunks per document
- All modules + custom module support
- Full autonomy with advanced routing rules
- Dedicated support
- Advanced analytics, team collaboration
- Built for agencies and businesses with high conversation volume

All plans include a 14-day free trial. No credit card required to start. Cancel anytime.`,
  },
  {
    title: 'Use Cases — Sales Agent',
    content: `Camello's AI sales agent handles the entire inbound sales funnel:

**Lead Qualification**: When a potential customer reaches out via WhatsApp or web chat, the sales agent engages them in natural conversation, asks qualifying questions (budget, timeline, needs), and automatically scores them as hot, warm, or cold leads. No more manually triaging every inquiry.

**Meeting Booking**: Once a lead is qualified, the agent can propose meeting times and book demo calls directly. It handles scheduling coordination so your team doesn't waste time on back-and-forth emails.

**Quote Generation**: For businesses that sell products or services with variable pricing, the agent can generate structured quotes with line items, totals, and validity periods — subject to human approval if desired.

**Follow-up Messaging**: The agent automatically follows up with leads who haven't responded, using customizable templates (gentle reminder, value-add, last chance). No lead falls through the cracks.

**Interest Capture**: For leads not ready to buy, the agent captures their contact info and interest level for future nurturing.

Real example: A real estate agency using Camello's sales agent qualified 3x more leads per week because the agent handles initial conversations 24/7, only escalating to human agents for serious buyers.`,
  },
  {
    title: 'Use Cases — Support Agent',
    content: `Camello's AI support agent deflects common tickets and escalates complex issues:

**Ticket Creation**: When a customer reports an issue, the agent creates a structured support ticket with subject, category, priority, and description — ready for your team to resolve.

**Escalation**: For issues the agent can't resolve (complaints, technical problems, billing disputes), it escalates to a human agent with a full conversation summary. The handoff is seamless — the customer doesn't have to repeat themselves.

**Knowledge-Powered Answers**: The agent uses your knowledge base (FAQs, product docs, policies) to answer common questions instantly. Upload your help center content and the agent handles the rest.

**24/7 Availability**: Unlike human agents, Camello's support agent never sleeps. It handles inquiries across time zones, in English or Spanish, at any hour.

Best for: e-commerce stores, SaaS companies, service businesses that receive repetitive support questions and want to free up their human team for complex cases.`,
  },
  {
    title: 'Key Differentiators — Why Camello vs Alternatives',
    content: `**Why Camello beats hiring a virtual assistant:**
- VAs cost $500-2000/month, work limited hours, and need training. Camello starts at $29/month, works 24/7, and learns from your knowledge base instantly.
- VAs can't handle multiple conversations simultaneously. Camello handles unlimited concurrent conversations.
- VAs need supervision and management. Camello's progressive autonomy means it starts supervised and earns independence.

**Why Camello beats generic chatbots (Tidio, Intercom bots, ManyChat):**
- Generic chatbots use rigid decision trees. Camello uses LLM-powered natural conversation that adapts to context.
- Chatbots require manual flow building. Camello understands your business from a description and uploaded knowledge — no flow builder needed.
- Chatbots can't take real actions. Camello's module system lets agents qualify leads, book meetings, generate quotes, and collect payments.
- Chatbots are channel-locked. Camello deploys the same agent on WhatsApp and web chat with zero extra work.

**Why Camello beats building your own AI solution:**
- Building a custom AI agent takes months of engineering. Camello gets you live in minutes.
- You'd need to handle embeddings, RAG, conversation state, multi-tenancy, channel integrations, and safety guardrails. Camello handles all of this out of the box.
- Maintenance and model updates are our problem, not yours.

**Unique Camello features:**
- Progressive autonomy (no other platform offers graduated trust levels)
- Composable action modules (mix and match capabilities per agent)
- WhatsApp-native (not just an afterthought — built for LatAm and emerging markets)
- Built-in business analytics with AI advisor insights
- Multi-language (English + Spanish, more coming)`,
  },
  {
    title: 'Getting Started with Camello',
    content: `Setting up your AI agent on Camello takes less than 10 minutes:

**Step 1 — Create your account**
Sign up at camello.xyz. No credit card required for the 14-day trial.

**Step 2 — Describe your business**
Tell Camello what your business does in plain language. For example: "We're a digital marketing agency. We offer SEO, social media management, and paid ads. Our packages start at $500/month." The AI uses this to configure your agent's personality, tone, and goals.

**Step 3 — Meet your agent**
Camello generates a sales agent tailored to your business. Review its name, greeting, and personality. Adjust if needed.

**Step 4 — Teach your agent**
Upload your key business content: product descriptions, pricing sheets, FAQs, policies. The agent uses this knowledge base to answer customer questions accurately. You can also let it auto-learn from your business description.

**Step 5 — Connect a channel**
Deploy on web chat (embed a widget on your website) or WhatsApp (connect your business number). Both channels work simultaneously.

**Step 6 — Test and go live**
Chat with your agent to verify it responds correctly. Adjust autonomy levels — start with "Draft & Approve" so you review every action, then increase autonomy as you build confidence.

**Ongoing:**
- Monitor conversations in the dashboard
- Review and approve pending module executions (bookings, quotes)
- Check the AI advisor for performance insights
- Add more knowledge documents as your business evolves`,
  },
  {
    title: 'Frequently Asked Questions',
    content: `**Q: What channels does Camello support?**
A: Web chat (embeddable widget for any website) and WhatsApp Business. We're adding more channels soon.

**Q: What languages does Camello support?**
A: English and Spanish. Both the dashboard and AI agents work in either language. More languages are on the roadmap.

**Q: How does the knowledge base work?**
A: You upload text content (product info, FAQs, policies) or provide URLs. Camello chunks the content, generates vector embeddings, and stores it. When a customer asks a question, the agent searches your knowledge base using semantic similarity to find the most relevant answers.

**Q: Is my data secure?**
A: Yes. Each business gets its own isolated workspace with Row-Level Security (RLS) at the database level. Your data is never shared with other tenants. We use Supabase (hosted Postgres) with encryption at rest and in transit.

**Q: Can I control what the agent says?**
A: Absolutely. You set constraints (topics to never discuss, situations to always escalate), choose autonomy levels per module, and review all actions in "Draft & Approve" mode before anything goes to customers.

**Q: How does billing work?**
A: Monthly subscription via Paddle (our payment processor). We accept credit cards and many local payment methods. Cancel anytime — no long-term contracts.

**Q: Can I use Camello for my clients (agency model)?**
A: Yes! The Scale plan supports unlimited agents. Agencies can manage multiple client workspaces from a single account. Each client gets isolated data and their own agent configuration.

**Q: What happens when the agent can't answer a question?**
A: The agent escalates to a human. You get a notification with the full conversation summary so you can pick up seamlessly. No information is lost.

**Q: Do I need technical skills to use Camello?**
A: No. The entire setup is guided — describe your business in plain language, upload your content, and deploy. No coding, no flow builders, no API configuration needed.

**Q: Who is behind Camello?**
A: Camello is built by Mateo Daza, a software engineer based in Bogota, Colombia. You can reach Mateo directly at mateodaza@gmail.com or book a demo through the website.`,
  },
  {
    title: 'Module System — Composable Agent Actions',
    content: `Camello agents don't just chat — they take real actions through composable modules. Each module is a discrete capability that you can enable, disable, or set autonomy levels for independently.

**Available Modules:**

1. **Qualify Lead** (Sales) — Scores leads as hot/warm/cold based on conversation context. Extracts budget, timeline, and needs. Suggests next actions.

2. **Book Meeting** (Sales) — Proposes meeting times, coordinates scheduling, generates calendar links. Perfect for demo bookings and consultations.

3. **Send Quote** (Sales) — Generates structured quotes with line items, totals, currency, and validity period. Great for service businesses with variable pricing.

4. **Collect Payment** (Sales) — Sends payment links for invoices or orders. Integrates with your payment setup.

5. **Capture Interest** (Marketing) — Logs customer interest level and contact info for leads not ready to buy. Builds your nurture pipeline.

6. **Send Follow-up** (Marketing) — Sends templated follow-up messages (gentle reminder, value-add, last chance). Prevents leads from going cold.

7. **Draft Content** (Marketing) — Drafts marketing content from conversation context. Useful for social posts, email snippets, or product descriptions.

8. **Create Ticket** (Support) — Creates structured support tickets with subject, category, priority, and description.

9. **Escalate to Human** (Support) — Hands off the conversation to a human agent with full context summary.

**Autonomy per module:** Each module can independently be set to Suggest Only, Draft & Approve, or Fully Autonomous. For example, you might let lead qualification run autonomously while requiring human approval for quotes.`,
  },
  {
    title: 'Progressive Autonomy — Trust Graduation',
    content: `Progressive autonomy is Camello's core differentiator. Unlike chatbots that are either fully manual or fully automated, Camello lets you graduate trust over time.

**How it works:**

When you first set up your agent, we recommend starting with "Draft & Approve" mode. In this mode, the agent handles conversations and prepares actions (qualifying a lead, booking a meeting, generating a quote), but waits for your approval before executing. You review each action in the dashboard and approve or reject it.

As you see the agent making good decisions consistently, you can increase autonomy module by module:
- First, let lead qualification run autonomously (low risk)
- Then follow-ups (medium risk)
- Then meeting booking (medium risk)
- Finally, quotes and payments (higher risk — keep these on approval longer)

**The three levels:**
1. **Suggest Only** — Agent drafts a response, you send it manually. Maximum control.
2. **Draft & Approve** — Agent prepares the action, you approve with one click. Balanced.
3. **Fully Autonomous** — Agent executes immediately. Maximum efficiency.

**Why this matters:**
- 70% of businesses want AI automation but don't trust it enough to go fully autonomous on day one
- Progressive autonomy lets you build confidence gradually
- You never lose control — you can dial back autonomy at any time
- The dashboard shows a "Trust Graduation" card tracking your autonomy journey

**Business impact:**
Businesses typically start at 30% automation and reach 80%+ within 2-4 weeks. The ones that graduate fastest are those who actively review and approve agent actions in the first week.`,
  },
  {
    title: 'WhatsApp Integration',
    content: `Camello integrates natively with WhatsApp Business via the official Meta Cloud API. This means your AI agent can receive and respond to customer messages on WhatsApp — the most popular messaging app in Latin America, with 2 billion users globally.

**Setup:**
1. You need a WhatsApp Business account and a verified phone number
2. Connect your number through the Camello dashboard (Connect Channel step)
3. Camello handles webhook registration, message routing, and response delivery

**Features on WhatsApp:**
- Natural conversational AI (not canned replies)
- All module actions work (qualify leads, book meetings, send quotes)
- Knowledge base answers available in real-time
- Auto-detected language (English or Spanish)
- Abuse prevention (rate limiting, conversation caps)

**Why WhatsApp matters:**
- In Latin America, WhatsApp is the primary business communication channel
- Customers prefer messaging over email or phone calls
- Response time expectations on WhatsApp are minutes, not hours
- Businesses that respond fast on WhatsApp close 2-3x more sales

**Security:**
- Webhook signature verification using HMAC-SHA256
- Rate limiting per customer (20 messages/minute burst, 50/conversation, 100/day)
- Messages processed asynchronously for fast webhook response times
- No message content stored on our servers beyond conversation history`,
  },
];

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

function makeInsertChunks(pool: pg.Pool, tenantId: string, artifactId: string | null) {
  return async (chunks: KnowledgeChunk[]): Promise<string[]> => {
    const ids: string[] = [];
    for (const chunk of chunks) {
      const id = randomUUID();
      ids.push(id);
      const embeddingStr = `[${chunk.embedding.join(',')}]`;
      await pool.query(
        `INSERT INTO knowledge_docs (id, tenant_id, artifact_id, title, content, source_type, chunk_index, metadata, embedding)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::vector)`,
        [
          id,
          tenantId,
          artifactId,
          chunk.title ?? null,
          chunk.content,
          chunk.sourceType,
          chunk.chunkIndex,
          JSON.stringify(chunk.metadata),
          embeddingStr,
        ],
      );
    }
    return ids;
  };
}

function makeGetIngestionCountToday(_pool: pg.Pool) {
  return async (_tenantId: string): Promise<number> => {
    return 0; // seed bypass
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function seedDB(label: string, connectionString: string, artifactId: string) {
  console.log(`\n=== Seeding ${label} ===`);
  const pool = new pg.Pool({ connectionString });

  // Clean existing knowledge docs for this tenant
  const delResult = await pool.query(
    'DELETE FROM knowledge_docs WHERE tenant_id = $1',
    [TENANT_ID],
  );
  console.log(`  Deleted ${delResult.rowCount} existing docs`);

  const insertChunks = makeInsertChunks(pool, TENANT_ID, artifactId);
  const getIngestionCountToday = makeGetIngestionCountToday(pool);

  let totalChunks = 0;

  for (const doc of KNOWLEDGE_DOCS) {
    console.log(`  Ingesting: ${doc.title}...`);
    const result = await ingestKnowledge({
      tenantId: TENANT_ID,
      planTier: 'growth',
      content: doc.content,
      title: doc.title,
      sourceType: 'upload',
      metadata: { source: 'dogfood-seed' },
      insertChunks,
      getIngestionCountToday,
    });
    console.log(`    → ${result.chunkCount} chunks`);
    totalChunks += result.chunkCount;
  }

  console.log(`  Total: ${totalChunks} chunks with real embeddings`);
  await pool.end();
}

async function main() {
  const target = process.argv[2] ?? 'both';

  if (!process.env.OPENAI_API_KEY) {
    console.error('ERROR: OPENAI_API_KEY is required for generating embeddings');
    process.exit(1);
  }

  if (target === 'local' || target === 'both') {
    await seedDB('LOCAL', LOCAL_DB, ARTIFACT_IDS.local);
  }

  if (target === 'cloud' || target === 'both') {
    if (!CLOUD_DB) {
      console.error('ERROR: CLOUD_DATABASE_URL is required for cloud seeding');
      process.exit(1);
    }
    await seedDB('CLOUD', CLOUD_DB, ARTIFACT_IDS.cloud);
  }

  console.log('\nDone! Knowledge base seeded successfully.');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

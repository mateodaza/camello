# Camello Generalist Platform Spec

**Version:** 0.2 (Updated after Sprint 3 audit)
**Author:** Mateo Daza
**Date:** 2026-02-28
**Status:** Parked. Resume after current sprint work is complete.

---

## 1. Vision

Camello evolves from "The Shopify of AI workforces" to **a vertical-agnostic AI agent orchestration platform**. Any business deploys an AI agent on any messaging channel (WhatsApp, webchat, Instagram, email, voice) with pluggable tools — sales, support, finance, e-commerce, health, education.

The core product is the **orchestration layer**: multi-tenancy, intent classification, conversation state, channel adapters, approval workflows, cost metering, observability. Domain logic lives in **tool modules** that plug into a generic pipeline.

### Positioning

- **For businesses:** "Deploy AI agents on any channel"
- **For developers:** "The agent runtime — write tools, we handle everything else"
- **For investors:** Infrastructure play, not a vertical app. Every AI agent on a messaging channel needs what Camello provides.

### First proof: Sippy convergence

Sippy (WhatsApp USDC payment bot on Arbitrum) becomes a "finance" vertical on Camello. A fintech deploys a "money agent" the same way a retailer deploys a "sales agent." Same tenant model, same dashboard, same analytics. This validates the generalist abstraction with two concrete verticals.

---

## 2. Architecture Assessment

### What's already reusable (~70%)

Since the original assessment, Sprint 3 added the archetype system, workspace registry, and risk-based autonomy — all of which are extensibility patterns that further reduce the generalist refactor surface.

| Component | Why it's generic |
|---|---|
| Module system (`ModuleDefinition`) | Domain-agnostic: slug, Zod schemas, `execute()`, `formatForLLM()`, `riskTier`, `quickAction`. 9 modules exist. A `transfer_funds` module has the same shape as `qualify_lead`. |
| Risk-based autonomy | `riskTier` (`low`/`medium`/`high`) auto-maps to autonomy levels via `autonomyFromRisk()`. Financial compliance is just `riskTier: 'high'` → `draft_and_approve`. |
| Archetype system | `ArchetypeDefinition` bundles prompts + module slugs + tone + RAG bias per agent type. **This is a proto-VerticalConfig** — already extensible for new verticals. |
| Auto-binding (`applyArchetypeDefaults`) | Artifact creation auto-binds modules from archetype, with `autonomy_source` tracking (`'default'` vs `'manual'`) to prevent migration overwrites. |
| Tool adapter (`buildToolsFromBindings`) | Builds AI SDK tools from modules via schema introspection. No domain assumptions. |
| Idempotency | Per-pipeline-run dedup prevents duplicate actions. Critical for financial transactions. |
| Channel adapters | `ChannelAdapter` interface is domain-agnostic. WhatsApp, webchat work for any vertical. |
| Orchestration pipeline | 15-step `message-handler.ts` delegates every domain decision. Never touches domain logic. |
| Multi-tenancy + RLS | `createTenantDb()`, Clerk orgs, tenant isolation — all infrastructure, no business logic. |
| Cost budgets + Langfuse | Per-tenant metering works for any vertical. |
| RAG with chunk roles | `classifyChunkRole()` splits context into lead/support roles. Role mapping is intent-driven — generalizes to any vertical's intent vocabulary. |
| Customer memory | Regex extraction, JSONB storage, injection-safe prompt rendering. Domain-agnostic. |
| Workspace registry (frontend) | `sectionRegistry` maps artifact type → UI sections. Adding a new vertical = 1 file + 1 registry entry. Uses 5 shared primitives (`MetricsGrid`, `DataTable`, `CardFeed`, `AlertList`, `BarChartCss`). |
| Quick actions | Module-derived via `getQuickActionsForModules()`. Localized (en/es). Any new module just defines `quickAction` and it surfaces in the widget. |
| Jobs worker | node-cron standalone (learning decay, metrics rollup, URL ingestion). Generic operational tasks. |

### What's hardcoded to workforce (~30%)

All hardcoded assumptions remain **vocabulary, not architecture**. The surface is smaller than the original assessment because archetype/registry patterns have absorbed some of the rigidity.

| What | Where | Current values |
|---|---|---|
| `ArtifactType` | `shared/types`, DB CHECK | `sales \| support \| marketing \| custom` |
| `ModuleCategory` | `shared/types`, DB CHECK | `sales \| support \| marketing \| operations \| custom` |
| `IntentType` | `shared/types` | 14 customer-service intents |
| `REGEX_INTENTS` | `shared/constants` | 6 patterns (greeting, pricing, availability, complaint, simple_question, farewell) |
| `INTENT_TO_DOC_TYPES` | `shared/constants` | 4 mappings (pricing→plans, product_question→features, tech_support→docs, booking→services) |
| Model selector | `model-selector.ts` | Routes by confidence + complexity + intent type (3-tier, not just intent name) |
| Prompt builder | `prompt-builder.ts` | Identity role + archetype behavioral framework (dynamic per type, but still workforce vocabulary) |
| Budget exceeded msg | `message-handler.ts` | `"Your AI team..."` |
| `ModuleDbCallbacks` | `shared/types` | 4 fixed callbacks: `insertLead` (with stage + estimatedValue), `insertModuleExecution`, `updateModuleExecution`, `updateConversationStatus` |
| `leads` table | `db/schema` | Sales pipeline: score (hot/warm/cold), stage (6 values: new→closed_won/lost), estimatedValue, budget, timeline |
| Onboarding templates | `onboarding.ts` | services, ecommerce, saas, restaurant, realestate |
| `PlanTier` | `shared/types` | `starter \| growth \| scale` |

---

## 3. Required Changes (3 focused refactors)

### 3.1 Open type enums

Replace closed TypeScript unions + DB CHECK constraints with configurable strings validated at the application layer.

```typescript
// Before
type ArtifactType = 'sales' | 'support' | 'marketing' | 'custom';
type ModuleCategory = 'sales' | 'support' | 'marketing' | 'operations' | 'custom';

// After
type ArtifactType = string; // validated by VerticalConfig
type ModuleCategory = string; // validated by VerticalConfig
```

- 1 migration to drop CHECK constraints (or widen them)
- tRPC validation reads allowed values from vertical config instead of hardcoded enums
- Existing `sales`, `support`, `marketing` values remain valid — no data migration

### 3.2 Evolve ArchetypeDefinition into VerticalConfig

**Key insight from Sprint 3 audit:** `ArchetypeDefinition` already exists as a partial implementation. The generalist refactor should **extend it**, not create a parallel structure.

```typescript
// Current ArchetypeDefinition (packages/ai/src/archetype-registry.ts)
interface ArchetypeDefinition {
  type: ArtifactType;
  prompts: LocalizedText | null;       // behavioral framework injected into system prompt
  defaultTone: LocalizedText;
  moduleSlugs: string[];               // auto-bound modules on artifact creation
  icon: string;
  color: string;
  ragBias: ArchetypeRagBias | null;    // doc_type filtering for RAG search
}

// Evolved into VerticalConfig (extends what exists, adds what's missing)
interface VerticalConfig extends ArchetypeDefinition {
  slug: string;                              // 'sales' | 'support' | 'money_agent' | 'advisor'
  intentTypes: string[];                     // the intent vocabulary for this vertical
  regexIntents: Record<string, RegExp[]>;    // fast-path intent patterns
  intentToDocTypes: Record<string, string[]>; // RAG routing
  modelRouting: Record<string, 'fast' | 'balanced' | 'powerful'>; // complexity mapping
  onboardingTemplates: OnboardingTemplate[]; // wizard templates for this vertical
}
```

What `ArchetypeDefinition` already covers (no work needed):
- `prompts` → behavioral framework per type (sales persuasion, support empathy, etc.)
- `moduleSlugs` → auto-binding at artifact creation
- `defaultTone` → localized tone presets
- `ragBias` → doc_type filtering (sales searches pricing docs, support searches troubleshooting)

What must be added to generalize:
- `intentTypes` → per-vertical intent vocabulary (currently global `IntentType`)
- `regexIntents` → per-vertical regex patterns (currently global `REGEX_INTENTS`)
- `intentToDocTypes` → per-vertical RAG routing (currently global `INTENT_TO_DOC_TYPES`)
- `modelRouting` → per-vertical model tier mapping (currently hardcoded in `model-selector.ts`)
- `onboardingTemplates` → per-vertical wizard flow

Existing production behavior to preserve:
- `autonomyFromRisk(riskTier)` drives autonomy at bind time — generalizes to any vertical
- `autonomy_source` tracking (`'default'` vs `'manual'`) prevents migration overwrites
- `applyArchetypeDefaults()` auto-binds modules — stays as-is, just reads from extended config
- Quick actions derived from modules via `getQuickActionsForModules()` — already generic

### 3.3 Generic module DI callbacks

Replace the fixed `ModuleDbCallbacks` interface with a named callback registry.

```typescript
// Current: 4 fixed callbacks (expanded since v0.1)
interface ModuleDbCallbacks {
  insertLead: (data: {
    tenantId, customerId, conversationId, score: LeadScore,
    tags, budget?, timeline?, summary?,
    stage?, estimatedValue?  // ← added in Sprint 3
  }) => Promise<string>;
  insertModuleExecution: (...) => Promise<string>;
  updateModuleExecution: (id, data) => Promise<void>;
  updateConversationStatus: (conversationId, status) => Promise<void>;  // ← added in Sprint 3
}

// After: modules declare their required callbacks
interface ModuleDefinition<TInput, TOutput> {
  // ... existing fields (slug, name, category, riskTier, quickAction, schemas, execute, formatForLLM) ...
  requiredCallbacks: string[]; // ['insertTransaction', 'getWalletBalance']
}

// Pipeline resolves callbacks from a registry at bind time
type CallbackRegistry = Record<string, (...args: any[]) => Promise<any>>;
```

- Workforce modules keep using `insertLead`, `updateConversationStatus` — nothing breaks
- Financial modules declare `insertTransaction`, `getWalletBalance`, etc.
- The pipeline resolves callbacks from the registry based on module declarations
- Missing callbacks fail fast at bind time, not at runtime
- `insertModuleExecution` / `updateModuleExecution` are universal (always provided)

---

## 4. Naming Evolution (post-MVP)

| Current | Proposed | Rationale |
|---|---|---|
| **Artifact** | **Agent** | Users say "deploy an agent," not "deploy an artifact." Industry-standard term. |
| **Module** | **Tool** | AI SDK calls them tools. Users say "my agent can *do* X." Developers think in tools. |
| Tool bundle concept | **Toolkit** | A curated set of tools. "Attach the Sales toolkit to your agent." |
| Binding | **Binding** (keep) | Internal/dev-facing. Connects a tool to an agent at a specific autonomy level. |
| Tenant | **Workspace** or keep as-is | Users see "organization" via Clerk. "Tenant" is internal DB terminology. |

Mechanical rename: `s/artifact/agent/g` + `s/module/tool/g` across codebase. Do it in one pass after the generalist refactor, not incrementally.

---

## 5. Current Infrastructure (Sprint 3 additions — generalist building blocks)

These systems were built for workforce agents but are already vertical-agnostic in design. The generalist refactor extends them rather than replacing them.

### 5.1 Module system (9 modules, up from 3)

| Module | Category | Risk Tier | Quick Action | Added |
|---|---|---|---|---|
| `qualify_lead` | sales | low | Yes | Week 2 |
| `book_meeting` | sales | medium | Yes | Week 2 |
| `send_followup` | marketing | medium | Yes | Week 2 |
| `collect_payment` | sales | high | No | Sprint 3 |
| `send_quote` | sales | high | No | Sprint 3 |
| `create_ticket` | support | low | Yes | Sprint 3 |
| `escalate_to_human` | support | medium | Yes | Sprint 3 |
| `capture_interest` | marketing | low | Yes | Sprint 3 |
| `draft_content` | marketing | high | No | Sprint 3 |

`ModuleDefinition` now includes:
- `riskTier: RiskTier` — `'low' | 'medium' | 'high'`, drives autonomy assignment
- `quickAction?: { en: { label, message }, es: { label, message } }` — localized widget buttons

### 5.2 Archetype system

`ArchetypeDefinition` at `packages/ai/src/archetype-registry.ts`:

| Archetype | Module Slugs | RAG Bias | Prompt |
|---|---|---|---|
| `sales` | qualify_lead, book_meeting, collect_payment, send_quote | pricing, product, case_study | Persuasion framework |
| `support` | create_ticket, escalate_to_human | troubleshooting, faq, how_to | Empathy + resolution framework |
| `marketing` | send_followup, capture_interest, draft_content | null (no bias) | Engagement framework |
| `custom` | [] (empty) | null | null |

**Auto-binding flow:** `applyArchetypeDefaults(type)` → look up archetype → get module slugs → resolve from DB → bind with `autonomyFromRisk(riskTier)` → set `autonomy_source = 'default'`.

**Adding a new vertical (e.g., finance):** Create `packages/ai/src/archetypes/finance.ts` with module slugs, prompts, tone, RAG bias. Register in archetype index. That's it — auto-binding, quick actions, and prompt injection all work automatically.

### 5.3 Risk-based autonomy

```
autonomyFromRisk('low')    → 'fully_autonomous'
autonomyFromRisk('medium') → 'fully_autonomous'
autonomyFromRisk('high')   → 'draft_and_approve'
```

Source: `apps/api/src/lib/apply-archetype-defaults.ts`. Applied at artifact creation time. `autonomy_source` column tracks provenance (`'default'` vs `'manual'`), so migrations/re-bindings never overwrite manual overrides.

For financial modules: `transfer_funds` would be `riskTier: 'high'` → `draft_and_approve` (requires confirmation). `check_balance` would be `riskTier: 'low'` → `fully_autonomous`.

### 5.4 Workspace registry (frontend)

`apps/web/src/components/agent-workspace/registry/index.ts`:

```typescript
export const sectionRegistry: Record<string, ComponentType<{ artifactId: string }>[]> = {
  sales: salesSections,      // SalesOverview, SalesPipeline, SalesQuotes
  support: supportSections,  // SupportOverview, SupportTickets, SupportEscalations, SupportKnowledgeGaps
  marketing: marketingSections, // MarketingOverview, MarketingEngagement, MarketingDrafts
  custom: [],
};
```

5 shared primitives: `MetricsGrid`, `DataTable`, `CardFeed`, `AlertList`, `BarChartCss`. Each section is ~40-80 lines wiring one tRPC call to a primitive.

**Adding a finance workspace:** Create `registry/finance.tsx` with `FinanceOverview` (balance, recent transactions), `FinanceTransactions` (DataTable), `FinanceAlerts` (AlertList for spending limit warnings). Add one line to the registry. Done.

### 5.5 DB schema additions (Sprint 3)

Migration 0013 + 0014 added:
- `leads.stage` — 6-value pipeline: new → qualifying → proposal → negotiation → closed_won/closed_lost
- `leads.estimated_value` — numeric(12,2) for pipeline value tracking
- `module_executions.module_slug` — denormalized for fast dashboard queries
- `artifact_modules.autonomy_source` — `'default' | 'manual'` provenance tracking
- 6 new module seeds (collect_payment, send_quote, create_ticket, escalate_to_human, capture_interest, draft_content)
- Archetype module backfill with autonomy correction (70/30 split: low/medium → fully_autonomous)

### 5.6 Model selector (more sophisticated than originally documented)

`packages/ai/src/model-selector.ts` routes by 3 factors, not just intent name:
1. **Confidence** — uncertain intents (< 0.7) → `balanced`
2. **Complexity** — `simple` → `fast`, `complex` → `powerful`
3. **Intent type** — greeting/farewell → `fast`, complaint/negotiation → `powerful`, etc.

For the generalist refactor: move the intent→tier mapping into `VerticalConfig.modelRouting` while keeping the confidence/complexity routing as universal logic.

---

## 6. Sippy Convergence Path

### What Sippy is today

- Express + Coinbase CDP SDK v2 + Groq (Llama 3.1) + PostgreSQL + Arbitrum
- WhatsApp bot: `start`, `balance`, `send`, `history`, `settings`, `about`, `help`
- CDP Server Wallets (migrating to embedded wallets with spend permissions)
- USDC transfers on Arbitrum, daily/per-tx spending limits, gasless via CDP paymaster
- Single-tenant, single-user-per-phone, no multi-tenancy
- Repo: separate project (not in Camello monorepo)

### How Sippy maps to Camello

| Sippy concept | Camello equivalent |
|---|---|
| Single bot | An **agent** of type `money_agent` owned by a tenant |
| 8 LLM-parsed commands | **Tools**: `check_balance`, `transfer_funds`, `create_wallet`, `view_history`, `manage_settings` |
| Groq intent parsing | Camello's 2-pass classifier (regex -> LLM) with `finance` intent vocabulary |
| CDP wallet service | External service adapter called by `transfer_funds` tool's `execute()` |
| Phone -> wallet mapping | `customers` table + wallet metadata (or external CDP lookup) |
| Daily spending limits | Agent `constraints` JSONB: `{ dailyLimit: 500, txLimit: 100 }` |
| Spend permissions (embedded wallets) | `fully_autonomous` autonomy level (pre-approved on-chain) |
| "Send $25 to Maria? Confirm" | `draft_and_approve` autonomy level |

### What's closer than v0.1 estimated

Sprint 3 added infrastructure that directly reduces the Sippy convergence effort:

- **Archetype system** already supports per-type module bundles, prompts, tone, and RAG bias. Adding a `money_agent` archetype is one file + one registry entry.
- **Workspace registry** already supports per-type dashboard sections. Adding `finance` sections is one file + one registry entry.
- **Risk-based autonomy** already maps `riskTier: 'high'` → `draft_and_approve`. Financial modules just declare their risk tier.
- **Quick actions** already derive from modules. Financial modules define `quickAction` and it surfaces in the widget.
- **9 modules exist** (up from 3). The pattern is proven and well-tested. Adding financial modules follows the same shape.

### Sequence

1. Ship Sippy M1 independently (grant deliverable)
2. Complete Camello current sprint work
3. Implement the 3 generalist changes (open enums, evolve ArchetypeDefinition→VerticalConfig, generic callbacks)
4. Port Sippy's CDP logic into Camello financial modules
5. Create `money_agent` archetype + finance workspace registry
6. Deploy a "finance" vertical tenant running on Camello infrastructure

---

## 7. Tool Module Integration Research

### Evaluation criteria

For each service:
- **API quality**: REST preferred, good docs, SDK available
- **Auth method**: API key (trivial) vs OAuth2 (adds complexity)
- **Integration effort**: Trivial (<1 day) / Low (1-2 days) / Medium (~1 week)
- **Free tier**: Must have a free/dev tier for MVP testing
- **Demand**: Would tenants actually want this?

### Phase 1 — Trivial effort, ship in days

These are all single-API-call integrations with API key auth. Maximum impact for minimum lift.

#### 1. Resend — `send_email`

- **What:** Send transactional emails (follow-ups, confirmations, proposals)
- **API:** POST `/emails` with `from`, `to`, `subject`, `html`. API key auth.
- **Input:** `{ to: string, subject: string, htmlBody: string, from?: string }`
- **Output:** `{ emailId: string, status: string }`
- **Free tier:** 3,000 emails/month. No credit card.
- **Effort:** Trivial. One API call.
- **Why:** Universal. Every agent vertical needs email. Support sends case summaries, sales sends proposals, finance sends receipts.

#### 2. Stripe — `create_payment_link`

- **What:** Generate a shareable payment link → hosted checkout page
- **API:** POST `/v1/payment_links` with `line_items`. API key auth (Bearer). Excellent docs + Node.js SDK.
- **Input:** `{ productName: string, unitAmountCents: number, currency: string, quantity?: number }`
- **Output:** `{ paymentLinkId: string, url: string, active: boolean }`
- **Free tier:** Pay-per-transaction only (2.9% + $0.30). Test mode is fully free.
- **Effort:** Trivial. One API call.
- **Why:** Sales agent closes a deal and sends a payment link mid-conversation.

#### 3. MercadoPago — `create_payment_link_mp`

- **What:** Create checkout preferences → payment URL. Dominant in LatAm (CO, AR, BR, MX, CL).
- **API:** POST `/checkout/preferences` returns `init_point` URL. Bearer token auth. Node.js SDK.
- **Input:** `{ title: string, unitPrice: number, currencyId: string, quantity?: number }`
- **Output:** `{ preferenceId: string, checkoutUrl: string, sandboxUrl: string }`
- **Free tier:** Free sandbox. Production is pay-per-transaction (~3.5-5%).
- **Effort:** Trivial. One API call.
- **Why:** LatAm market fit. A Colombian sales agent needs MercadoPago, not Stripe.

#### 4. Dub.co — `shorten_link`

- **What:** Create branded short links with analytics. Open-source.
- **API:** POST `/links` with `url`. API key auth. Clean modern docs.
- **Input:** `{ url: string, domain?: string, key?: string }`
- **Output:** `{ shortLink: string, linkId: string, clicks: number }`
- **Free tier:** 1,000 links free. Custom domain support.
- **Effort:** Trivial. One API call.
- **Why:** WhatsApp messages are cleaner with short links. Track engagement. Utility module for any vertical.

#### 5. Slack — `notify_slack`

- **What:** Send messages to Slack channels or DMs. Escalation and alerting.
- **API:** POST `chat.postMessage` with `channel` + `text`. Bot token auth. Incoming webhooks even simpler.
- **Input:** `{ channel: string, message: string, threadTs?: string }`
- **Output:** `{ ok: boolean, ts: string, channel: string }`
- **Free tier:** Free. Bot functionality works on Slack free plan.
- **Effort:** Trivial. One API call.
- **Why:** Agent escalates to humans. Sales team gets notified of hot leads. Support team gets alerted to complaints.

#### 6. Google Places — `lookup_business`

- **What:** Search for businesses, get details (hours, address, phone, rating).
- **API:** POST `/v1/places:searchText`. API key auth. JSON.
- **Input:** `{ query: string, location?: { lat: number, lng: number }, radius?: number }`
- **Output:** `{ places: Array<{ name, address, phone, rating, openNow, googleMapsUrl }> }`
- **Free tier:** 10,000 Essentials API calls/month. $300 credit for new Google Cloud accounts.
- **Effort:** Trivial. One API call.
- **Why:** "What are their hours?" "Where's the nearest location?" Common in support and local services.

### Phase 2 — Low effort (1-2 days each), high demand

These require 2-3 API calls or slightly more complex setup, but use API key auth.

#### 7. Cal.com — `book_meeting`

- **What:** Check availability + create bookings. Open-source scheduling.
- **API:** REST v2. GET available times, POST `/v2/bookings`. API key auth.
- **Input:** `{ eventTypeId: string, startTime: string, attendeeName: string, attendeeEmail: string }`
- **Output:** `{ bookingId: string, meetingUrl: string, startTime: string, endTime: string }`
- **Free tier:** Generous — unlimited event types, unlimited bookings, API access.
- **Effort:** Low. Two API calls. Well-documented.
- **Why:** The #1 request in conversational AI. Sales books demos. Support schedules callbacks. Universal.

#### 8. HubSpot CRM — `lookup_contact` + `create_deal`

- **What:** Look up contacts by email. Create/update deals. Log interactions.
- **API:** REST v3. GET `/crm/v3/objects/contacts/{email}`, POST `/crm/v3/objects/deals`. API key or OAuth2.
- **Input (lookup):** `{ email: string }`
- **Output (lookup):** `{ contactId, firstName, lastName, company, phone, lifecycle }`
- **Input (deal):** `{ dealName: string, amount: number, stage: string, contactEmail?: string }`
- **Output (deal):** `{ dealId, dealName, stage, createdAt }`
- **Free tier:** Basic CRM API works on free HubSpot. Contacts, deals, companies.
- **Effort:** Low. 1-2 API calls per module.
- **Why:** Sales workflow backbone. Agent knows who they're talking to, creates deals when qualified.

#### 9. Twilio — `send_sms`

- **What:** Send SMS/MMS programmatically.
- **API:** POST `/Messages.json`. Account SID + auth token (Basic Auth). Excellent Node.js SDK.
- **Input:** `{ to: string, body: string }`
- **Output:** `{ messageSid: string, status: string, dateCreated: string }`
- **Free tier:** $15 trial credit. Then pay-per-use (~$0.0083/segment).
- **Effort:** Trivial. One API call. Need to provision a phone number ($1.15/mo).
- **Why:** Multi-channel reach. Follow up via SMS after a WhatsApp conversation.

#### 10. WooCommerce — `lookup_product`

- **What:** Search products, check stock, get prices. For WordPress/WooCommerce merchants.
- **API:** True REST. GET `/wp-json/wc/v3/products?search=...`. Consumer key auth (query params or Basic Auth).
- **Input:** `{ query: string, storeUrl: string, consumerKey: string, consumerSecret: string }`
- **Output:** `{ products: Array<{ id, name, price, stockStatus, permalink }> }`
- **Free tier:** WooCommerce is free and open-source. API included.
- **Effort:** Low. One API call. Clean REST.
- **Why:** Many LatAm merchants use WooCommerce (cheaper than Shopify). E-commerce support agents need product data.

#### 11. Brevo — `add_to_email_list`

- **What:** Add contacts to email lists for drip campaigns and marketing automation.
- **API:** POST `/contacts`. API key auth. REST.
- **Input:** `{ email: string, listId: number, firstName?: string, lastName?: string }`
- **Output:** `{ contactId: string, addedToList: boolean }`
- **Free tier:** 300 emails/day (~9K/month). 100K contacts. Marketing automation included.
- **Effort:** Low. One API call.
- **Why:** Marketing agent captures leads into drip campaigns. Support subscribes customers to updates.

#### 12. Notion — `query_notion_db`

- **What:** Read from Notion databases. Many SMBs use Notion as their CRM/knowledge base.
- **API:** POST `/databases/{id}/query`. Integration token or OAuth. Official `@notionhq/client` library.
- **Input:** `{ databaseId: string, filter?: object, sorts?: Array<object> }`
- **Output:** `{ results: Array<{ id, properties, url }>, hasMore: boolean }`
- **Free tier:** API works on free Notion plan. No per-call charges.
- **Effort:** Low. 1-2 API calls.
- **Why:** Agent looks up customer info, inventory, project status from Notion. Huge adoption with SMBs.

#### 13. Airtable — `query_airtable`

- **What:** CRUD on Airtable bases. Many businesses use Airtable as operational database.
- **API:** REST. GET `/v0/{baseId}/{tableName}`. Personal access token or OAuth2.
- **Input:** `{ baseId: string, tableName: string, filterFormula?: string, maxRecords?: number }`
- **Output:** `{ records: Array<{ id, fields }> }`
- **Free tier:** 1,000 records/base. API access included.
- **Effort:** Low. One API call.
- **Why:** Same as Notion. Universal data connector for businesses that run on Airtable.

### Phase 3 — Medium effort (~1 week each), vertical expansion

These require OAuth2 flows, complex payloads, or multi-step interactions.

#### 14. Google Calendar — `check_availability` + `create_calendar_event`

- **What:** Check free/busy, create events. Universal scheduling backbone.
- **API:** REST v3. POST `/freeBusy`, POST `/events`. OAuth2 required.
- **Input (avail):** `{ calendarId: string, timeMin: string, timeMax: string }`
- **Output (avail):** `{ busySlots: Array<{ start, end }>, freeSlots: Array<{ start, end }> }`
- **Free tier:** Completely free. Generous quotas.
- **Effort:** Medium. OAuth2 token storage and refresh is the blocker, not the API calls.
- **Why:** Deep calendar integration (vs Cal.com which is a separate scheduling tool).

#### 15. Google Sheets — `read_sheet` + `append_to_sheet`

- **What:** Read from and write to Google Sheets. The lowest-common-denominator database.
- **API:** REST v4. GET/PUT on ranges. OAuth2 or service account.
- **Input (read):** `{ spreadsheetId: string, range: string }`
- **Output (read):** `{ values: string[][], rowCount: number }`
- **Free tier:** Completely free. 300 reads/min.
- **Effort:** Medium. OAuth2 setup. Service accounts simplify server-to-server use.
- **Why:** Everyone has Google Sheets. Agent logs leads, reads inventory, appends summaries.

#### 16. Shopify — `lookup_product`

- **What:** Search products, check order status. E-commerce at scale.
- **API:** GraphQL only (Storefront API). Storefront access token auth.
- **Input:** `{ query: string, storeUrl: string, storefrontToken: string }`
- **Output:** `{ products: Array<{ id, title, description, price, imageUrl, available }> }`
- **Free tier:** Free partner/development stores.
- **Effort:** Medium. GraphQL adds wrapper complexity vs REST.
- **Why:** "What's the status of my order?" is the #1 e-commerce support query.

#### 17. Jira — `create_jira_ticket`

- **What:** Create issues/tickets. For teams tracking work in Jira.
- **API:** REST v3. POST `/rest/api/3/issue`. API token auth (Basic Auth with email + token).
- **Input:** `{ projectKey: string, issueType: string, summary: string, description?: string, priority?: string }`
- **Output:** `{ issueKey: string, issueId: string }`
- **Free tier:** Jira Cloud free plan (10 users). API included.
- **Effort:** Low-Medium. Verbose Jira payload but well-documented.
- **Why:** Support creates bug tickets. Sales creates follow-up tasks.

#### 18. Shippo — `get_shipping_rates` + `track_shipment`

- **What:** Multi-carrier shipping: rates, labels, tracking. USPS, FedEx, UPS, DHL.
- **API:** REST. POST `/shipments` for rates, GET `/tracks/{carrier}/{tracking}`. API key auth.
- **Input (track):** `{ carrier: string, trackingNumber: string }`
- **Output (track):** `{ status, eta, events: Array<{ date, description, location }> }`
- **Free tier:** 30 labels/month. Unlimited test calls.
- **Effort:** Low-Medium. Multi-step for label creation, simple for tracking.
- **Why:** "Where's my package?" + shipping quotes during sales conversations.

#### 19. Cloudinary — `upload_image`

- **What:** Upload, store, transform images via CDN. Resize, crop, watermark.
- **API:** POST `/v1_1/{cloud}/image/upload`. Basic Auth. Official Node.js SDK.
- **Input:** `{ fileUrl: string, folder?: string, transformation?: string }`
- **Output:** `{ publicId: string, secureUrl: string, width: number, height: number }`
- **Free tier:** 25 credits/month (1 credit = 1 GB storage or 1,000 transforms).
- **Effort:** Low. One API call.
- **Why:** Customer sends product photo, receipt, screenshot. Agent stores/processes it.

#### 20. DocuSign — `send_for_signature`

- **What:** Send documents for e-signature. Create envelopes, track status.
- **API:** REST. POST `/envelopes`. OAuth2 (JWT bearer for server-to-server).
- **Input:** `{ documentUrl: string, signerName: string, signerEmail: string, subject?: string }`
- **Output:** `{ envelopeId: string, status: string, sentAt: string }`
- **Free tier:** 25 envelopes/month in sandbox (never expires).
- **Effort:** Medium. OAuth2 flow is the main complexity.
- **Why:** Sales sends contracts. Real estate, legal, HR use cases. High-value.

#### 21. Tally — `get_form_responses`

- **What:** Retrieve form submissions. Free form builder with API + webhooks.
- **API:** GET `/forms/{formId}/submissions`. API key auth. SHA256 webhook signatures.
- **Input:** `{ formId: string, limit?: number }`
- **Output:** `{ responses: Array<{ submissionId, fields, submittedAt }>, totalCount: number }`
- **Free tier:** Completely free. Unlimited forms, submissions, API access.
- **Effort:** Low. One API call.
- **Why:** Agent collects structured data via form links (CSAT, intake, feedback). Reads results.

### Phase summary

| Phase | Modules | Total effort | Cumulative tools |
|---|---|---|---|
| Phase 1 | 6 modules (Resend, Stripe, MercadoPago, Dub, Slack, Google Places) | ~3-4 days | 6 |
| Phase 2 | 7 modules (Cal.com, HubSpot x2, Twilio, WooCommerce, Brevo, Notion, Airtable) | ~2-3 weeks | 13 |
| Phase 3 | 8 modules (Google Calendar, Sheets, Shopify, Jira, Shippo, Cloudinary, DocuSign, Tally) | ~4-6 weeks | 21 |

### Finance vertical tools (Sippy-derived, separate track)

These are NOT part of the phases above. They come from porting Sippy into Camello.

| Tool slug | What | External dependency |
|---|---|---|
| `check_balance` | Query USDC/token balance for a wallet | Arbitrum RPC + ethers.js |
| `transfer_funds` | Send USDC to a phone number or address | Coinbase CDP SDK |
| `create_wallet` | Provision a CDP wallet for a new user | Coinbase CDP SDK |
| `get_spending_limit` | Query remaining allowance from on-chain spend permission | SpendPermissionManager contract |
| `onramp_fiat` | Initiate fiat-to-USDC onramp | TBD (Moonpay, Transak, or MercadoPago) |
| `deploy_savings` | Deposit into yield-bearing DeFi protocol | TBD (Aave, Compound, or similar on Arbitrum) |

---

## 8. Implementation Sequence

### Now — do NOT touch generalist work
- Finish current sprint work (support/marketing polish, remaining tasks)
- Ship Sippy M1 grant independently
- Week 4 deliverables (billing #37, E2E, deploy) are DONE

### Phase A: Generalist refactor (estimated ~1 week)

Sprint 3's archetype system and workspace registry reduced this from a structural refactor to mostly vocabulary changes:

1. Open type enums — 1 migration to drop/widen CHECK constraints on `artifacts.type` + `modules.category`
2. Evolve `ArchetypeDefinition` → `VerticalConfig` — extend with `intentTypes`, `regexIntents`, `intentToDocTypes`, `modelRouting`
3. Extract `workforce` vertical config from current hardcoded constants (move `REGEX_INTENTS`, `INTENT_TO_DOC_TYPES`, model selector switch into the workforce config)
4. Define `finance` vertical config (intent vocabulary, regex patterns, model routing)
5. Generic module DI callbacks (callback registry replacing 4 fixed callbacks)
6. Rename: artifact → agent, module → tool (mechanical `s///g` — touch every file once, not incrementally)

### Phase B: Tool modules (can run in parallel with Phase C)
1. Phase 1 tools (6 trivial integrations, ~3-4 days)
2. Phase 2 tools (7 low-effort integrations, ~2-3 weeks)
3. Phase 3 tools (8 medium-effort integrations, ~4-6 weeks)

### Phase C: Sippy convergence
1. Port Sippy's CDP wallet logic into Camello financial modules (same `ModuleDefinition` shape)
2. Create `money_agent` archetype (prompts, module slugs, tone, RAG bias)
3. Create finance workspace registry file (dashboard sections using shared primitives)
4. Deploy a finance-vertical tenant on Camello
5. Sunset standalone Sippy backend

---

## 9. Open Questions (to resolve when resuming)

1. **Toolkit abstraction:** ~~Should tool bundles (presets) be a first-class entity?~~ **Partially answered:** Archetypes already ARE tool bundles (module slugs + prompts + tone + RAG bias). The remaining question: should tenants create custom toolkits (mix modules from different archetypes), or only use pre-built archetype bundles?
2. **OAuth2 modules:** How do we handle per-tenant OAuth tokens for Google Calendar, Sheets, DocuSign? Encrypted storage in tenant settings JSONB? Separate `oauth_tokens` table?
3. **Module marketplace:** When do we allow third-party tool publishing? What's the security model (sandboxed execution, permission scopes)?
4. **Pricing per tool:** Do we charge per tool activation? Per tool execution? Or just per plan tier (starter = 3 tools, growth = 10, scale = unlimited)?
5. **Financial compliance:** Does the finance vertical need additional infrastructure (KYC checks, regulatory disclaimers, audit trails) beyond what autonomy gating + `riskTier: 'high'` provides?
6. **Intent vocabulary migration:** When we move from global `IntentType` to per-vertical vocabularies, what happens to existing `interaction_logs` rows that store intent types? Do we migrate them, or treat them as historical data with the old vocabulary?
7. **Cross-vertical agents:** Can one artifact have modules from multiple verticals (e.g., a sales agent that can also create support tickets)? Archetypes currently bind modules from one vertical only. Is cross-binding a feature or an anti-pattern?

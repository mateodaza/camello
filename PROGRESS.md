# Camello Build Progress

> Single source of truth for what's done, what's next, and what's blocked.
> Updated at the end of every work session.
>
> **AI memory lives at:** `~/.claude/projects/.../memory/` (MEMORY.md, architecture.md, compliance-gaps.md, differentiation.md). Not in-repo — persists across Claude sessions.

## Current Phase: Week 4 — Onboarding + Hardening (Weeks 1-3 complete)

### Done

| # | Task | Date | Notes |
|---|------|------|-------|
| 1 | Monorepo scaffold (Turborepo + pnpm) | Feb 17 | apps/api, apps/web, packages/db, packages/shared, packages/ai, packages/config |
| 2 | Drizzle schema — all 22 tables | Feb 17 | Matches spec v1.5 DDL exactly |
| 3 | Migration SQL (0001_initial_schema.sql) | Feb 17 | Hand-written, executable top-to-bottom, includes RLS + app_user role |
| 4 | Shared types + Zod schemas + constants | Feb 17 | CanonicalMessage, Intent, ModelTier, PLAN_LIMITS, REGEX_INTENTS, etc. |
| 5 | AI package scaffold | Feb 17 | intent-classifier, model-selector, prompt-builder, openrouter-client |
| 6 | Artifact resolver contract | Feb 17 | ArtifactResolverInput/Output, priority ordering, NoArtifactAvailableError |
| 7 | tRPC skeleton (tenant router stub) | Feb 17 | Hono + tRPC wired, CORS, logger |
| 8 | Spec v1.5 — Innovation Roadmap (Section 20) | Feb 17 | Handoffs, marketplace, customer memory |
| 9 | Full compliance audit (spec DDL vs code) | Feb 17 | All P0/P1/P2/P3 gaps resolved |
| 10 | CHECK constraints on all 9 Drizzle tables | Feb 17 | plan_tier, role, category, type, status, score, etc. |
| 11 | pgEnum for autonomy_level | Feb 17 | Was text, now proper enum |
| 12 | HNSW + GIN indexes in Drizzle | Feb 17 | knowledge_docs (embedding + fts), learnings (embedding) |
| 13 | fts tsvector column in Drizzle | Feb 17 | Custom type, declared so Drizzle won't drop it |
| 14 | Supabase CLI + local dev environment | Feb 18 | `npx supabase@latest` (brew blocked by Xcode CLT on macOS 26), `supabase start` running |
| 15 | RLS policies + cross-tenant isolation tests | Feb 18 | 22 tests pass — isolation, fail-closed, global catalog, write isolation, set_config/RESET cycle |
| 16 | `createTenantDb()` helper | Feb 18 | `packages/db/src/tenant-db.ts` — query() + transaction() with UUID validation |
| 17 | Clerk auth middleware + tRPC protected procedures | Feb 18 | `authedProcedure`, `tenantProcedure`, JWT verification, org→tenant mapping |

| 18 | Embedding service (text-embedding-3-small via AI SDK) | Feb 18 | `packages/ai/src/embedding.ts` — generateEmbedding + generateEmbeddings (batch) |
| 19 | Text chunker (512 tokens, 50-token overlap, paragraph-aware) | Feb 18 | `packages/ai/src/chunker.ts` — paragraph + sentence splitting, overlap for context continuity |
| 20 | RAG orchestrator (gate → primary + proactive search → MMR → context assembly) | Feb 18 | `packages/ai/src/rag.ts` — DI pattern (MatchKnowledgeFn callback), intent gating, proactive cross-referencing |
| 21 | Knowledge ingestion pipeline (chunk + embed + plan-tier limits) | Feb 18 | `packages/ai/src/knowledge-ingestion.ts` — plan-tier validation, batch embed, DI for DB insert |
| 22 | RAG/ingestion constants + types in shared package | Feb 18 | RAG_CONFIG, CHUNK_CONFIG, INGESTION_LIMITS, LEARNING_CONFIDENCE, REJECTION_REASONS, MatchKnowledgeRow, RagResult, KnowledgeChunk |
| 23 | Artifact resolver implementation | Feb 18 | `packages/ai/src/artifact-resolver.ts` — 3-step priority (existing conv → route rules → default fallback), DI for DB lookups |
| 24 | Prompt builder: channel_overrides + proactive context | Feb 18 | Updated `prompt-builder.ts` — resolves per-channel tone/greeting/style from artifact config, separate PROACTIVE CONTEXT block |
| 25 | Feedback loop: rejection → structured learning write path | Feb 18 | `packages/ai/src/feedback-loop.ts` — reason taxonomy, confidence math, reinforcement detection, monthly decay |
| 26 | Chunker unit tests (16 tests) | Feb 18 | `packages/ai/src/__tests__/chunker.test.ts` — size invariant, overlap bounds, oversized sentences, CRLF, content preservation |
| 27 | tRPC routers: artifact, conversation, knowledge, module, channel, analytics | Feb 18 | 6 router files in `apps/api/src/routes/` — full CRUD, pagination, module approval/reject, knowledge ingestion wiring |
| 28 | LLM orchestration: message handler + chat router | Feb 18 | `apps/api/src/orchestration/message-handler.ts` — full pipeline: intent → resolver → RAG → prompt → LLM → save + telemetry. `chat.send` tRPC endpoint |
| 29 | Supabase cloud: schema + RLS + indexes + module seeds | Feb 18 | Full migration applied, FK indexes (24 total), initplan RLS fix, 3 modules seeded |
| 30 | Module executor system (#32) | Feb 18 | Registry + tool adapter + 3 modules + message-handler tool-calling loop + race-safe approve/reject + feedback loop wiring + 26 tests |

| 31 | Channel adapters (#31): WebChat + WhatsApp | Feb 18 | Full adapter system: interface, registry, widget JWT auth, widget Hono routes, WhatsApp async webhook, DB migrations (phone_number unique index + bootstrap RPCs), widget app scaffold, 52 tests (25 adapter + 27 route integration) |

| 34 | Dashboard (#34): Clerk + tRPC + 4 pages | Feb 19 | Clerk provider + tRPC client (useAuth getToken), sidebar layout, overview (tenant.me + analytics.overview), conversations list (infinite scroll) + detail (message thread + status update), artifacts (CRUD + toggle). All lint + type-check clean. |

| 32 | Trigger.dev jobs (#32): 3 background jobs | Feb 19 | `apps/jobs` workspace (Trigger.dev v3), service-role DB pool, SSRF-safe content extractor, 3 cron jobs (monthly learning decay, daily metrics rollup, 5-min URL ingestion with atomic claim), migration 0004 (learnings archived_at/updated_at, knowledge_syncs ops columns + claim index), 38 tests |

| 33 | KPI instrumentation (#33): Langfuse + budgets + rollback | Feb 19 | Real Langfuse SDK tracing (trace/span/finalize), per-tenant cost budgets (hard limit before paid work), learning rollback controls (dismiss/boost/bulkClear + audit logs), migration 0005, 10 tests |

| 35 | Dashboard: knowledge + analytics pages (#35) | Feb 19 | Knowledge mgmt (docs table grouped by title, ingest form, delete-by-title, offset pagination, learning list with dismiss/boost/bulkClear), analytics deep-dive (date range, overview stats, per-artifact metrics, interaction logs, billing periods). Shared `stat-card.tsx` + `format.ts` utils. 25 tests. Perf: bounded LRU org→tenant cache (500 max), removed RESET round-trip. Vitest v4 standardized. |

| 36 | Tenant onboarding wizard (#36) | Feb 19 | Clerk webhook (Svix sig verification), `provisionTenant()` (deterministic UUIDv5 + legacy org adoption with member verification + slug retry), 7-procedure tRPC onboarding router (provision, parseBusinessModel, setupArtifact, ensurePreviewCustomer, getStatus, saveStep, complete), dashboard `OnboardingGate` (layout-level redirect + render guard), 5-step wizard (org creation, AI business parser, artifact setup, channel connect, live test chat), `orgId` in tRPC context, 6 security audit rounds (cross-tenant takeover prevention, UUID validation, null-creator blocking, split member queries), 53 new tests (43 API + 10 web). Dependencies: `svix`, `uuid` |

| 36b | Knowledge seeding + wizard UX polish (#36b) | Feb 20 | Step 4 "Teach Agent" auto-seeds business description (chunked + embedded), optional quick facts + website URL queue. `knowledge.queueUrl` tRPC procedure, migration 0006 (knowledge_syncs unique URL index with dedupe), `setupArtifact` idempotency guard, back navigation (steps 3-6), resume-once guard (`hasResumed` ref prevents stale-step overwrite), seeded-flag reset on description change, 15s auto-seed timeout with spinner UX, vector/text[] cast fixes in `match_knowledge` RPC. Smoke-tested end-to-end: RAG answers from seeded knowledge confirmed. 157 tests (122 API + 35 web). |

| 37 | Paddle billing integration (#37) | Feb 20 | Paddle SDK, webhook handler (4 event types, atomic claim idempotency, timestamp guard, effective-date gated cancellation), billing tRPC router (4 procedures: currentPlan, createCheckout with branching, cancelSubscription, history), billing dashboard page (plan cards, subscribe/switch/cancel), migration 0007 (5 tenant columns + idempotency table + RPC), shared PLAN_PRICES + SubscriptionStatus. 189 tests (146 API + 43 web). |

| 38 | Integration pipeline tests (#38) | Feb 20 | 4 test files in `apps/api/src/__tests__/integration/`: full-message-pipeline (5), budget-gate-integration (5), module-tool-calling (5), rag-knowledge-flow (5). Exercises `handleMessage()` orchestration with mocked LLM/DB. 209 tests (166 API + 43 web). |

| 39 | Production deploy (#39) | Feb 21 | Railway (API at `api.camello.xyz`), Vercel (web at `camello.xyz`), Cloudflare Pages (widget at `widget.camello.xyz`). tsup noExternal + createRequire banner, Dockerfile, graceful shutdown, `.node-version` + engines. Domain: `camello.xyz` primary, `camello.lat` 301 redirect. Removed git submodules. Cloudflare DNS (both domains). Vite `minify: true` fix (terser optional). |
| 39c | Jobs migration: Trigger.dev → Railway worker (#39c) | Feb 21 | Replaced `@trigger.dev/sdk` with `node-cron` standalone worker. DB-backed `job_runs` ledger (migration 0008), bounded catch-up on startup (7-day cap), `createWorker()` factory pattern, graceful shutdown, health endpoint, `Dockerfile.jobs`. 42 tests (38 existing + 4 new). |
| 39b | Clerk webhook registration (#39b) | Feb 21 | Registered `organization.created` → `https://api.camello.xyz/api/webhooks/clerk`. `CLERK_WEBHOOK_SECRET` set on Railway. Verified working end-to-end. |
| 39d | Smoke test: core flow (#39d) | Feb 21 | Sign-up → Clerk org creation → webhook fires → tenant provisioned in Supabase → 6-step onboarding wizard → AI chat with RAG (knowledge retrieval from seeded docs confirmed). Fixed: DATABASE_URL (Supabase pooler, not Railway Postgres), CORS (gray cloud for api CNAME), www→apex redirect (Vercel domains). |
| 39c-deploy | Deploy jobs worker (#39c-deploy) | Feb 21 | Railway worker service with dedicated `apps/jobs/Dockerfile` + `apps/jobs/railway.toml`. Port 3001, node-cron, 3 cron schedules. Fixed: `__dirname` ESM shim in tsup banner (node-cron uses it internally), separate Dockerfile per service (root `railway.toml` is API-only), `DATABASE_URL` env var required alongside `DATABASE_URL_SERVICE_ROLE` (tenant-scoped queries use `@camello/db/client` pool). Catch-up verified: 7-day metrics rollup + learning decay completed. |
| 39d-widget | Smoke test: widget embed (#39d-widget) | Feb 21 | Widget loads from `widget.camello.xyz`, resolves tenant slug, shows agent name + org, session creation + AI responses confirmed end-to-end. |
| 39b-paddle | Paddle webhook registration (#39b-paddle) | Feb 21 | Registered at `sandbox-vendors.paddle.com` → Developer Tools → Notifications. URL: `https://api.camello.xyz/api/webhooks/paddle`. Events: `subscription.created`, `subscription.updated`, `subscription.canceled`, `transaction.completed`. Default payment link set to `https://camello.xyz`. `PADDLE_WEBHOOK_SECRET` set on Railway. |
| 39d-billing | Billing smoke test (#39d-billing) | Feb 21 | Paddle sandbox checkout (test card 4242) → `subscription.created` + `transaction.completed` webhooks → tenant updated (`subscription_status: active`, `paddle_subscription_id` + `paddle_customer_id` set). **3 bugs found & fixed:** (1) Drizzle `sql` tag produces malformed SQL when bundled with tsup `noExternal` → switched webhook helpers to `pool.query()`. (2) `paddle.webhooks.unmarshal()` is async but wasn't awaited → added `await`. (3) Paddle Billing v2 uses overlay checkout (not hosted page) → refactored from redirect-based to Paddle.js overlay (`Paddle.Checkout.open({ transactionId })`), added `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` + `NEXT_PUBLIC_PADDLE_ENVIRONMENT` env vars on Vercel. Post-checkout auto-refresh with 2s/5s delayed invalidation. |

| 43 | Spanish language support (#43) | Feb 21 | Full i18n across all layers — 6 phases: widget localization (artifact-level `personality.language`), AI system prompts (locale-aware `buildSystemPrompt`), backend error messages (`@camello/shared/messages`), dashboard i18n (next-intl + cookie-based locale from tenant `preferredLocale`), onboarding wizard (all 8 components + `parseBusinessModel` locale input), metadata & polish (Intl formatters, Clerk `esES` localization, dynamic metadata). `LocaleSync` component syncs tenant locale → cookie → `router.refresh()`. `QueryError` switches on tRPC error `code` (not message text). Budget-exceeded uses tenant `preferredLocale`. ~640 translation strings (en.json + es.json). 210 tests (167 API + 43 web). |

| 40 | Landing page (#40) | Feb 21 | Full marketing landing page at `/`. Design system: Jost (headings) + DM Sans (body) Google Fonts, 8-color palette (midnight/sand/teal/sunset/gold/cream/charcoal/dune), 3-zone color blocking (dark hero → warm features → accent pricing). Sticky nav (auth-aware: signed-in shows Dashboard, signed-out shows Login + Get Started), hero with ALL CAPS headline + camel-sales illustration, 2x2 feature cards with camel illustrations (support/knowledge/analytics/sales), 3-col pricing from PLAN_PRICES/PLAN_LIMITS with teal checkmarks + gold "Popular" badge, 4-col footer. All i18n (en + es). Responsive (mobile stacks, nav collapses to CTA-only). OG image + metadata. `unoptimized` on illustrations (pre-generated 1K JPEGs, prevents double-compression artifacts). Smooth scroll anchors with scroll-padding. |

| 48 | Dashboard retheme + collapsible sidebar (#48) | Feb 21 | Applied landing page design system to all dashboard + onboarding. 23 files modified: 3 shared UI (card/button/badge), 2 shared components (stat-card/query-error), 2 layout (sidebar/dashboard layout), 7 dashboard pages, 9 onboarding files. Gray→design system: midnight sidebar, sand content bg, teal primary buttons/focus rings, cream cards/tables, charcoal text, dune secondary text, sunset errors, gold warnings. WCAG AA contrast on all tinted-bg badges (charcoal on teal/15 ≈ 10:1). Collapsible sidebar: `w-60`↔`w-16`, CSS transition (200ms), localStorage persistence, ChevronsLeft/Right toggle, Tooltip on collapsed icons (CSS group-hover), Clerk OrganizationSwitcher crop approach, logo link to landing. New: `hooks/use-sidebar-collapsed.ts`, `ui/tooltip.tsx`. i18n: +2 keys (collapse/expand en+es). 43 tests pass, build clean. |

| 49 | Dashboard UX simplification (#49) | Feb 21 | **3 areas:** (1) Layout: `max-w-5xl mx-auto` container in dashboard layout — centers content, prevents ultrawide stretch. (2) Agent test chat (sandbox mode): `TestChatPanel` slide-over with conversation continuity, `chat.send` accepts `sandbox` + `artifactId` (bidirectional `.refine()` validation), `handleMessage` override path (artifact resolution before intent classification), sandbox conversations hidden from `conversation.list` via JSONB `@>` containment filter, route-layer artifact validation (TRPCError before paid LLM calls). (3) Overview simplification: plan-tier usage bars (`UsageBar` component, `analytics.monthlyUsage` procedure with `resolvedAt` UTC window), business KPIs stay, LLM details behind collapsible "Advanced" toggle. Extracted `getUtcMonthWindow()` into shared `date-utils.ts`. i18n: +20 keys (en+es). **Tests:** 11 new (7 API: 5 sandbox-chat + 2 analytics-monthly-usage, 4 web: test-chat-panel logic). **Totals:** 221 tests (174 API + 47 web). Lint 0 errors, type-check clean. |

### Next Up — Launch Readiness

| # | Task | Priority | Notes |
|---|------|----------|-------|
| ~~40~~ | ~~Landing page (camello.xyz)~~ | ~~P1~~ | ~~DONE~~ |
| ~~48~~ | ~~Dashboard retheme + collapsible sidebar~~ | ~~P1~~ | ~~DONE~~ |
| ~~49~~ | ~~Dashboard UX simplification~~ | ~~P2~~ | ~~DONE~~ |
| 41 | Clerk production instance | P1 | Swap test keys → production keys, configure custom domain auth |
| 42 | Paddle business verification | P2 | Required before processing real payments — sandbox works without it |
| 44 | Error handling polish | P2 | Loading skeletons, toast notifications, mobile responsiveness, empty states |
| 45 | Docs / help center | P3 | Setup guide, API reference, widget embed instructions |
| ~~46~~ | ~~Paddle smoke test~~ | ~~P2~~ | ~~DONE — checkout + webhooks confirmed end-to-end~~ |
| 47 | WhatsApp Business setup | P3 | Meta Business verification + phone number for production WhatsApp channel |

### Post-Launch — Innovation Roadmap (Spec Section 20)

| # | Task | Priority | Notes |
|---|------|----------|-------|
| 50 | Agent handoffs | P2 | Artifact-to-artifact transfers with context preservation |
| 51 | Customer memory | P2 | Cross-conversation memory, preferences, history summary |
| 52 | Module marketplace | P3 | Community-contributed modules with trust scoring |
| 53 | Scheduled automations | P3 | Time-based triggers (follow-up reminders, SLA alerts) |
| 54 | Advisory council | P3 | Multi-agent deliberation for complex decisions |
| 55 | Self-evolving system | P3 | Auto-generate learnings from successful interactions |
| 56 | RAG upgrade: trigger taxonomy + chunk roles + extraction rules | P1 | ~7hrs, no schema changes. Intent profiles → chunk lead/support roles → structured metadata extraction in prompts. Cross-pollinated from Hivemind. Design: `memory/rag-upgrade-design.md` |

### Blocked

| Task | Blocker | Workaround |
|------|---------|------------|
| CHEZ/Hivemind reference agents | Permission restrictions on dirs outside project | Read manually when needed |

---

## Roadmap

### Week 1 — Foundation + Tenant Isolation (current)
- [x] Monorepo scaffold, Drizzle schema, migration SQL, shared types, AI scaffold
- [x] Full compliance audit — all gaps resolved
- [x] Supabase CLI + local dev (npx supabase@latest)
- [x] RLS policies + cross-tenant isolation tests (22 pass)
- [x] `createTenantDb()` helper + fail-closed tests
- [x] Clerk auth middleware + tRPC protected procedures

### Week 2 — Core Intelligence
- [x] RAG pipeline: embedding service + text chunker + RAG orchestrator (gate, primary + proactive search, MMR, context assembly)
- [x] Knowledge ingestion pipeline: chunk → embed → insert with plan-tier limits
- [x] Artifact resolver implementation (3-step priority resolution with DI)
- [x] Prompt builder: channel_overrides consumption + proactive context block
- [x] Feedback loop: rejection → structured learning (reason taxonomy, confidence math, reinforcement, decay)
- [x] Chunker unit tests (16 tests pass — size invariant, overlap, oversized sentences, CRLF, content preservation)
- [x] tRPC routers: artifact (CRUD + module bindings), conversation (list, messages, status), knowledge (ingest, list, delete), module (catalog, approve/reject), channel (upsert, delete), analytics (metrics, overview, logs, usage)
- [x] LLM orchestration wiring: intent → resolver → RAG → prompt → model select → LLM call → save messages + telemetry → response
- [x] Chat tRPC endpoint (`chat.send`) — full pipeline exposed for webchat
- [x] Supabase cloud deployment: full schema migration, RLS policies, FK indexes (24), initplan fix, module seeds
- [x] Module executor (#32): registry + tool adapter (idempotency + autonomy gating + timeout) + 3 modules (qualify_lead, book_meeting, send_followup) + message-handler tool-calling loop (generateText with maxSteps:5) + race-safe approve/reject with post-approval execution + feedback loop wiring + Supabase Broadcast for approval notifications + 26 tests pass
- [x] Trigger.dev jobs: learning decay, metrics rollup, URL-drop ingestion
- [x] KPI instrumentation: Langfuse tracing, per-tenant cost budgets, learning rollback controls

### Week 3 — Channels + Dashboard
- [x] Channel adapter interface + registry (`apps/api/src/adapters/`)
- [x] Widget JWT auth (jose) — `createWidgetToken` / `verifyWidgetToken` with HS256
- [x] Widget Hono routes — session (rate-limited, generic errors), message (JWT + conversation ownership check), history
- [x] WebChat adapter — parseInbound, sendText, sendInteractive, sendMedia
- [x] WhatsApp adapter — signature verification (timingSafeEqual), Meta webhook parsing (text/image/audio/doc/location/interactive), Cloud API outbound, tenant resolution, idempotency, async processing
- [x] WhatsApp Hono webhook routes — GET challenge + POST with fire-and-forget async (return 200 fast)
- [x] DB migration: `channel_configs_type_phone_unique_idx` (cross-tenant misrouting prevention)
- [x] Widget app scaffold (`apps/widget/` — React 19 + Vite IIFE bundle, ChatBubble, ChatWindow, useWidgetSession, useChat)
- [x] CORS: widget `*` (JWT auth), tRPC restricted to dashboard origin
- [x] 52 adapter + route tests (JWT, signature, normalization, message types, spoofing guard, rate limiting, async webhook, ownership checks)
- [x] Security hardening: SECURITY DEFINER RPCs (search_path + schema-qualified), trusted IP extraction, route-level integration tests
- [x] Dashboard pages: tenant overview, conversations list + detail, artifacts (CRUD)
- [x] Dashboard pages: knowledge management, analytics deep-dive
- [x] Shared components: stat-card, format utils (25 tests)
- [x] Perf: bounded LRU org→tenant cache + RESET removal

### Week 4 — Onboarding + Hardening
- [x] Tenant onboarding wizard (6-step: create org → describe business → meet agent → teach agent → connect channel → test chat)
- [x] Clerk webhook handler (organization.created → auto-provision tenant)
- [x] Dashboard OnboardingGate (redirects unonboarded users from all /dashboard routes)
- [x] Knowledge seeding during onboarding (auto-seed business description + quick facts + website URL queue)
- [x] Billing integration (Paddle — Merchant of Record, no US LLC needed)
- [x] Integration pipeline tests: full message flow, budget gate, module tool-calling, RAG knowledge flow (20 tests)
- [x] Spanish language support (#43): widget, AI prompts, backend errors, dashboard, onboarding, metadata
- [ ] Load testing, error handling, edge cases
- [x] Production deploy: Railway (API), Vercel (web), Cloudflare Pages (widget)
- [x] Clerk webhook registered + working
- [x] Paddle webhook registration
- [x] Jobs migration (Trigger.dev → Railway standalone worker with node-cron)
- [x] Jobs deploy (Railway worker service)
- [x] Smoke test: sign-up → onboarding → AI chat with RAG ✓
- [x] Smoke test: widget embed ✓
- [x] Smoke test: billing checkout (Paddle sandbox — overlay checkout + webhooks confirmed) ✓
- [x] Landing page: design system (Jost + DM Sans, 8-color palette) + full marketing page with illustrations
- [x] Dashboard retheme: applied landing page design system to all 23 dashboard + onboarding files
- [x] Collapsible sidebar: icon rail (w-16), localStorage persistence, tooltips, Clerk component adaptation
- [x] Dashboard UX simplification (#49): layout width constraint, agent test chat (sandbox mode), simplified overview (plan usage bars + collapsible advanced), 11 new tests

---

## Session Log

### Session 1 — Feb 17
- Scaffolded entire monorepo from spec
- Hit timestamptz/Drizzle issue (use `timestamp` with `{ withTimezone: true }`)
- Added BIPS + OpenClaw as git submodules
- Built routing/assignment/metrics tables (v1.4 spec additions)
- Wrote artifact resolver contract
- Added Innovation Roadmap to spec (Section 20)
- Ran full compliance audit — found 3 P0s, 2 P1s, 9 P2s, 2 P3s
- Resolved all gaps: artifact_id, ON DELETE SET NULL, fts column, pgEnum, HNSW indexes, all CHECKs
- All 5 packages pass type-check
- Introduced PROGRESS.md for persistent tracking

### Session 2 — Feb 18
- Installed Supabase CLI via `npx supabase@latest` (brew blocked by Xcode CLT on macOS 26)
- Started Supabase local dev (`supabase start` — PG 17, Docker containers)
- Built `createTenantDb()` helper (`packages/db/src/tenant-db.ts`): query() + transaction() with UUID validation
- Built Clerk auth middleware (`apps/api/src/lib/clerk.ts`, `trpc/context.ts`, `trpc/init.ts`): JWT verification, org→tenant mapping, `authedProcedure` + `tenantProcedure`
- Updated `tenant.me` router to use `tenantProcedure` with real DB query
- Wrote comprehensive RLS integration test suite (22 tests): cross-tenant isolation, fail-closed, global catalog, write isolation, set_config/RESET cycle, transaction-local auto-clear
- **Found and fixed RLS policy bug**: `current_setting('app.tenant_id', true)::uuid` crashes on empty string after `RESET`. Fixed with `NULLIF(..., '')::uuid` — now properly fail-closed instead of fail-error
- **Discovered**: Supabase local `postgres` role is NOT superuser — requires explicit `GRANT app_user TO postgres` for `SET ROLE`
- All 5 packages pass type-check, all 22 RLS tests pass
- Week 1 tasks complete — ready for Week 2 (Core Intelligence)

### Session 3 — Feb 18 (Week 2 Day 1-4)
- Updated spec with OpenClaw-inspired patterns: channel_overrides, self-improving feedback loop, proactive cross-referencing, URL-drop ingestion, prompt injection defense, scheduled automation, advisory council, self-evolving system
- Added production safety guardrails to spec: acceptance KPIs per feature, hard limits per plan tier, human-governed feedback with reason taxonomy + confidence thresholds + rollback
- Built embedding service (`packages/ai/src/embedding.ts`): `generateEmbedding` + `generateEmbeddings` (batch) via OpenAI text-embedding-3-small, AI SDK
- Built text chunker (`packages/ai/src/chunker.ts`): 512-token target, 50-token overlap, paragraph-aware + sentence-boundary splitting
- Built RAG orchestrator (`packages/ai/src/rag.ts`): intent gating → primary search (0.3 threshold) → proactive cross-referencing (0.15 threshold) → MMR diversification → token-budget context assembly
- Built knowledge ingestion (`packages/ai/src/knowledge-ingestion.ts`): plan-tier limit validation, batch embedding, DI callbacks for DB insert
- Built artifact resolver (`packages/ai/src/artifact-resolver.ts`): existing_conversation → route_rule → tenant_default_fallback priority chain, DI callbacks for DB lookups
- Updated prompt builder: channel_overrides resolution (per-channel tone/greeting/style from artifact config JSONB), separate PROACTIVE CONTEXT block with external content label
- Built feedback loop (`packages/ai/src/feedback-loop.ts`): rejection reason taxonomy (5 categories), confidence math (initial 0.8/1.0, +0.1 per reinforcement, -0.05/month decay), similar learning detection, archive below 0.3
- Added shared constants: RAG_CONFIG, CHUNK_CONFIG, INGESTION_LIMITS (per plan tier), LEARNING_CONFIDENCE, REJECTION_REASONS
- Added shared types: MatchKnowledgeRow, RagResult, KnowledgeChunk, RejectionReason
- All AI functions use dependency injection (callbacks) — no @camello/db import in AI package
- All 5 packages pass type-check

### Session 4 — Feb 18 (Week 2 Day 5: Routers + Orchestration)
- Built 16 chunker unit tests: edge cases for oversized sentences, paragraph overflow, overlap bounds, CRLF normalization, content preservation. All 16 pass.
- Built 6 tRPC routers (apps/api/src/routes/):
  - **artifact** — list, byId, create, update, delete, listModules, attachModule, detachModule (upsert on conflict)
  - **conversation** — list (cursor pagination with customer join), byId, messages (time-based pagination), updateStatus
  - **knowledge** — list (content preview), ingest (wires DI callbacks to @camello/ai ingestKnowledge), delete, deleteByTitle
  - **module** — catalog (global modules table), pendingExecutions, approve, reject
  - **channel** — list (credentials excluded for security), upsert (on conflict), delete
  - **analytics** — artifactMetrics (date range), overview (conversation stats + LLM cost), recentLogs, usage
- Built LLM orchestration pipeline (`apps/api/src/orchestration/message-handler.ts`):
  - Full pipeline: classifyIntent → createArtifactResolver (with 3 DB callback helpers: findActiveConversation, findMatchingRule, getDefaultArtifact) → findOrCreateConversation (transaction) → save customer message → RAG searchKnowledge (with match_knowledge SQL function call) → fetch learnings → buildSystemPrompt → selectModel → generateText (AI SDK via OpenRouter) → save artifact response → log interaction telemetry → return
  - Conversation create uses transaction to atomically insert conversation + artifact assignment
  - Cost estimation per model tier (Gemini Flash, GPT-4o-mini, Claude Sonnet)
- Built chat tRPC router (`apps/api/src/routes/chat.ts`): `chat.send` mutation — validates customer ownership, calls handleMessage pipeline
- Wired all 7 routers into appRouter (tenant, artifact, module, conversation, knowledge, channel, analytics, chat)
- All packages pass type-check (api, ai, shared), all 16 chunker tests pass

### Session 5 — Feb 18 (Week 2 Day 6: Cloud Deploy + Module Executor)
- Deployed full schema to Supabase cloud (project `eukklvizytkojmptepdf`): migration applied, RLS policies active, 3 modules seeded (qualify_lead, book_meeting, send_followup)
- Applied RLS initplan performance fix (SELECT subquery wrapper) to all 21 tenant-scoped policies
- Applied 24 FK indexes across all tables (2 batches: 6 high-traffic + 18 remaining)
- Verified Supabase performance advisor: FK warnings cleared, initplan warnings are false positive (cache lag)
- Installed Figma MCP server globally for Claude Code (`~/.claude.json`)
- **Built Module Executor System (#32)** — full implementation:
  - `packages/ai/src/module-registry.ts` — in-memory Map registry with `ModuleDefinition` (Zod schemas live in @camello/ai, not shared — guardrail #1)
  - `packages/ai/src/tool-adapter.ts` — converts ArtifactModuleBinding[] to AI SDK CoreTool, with: per-pipeline idempotency Map (guardrail #2), 3 autonomy paths (suggest_only/draft_and_approve/fully_autonomous), Promise.race timeout, non-blocking safeBroadcast (guardrail #4)
  - `packages/ai/src/modules/` — 3 self-registering modules: qualify_lead (deterministic hot/warm/cold scoring + insertLead callback), book_meeting (MVP stub), send_followup (MVP stub)
  - `apps/api/src/orchestration/message-handler.ts` — integrated tool-calling loop: fetch artifact module bindings (JOIN artifact_modules + modules), build ModuleDbCallbacks (DI), build Supabase Broadcast notifier, replaced generateText with `generateText({ tools, maxSteps: 5 })`, pass modules to buildSystemPrompt
  - `apps/api/src/routes/module.ts` — upgraded approve (race-safe atomic `UPDATE WHERE status='pending'` + post-approval execution with timeout + finalize as executed/failed — guardrail #3), upgraded reject (reason + freeText input, wired into processRejection feedback loop → creates/reinforces learnings)
  - `packages/ai/src/prompt-builder.ts` — added `--- AVAILABLE ACTIONS ---` section with per-module autonomy level notes and usage rules
  - 26 new tests (module-executor.test.ts): registry CRUD, qualify_lead scoring (hot/warm/cold), insertLead callback, book_meeting/send_followup stubs, autonomy gating (all 3 paths), idempotency dedup, timeout, error handling, non-blocking broadcast, formatForLLM
  - Added `@supabase/supabase-js` to apps/api
- All 42 tests pass (26 module + 16 chunker), @camello/ai + @camello/api type-check clean

### Session 6 — Feb 18 (Week 2/3: Channel Adapters #31)
- **Built full channel adapter system** — WebChat + WhatsApp, end-to-end:
  - `apps/api/src/adapters/types.ts` — ChannelAdapter interface (verifyWebhook, parseInbound, sendText/Interactive/Media, markRead, sendTypingIndicator)
  - `apps/api/src/adapters/registry.ts` — map-based adapter registry with getAdapter()
  - `apps/api/src/adapters/webchat.ts` — WebChat adapter (trivial normalization, response via HTTP body)
  - `apps/api/src/adapters/whatsapp.ts` — WhatsApp adapter: signature verification (HMAC-SHA256 on raw bytes, timingSafeEqual), Meta webhook parsing (6 message types: text, image, audio, document, location, interactive), Cloud API outbound (sendText, sendInteractive, sendMedia, markRead), tenant resolution by phone_number_id, customer find-or-create, atomic idempotency (INSERT ON CONFLICT DO NOTHING)
  - `apps/api/src/webhooks/widget.ts` — Widget Hono routes: POST /session (rate-limited 10/min per IP+slug, generic errors, tenant slug → server-side UUID resolution, deterministic visitor ID, customer upsert, JWT creation), POST /message (JWT auth, conversation ownership verification, handleMessage pipeline), GET /history (JWT-scoped customer history)
  - `apps/api/src/webhooks/whatsapp.ts` — WhatsApp Hono webhook: GET challenge, POST with async processing (verify sig → resolve tenant → idempotency check → return 200 fast → fire-and-forget processing via setImmediate)
  - `apps/api/src/lib/widget-jwt.ts` — jose-based JWT create/verify (HS256, 24h expiry, issuer: platform-widget, claims: sub, tenant_id, artifact_id, customer_id)
  - `apps/api/src/app.ts` — mounted widget + WhatsApp routes, widget CORS '*' (JWT auth, no cookies)
  - `apps/widget/` — full scaffold: React 19 + Vite IIFE bundle (embeddable), ChatBubble + ChatWindow components, useWidgetSession (memory-only token) + useChat hooks
- **Security hardening** (all P1 feedback addressed):
  - WhatsApp async: returns 200 before handleMessage(), uses setImmediate for fire-and-forget, webhookEvents as durable retry queue
  - phone_number_id unique index: DB migration applied to Supabase cloud, prevents cross-tenant misrouting
  - Conversation spoofing closed: customer_id in JWT, server-side ownership check before reuse
  - Broadcast auth: widget does NOT get Supabase credentials — MVP uses sync HTTP, future uses SSE proxy
  - Rate limiting + generic errors on session endpoint (no slug enumeration)
- Applied migration `add_phone_number_unique_index` to Supabase cloud
- Added `jose` + `vitest` to api package, vitest.config.ts, test script
- 25 new adapter tests: JWT (create/verify/tamper/wrong-secret), signature verification (6 tests), message extraction (3 tests), normalization (7 tests: text/image/audio/doc/location/interactive/unknown), adapter identity
- **Security hardening round** (3 rounds of P1/P2 feedback resolved):
  - P1: Bootstrap queries (tenant-by-slug, channel-config-by-phone) moved from global `db` to SECURITY DEFINER RPCs — `SET search_path = public`, schema-qualified table refs
  - P1: WhatsApp adapter `insertWebhookEvent` + `markWebhookProcessed` moved from global `db` to `createTenantDb()` (RLS-safe)
  - P1: phone_number unique index committed to Drizzle schema + local migration files (0002 + 0003)
  - P2: Trusted IP extraction (`client-ip.ts`): cf-connecting-ip > x-real-ip > x-forwarded-for (first only) > fallback
  - P2: 27 route-level integration tests: widget (15 — session auth/rate-limit/spoofing, message auth/ownership/validation, history auth), WhatsApp (12 — challenge, signature, status, idempotency, async processing, error isolation)
- All 94 tests pass (52 API + 26 module + 16 chunker), all packages type-check clean

### Session 7 — Feb 18 (ESLint Setup)
- **Set up ESLint 9 flat config across the monorepo:**
  - `packages/config/eslint/base.mjs` — @eslint/js + typescript-eslint recommended + turbo plugin + Vitest test-file globals override (describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll)
  - `packages/config/eslint/react.mjs` — extends base + react-hooks + react-refresh
  - `packages/config/eslint/next.mjs` — extends react + @next/eslint-plugin-next + disables react-refresh (conflicts with page exports)
  - Per-workspace `eslint.config.mjs` files (api→base, web→next, widget→react, ai→base, db→base, shared→base)
  - `eslint` devDep + `"lint": "eslint ."` script in all 6 workspaces
  - `turbo.json`: removed `lint.dependsOn: ["^build"]` for faster lint runs
  - Fixed `eslint-plugin-turbo` flat config (single object, not array — don't spread)
  - Fixed `@camello/config` missing from widget devDeps
  - Disabled `turbo/no-undeclared-env-vars` (runtime env vars, not build-time)
  - Cleaned lint warnings: unused imports/params (customers, ChannelConfig, table, text, payload, input, tier), stale eslint-disable directives
  - 4 remaining `any` warnings are expected (typed cast boundaries)
- `turbo lint` passes all 6 workspaces (0 errors), `type-check` clean, 94 tests pass

### Session 8 — Feb 19 (Dashboard #34)
- **Built MVP dashboard in `apps/web`** — Clerk + tRPC + Tailwind v4:
  - `apps/api/src/trpc-types.ts` — type-only `AppRouter` re-export (decouples web from API internals)
  - `apps/api/package.json` — added `exports: { "./trpc": "./src/trpc-types.ts" }`
  - Installed `@clerk/nextjs`, `clsx`, `tailwind-merge`, `lucide-react` in web
  - `src/lib/utils.ts` — `cn()` helper (clsx + tailwind-merge)
  - `src/lib/trpc.ts` — `createTRPCReact<AppRouter>()` + `makeTrpcClient(getToken)` with httpBatchLink + superjson
  - `src/components/providers.tsx` — `ClerkProvider` → inner `TrpcQueryProvider` (uses `useAuth().getToken()` for per-request auth headers)
  - `src/middleware.ts` — Clerk `clerkMiddleware()` + `createRouteMatcher('/dashboard(.*)')`, proper matcher excluding `_next`/static assets
  - `src/components/sidebar.tsx` — nav links (Overview, Conversations, Artifacts) + `UserButton`
  - `src/components/ui/card.tsx`, `badge.tsx`, `button.tsx` — shadcn-style reusable components
  - `src/app/dashboard/layout.tsx` — sidebar + main area (real `/dashboard` route, not route group)
  - `src/app/dashboard/page.tsx` — tenant overview: `tenant.me` + `analytics.overview` + `artifact.list` → stat cards + cost summary
  - `src/app/dashboard/conversations/page.tsx` — conversation list with `useInfiniteQuery` cursor pagination, table with badges
  - `src/app/dashboard/conversations/[id]/page.tsx` — message thread (chronological, role-based styling), status update buttons, `useParams()` for client route params
  - `src/app/dashboard/artifacts/page.tsx` — artifact cards with create form (name + type), activate/deactivate toggle
  - `src/app/page.tsx` — redirect `/` → `/dashboard`
  - Updated `.env.example` (added `CLERK_SECRET_KEY`, `NEXT_PUBLIC_API_URL`)
  - Removed `@camello/ai` from `next.config.ts` transpilePackages (web doesn't use it)
- **Error handling hardening** (P1 review feedback):
  - `src/components/query-error.tsx` — shared error banner with actionable messages for UNAUTHORIZED/FORBIDDEN/generic
  - All 4 pages: primary queries block on error, secondary queries (overview, artifacts, messages) show inline error banners
  - `eslint.config.mjs` — ignore `next-env.d.ts` (auto-generated triple-slash refs)
- **Seed data** in Supabase cloud: 1 tenant (`a0a0a0a0-...-0001` "Acme Corp", growth), 2 artifacts (Sales + Support), 3 customers, 5 conversations (mixed statuses), 13 messages, 8 interaction logs
- All 6 workspaces lint-clean (0 errors), all 6 type-check clean, 94 tests still pass

### Session 9 — Feb 19 (Trigger.dev Jobs #32)
- **Created `apps/jobs` workspace** — Trigger.dev v3, 7th workspace in monorepo:
  - `trigger.config.ts` — `defineConfig` from `@trigger.dev/sdk/v3`, `dirs: ["src/jobs"]`
  - `src/lib/service-db.ts` — separate `Pool` + Drizzle from `DATABASE_URL_SERVICE_ROLE` (bypasses RLS for cross-tenant enumeration/queue-claim)
  - `src/lib/content-extractor.ts` — SSRF-safe URL fetcher: protocol allow-list (http/https only), DNS → private IP block (127/10/172.16-31/192.168/169.254), manual redirect following (max 3, re-validate each hop), 30s timeout, 5 MB body cap, cheerio HTML extraction (strips nav/script/style/footer, prefers article → main → body)
- **Migration 0004** (`add_jobs_columns`) applied to Supabase cloud:
  - `learnings` — `archived_at TIMESTAMPTZ`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` + backfill
  - `knowledge_syncs` — `updated_at`, `attempt_count`, `last_error`, `processing_started_at`, `CHECK (status IN (...))`, partial index `idx_knowledge_syncs_claim` on `(status, processing_started_at, created_at) WHERE status IN ('pending', 'processing')`
- **3 Trigger.dev v3 cron jobs** (all use `schedules.task` from `@trigger.dev/sdk/v3`):
  - `learning-decay.ts` — monthly (`0 3 1 * *`): service-role tenant enumeration → per-tenant `createTenantDb` → `applyConfidenceDecay()` with DI callbacks → archives below 0.3
  - `metrics-rollup.ts` — daily (`0 2 * * *`): UTC date-window `[yesterday 00:00, today 00:00)`, `COUNT(DISTINCT conversation_id) FILTER` for resolutions, explicit handoff SQL (FULL OUTER JOIN handoff_in/handoff_out), ON CONFLICT UPSERT (handles artifacts with handoffs but no interaction_logs)
  - `url-ingestion.ts` — every 5 min (`*/5 * * * *`): atomic claim via `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING`, stale-processing recovery (>10 min), retry logic (attempt < 3 → back to pending, >= 3 or SSRF → permanent fail), `tenants.plan_tier` JOIN for ingestion limits
- **38 new tests**: content-extractor (17 — SSRF blocks, redirect handling, HTML extraction, plaintext passthrough, size limit, HTTP errors), learning-decay (5 — decay math, archive threshold, idempotency, empty list, negative clamp), metrics-rollup (7 — UTC date-window computation across month/year boundaries, SQL correctness guards), url-ingestion (9 — retry logic, stale recovery, claim pattern, plan_tier enforcement)
- **Gate:** 7 workspaces lint-clean, all type-check clean, 154 tests pass (22 RLS + 42 AI + 52 API + 38 Jobs)

### Session 10 — Feb 19 (KPI Instrumentation #33)
- **Per-tenant cost budget system:**
  - `monthly_cost_budget_usd` column on `tenants` table (nullable — NULL = plan-tier default: starter $5, growth $25, scale $100)
  - Budget gate placed BEFORE any paid work (intent classification, RAG) in `handleMessage()` — step 1, immediately after tenant fetch
  - `handleBudgetExceeded()` returns normal `HandleMessageOutput` with canned message (not throw — all callers work without error mapping)
  - Budget check: `SUM(cost_usd)` from `interaction_logs` for current UTC calendar month, inclusive threshold
  - Helpers: `getUtcMonthWindow()`, `resolveEffectiveMonthlyBudget()`, `isBudgetExceeded()`
- **Real Langfuse SDK tracing** (replaced placeholder logging):
  - `apps/api/src/lib/langfuse.ts` — singleton `Langfuse` SDK, `createTrace()` (trace + metadata + span + finalize), `buildTelemetry()` (AI SDK `experimental_telemetry`), `shutdownLangfuse()`
  - Installed in `apps/api` (not `packages/ai`) — tenant context lives in API layer
  - Graceful noop when `LANGFUSE_PUBLIC_KEY`/`LANGFUSE_SECRET_KEY` not set
- **Learning rollback controls:**
  - `apps/api/src/routes/learning.ts` — new router: `list`, `dismiss` (confidence→0, archived), `boost` (confidence→1.0), `bulkClearByModule`
  - `learning_audit_logs` table (7 actions: created, reinforced, dismissed, boosted, bulk_cleared, decayed, archived) with RLS + tenant isolation policy
  - `source_module_execution_id` + `source_module_slug` columns on `learnings` (enables bulkClearByModule)
  - `COST_BUDGET_DEFAULTS` constant in `@camello/shared`
- **Migration 0005** (`kpi_instrumentation`) applied to Supabase cloud
- **10 new tests** (`kpi-instrumentation.test.ts`): UTC month window, budget fallbacks, tenant overrides, invalid overrides, threshold inclusivity, buildTelemetry ±keys, trace metadata/span, span error propagation, setMetadata edge cases
- **Gate:** 7 workspaces type-check clean, 142 tests pass (42 AI + 62 API + 38 Jobs), 0 lint errors
- **Hardening round** (2 P1s + 2 P2s resolved):
  - P1: `handleBudgetExceeded` validates conversation ownership (customer_id + tenant_id + status) via JOIN before reuse — prevents writing into wrong conversation
  - P1: Removed `?? tenantId` FK placeholder — no-artifact path returns controlled response without DB writes
  - P2: Added `budgetExceeded?: boolean` to `HandleMessageOutput`, propagated to `chat.send` and widget JSON response
  - P2: 13 new tests — `budget-exceeded.test.ts` (5: ownership validation, reuse, FK safety, undefined tenant, flags), `learning-routes.test.ts` (8: list, dismiss, boost, bulkClearByModule via tRPC caller)
  - Exported `createCallerFactory` from `trpc/init.ts` for route-level testing
- **Gate (post-hardening):** 7 workspaces type-check clean, 177 tests pass (22 RLS + 42 AI + 75 API + 38 Jobs), 0 lint errors

### Session 11 — Feb 19 (Dashboard Knowledge + Analytics #35)
- **Built Knowledge Management page** (`/dashboard/knowledge`):
  - Section A — Documents: `knowledge.list` with source type filter + offset pagination (resets on filter change), ingest form (toggleable, conditional sourceUrl when type='url'), docs table grouped by title via `useMemo(groupChunksByTitle)`, inline delete confirm with blast-radius text
  - Section B — Learnings: `learning.list` with module slug filter + archived checkbox, truncated content via `useMemo`, dismiss/boost per row, bulk clear by module (trimmed + guarded)
- **Built Analytics Deep-Dive page** (`/dashboard/analytics`):
  - Date range controls: local-time defaults (30d ago → today), auto-swap validation with amber hint
  - Section A — Overview Stats: `analytics.overview` as primary query, StatCard grid + LLM usage card
  - Section B — Artifact Metrics: conditional query with artifact dropdown, daily metrics table
  - Section C — Recent Logs: wide table with overflow-x-auto, artifact filter
  - Section D — Billing Periods: overage in red
- **Extracted shared components**: `stat-card.tsx` (StatCard + Metric), `format.ts` (localDateStr, fmtCost, fmtMicroCost, fmtInt, fmtDate, fmtDateTime, truncate, groupChunksByTitle)
- **Updated sidebar**: added Knowledge (BookOpen) + Analytics (BarChart3) nav items
- **Set up vitest for apps/web**: vitest.config.ts with `@` alias, 25 unit tests for format utils
- **Performance improvements**: bounded LRU org→tenant cache (500 max, 5min TTL) in context.ts, removed redundant RESET round-trip in tenant-db.ts
- **Standardized vitest v4.0.18** across all workspaces (web was on v3.2.1)
- **Billing decision**: Paddle (Merchant of Record) for Week 4 — no US LLC needed, Colombia supported, 5% + $0.50/txn
- **Gate:** 7 workspaces type-check clean, 202 tests pass (22 RLS + 42 AI + 75 API + 38 Jobs + 25 Web), 0 lint errors
- **Week 3 complete** — all tasks done. Ready for Week 4.

### Session 12 — Feb 19 (Tenant Onboarding Wizard #36)
- **Built full 5-step onboarding wizard** — Clerk webhook + tRPC router + dashboard gate + frontend:
- **Backend — `apps/api/src/services/tenant-provisioning.ts`:**
  - `orgIdToTenantId(orgId)` — deterministic UUIDv5 (DNS namespace)
  - `deriveSlug(name)` — URL-safe with random 4-char suffix, max 40 base chars
  - `provisionTenant()` — legacy org adoption (step 0: check Clerk metadata, verify tenant row exists before hard-fail), tenant INSERT with ON CONFLICT (id) DO NOTHING, slug collision retry (23505, max 3), member + preview customer creation, Clerk metadata sync, LRU cache invalidation
- **Backend — `apps/api/src/webhooks/clerk.ts`:**
  - Hono route at POST `/api/webhooks/clerk`, Svix signature verification
  - Dispatches `organization.created` to shared `provisionTenant()`
- **Backend — `apps/api/src/routes/onboarding.ts`:**
  - 7-procedure tRPC router: `provision` (authedProcedure, orgId security check), `parseBusinessModel` (generateObject + Zod schema + default fallback), `setupArtifact` (atomic: artifact + modules + defaultArtifactId), `ensurePreviewCustomer` (explicit conflict target), `getStatus`, `saveStep`, `complete`
- **Backend — `apps/api/src/trpc/context.ts`:**
  - Added `orgId: string | null` to Context, exported `clearOrgCache()`
- **Frontend — `apps/web/src/app/onboarding/`:**
  - `layout.tsx` — centered max-w-2xl on gray-50 background
  - `page.tsx` — wizard orchestrator with step state, resume from saved step
  - `WizardProgress.tsx` — 5-dot horizontal step indicator
  - `Step1CompanyName.tsx` — Clerk `<CreateOrganization />` or auto-provision
  - `Step2BusinessModel.tsx` — textarea → `parseBusinessModel` → suggestion card
  - `Step3MeetAgent.tsx` — AI suggestion preview, inline rename, `setupArtifact`
  - `Step4ConnectChannel.tsx` — WebChat (embed snippet) or WhatsApp (phone + webhook URL)
  - `Step5TestIt.tsx` — live chat with `chat.send`, `ensurePreviewCustomer` fallback
- **Frontend — `apps/web/src/app/dashboard/layout.tsx`:**
  - `OnboardingGate` wrapper: `tenant.me` → redirect to `/onboarding` if not complete, render guard (null) to prevent flash, `QueryError` for non-FORBIDDEN errors
- **Frontend — `apps/web/src/middleware.ts`:**
  - Added `/onboarding(.*)` to protected routes
- **Tests:**
  - 13 provisioning tests: deterministic UUID, slug derivation, idempotent provision, legacy adoption, metadata mismatch, slug retry
  - 8 webhook tests: valid org.created, invalid sig, non-org events, idempotent, missing secret
  - 17 onboarding route tests: all 7 procedures + schema validation + orgId security
  - 10 web tests: wizard steps, suggestion shape, widget snippet construction
- **6 rounds of security audits resolved:**
  - P1: orgId null bypass → require `!ctx.orgId || ctx.orgId !== input.orgId`
  - P1: widget snippet URL → `NEXT_PUBLIC_WIDGET_URL` + `widget.js` (matching vite.config)
  - P1: legacy org adoption → check tenant row exists before hard-fail on metadata mismatch
  - P1: cross-tenant takeover → member verification on legacy adoption (occupied tenant requires caller to be existing member)
  - P1: null-creator webhook path → unconditional occupancy check (blocks null-creator + non-member callers)
  - P2: dashboard gate flash → synchronous render guard before useEffect redirect
  - P2: missing env vars → added `CLERK_WEBHOOK_SECRET` to API, `NEXT_PUBLIC_WIDGET_URL` to web
  - P2: onboarding web tests added (10 tests)
  - P2: malformed `camello_tenant_id` → UUID regex validation before `createTenantDb()`
  - P2: `.limit(1)` false rejection → split into `hasAnyMembers` + `callerMembership` queries
  - P3: `ensurePreviewCustomer` → explicit conflict target `[tenantId, channel, externalId]`
- **Dependencies:** `svix` + `uuid` added to `apps/api`
- **Gate:** 7 workspaces type-check clean, 256 tests pass (22 RLS + 42 AI + 119 API + 38 Jobs + 35 Web), 0 lint errors (4 pre-existing warnings)

### Session 13 — Feb 20 (Knowledge Seeding + Wizard UX Polish #36b)
- **Step 4 "Teach Agent"** — new wizard step between artifact creation and channel setup:
  - Auto-seeds business description from Step 2 (chunk → embed → insert via `knowledge.ingest`)
  - Optional "Quick Facts" textarea (ingested on Continue)
  - Optional website URL input (queued via `knowledge.queueUrl` for async Trigger.dev scraping)
  - 15s timeout with `settled` ref (fixes stale closure bug), spinner animation, personalized status messages
  - `alreadySeeded` prop + `businessDescriptionSeeded` flag persisted in tenant JSONB settings
- **`knowledge.queueUrl`** — new tRPC procedure: inserts `knowledge_syncs` row with `ON CONFLICT DO NOTHING`
- **Migration 0006** — `idx_knowledge_syncs_tenant_url` unique index + `row_number()` dedupe (tiebreaker: `id DESC`)
- **`setupArtifact` idempotency** — checks `defaultArtifactId` before creating, returns existing artifact
- **Back navigation** — Back button for steps 3-6, Step 1 hidden (provisioning is one-way)
- **Resume-once guard** — `hasResumed` ref prevents stale-step overwrite when `suggestion`/`businessDescription` change
- **Seeded-flag reset** — changing description in Step 2 resets `businessDescriptionSeeded` so Step 4 re-indexes
- **Vector/text[] cast fixes** — `match_knowledge` RPC: format embedding as `[...]::vector` string literal, docTypes as `{...}::text[]` (Drizzle sends JS arrays as `record` type)
- **Step2BusinessModel** — `initialDescription` prop for back-navigation data preservation; `variables.description` in `onSuccess` (race fix)
- **Step5TestIt** — error UI for `ensurePreviewCustomer` failure
- **`saveStep` schema** — `step` made optional so `onSeeded` can persist flag without step regression
- **WizardProgress** — updated to 6 steps
- **Smoke test confirmed:** agent answers "We have a 30-day money-back return policy" using RAG on seeded knowledge
- **Self-audit (4 findings):** P2 stale-seeded-flag (fixed), P3 ensureCustomer error UI (fixed), P3 empty-patch write (acceptable), P3 URL protocol validation (server validates)
- **Gate:** 7 workspaces type-check clean, 157 tests pass (122 API + 35 Web), 0 lint errors

### Session 14 — Feb 20 (Paddle Billing Integration #37)
- **Built Paddle Billing integration** — webhook handler + tRPC router + billing dashboard:
- **Migration 0007** (`paddle_billing`) applied to Supabase cloud:
  - `billing_events.stripe_event_id` renamed → `paddle_event_id`
  - 5 new columns on `tenants`: `paddle_subscription_id`, `paddle_customer_id`, `subscription_status` (CHECK constraint, 6 values), `paddle_status_raw`, `paddle_updated_at`
  - `paddle_webhook_events` table — dedicated idempotency table (NO RLS, operational/infra)
  - Partial index: `idx_tenants_paddle_subscription` for reverse-lookup
  - SECURITY DEFINER RPC: `resolve_tenant_by_paddle_subscription()` (bypasses RLS)
- **Backend — `apps/api/src/lib/paddle.ts`:**
  - Singleton `getPaddle()` (same pattern as Langfuse)
  - `priceIdToTier()` / `tierToPriceId()` — env-var-based mapping
  - `mapPaddleStatus()` — maps to SubscriptionStatus with safe fallback
- **Backend — `apps/api/src/webhooks/paddle.ts`:**
  - Hono route at POST `/api/webhooks/paddle`
  - Signature verification via `paddle.webhooks.unmarshal()`
  - Atomic claim idempotency: INSERT ON CONFLICT with 60s stale-lock recovery
  - Timestamp guard: `paddle_updated_at` prevents out-of-order corruption
  - 4 event handlers: `subscription.created`, `subscription.updated`, `subscription.canceled`, `transaction.completed`
  - Cancellation downgrade gated on effective date (`canceled_at <= now()`)
  - Terminal failures: `failed_at + last_error`, return 200 to stop Paddle retries
  - Transient failures: don't finalize, lock expires → Paddle retries
- **Backend — `apps/api/src/routes/billing.ts`:**
  - 4 tRPC procedures: `currentPlan`, `createCheckout`, `cancelSubscription`, `history`
  - Checkout branching: no active sub → `transactions.create()` (checkout URL), active sub → `subscriptions.update()` (in-place proration)
- **Frontend — `apps/web/src/app/dashboard/settings/billing/page.tsx`:**
  - Current plan summary with limits + budget
  - 3 plan cards (starter/growth/scale) with highlighting
  - Subscribe/Switch button logic based on subscription state
  - Cancel with confirmation (effective at next billing period)
  - Billing history table
- **Sidebar:** added Billing nav item (CreditCard icon)
- **Shared:** `PLAN_PRICES` constant, `SubscriptionStatus` type
- **Tests:** 32 new (15 webhook + 9 billing routes + 8 web)
- **Env vars:** `.env.example` updated with 6 Paddle vars
- **Fix:** `@camello/shared` sub-path exports only — bare imports fail at runtime (Vite/tsc). All imports changed to `@camello/shared/constants` and `@camello/shared/types`.
- **Audit fix round** (3 findings from P1/P2 review):
  - P1: Transient webhook failures returned 200 (blocking Paddle retries) → now return 500
  - P2: `mapPaddleStatus()` unknown fallback was `'active'` (over-entitlement risk) → changed to `'past_due'`
  - P2: Missing tenant for `subscription.updated`/`subscription.canceled` was terminal `markFailed()` → now transient `throw` (out-of-order delivery, Paddle retries)
- **Gate:** 7 workspaces type-check clean, 189 tests pass (146 API + 43 Web), 0 lint errors

### Session 15 — Feb 20 (Integration Pipeline Tests #38)
- **Built 4 integration test files** exercising `handleMessage()` orchestration with mocked LLM/DB:
  - `full-message-pipeline.test.ts` (5 tests): full greeting pipeline, complex query with RAG, conversation reuse (skips transaction), conversation history role mapping, telemetry + trace finalization
  - `budget-gate-integration.test.ts` (5 tests): budget blocking (no AI calls), under-budget pass-through, custom tenant budget override, plan tier defaults (growth $25), canned response + telemetry writes
  - `module-tool-calling.test.ts` (5 tests): tools passed with maxSteps:5, no-modules skip (maxSteps:1), single/multi step tool extraction into moduleExecutions, DI dependency injection verification
  - `rag-knowledge-flow.test.ts` (5 tests): RAG context in system prompt, greeting skip, searchKnowledge args verification, learnings in prompt, empty RAG + empty learnings graceful handling
- **Mock strategy**: `vi.mock('@camello/db')` with real schema from side-effect-free `@camello/db/schema` sub-path (avoids Pool creation from barrel import). `createArtifactResolver` mocked to return `{ resolve: vi.fn() }` (skips 3 internal DB queries). `drizzle-orm` NOT mocked — chain mocks swallow all args, real operators receive real column objects.
- **DB query sequence**: documented 2 variants (new conversation = 10 queries + 1 transaction, reuse = 10 queries + 0 transactions). Each `mockImplementationOnce` annotated with pipeline step comment.
- **Audit**: 2 rounds. P1 type-check failures (intent union types) fixed. P2 subset command corrected (`vitest run src/__tests__/integration`).
- **Gate:** 7 workspaces type-check clean, 209 tests pass (22 RLS + 42 AI + 166 API + 38 Jobs + 43 Web), 0 lint errors

### Session 17 — Feb 21 (Jobs Migration: Trigger.dev → Railway Worker #39c)
- **Migrated `apps/jobs` from Trigger.dev to standalone Railway worker** — `node-cron` scheduler:
- **Migration 0008** (`job_runs_ledger`) applied to Supabase cloud:
  - `job_runs` table — DB-backed run ledger for deduplication + catch-up. `UNIQUE(job_name, period)`, `CHECK(period ~ '^\d{4}-\d{2}(-\d{2})?$')`. No RLS (operational, service-role access only).
  - `GRANT SELECT, INSERT, UPDATE, DELETE ON job_runs TO app_user`
- **New files in `packages/db`:**
  - `src/schema/ops.ts` — Drizzle schema for `job_runs` (operational/infra, not tenant-scoped)
  - `src/schema/index.ts` — added `export * from './ops.js'`
- **New files in `apps/jobs`:**
  - `src/lib/logger.ts` — structured JSON logger replacing Trigger.dev `logger` (same API: `log.info/warn/error`)
  - `src/lib/job-lock.ts` — DB-backed helpers: `claimJobRun()` (INSERT ON CONFLICT DO NOTHING + 24h stale lock cleanup), `completeJobRun()` ($2::jsonb explicit cast), `getLastCompletedPeriod()`
  - `src/worker.ts` — `createWorker()` factory (zero side effects at import): bounded catch-up on startup, 3 cron schedules (node-cron), in-process overlap protection (`runningJobs: Set`), health HTTP endpoint (`/health` on PORT 3001), graceful SIGTERM/SIGINT shutdown (60s timeout)
  - `src/main.ts` — entrypoint: `createWorker().start()` (tsup entry)
  - `tsup.config.ts` — self-contained ESM bundle (`noExternal: [/.*/]`, `createRequire` banner)
  - `src/__tests__/worker.test.ts` — 4 tests: no side effects, 3 schedules registered with correct cron + timezone, stop cleanup, catch-up queries
- **Refactored 3 job files** (business logic unchanged):
  - `learning-decay.ts` — `schedules.task()` → `export async function runLearningDecay()`
  - `metrics-rollup.ts` — `schedules.task()` → `export async function runMetricsRollup(metricDate: Date)` (explicit date param, no internal offset, caller computes yesterday)
  - `url-ingestion.ts` — `schedules.task()` → `export async function runUrlIngestion()` (no ledger — SKIP LOCKED is idempotent)
- **Catch-up logic:** metrics-rollup bounded by `METRICS_CATCHUP_DAYS` env (default 7) in ALL paths (first deploy + long outage). Learning-decay = current month only (cumulative decay, no multi-month replay).
- **`Dockerfile.jobs`** at repo root — two-stage build, runner copies only `dist/main.js` (no node_modules)
- **package.json:** removed `@trigger.dev/sdk`, added `node-cron` + `@types/node-cron` + `tsx` + `tsup`. Scripts: `build: tsup`, `start: node dist/main.js`, `dev: tsx watch src/main.ts`
- **Deleted:** `trigger.config.ts`
- **Gate:** 42 jobs tests pass (38 existing + 4 new worker), type-check clean, build produces `dist/main.js` (2.90 MB)

### Session 18 — Feb 21 (Landing Page #40)
- **Built full marketing landing page** at `/` (Server Component):
  - `apps/web/src/app/globals.css` — 8-color palette (midnight/sand/teal/sunset/gold/cream/charcoal/dune) via `@theme` custom properties, `scroll-behavior: smooth` + `scroll-padding-top: 5rem`
  - `apps/web/src/app/layout.tsx` — Jost (headings) + DM Sans (body) via `next/font/google`, OG metadata with `og-image.jpeg`, favicon from `camel-logo.jpeg`
  - `apps/web/messages/en.json` + `es.json` — `landing` namespace (~60 strings each: nav, hero, features, pricing, footer)
  - `apps/web/src/app/page.tsx` — full Server Component landing page
- **Design system:**
  - Typography: Jost 700 uppercase for hero, Jost 600 title case for sections, DM Sans 400 for body, Jost 500 uppercase tracking-widest for nav/buttons
  - 3-zone color blocking: midnight (hero + nav + footer) → sand (features) → teal (pricing)
  - 8px grid: py-20/32 sections, p-6/8 cards, gap-8 grids, max-w-6xl content / max-w-2xl centered text
  - WCAG AA contrast on all text/bg combos
- **Sections:**
  - Sticky nav: auth-aware (signed-in = "Dashboard" CTA, signed-out = "Log in" + "Get Started"), mobile collapses to logo + CTA
  - Hero: ALL CAPS headline, subheadline, teal CTA, "Built in Colombia 🇨🇴" trust line, `camel-sales.jpeg` (520px, rounded-2xl, no border — bg matches midnight)
  - Features: 2x2 grid, each card with camel illustration (152px) + title + description. Solid cream bg, border-2, rounded-xl, hover:shadow-md. Mobile: stacks vertically with centered image
  - Pricing: 3-col cards on midnight bg within teal section. Real data from `PLAN_PRICES` + `PLAN_LIMITS`. Growth plan gold border + "Popular" badge. Teal checkmark SVGs on list items. CTA buttons (gold for popular, cream/10 for others)
  - Footer: 4-col grid (logo, product, company, legal), copyright with dynamic year
- **Illustrations:** 7 pre-generated 1K JPEGs in `public/illustrations/` (camel-base, camel-sales, camel-support, camel-marketing, camel-analytics, camel-knowledge, camel-logo) + `og-image.jpeg`. All served with `unoptimized` prop (prevents Next.js double-compression artifacts on flat-color UPA style art)
- **i18n:** Full Spanish support via `getTranslations('landing')` — nav, hero, features, pricing, footer all translated
- **Auth behavior:** Landing page always shows (no redirect for signed-in users). Nav adapts based on auth state.
- **Gate:** Web build clean (5.34 kB first load for `/`), lint 0 errors, type-check clean

### Session 20 — Feb 21 (Dashboard UX Simplification #49)
- **3 areas of UX improvement** — layout width, agent test chat, overview simplification:
- **Part 1 — Layout width constraint:**
  - `apps/web/src/app/dashboard/layout.tsx` — added `max-w-5xl mx-auto` inner container to `<main>`
  - Centers content at 1024px max, prevents ultrawide stretch
- **Part 2 — Agent test chat (sandbox mode):**
  - `apps/api/src/routes/chat.ts` — added `sandbox` + `artifactId` optional fields with bidirectional `.refine()` validation, early artifact validation (TRPCError before paid LLM calls)
  - `apps/api/src/orchestration/message-handler.ts` — added `artifactId` + `conversationMetadata` to `HandleMessageInput`, override path runs BEFORE intent classification, conversation reuse checks (ownership + artifact match + sandbox metadata), `findOrCreateConversation` accepts optional `metadata`, handles `manual_override` assignment reason
  - `apps/api/src/routes/conversation.ts` — sandbox exclusion via JSONB containment: `NOT (metadata @> '{"sandbox": true}'::jsonb)`
  - `apps/web/src/components/test-chat-panel.tsx` — new slide-over panel with chat UI, conversation continuity tracking (`conversationId` state), reset on close, uses `ensurePreviewCustomer` + `chat.send` with sandbox params
  - `apps/web/src/app/dashboard/artifacts/page.tsx` — "Test" button per active artifact, `TestChatPanel` rendering
- **Part 3 — Overview simplification:**
  - `apps/api/src/routes/analytics.ts` — new `monthlyUsage` procedure (`resolvedThisMonth` via `resolvedAt` range, `costThisMonth` via `interaction_logs` range, UTC month boundaries)
  - `apps/api/src/lib/date-utils.ts` — extracted `getUtcMonthWindow()` from message-handler (shared by budget gate + analytics)
  - `apps/web/src/app/dashboard/page.tsx` — restructured: Plan Usage section (tier badge + resolution/cost progress bars), Business KPIs (stat cards), collapsible Advanced section (LLM details, default closed)
  - `apps/web/src/components/stat-card.tsx` — added `UsageBar` component (teal fill, charcoal/8 track, gold >80%)
- **i18n:** +20 keys in en.json + es.json (dashboard.planUsage/advanced/resolutionsUsed/costUsed/unlimited, artifacts.test/testChat/closeTest/testChatDescription/chatEmpty/thinking/messagePlaceholder/sendButton)
- **P1 audit fixes** (2 findings resolved):
  - Invalid artifact override threw generic `Error` → moved validation to route layer, throws `TRPCError({ code: 'NOT_FOUND' })`
  - Artifact override validated after intent classification (wasted paid LLM calls) → restructured pipeline: override resolution before intent classification
- **Tests:** 11 new (5 sandbox-chat, 2 analytics-monthly-usage, 4 test-chat-panel logic)
- **Gate:** 221 tests pass (174 API + 47 Web), lint 0 errors, type-check clean

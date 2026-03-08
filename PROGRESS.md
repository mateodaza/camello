# Camello Build Progress

> Single source of truth for what's done, what's next, and what's blocked.
> Updated at the end of every work session.
>
> **AI memory lives at:** `~/.claude/projects/.../memory/` (MEMORY.md, architecture.md, compliance-gaps.md, differentiation.md). Not in-repo — persists across Claude sessions.

## Current Phase: Launch-Ready Polish Sprint

> **Authoritative task list:** `TASK_QUEUE.md` (root). Tasks use `CAM-1XX` IDs.
> Goal: Make the product presentable for first real users. Fix onboarding gaps, finish workspace analytics, flesh out support/marketing workspaces, harden for production.
> NC (Nightcrawler) executes tasks autonomously on `nightcrawler/dev` branch.

| ID | Task | Date | Notes |
|----|------|------|-------|
| CAM-122 | Accessibility audit on new components | Mar 8 | `sheet.tsx`: `role="dialog"` + `aria-modal="true"` + `aria-labelledby` prop. `module-settings.tsx`: `aria-controls="module-settings-panel"` on expand button; `id="module-settings-panel"` on panel div; `htmlFor`/`id` pairs on all 6 label/input combos. `notifications-panel.tsx`: sr-only unread text span; `t('close')` i18n on close button aria-label. `lead-detail-sheet.tsx`: `type="button"` on close/stage/add-note buttons; `type="button"` + `min-h-[36px]` on confirm/cancel; `<label htmlFor>` + `id` for notes textarea. `sales-alerts.tsx`: `type="button"` on approve/reject/confirm/cancel; `htmlFor`/`id` on reject reason label+select and free text label+textarea. `bar-chart-css.tsx`: `role="list"` + `aria-label` on container; `role="listitem"` + `aria-label="{label}: {value}"` on each row; `ariaLabel` prop. `registry/sales.tsx`: win-rate always `text-charcoal` + color-indicator dot; `ariaLabel` on `BarChartCss`. `en.json`/`es.json`: `notifications.unread` + `notifications.close`. 15 tests in `a11y-audit.test.tsx`. Type-check passes. |
| CAM-121 | Test coverage push for new tRPC procedures | Mar 8 | Created `apps/api/src/__tests__/routes/agent-notifications.test.ts` (12 tests: ownerNotifications×3, markNotificationRead×3, markAllNotificationsRead×3, unreadNotificationCount×3); extended `agent-source-breakdown.test.ts` with empty-result test (+1). 13 total new tests. Type-check passes. |
| CAM-120 | Error boundary + global error handling audit | Mar 8 | New `workspace-section-error-boundary.tsx` (class component + functional fallback); `agents/[id]/page.tsx` wraps `ModuleSettings`, registry sections, `PriorityIntents`, `AgentActivity` in per-section boundaries + `retry: 2` on workspace query. `retry: 2` added to all 18 polling queries across `sales.tsx`, `sales-alerts.tsx`, `support.tsx`, `marketing.tsx`, `notifications-panel.tsx`. `onError` toast handlers added to 9 mutations (`updateLeadStage` ×2, `updateTicketStatus`, `resolveConversation`, `storeCsatRating`, `acknowledgeEscalation`, `markRead`, `markAllRead`, `addLeadNoteMut`). 4 i18n keys in en+es (`errorBoundaryTitle`, `errorBoundaryRetry` in `agentWorkspace`; `errorLoading` in `notifications`). Type-check passes. |
| CAM-119 | Marketing workspace: interest stats + draft content feed | Mar 8 | `apps/api/src/routes/agent.ts`: `marketingStats` raw-SQL CTE procedure (total interests, top 3 categories, draft count — all filtered to `status='executed'`); `marketingDrafts` updated with `status='executed'` + `draft_status IS NULL` filters. `apps/api/src/routes/module.ts`: `updateDraft` mutation (approve/edit/discard lifecycle in output JSONB). `registry/marketing.tsx`: new `MarketingStats` (MetricsGrid + top-categories list), `MarketingDrafts` rewritten with optimistic removal + approve/edit/discard buttons (`output.topic` as draft title). 11 i18n keys (en+es). 4 tests in `agent-marketing-stats.test.ts`, 7 tests in `module-update-draft.test.ts`. Type-check passes. |
| CAM-118 | Support workspace: knowledge gap inline ingest + UX | Mar 8 | `apps/api/src/routes/agent.ts`: `supportKnowledgeGaps` rewritten to `db.execute(sql\`...\`)` with `lower(trim())` intent normalization + `tokens_out ASC` subquery for lowest-confidence sample question. `registry/support.tsx`: `SupportKnowledgeGaps` rewritten as card-feed with `dismissedIntents` useRef optimistic removal (persists through 30s poll), inline textarea + submit flow. 8 i18n keys (en+es). 4 tests in `agent-knowledge-gaps.test.ts`. Type-check passes. |
| CAM-117 | Support workspace: ticket resolution flow | Mar 8 | `apps/api/src/routes/agent.ts`: `supportResolutionStats` tRPC procedure (30d resolved count, avg CSAT, resolution rate via `COUNT FILTER` + `AVG JSONB->>'csat'`); `storeCsatRating` mutation (JSONB merge with `WHERE status='resolved'` guard); `supportTickets` extended with `leftJoin(conversations)` to expose `conversationStatus` + `csat`. `apps/web/src/components/agent-workspace/primitives/data-table.tsx`: `rowClassName` prop added. `registry/support.tsx`: new `SupportResolutionStats` MetricsGrid component; `SupportTickets` gains Resolve button, inline star CSAT prompt, grayed-out resolved rows. 11 i18n keys (en+es). Type-check passes. |
| CAM-114 | Revenue forecasting card | Mar 8 | `apps/api/src/routes/agent.ts`: `salesForecast` tRPC procedure — `stage_history` CTE (artifact-scoped via `INNER JOIN conversations`, 90-day window, `COUNT DISTINCT FILTER` for won/terminated) + `active_pipeline` CTE, LEFT JOIN, `FALLBACK_RATES` (qualifying 20%/proposal 50%/negotiation 70%) when `terminated_count < 5`. `apps/web/src/components/agent-workspace/registry/sales.tsx`: `ForecastCard` component + `salesForecast` query + stats strip cell updated. 4 i18n keys (en+es). 4 tests in `agent-sales-forecast.test.ts`. Type-check passes. |
| CAM-111 | Period-over-period sales comparison | Mar 8 | `apps/api/src/routes/agent.ts`: `salesComparison` tRPC procedure (single CTE SQL with `date_trunc('week', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'` bounds, `COUNT(*) FILTER` conditional aggregates, TypeScript `delta()` helper). `apps/web/src/components/agent-workspace/registry/sales.tsx`: `DeltaBadge` component (fully i18n via `useTranslations`), delta badges on Revenue Earned + Money in Play hero cards, new "This Week" 4-cell comparison card. 8 i18n keys per locale (en+es). New `apps/api/src/__tests__/routes/agent-sales-comparison.test.ts` (4 tests). Type-check passes. |
| CAM-107 | Fix onboarding Step 3 module badges + collect profile basics | Mar 7 | `apps/api/src/routes/onboarding.ts`: `setupArtifact` restructured — `profile` field added to input, `runSetupTransaction` helper extracted, all 4 resolution paths converge into `resolvedArtifact`, unified Phase 2 `UPDATE artifacts SET personality = personality || $patch` runs after convergence. `Step3MeetAgent.tsx`: `trpc.module.catalog` removed, static `ARCHETYPE_MODULE_SLUGS` map added, Quick Profile section (tagline/bio/avatar upload via `tenant.uploadAvatar`), mutation chain `setupArtifact → updateProfile → onComplete`. 10 i18n keys (en+es), `loadingModules` removed. 7 new API tests (Paths 1–4 + blank/omit/avatarUrl) + 9 new web tests. Type-check passes. |

---

## Previous Phase: Sales Agent Optimization Sprint

> Gap analysis (2026-03-07) found 3 critical blockers, 4 high gaps, 7 medium gaps in the sales agent happy path.
> NC completed 13 tasks (CAM-101-116). Audit found 13 issues (3 critical, 4 high, 6 medium) — all fixed. Migrations 0016-0020 applied to Supabase cloud.

| ID | Task | Date | Notes |
|----|------|------|-------|
| CAM-007 | Follow-up queue cron job | Mar 7 | `apps/jobs/src/jobs/process-followups.ts` — pure functions (`computeFollowupOutcome`, `processClaimedRows`), FOR UPDATE SKIP LOCKED (50 row batch), 5-min cron schedule, unit tests. Type-check passes. |
| CAM-101 | Approve/reject UI for pending module executions | Mar 7 | `sales-alerts.tsx`: added `onMutate` + `onError` rollback to `approveMut` for optimistic card removal. `agent-workspace.test.ts`: fixed `useUtils` proxy to 3-level depth, updated `useMutation` mock to forward `onMutate`, added 1 new optimistic-UI test. 10 tests total. Type-check passes. |
| CAM-102 | Module config UI | Mar 7 | Created `apps/web/src/components/agent-workspace/module-settings.tsx` (collapsible, per-module autonomy + slug-specific config fields); inserted into `apps/web/src/app/dashboard/agents/[id]/page.tsx` below WorkspaceHeader; added 17 i18n keys to en.json + es.json. Type-check passes. |
| CAM-103 | Dashboard polling | Mar 7 | Added `refetchInterval: 30_000, refetchIntervalInBackground: false` to 10 tRPC queries across 7 files: `agents/[id]/page.tsx`, `registry/sales.tsx` (3 queries), `sales-alerts.tsx`, `conversations/[id]/page.tsx`, `conversations/page.tsx` (useInfiniteQuery), `registry/support.tsx` (4 queries), `registry/marketing.tsx` (3 queries). Type-check passes. |
| CAM-104 | Robust budget parser | Mar 7 | Exported `parseBudgetString` from `packages/ai/src/modules/qualify-lead.ts`; new `__tests__/qualify-lead-budget-parser.test.ts` (17 cases covering $Nk, ~N, ranges, multipliers, null-list); updated 3 assertions in `module-executor.test.ts`. Type-check passes. |
| CAM-105 | Enhanced lead scoring | Mar 7 | Added `computeLeadScore` to `qualify-lead.ts` (6 weighted signals, capped at 100); extended `qualifyLeadInputSchema` with `asked_pricing`/`is_returning`/`need_count` (`.optional()` only, no `.default()`); added `numeric_score` to `qualifyLeadOutputSchema`; updated `formatForLLM`; created `__tests__/qualify-lead-scoring.test.ts` (22 cases). Type-check passes. |
| CAM-106 | Sales prompt optimization | Mar 7 | Replaced 8-line prompts in `packages/ai/src/archetypes/sales.ts` with structured ~25-line prompts (en + es) covering objection handling (acknowledge→validate→reframe→offer alternative), urgency detection, trial/assumptive/alternative close techniques, upsell signals, and "never do" rules. Type-check passes. |
| CAM-108 | Owner notification channel | Mar 7 | Created `packages/db/migrations/0016_owner_notifications.sql` + `packages/db/src/schema/notifications.ts` (`ownerNotifications` table with RLS + stale dedup partial index); added `OwnerNotificationType` + `insertOwnerNotification` callback to `@camello/shared/types`; wired emit paths in `qualify-lead.ts` (hot_lead), `message-handler.ts` (approval_needed + insertOwnerNotification callback), `agent.ts` (deal_closed on updateLeadStage; lead_stale fire-and-forget in salesAlerts; 4 new tRPC procedures: ownerNotifications, markNotificationRead, markAllNotificationsRead, unreadNotificationCount); created `NotificationsPanel` + `NotificationsBell` components (`notifications-panel.tsx`) with 15s polling; updated `WorkspaceHeader` with `rightAction` slot; wired bell in `agents/[id]/page.tsx`; added 12 i18n keys to en.json + es.json. 5 unit tests in `qualify-lead-notification.test.ts`. Type-check passes. |
| CAM-109 | Quote-to-payment auto-flow on approval | Mar 7 | Created `apps/api/src/lib/insert-payment-for-quote.ts` (SELECT lead by conversationId → INSERT payments row); added `if (moduleRow.slug === 'send_quote')` guard in `apps/api/src/routes/module.ts` approve success path; 3 unit tests in `apps/api/src/__tests__/routes/module-approve-quote-payment.test.ts` via `createCallerFactory`. Type-check passes. |
| CAM-110 | Auto-stage progression on re-qualification | Mar 7 | Added required `getLeadByConversation` to `ModuleDbCallbacks` + `OwnerNotificationType.stage_advanced`; stage resolution logic in `qualify-lead.ts` (STAGE_ORDER, TERMINAL_STAGES, anti-downgrade, fire-and-forget `stage_advanced` notification); migration 0017 drops/re-adds type CHECK constraint; wired DB query in `message-handler.ts`; stubs in `module.ts` approve route; 6 new tests in `qualify-lead-stage-progression.test.ts`; updated 4 existing test files. Type-check passes. |
| CAM-112 | Lead notes and unified activity timeline | Mar 7 | Migration 0018 (`lead_notes` + `lead_stage_changes` tables + Postgres `AFTER UPDATE` trigger on `leads.stage`); Drizzle tables in `packages/db/src/schema/conversations.ts`; `agent.leadNotes` query + `agent.addLeadNote` mutation in `apps/api/src/routes/agent.ts`; `salesLeadDetail` extended with `notes`, `messages`, `stageChanges`; `buildTimeline()` exported pure function in `lead-detail-sheet.tsx` with 5-kind merge+sort; notes textarea UI; 7 tests in `agent-lead-notes.test.ts` + 1 test in `sales-timeline.test.ts`; 9 i18n keys each in en.json + es.json. Type-check passes. |
| CAM-113 | Lead source attribution | Mar 7 | Migration 0019 (`source_channel`, `source_page` columns + index on `leads`); Drizzle schema updated; `ModuleExecutionContext` + `ModuleDbCallbacks` extended with `channel`/`metadata`/`sourceChannel`/`sourcePage`; `ToolAdapterDeps` extended + ctx wired in `tool-adapter.ts`; `qualify-lead.ts` passes `sourceChannel`/`sourcePage` to `insertLead`; `message-handler.ts` wires channel + first-write-wins upsert; `agent.salesSourceBreakdown` tRPC procedure; `BarChartCss` section in `SalesOverview`; 7 i18n keys (en + es); 3 tests in `qualify-lead-source-attribution.test.ts` + 2 tests in `agent-source-breakdown.test.ts`. Type-check passes. |
| CAM-116 | Conversation summarization on resolve | Mar 7 | New `packages/ai/src/summarize-conversation.ts` (`summarizeConversation(messages, locale)`) using `MODEL_MAP['fast']`; exported from `packages/ai/src/index.ts`; second `setImmediate` in `conversation.updateStatus` fetches tenant locale and merges summary into `conversations.metadata.summary`; `list` query adds JSONB-extracted `summary`; `salesLeadDetail` returns `conversationSummary`+`conversationResolvedAt`; `lead-detail-sheet.tsx` adds `summary` timeline kind + render; conversations page shows truncated summary; 2 i18n keys (en+es); 6 unit tests in `summarize-conversation.test.ts`. Type-check passes. |
| CAM-115 | Sales auto-follow-up scheduling | Mar 7 | Added `checkModuleExecutionExists` + `checkQueuedFollowupExists` (required) + `scheduleFollowupExecution?` (optional) to `ModuleDbCallbacks` in `packages/shared/src/types/index.ts`; warm/hot scheduling logic in `packages/ai/src/modules/qualify-lead.ts` (4h hot, 24h warm, booking+queued guards); 3 callbacks wired in `apps/api/src/orchestration/message-handler.ts` (app-level JSONB filter for tsup guardrail); stub updated in `apps/api/src/routes/module.ts`; 6 test helper stubs updated; 6-test `qualify-lead-followup-scheduling.test.ts` created. Race condition fix (iteration 3): migration `0020_unique_queued_followup.sql` adds JSONB partial unique index on `module_executions (conversation_id) WHERE module_slug='send_followup' AND status='executed' AND output->>'followup_status'='queued'`; `scheduleFollowupExecution` insert uses `.onConflictDoNothing()` — concurrent inserts race to the DB constraint, second silently discarded. Type-check passes. |

---

## Previous Phase: Week 5 — RAG Upgrade + Customer Memory + Launch Prep (Weeks 1-4 complete)

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

| 44 | Error handling polish (#44) | Feb 26 | **Widget route hardening:** JSON parse guards (400 on malformed body) for `/session` + `/message`, outer try/catch on all 4 widget routes (consistent `{ error }` JSON on 500), sessionInits silent catch → `console.error`. **Widget UX:** bilingual error messages for budget exceeded, conversation limit, daily limit, burst rate limit (5 i18n keys en+es), `inputDisabled` state permanently disables input on limits, HTTP 429 handling with rollback. **Dashboard:** `OnboardingGate` handles `UNAUTHORIZED` → redirect to `/sign-in`, `error.tsx` error boundary (new file), `QueryError` handles 6 tRPC codes (UNAUTHORIZED/FORBIDDEN/NOT_FOUND/PAYLOAD_TOO_LARGE/TOO_MANY_REQUESTS/INTERNAL_SERVER_ERROR) with "Sign in" button for auth errors. **Locale fallback:** widget `/info` + `/session` fall back to `tenants.settings.preferredLocale` instead of hardcoded 'en'. 410 tests (109 AI + 223 API + 78 web). |
| 65b | Legacy QA cleanup (#65b) | Feb 26 | Removed 20+ dead barrel re-exports from `packages/ai/src/index.ts` (unused externally: `generateEmbeddings`, `chunkText`, `estimateTokens`, registry internals, type-only exports). Removed ~20 orphaned i18n keys from `en.json`/`es.json` (`common.back/next/yes/no`, `sidebar.appName`, `dashboard.resolutionsUsed/costUsed/shareLinkDescription`, `conversations.loading/noConversations`, `artifacts.newArtifact/loading/noArtifacts/labelName/placeholderName/labelType/deactivate/activate/closeTest`, `profile.downloadQr`). No debug `console.log` found (codebase clean). No unused imports found. 410 tests. |
| 60b | Phase 2 enhancements (#60b) | Feb 26 | **Dynamic greetings:** `personality.greeting` supports string (backward compat) or string[] (random pick per session). Widget `/info` filters + selects randomly. Artifacts page: textarea (one greeting per line), auto-splits on save. **Avatar upload:** Supabase Storage `avatars` bucket (migration 0010, 2MB limit, service-role-only write policies — no cross-tenant risk), `uploadAvatar()` helper (`apps/api/src/lib/supabase-storage.ts`), `tenant.uploadAvatar` tRPC mutation (validation→BAD_REQUEST, infra→INTERNAL_SERVER_ERROR), profile page file picker with preview + remove. **Session analytics:** `tenant.sessionAnalytics` tRPC query (30-day conversations grouped by day), profile page stats grid (total sessions `StatCard` + 30-day SVG sparkline bar chart, zero deps). 410 tests. |
| 56 | RAG upgrade: chunk roles + prompt builder (#56) | Feb 27 | **Chunk role classification:** `classifyChunkRole(intentType, docType)` maps intent→doc_type to lead/support roles via `INTENT_CHUNK_ROLES` (6 intents mapped: pricing, product_question, technical_support, booking_request, complaint, general_inquiry). Unmapped intents/doc_types default to 'lead'. **`RagChunk` type:** `{content, role: 'lead'\|'support', docType}` replaces `string[]` in `RagResult.directContext` + `proactiveContext`. **Prompt builder upgrade:** Merges direct+proactive chunks, splits by role, renders `--- PRIMARY KNOWLEDGE ---` (lead) and `--- SUPPORTING KNOWLEDGE ---` (support) with extraction hint (primary=authoritative, supporting=supplementary, primary wins conflicts). **Grounding check compat:** `flattenRagChunks()` adapter preserves existing `string[]` interface for `checkGrounding`/`shouldCheckGrounding`. **New files:** `chunk-roles.ts`, `chunk-roles.test.ts` (20 tests), `rag.test.ts` (8 tests). **Modified:** `rag.ts` (assembleContext passes intentType), `prompt-builder.ts` (role-aware rendering), `prompts/en.ts`+`es.ts` (5 new template keys), `shared/types` (RagChunk + updated RagResult), `message-handler.ts` (flattenRagChunks at grounding call site), integration tests (RagChunk mocks). No schema changes. 486 tests. |
| 41/65b | Clerk prod checklist + quickActions backfill (#41/#65b) | Feb 27 | **Clerk prod checklist:** `CLERK_PROD_CHECKLIST.md` documenting all env vars, deployment locations, webhook re-registration. **Migration 0011:** 3-step backfill — pre-check module slugs exist (RAISE EXCEPTION), per-pair INSERT with NOT EXISTS + ON CONFLICT DO NOTHING (handles partial bindings), post-check RAISE EXCEPTION if gaps remain. **Legacy fallback removal:** Removed ~15-line fallback block from widget `/info` route. **Validator cleanup:** Removed quickActions validation from `personality-validator.ts` + deleted obsolete `artifact-quickactions.test.ts`. Applied to Supabase cloud successfully (post-check passed). 486 tests. |
| 51 | Customer memory (#51) | Feb 27 | **Schema:** Migration 0012 adds `memory jsonb NOT NULL DEFAULT '{}'` to `customers` table. **Memory extractor:** `extractFactsRegex()` — regex-based extraction (en+es name, email, phone), customer-only messages, max 5/run, zero LLM cost. `sanitizeFactValue()` — strips backtick blocks, injection patterns (SYSTEM:/IGNORE/<\|/---/###), control chars, zero-width chars, 120 char cap. `mergeMemoryFacts()` — dedup by key (newer wins), FIFO eviction at 10. `parseMemoryFacts()` — safe JSONB parser. **Allowlist:** 5 keys only (name, email, phone, preference, past_topic). **Prompt injection:** `[UNVERIFIED — user-reported]` label, re-sanitize at injection, cap at 6 injected facts. **Pipeline integration:** Step 0b fetches customer memory (one lightweight query). `buildSystemPrompt` renders CUSTOMER CONTEXT section between LEARNINGS and MODULES. **Async extraction:** `conversation.updateStatus` triggers regex extraction on resolve via `setImmediate` (fail-open, non-blocking). **Dashboard:** Conversation detail shows collapsible "Customer Info" card (name, channel badge, first seen, memory facts). **Router:** `customer.byId` tRPC procedure. **i18n:** 5 new keys (en+es). **Tests:** 32 memory-extractor + 2 customer-routes + 18 prompt-builder (customer memory) = 52 new tests. 486 tests total (187 AI + 221 API + 78 Web). |
| — | Week 5 audit fixes | Feb 27 | **3 findings resolved:** (P2) Proactive chunk promotion — forced `role: 'support'` on all proactive chunks in `prompt-builder.ts` to prevent low-confidence results entering PRIMARY KNOWLEDGE. (P2) Defense-in-depth tenant scoping — added explicit `eq(customers.tenantId, ...)` to 4 customer memory queries across `customer.ts`, `message-handler.ts`, `conversation.ts` (read + write). (P3) Customer Info card — added email/phone rendering in conversation detail page (was blank when only email/phone existed). 486 tests green. |
| 67 | Agent workspace dashboard (Sprint 3) | Feb 27 | **16 new files, 8 modified.** Registry + shared primitives architecture: 5 primitives (`MetricsGrid`, `DataTable`, `CardFeed`, `AlertList`, `BarChartCss`), 3 type-specific registry files (sales, support, marketing), workspace shell + header + priority intents + activity timeline. `/dashboard/agents/[id]` page consumes 20 `agentRouter` procedures. Sidebar "Agents" rename, artifacts page "Open Workspace" button. Migrations 0013 (leads stage/estimated_value, module_executions.module_slug denormalization, autonomy_source, 6 new module seeds) + 0014 (archetype module backfill with `::autonomy_level` casts, 70/30 autonomy correction). ~100 i18n keys (en+es). 4 audit rounds: closed-enum localization for intents (14), modules (9), content types (3), priorities, statuses, scores — all via lookup maps with `humanize()` fallback for unknown values only. 102 web tests, build clean. |
| 67b | Sales workspace UX polish | Feb 27 | **SalesOverview redesign:** Hero revenue card (teal-tinted, large `fmtMoney` + "X deals won" plural), pipeline "Money in Play" card, 3 compact stat cards (hot leads + potential value, win rate with color thresholds, total leads), funnel with per-stage colors + inline drop-off %. **SalesPipeline:** Score badges → colored dots (scannable), customer names link to conversations, `fmtMoney` for values. **SalesQuotes:** Total value pulled right in large bold text. **New:** `fmtMoney()` formatter ($2,400 or $12.4K). i18n: replaced 4 keys, added 7 new (ICU plurals for counts). "Pipeline Value" → "Money in Play", "Conversion Rate" → "Win Rate". Build clean, 102 tests. |
| 67c | Sales workspace v2 — Payments + Kanban + Lead Detail | Feb 28 | **20 files added/modified.** Payments module: `payments` table (migration 0015 — `artifact_id` immutable owner, `lead_id`/`conversation_id` provenance only), 5 new tRPC procedures (`salesPayments`, `createPayment`, `updatePaymentStatus`, `salesLeadSummaries`, `salesAfterHours`) + 2 extended (`salesPipeline` adds sparklines/velocity, `updateLeadStage` adds closeReason). One-lead-per-conversation invariant enforced via partial unique index. `insertLead` → upsert (ON CONFLICT conversationId). `salesQuotes` enriched with leadId/customerId. **Frontend:** `SalesWorkspace` registry wrapper owns all cross-section state (selectedLeadId, recordPaymentOpen, prefill); 6 sections rendered. **New components:** `Sparkline` (inline SVG), `KanbanBoard` (click-to-move, 6 columns, mobile snap-scroll), `LeadDetailSheet` (shadcn Sheet, 4 sections: header/stage-actions/attribution/AI-timeline), `SalesAlerts` (stale/pending/high-value cards), `SalesPayments` (inline Record Payment form + table), `AfterHoursCard` (dark ROI card). **Two-gate quote-to-payment:** currency check + non-null leadId before `createPayment` fires. **Format helpers:** `fmtTimeAgo`, `daysBetween`. **Badge variants:** paid/overdue/sent/pending/viewed/cancelled. **~50 new i18n keys** (en+es). Migration 0015 applied to Supabase cloud (project `eukklvizytkojmptepdf`), all 5 post-check assertions passed. Tests green. |

| 67d | Sales workspace audit + UI polish | Mar 1 | **19-issue audit resolved + visual redesign.** Audit fixes: div→`<button>` in KanbanBoard (WCAG 2.1.1), `<label>` on close-reason textarea (WCAG 1.3.1), `aria-label` on all "View" buttons + stage selects + score dots, touch targets ≥36px on stage/convert buttons, funnelColors hex→CSS vars (`var(--color-teal/gold/dune)`), opacity normalization (`/3`→`/5`, `/4`→`/5`), loading skeleton for SalesAlerts, per-card pending state for Convert to Payment, Tailwind `snap-x`/`snap-start` replacing inline styles, `useMemo`/`useCallback` perf pass (byStage, timeline sort, kanbanLeads, derived stats, sparklines, funnelData), `memo()` on KanbanBoard. **Shared constants:** extracted `sales/constants.ts` (STAGES, scoreDots, stageKey) — single source of truth across 4 files. **Visual polish:** Workspace header redesigned (agent initial avatar, module chips with autonomy-level dots, 3-panel KPI: Conversations hero + Automation Score w/ progress bar + centered secondary stats strip, subtle panel background). Sales stats row: 4 cards→single card with dividers. Funnel bars taller + rounded. Kanban columns: colored `border-t-2` headers + count pills. Section titles upgraded to `<h2 font-heading>`. Icons: Trophy/Crosshair/Gauge replacing generic set. Short-form i18n keys for compact stats strip (`metricTotalShort`/`metricPendingShort`). ~10 new i18n keys (en+es). Build clean. |

### Next Up — Sales Agent Optimization Sprint (see `TASK_QUEUE.md`)

| ID | Task | Priority | Notes |
|----|------|----------|-------|
| CAM-101 | Approve/reject UI for pending executions | P0 | #1 blocker — buttons missing on SalesAlerts cards |
| CAM-102 | Module config UI (calendar URL, payment URL, autonomy) | P0 | Unblocks book_meeting + collect_payment |
| CAM-103 | Dashboard polling (refetchInterval 30s) | P0 | Stop-gap real-time |
| CAM-104 | Robust budget parser | P0 | `parseFloat("$5k")` → NaN breaks pipeline |
| CAM-105–116 | Enhanced scoring, prompts, notifications, auto-flows, workspace polish | P1–P2 | See TASK_QUEUE.md |

### Deferred — Launch Readiness

| # | Task | Priority | Notes |
|---|------|----------|-------|
| 41 | Clerk production instance | P2 | Closed beta uses dev keys. Swap when ready for public launch. |
| 42 | Paddle business verification | P2 | Required before processing real payments — sandbox works without it |

### Post-Launch — Innovation Roadmap (Spec Section 20)

| # | Task | Priority | Notes |
|---|------|----------|-------|
| 50 | Agent handoffs | P2 | Artifact-to-artifact transfers with context preservation |
| ~~51~~ | ~~Customer memory~~ | ~~P2~~ | ~~DONE — Regex extraction (en+es), JSONB storage, prompt injection controls, 5-key allowlist, async extraction on resolve, dashboard display. Audit fixes: proactive chunk demotion, defense-in-depth tenant scoping (4 customer queries), email/phone rendering in card. 486 tests.~~ |
| 52 | Module marketplace | P3 | Community-contributed modules with trust scoring |
| 53 | Scheduled automations | P3 | Time-based triggers (follow-up reminders, SLA alerts) |
| 54 | Advisory council | P3 | Multi-agent deliberation for complex decisions |
| 55 | Self-evolving system | P3 | Auto-generate learnings from successful interactions |
| ~~56~~ | ~~RAG upgrade: chunk roles + intent-aware lead/support~~ | ~~P1~~ | ~~DONE — `classifyChunkRole` (6 intents mapped), `RagChunk` type, prompt builder PRIMARY/SUPPORTING blocks, `flattenRagChunks` adapter for grounding check, proactive chunk forced to `support` (audit fix). No schema changes. 486 tests.~~ |
| 59 | Intent prioritization + categorization | P2 | Tenants tag/prioritize intent types (e.g., "pricing inquiry" = high priority, "hours" = low). Dashboard alerts on high-priority intents. Growth/Scale tier feature. |
| ~~60b~~ | ~~Business card Phase 2 enhancements~~ | ~~P2~~ | ~~DONE (partial) — Dynamic greetings (array rotation), avatar upload (Supabase Storage, service-role only), session analytics sparkline. **Remaining:** subdomain routing, custom domains, conversation summarization, daily cap pre-aggregation cron.~~ |
| 61 | Dynamic intent labels | P3 | Currently intent types are a hardcoded Zod enum (14 types) with i18n keys in en/es JSON. Adding a new intent = update 3 places (schema + 2 JSON files). Future: classify intent into user-facing label at classification time (stored alongside canonical slug in `interaction_logs`), so dashboard renders DB values directly. Eliminates per-intent i18n maintenance. |
| ~~62~~ | ~~Agent archetype framework~~ | ~~P2~~ | ~~Superseded by #64/64b/64c~~ |
| ~~64~~ | ~~Archetype Tier 1: behavioral differentiation~~ | ~~P1~~ | ~~DONE — Hardcoded archetype prompts (en+es), auto-bind modules on create, preset quick actions + tones, `personality.instructions` wired into AI prompt, tone preset selector, test chat hints, server-side validation. Shared `applyArchetypeDefaults` helper for both dashboard + onboarding paths.~~ |
| ~~65~~ | ~~Module-derived quick actions~~ | ~~P1~~ | ~~DONE — Quick actions derived from bound modules at runtime (not stored JSONB). `ModuleDefinition.quickAction` (en+es), `getQuickActionsForModules()` helper, widget `/info` resolves from `artifact_modules` join, empty-list guard for module-less agents, legacy `personality.quickActions` fallback (remove after backfill), dashboard skills display (read-only badges from enriched `listModules`). 380 tests.~~ |
| ~~65b~~ | ~~Legacy QA cleanup~~ | ~~P3~~ | ~~DONE — Dead AI exports removed, orphaned i18n keys removed, codebase clean (no debug logs, no unused imports). quickActions backfill still pending (remove `/info` legacy fallback + validator after backfill).~~ |
| 47 | WhatsApp channel (Meta Embedded Signup) | P2 | **Research complete (Feb 23). Decision: Meta Embedded Signup (per-tenant WABA), NO Twilio.** Shared WABA model is prohibited by Meta since Jan 2024 (One WABA Policy) + OBO deprecated Oct 2025. **Chosen architecture:** Camello creates one Meta App (1-4 week review), tenants self-onboard via Embedded Signup popup (Facebook OAuth → create WABA → verify phone OTP, ~5 min). Each tenant owns their WABA. 250 msgs/day without Business Verification, scales after tenant self-verifies. Existing Meta Cloud API adapter stays as-is — just add `waba_id` to `channel_configs` + store per-tenant token from Embedded Signup callback. No adapter rewrite needed. **Real examples:** Chatwoot, WhatsCloud, Misayan SaaS. **Next steps:** Submit Meta App for review (request `whatsapp_business_messaging` + `whatsapp_business_management` Advanced Access), build Embedded Signup frontend flow in dashboard channel settings. |
| 64b | Archetype Tier 2: new capabilities | P2 | New modules: `draft_content` (marketing), `escalate_to_human` (support), `request_review` (marketing). Archetype-specific RAG filtering (support searches troubleshooting docs, sales searches pricing docs). Intent-aware artifact switching within conversation (handoff protocol). |
| 64c | Archetype Tier 3: platform integrations | P3 | Social media API integrations (Twitter/Instagram posting for marketing agent). Real multi-agent orchestration (agents calling other agents as tools). Per-archetype model routing (simpler model for quick support, powerful for sales qualification). DB-backed vertical templates (restaurant, real estate, SaaS). |

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
- [x] Public chat page (#57): `/chat/[slug]` with SSR OG metadata, mobile-first chat UI, widget API reuse, error differentiation (not_found vs connection), typing indicator, greeting from `/info` endpoint, i18n (en+es), 64 web tests
- [x] Intent dashboard (#58): `analytics.intentBreakdown` tRPC procedure, CSS-only bar chart on overview, recent questions with conversation links, empty-state placeholder, i18n (en+es), 183 API tests
- [x] Business card (#60): collapsible business card + QR share + quick actions + profile dashboard + abuse prevention (burst/conv/daily caps) + SSR metadata + AI language prompt fix, 269 tests

### Week 5 — RAG Upgrade + Customer Memory + Launch Prep
- [x] RAG upgrade (#56): chunk role classification, intent-aware lead/support, PRIMARY/SUPPORTING knowledge blocks, flattenRagChunks adapter
- [x] Clerk prod checklist (#41) + quickActions backfill (#65b): migration 0011 (hard-fail gate), legacy fallback removal, validator cleanup
- [x] Customer memory (#51): regex extraction, JSONB storage, prompt injection controls, async extraction on resolve, dashboard display
- [x] Week 5 audit fixes: proactive chunk demotion, tenant scoping (4 queries), email/phone card rendering
- [ ] Clerk production keys swap (#41 — manual)
- [ ] Paddle business verification (#42 — manual)

### Sprint 6 — Sales Agent Optimization (NC autonomous)
- [x] CAM-007: Follow-up queue cron job (process-followups.ts, pure functions, FOR UPDATE SKIP LOCKED)
- [ ] CAM-101: Approve/reject UI for pending module executions (P0 blocker)
- [ ] CAM-102: Module config UI — calendar URL, payment URL, autonomy controls (P0)
- [ ] CAM-103: Dashboard polling — refetchInterval 30s (P0)
- [ ] CAM-104: Robust budget parser (P0)
- [ ] CAM-105–116: Enhanced scoring, prompts, notifications, auto-flows, workspace polish (P1–P2)
- See `TASK_QUEUE.md` for full acceptance criteria and dependency graph

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

### Session 21 — Feb 22 (Public Chat Page #57 + Intent Dashboard #58)
- **Built public chat page** at `/chat/[slug]` — shareable link for Linktree/bio traffic:
- **Backend — `apps/api/src/webhooks/widget.ts`:**
  - New `GET /api/widget/info?slug=X` — public endpoint returning `{ tenant_name, artifact_name, greeting, language }` (no session/JWT). Uses existing `resolveTenantBySlug()` RPC + artifact query. Rate-limited (10/min per IP+slug). Needed for SSR `generateMetadata()` (can't generate fingerprint server-side).
- **Frontend — `apps/web/src/app/chat/[slug]/`:**
  - `page.tsx` — Server Component wrapper. `generateMetadata()` fetches `/info` for dynamic OG title/description (5s timeout, graceful fallback). Renders `<ChatPage slug={slug} />`.
  - `chat-page.tsx` — Main client component (`'use client'`). State machine: `idle` → `connecting` → `ready` → `error`. Browser fingerprint (SHA-256 of UA+lang+screen+timezone — same algo as widget). Bootstrap: POST `/session` → JWT + tenant info, GET `/history` for conversation restore, GET `/info` for greeting (if no history). Message flow: optimistic add → POST `/message` → append AI response. Error differentiation: HTTP 400 → `not_found` (invalid slug), network/500 → `connection` (retry button). Budget exceeded: polite notice. i18n: inline string map keyed by artifact language (en+es, 10 keys each).
  - `chat-page.module.css` — Typing indicator: 3 bouncing dots with staggered `animation-delay`, `@keyframes bounce` (0→-6px→0).
  - Layout: `h-dvh` flexbox. Midnight header (tenant name + logo), cream message area (auto-scroll), teal user bubbles / sand agent bubbles, sticky input bar, "Powered by Camello" footer.
- **Built intent dashboard** on overview page:
- **Backend — `apps/api/src/routes/analytics.ts`:**
  - New `intentBreakdown` procedure: `GROUP BY intent ORDER BY count DESC` from `interaction_logs` (current UTC month). Returns `topIntents` (intent, count, lastSeen) + `recentIntents` (last 10 with conversationId for linking). Explicit type annotations to fix cross-package tRPC inference.
- **Frontend — `apps/web/src/app/dashboard/page.tsx`:**
  - New `IntentSection` component: CSS-only horizontal bar chart (top 8 intents, rest grouped as "Other"), percentage width bars with count labels. "Recent Questions" list (last 5 with relative timestamps + conversation links). Empty state placeholder (`noIntentsYet` card).
- **i18n:** +12 keys in en.json + es.json (`publicChat.title/description`, `dashboard.intentBreakdown/recentQuestions/noIntentsYet/other/viewConversation`)
- **Type inference fix:** `ReturnType<typeof trpc.*.useQuery>` collapsed to `{}` across package boundaries (deeply nested Drizzle generics). Fix: explicit interface props on `IntentSection` instead of inferred query type.
- **P2 audit fixes** (2 findings resolved):
  - `noIntentsYet` key was unused (section hidden when empty) → always render section, show placeholder card
  - Chat errors undifferentiated (all showed `errorNotFound`) → added `ErrorKind` type, HTTP 400 → `not_found`, network/500 → `connection`
- **Tests:** 3 new error differentiation tests + existing 61 web tests + 183 API tests pass
- **Gate:** All 4 packages build, 247 tests pass (183 API + 64 Web), lint 0 errors, type-check clean

### Session 22 — Feb 22 (Business Card + AI Chat "Linktree for AI" #60)
- **Evolved public chat page into business card + AI chat** — full "Linktree for businesses" experience:
- **Backend — abuse prevention (3-layer):**
  - Message burst rate limit: 20 msgs/min per customer_id on `POST /message` (429 + `RATE_LIMITED` error code)
  - Conversation length cap: 50 messages per conversation (two-phase: pre-classifyIntent fast path for widget, post-findOrCreateConversation for WhatsApp/resolver). Returns `conversation_limit_reached` flag
  - Daily customer ceiling: 100 customer msgs/day per customer_id (JOIN messages→conversations, runs before classifyIntent). Returns `daily_limit_reached` flag
  - Both caps follow `handleBudgetExceeded()` pattern: synthetic Intent, full `HandleMessageOutput`, save customer msg + canned response, log telemetry
  - New `HandleMessageOutput` fields: `conversationLimitReached?: boolean`, `dailyLimitReached?: boolean`
- **Backend — profile + quick actions:**
  - `tenant.updateProfile` tRPC mutation: HTTPS-only URL validation, merge semantics (omitted fields preserved), max lengths (tagline 50, bio 150, location/hours 50, socialLinks max 6)
  - Expanded `GET /api/widget/info` to return `profile` (from `tenants.settings`) + `quick_actions` (from `artifacts.personality.quickActions`)
  - Session counter: fire-and-forget `sessionInits++` on `POST /session`
  - Artifact `quickActions` server validation: `.refine()` on personality field (max 4 items, label ≤ 40, message ≤ 200)
  - Synthetic intent filtering: `intentBreakdown` query excludes `budget_exceeded`, `conversation_limit`, `daily_limit` from analytics (fixes pre-existing pollution)
- **Frontend — chat page evolution:**
  - SSR `/info` fetch in `page.tsx` → passed as `ssrInfo` prop (eliminates client-side `/info` re-fetch)
  - Collapsible business card: compact horizontal header (avatar 40px + name + truncated tagline + social icons on desktop + chevron) → expandable section (bio + location/hours/social links in horizontal row with vertical separators). Default: collapsed
  - Quick action buttons: auto-sent messages, hidden after first user message
  - QR share modal: inline SVG QR code generator (`apps/web/src/lib/qr-svg.ts`, ~80 lines, zero deps)
  - Navbar: "CAMELLO" branding (logo + uppercase text), QR share button
  - Handle limit/rate responses: `conversation_limit_reached` / `daily_limit_reached` → polite i18n message + disable input. HTTP 429 → "slow down" message
  - Enhanced OG metadata: uses profile tagline + bio for social sharing
- **Frontend — dashboard:**
  - New profile settings page (`/dashboard/settings/profile`): tagline, short bio, avatar URL, location, hours, social links (dynamic list), share link (copy + QR + download), session counter display, language selector (moved from billing page)
  - Quick actions editor on artifacts page: dynamic label + message pairs (max 4), saves via `artifact.update`
  - Sidebar: added "Profile" nav item under Settings
- **Design refinements (iterative smoke testing, 6 rounds):**
  - Mobile-first char limits calibrated on iPhone SE (320px) + iPhone 14 Pro Max (430px): tagline 50, bio 150, location/hours 50
  - "Bio" → "Short bio" label to set user expectations
  - Card default collapsed (visitors come to chat, not read bio)
  - Removed tenant org name from navbar (redundant with business card)
  - Added "CAMELLO" brand to navbar
- **AI prompt fix:** Language directive upgraded from weak `Language: {lang}` to explicit `LANGUAGE RULES` block with strict instructions (prevents AI reverting to English)
- **i18n:** ~30 new keys in en.json + es.json (profile form, quick actions editor, chat limit messages, sidebar)
- **Tests:** 22 new (5 widget route + 12 abuse controls + 6 tenant profile + 4 artifact quickActions). 269 tests pass (205 API + 64 Web)
- **Gate:** Lint 0 errors, type-check clean, build clean

### Session 23 — Feb 23 (Archetype Tier 1 #64 + Module-Derived Quick Actions #65)
- **#64 — Agent Archetype Behavioral Differentiation (Tier 1):**
  - Hardcoded per-archetype system prompts (en+es) for sales/support/marketing in `ARCHETYPE_PROMPTS`
  - Auto-bind modules on artifact creation via `applyArchetypeDefaults()` shared helper
  - Preset tones per archetype (`ARCHETYPE_DEFAULT_TONES`)
  - `personality.instructions` wired into AI system prompt (custom free-text directives)
  - Tone preset selector on dashboard artifacts page
  - Test chat hints per archetype type
  - Server-side personality validation (`personality-validator.ts`)
  - Shared `applyArchetypeDefaults` for both dashboard create + onboarding `setupArtifact` paths
- **#65 — Module-Derived Quick Actions:**
  - Quick actions now derived from bound modules at runtime (not stored `personality.quickActions` JSONB)
  - Added `quickAction?: { en, es }` to `ModuleDefinition` interface + localized actions for qualify_lead, book_meeting, send_followup
  - `getQuickActionsForModules(slugs, locale)` helper resolves actions from in-memory module registry
  - Widget `GET /info` endpoint resolves QA by: query `artifact_modules` → join `modules` catalog → sort slugs alphabetically → `getQuickActionsForModules()`
  - Empty-list guard: module-less agents (support/custom) skip modules query entirely → zero buttons (honest UX)
  - Legacy fallback: if no module-derived actions AND `personality.quickActions` JSONB exists → use stored actions (backward compat for pre-#64 artifacts). Marked for removal after backfill (#65b)
  - `personality-validator.ts` quickActions validation kept during fallback window (coupled with fallback — remove together)
  - Removed `ARCHETYPE_QUICK_ACTIONS` export, QA defaulting from `artifact.create` + `onboarding.setupArtifact`
  - Enriched `artifact.listModules` with `innerJoin(modules)` → returns `moduleName`, `moduleSlug`, `moduleCategory`
  - Dashboard: replaced QA editor with read-only "Skills" section (Badge pills from `listModules`)
  - i18n: skills keys (en+es)
  - Deterministic button order: slugs sorted alphabetically before passing to helper
- **Tests:** 8 new tests (5 `getQuickActionsForModules`, 3 widget route: module-derived QA, empty guard, deterministic order). Updated archetype-prompts, onboarding-routes, widget-routes tests. 380 tests pass (82 AI + 220 API + 78 Web)
- **Gate:** Lint 0 errors, type-check clean

### Session 24 — Feb 26 (Error Handling + Legacy Cleanup + Phase 2 Enhancements)
- See tasks #44, #65b, #60b in Done table above
- 410 tests (109 AI + 223 API + 78 Web)

### Session 25 — Feb 27 (RAG Upgrade #56 + Clerk/Backfill #41/#65b + Customer Memory #51)
- **3 parallel workstreams** executed via background agents, then consolidated:
- **#56 — RAG Upgrade:**
  - New `chunk-roles.ts` with `INTENT_CHUNK_ROLES` mapping (6 intents: pricing, product_question, technical_support, booking_request, complaint, general_inquiry)
  - `classifyChunkRole(intentType, docType)` → 'lead' or 'support' (defaults to 'lead')
  - `flattenRagChunks()` adapter for grounding check backward compat
  - `RagChunk` type (`{content, role, docType}`) replaces `string[]` in `RagResult`
  - Prompt builder renders `PRIMARY KNOWLEDGE` (lead) + `SUPPORTING KNOWLEDGE` (support) + extraction hint
  - `rag.ts`: `assembleContext()` annotates chunks with role via `classifyChunkRole`
  - New test files: `chunk-roles.test.ts` (20 tests), `rag.test.ts` (8 tests)
- **#41/#65b — Clerk Prod Keys + quickActions Backfill:**
  - `CLERK_PROD_CHECKLIST.md` — env vars, deployment steps, webhook re-registration
  - Migration 0011: pre-check → per-pair backfill → hard-fail post-check (RAISE EXCEPTION)
  - Removed legacy `personality.quickActions` fallback from widget `/info`
  - Removed quickActions validation from `personality-validator.ts`
  - Deleted obsolete `artifact-quickactions.test.ts`
- **#51 — Customer Memory:**
  - Migration 0012: `customers.memory jsonb NOT NULL DEFAULT '{}'`
  - `memory-extractor.ts`: `extractFactsRegex` (en+es name/email/phone), `sanitizeFactValue` (anti-injection), `mergeMemoryFacts` (dedup + FIFO), `parseMemoryFacts` (safe JSONB)
  - 5-key allowlist (name, email, phone, preference, past_topic), 10 stored / 6 injected / 120 char cap
  - Prompt builder: CUSTOMER CONTEXT [UNVERIFIED] section between LEARNINGS and MODULES
  - Pipeline: step 0b fetches memory, step 9 passes to `buildSystemPrompt`
  - Async extraction: `conversation.updateStatus` triggers regex on resolve (setImmediate, fail-open)
  - `customer.byId` tRPC router, dashboard Customer Info card, 5 i18n keys
- **Test fixes:** Updated 4 integration test files (added customer memory mock + AI mock exports), fixed MMR-related rag tests (distinct embeddings), fixed prompt-builder assertions (section headers vs hint text)
- **Migrations applied to Supabase cloud:** 0011 (backfill passed post-check) + 0012 (customer memory column)
- **486 tests (187 AI + 221 API + 78 Web)** — all passing
- **NC-007** — 2026-03-07 — `b9e071d` — Session: 20260307-165056-camello
- **NC-101** — 2026-03-07 — `e6e8450` — Session: 20260307-174628-camello — ⚠ Committed after soft review rejections cap; local verification passed.
- **CAM-101** — 2026-03-07 — `34b40d4` — Session: 20260307-181842-camello
- **CAM-102** — 2026-03-07 — `ba41d9c` — Session: 20260307-181842-camello
- **CAM-103** — 2026-03-07 — `1769f1c` — Session: 20260307-181842-camello
- **CAM-104** — 2026-03-07 — `8b03493` — Session: 20260307-181842-camello
- **CAM-105** — 2026-03-07 — `e4785aa` — Session: 20260307-181842-camello
- **CAM-106** — 2026-03-07 — `e3115ab` — Session: 20260307-181842-camello
- **CAM-108** — 2026-03-07 — `aaf66c2` — Session: 20260307-181842-camello — ⚠ Committed after soft review rejections cap; local verification passed.
- **CAM-109** — 2026-03-07 — `baf36e8` — Session: 20260307-181842-camello
- **CAM-110** — 2026-03-07 — `930abfe` — Session: 20260307-181842-camello — ⚠ Committed after soft review rejections cap; local verification passed.
- **CAM-112** — 2026-03-07 — `c12feea` — Session: 20260307-181842-camello
- **CAM-113** — 2026-03-07 — `29cb39b` — Session: 20260307-181842-camello — ⚠ Committed after soft review rejections cap; local verification passed.
- **CAM-115** — 2026-03-07 — `213437f` — Session: 20260307-181842-camello
- **CAM-116** — 2026-03-07 — `c9534a7` — Session: 20260307-181842-camello
- **CAM-107** — 2026-03-08 — `04c6682` — Session: 20260307-231133-camello
- **CAM-111** — 2026-03-08 — `cfd0483` — Session: 20260307-231133-camello
- **CAM-114** — 2026-03-08 — `2f9714e` — Session: 20260307-231133-camello
- **CAM-117** — 2026-03-08 — `79684f5` — Session: 20260307-231133-camello
- **CAM-118** — 2026-03-08 — `d6ffe23` — Session: 20260307-231133-camello
- **CAM-119** — 2026-03-08 — `98c0662` — Session: 20260307-231133-camello
- **CAM-120** — 2026-03-08 — `b99826d` — Session: 20260307-231133-camello
- **CAM-121** — 2026-03-08 — `324d6df` — Session: 20260307-231133-camello
- **CAM-122** — 2026-03-08 — `993d7df` — Session: 20260307-231133-camello

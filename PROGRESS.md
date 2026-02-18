# Camello Build Progress

> Single source of truth for what's done, what's next, and what's blocked.
> Updated at the end of every work session.
>
> **AI memory lives at:** `~/.claude/projects/.../memory/` (MEMORY.md, architecture.md, compliance-gaps.md, differentiation.md). Not in-repo — persists across Claude sessions.

## Current Phase: Week 2 — Core Intelligence (Week 1 complete)

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

### Next Up

| # | Task | Priority | Estimate | Dependencies |
|---|------|----------|----------|--------------|
| 31 | Channel adapters (WhatsApp + WebChat) | P1 | Week 3 | #28, #30 |
| 32 | Trigger.dev jobs: learning decay, metrics rollup, URL-drop ingestion | P1 | 2-3 hrs | #21, #25 |
| 33 | KPI instrumentation + rollback controls + cost guards | P2 | 2 hrs | #20, #25 |

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
- [ ] Trigger.dev jobs: learning decay, metrics rollup, URL-drop ingestion
- [ ] KPI instrumentation + rollback controls + cost guards

### Week 3 — Channels + Dashboard
- [ ] WhatsApp Cloud API adapter (webhook verification, inbound/outbound)
- [ ] WebChat widget (`apps/widget` scaffold + Supabase Broadcast)
- [ ] Dashboard pages: conversations, conversation detail, artifact config, knowledge mgmt
- [ ] Analytics page (artifact metrics cards)

### Week 4 — Onboarding + Hardening
- [ ] Tenant onboarding wizard (create tenant → create artifact → connect WhatsApp)
- [ ] Billing integration (Stripe, usage records, plan limits)
- [ ] End-to-end testing: message in → intent → artifact → response out
- [ ] Load testing, error handling, edge cases
- [ ] Deploy to Vercel + Supabase cloud

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

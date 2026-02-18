# Camello Build Progress

> Single source of truth for what's done, what's next, and what's blocked.
> Updated at the end of every work session.
>
> **AI memory lives at:** `~/.claude/projects/.../memory/` (MEMORY.md, architecture.md, compliance-gaps.md, differentiation.md). Not in-repo — persists across Claude sessions.

## Current Phase: Week 1 — Foundation + Tenant Isolation

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

### Next Up

| # | Task | Priority | Estimate | Dependencies |
|---|------|----------|----------|--------------|
| 14 | Install Supabase CLI | P1 | 5 min | Xcode CLT update (`sudo xcode-select --install`) |
| 15 | RLS policies + cross-tenant isolation tests | P0 | 2-3 hrs | Supabase CLI or direct PG connection |
| 16 | `createTenantDb()` helper + fail-closed tests | P0 | 1-2 hrs | #15 |
| 17 | Clerk integration (auth middleware) | P0 | 1-2 hrs | Clerk account + keys |
| 18 | Artifact resolver implementation | P1 | 2-3 hrs | #15, #16 |
| 19 | Remaining tRPC routers (artifact, module, conversation, knowledge, channel, analytics, onboarding) | P1 | 3-4 hrs | #16, #17 |
| 20 | Channel adapters (WhatsApp + WebChat) | P1 | Week 3 | #18 |

### Blocked

| Task | Blocker | Workaround |
|------|---------|------------|
| Supabase CLI | Xcode CLT outdated | Run `sudo xcode-select --install`, then `brew install supabase/tap/supabase` |
| CHEZ/Hivemind reference agents | Permission restrictions on dirs outside project | Read manually when needed |

---

## Roadmap

### Week 1 — Foundation + Tenant Isolation (current)
- [x] Monorepo scaffold, Drizzle schema, migration SQL, shared types, AI scaffold
- [x] Full compliance audit — all gaps resolved
- [ ] Supabase CLI install
- [ ] RLS policies + cross-tenant isolation tests
- [ ] `createTenantDb()` helper + fail-closed tests
- [ ] Clerk auth middleware

### Week 2 — Core Intelligence
- [ ] Artifact resolver implementation (actual DB queries, not just contract)
- [ ] RAG pipeline: pgvector search + FTS + RRF reranking + MMR
- [ ] LLM orchestration: intent classifier → model selector → prompt builder → OpenRouter
- [ ] Module executor: qualify_lead, book_meeting, send_followup
- [ ] Remaining tRPC routers (artifact, conversation, knowledge, etc.)
- [ ] Trigger.dev jobs: learning extraction, metrics rollup

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

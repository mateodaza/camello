# Camello

Multi-tenant AI workforce platform ("Shopify of AI workforces"). Businesses describe what they do, and the platform generates role-based AI agents (sales, support, marketing) with composable action modules, deployed across customer-facing channels (web chat, WhatsApp). Built as a Turborepo monorepo: Hono + tRPC API, Next.js 15 dashboard, Vite widget, node-cron jobs worker. Drizzle ORM on Supabase Postgres with RLS tenant isolation. Clerk auth, Paddle billing, Vercel AI SDK + OpenRouter for LLM orchestration.

## Architecture

```
apps/
  api/       — Hono + tRPC backend (Railway). Routes, orchestration, webhooks.
  web/       — Next.js 15 App Router dashboard + landing (Vercel). shadcn/ui + Tailwind v4.
  widget/    — Vite IIFE embed for public chat (Cloudflare Pages).
  jobs/      — Standalone node-cron worker (Railway). Metrics rollup, learning decay, URL ingestion.
packages/
  db/        — Drizzle schema, migrations, tenant-db helper.
  shared/    — Types, Zod schemas, constants, i18n messages. Sub-path exports only (@camello/shared/types, etc).
  ai/        — LLM orchestration, RAG, modules, archetypes, embeddings. No DB imports.
  config/    — ESLint presets, shared tsconfig.
```

## Canonical Spec

`TECHNICAL_SPEC_v1.md` is the primary architecture reference. Consult it for data models, API contracts, and system design. `PROGRESS.md` tracks what's built vs planned.

## Key Conventions

- **ORM:** Drizzle (NOT Prisma). Schema in `packages/db/src/schema/`. Migrations: `pnpm db:generate && pnpm db:push`.
- **API:** tRPC routers in `apps/api/src/routes/`. `tenantProcedure` for tenant-scoped, `authedProcedure` for pre-tenant.
- **Auth:** Clerk (Organizations for multi-tenancy). Middleware in `apps/api/src/lib/clerk.ts`.
- **Validation:** Zod 3. All inputs validated at tRPC layer.
- **UI:** shadcn/ui + Radix + Tailwind v4. Design system: Jost headings, DM Sans body, 8-color palette.
- **i18n:** next-intl (dashboard), `packages/ai/src/prompts/{locale}.ts` (AI), `packages/shared/src/messages/` (backend errors).

## Monorepo Rules

- Changes to `packages/` must not break `apps/`. Always run `pnpm build` from root to verify.
- Cross-package imports use `@camello/` workspace aliases (e.g., `@camello/shared/types`).
- `@camello/shared` uses sub-path exports ONLY. Never import from bare `@camello/shared`.
- `@camello/ai` has NO runtime dependency on `@camello/db`. All DB access via dependency injection callbacks.

## Testing

- TEST_CMD is `pnpm type-check`. All new code must pass type-check.
- Existing tests use Vitest. If creating test infrastructure, use Vitest.
- API tests: `apps/api/src/__tests__/`. Web tests: `apps/web/src/__tests__/`. AI tests: `packages/ai/src/__tests__/`.

## File Naming

- kebab-case for files (`sales-pipeline.tsx`), PascalCase for components (`SalesPipeline`), camelCase for functions.
- Named imports only, never wildcard. Use `@camello/` aliases for cross-package imports.

## Database

- Drizzle `timestamp` with `{ withTimezone: true, mode: 'date' }` (NOT `timestamptz`).
- RLS on all tenant-scoped tables. `modules` table is global (no RLS).
- `app_user` Postgres role for runtime. `createTenantDb()` sets tenant context.
- Supabase cloud project: `eukklvizytkojmptepdf`.

## Existing Patterns (follow these, don't reinvent)

- **Modules:** Self-registering `ModuleDefinition` in `packages/ai/src/modules/`. Zod schemas for input/output. `registerModule()` side-effect in `modules/index.ts`. 9 modules exist (qualify_lead, book_meeting, send_followup, collect_payment, send_quote, create_ticket, escalate_to_human, capture_interest, draft_content).
- **Archetypes:** `packages/ai/src/archetypes/{sales,support,marketing,custom}.ts` registered via `archetype-registry.ts`. Each has prompts (en/es), default tone, module slugs, ragBias.
- **Agent workspace:** Registry + shared primitives in `apps/web/src/components/agent-workspace/`. Sales workspace is the most complete reference. Registry maps type -> section components.
- **Cron jobs:** `apps/jobs/src/jobs/` — follow `createWorker()` factory pattern. DB-backed `job_runs` ledger for idempotency.

## Git Rules

- Commit after completing each task. Use descriptive messages.
- Push ONLY to `nightcrawler/dev` branch. Never push to `main`.
- Never modify `.env` files or commit secrets.

## Guardrails

- Drizzle `sql` tag breaks when bundled with tsup `noExternal` — use `pool.query()` for raw SQL in bundled code.
- `@camello/shared` sub-path exports: `./types`, `./constants`, `./schemas`, `./messages`.
- Never apply migrations to production Supabase. Write the SQL file only — human reviews and applies.

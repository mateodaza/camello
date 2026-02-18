# Camello

**The Shopify of AI workforces.** Multi-tenant platform where businesses deploy, manage, and scale AI agents ("artifacts") across channels.

## Quick Start

```bash
pnpm install
pnpm dev        # starts api (port 4000) + web (port 3000)
pnpm type-check # verify all packages
```

## Monorepo Structure

```
apps/
  api/       Hono + tRPC backend
  web/       Next.js 15 dashboard

packages/
  db/        Drizzle schema + migrations (Supabase/Postgres 16 + pgvector)
  shared/    Types, Zod schemas, constants
  ai/        Intent classifier, model selector, prompt builder, OpenRouter client
  config/    Shared TypeScript configs
```

## Tech Stack

Hono + tRPC | Next.js 15 | Drizzle + Supabase | Clerk | Vercel AI SDK 6 + OpenRouter | Trigger.dev v3 | Tailwind v4 + shadcn/ui

## Docs

- [Technical Spec](TECHNICAL_SPEC_v1.md) — full architecture, DDL, orchestration, modules
- [Build Progress](PROGRESS.md) — what's done, what's next, what's blocked

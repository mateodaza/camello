FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10.6.1 --activate
WORKDIR /app

# Copy package manifests first (layer caching)
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/ai/package.json packages/ai/
COPY packages/shared/package.json packages/shared/
COPY packages/config/package.json packages/config/

RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy source
COPY packages/ packages/
COPY apps/api/src/ apps/api/src/
COPY apps/api/tsup.config.ts apps/api/tsup.config.ts
COPY apps/api/tsconfig.json apps/api/tsconfig.json

# Build (tsup bundles ALL deps into a single file)
RUN pnpm --filter @camello/api build

# --- Runtime ---
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Single self-contained bundle — no node_modules needed
COPY --from=builder /app/apps/api/dist/index.js ./index.js

EXPOSE 4000

# Railway runs its own healthcheck — disable Docker's to avoid conflicts
# HEALTHCHECK NONE

CMD ["node", "index.js"]

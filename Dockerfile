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

# Build (tsup bundles @camello/* inline via noExternal)
RUN pnpm --filter @camello/api build

# --- Runtime ---
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy bundled API + npm dependencies
COPY --from=builder /app/apps/api/dist/index.js ./index.js
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["node", "index.js"]

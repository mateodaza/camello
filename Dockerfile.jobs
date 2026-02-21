FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@10.6.1 --activate
WORKDIR /app

# Copy package manifests first (layer caching)
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY apps/jobs/package.json apps/jobs/
COPY packages/db/package.json packages/db/
COPY packages/ai/package.json packages/ai/
COPY packages/shared/package.json packages/shared/
COPY packages/config/package.json packages/config/

RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy source
COPY packages/ packages/
COPY apps/jobs/src/ apps/jobs/src/
COPY apps/jobs/tsup.config.ts apps/jobs/tsup.config.ts
COPY apps/jobs/tsconfig.json apps/jobs/tsconfig.json

# Build (tsup bundles ALL deps into a single file)
RUN pnpm --filter @camello/jobs build

# --- Runtime ---
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Single self-contained bundle — no node_modules needed
COPY --from=builder /app/apps/jobs/dist/main.js ./main.js

EXPOSE 3001

CMD ["node", "main.js"]

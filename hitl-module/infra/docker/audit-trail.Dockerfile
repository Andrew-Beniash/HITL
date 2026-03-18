# ── Stage 1: base ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.20.0 --activate
WORKDIR /repo

# ── Stage 2: install all workspace deps ───────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/audit-client/package.json packages/audit-client/package.json
COPY services/audit-trail/package.json services/audit-trail/package.json
RUN pnpm install --frozen-lockfile

# ── Stage 3: build ────────────────────────────────────────────────────────────
FROM deps AS build
COPY packages/shared-types/ packages/shared-types/
COPY packages/audit-client/ packages/audit-client/
COPY services/audit-trail/ services/audit-trail/
RUN pnpm --filter @hitl/shared-types build
RUN pnpm --filter @hitl/audit-client build
RUN pnpm --filter @hitl/audit-trail build
RUN pnpm deploy --filter @hitl/audit-trail --prod /deploy/audit-trail

# ── Stage 4: production image ─────────────────────────────────────────────────
FROM node:22-alpine AS prod
RUN addgroup -S hitl && adduser -S hitl -G hitl
WORKDIR /app
COPY --from=build --chown=hitl:hitl /deploy/audit-trail ./
USER hitl
ENV NODE_ENV=production PORT=3006
EXPOSE 3006
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3006/health || exit 1
CMD ["node", "dist/index.js"]

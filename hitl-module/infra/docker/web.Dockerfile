# ── Stage 1: base ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.20.0 --activate
WORKDIR /repo

# ── Stage 2: install deps ─────────────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

# ── Stage 3: build ────────────────────────────────────────────────────────────
FROM deps AS build
COPY packages/shared-types/ packages/shared-types/
COPY apps/web/ apps/web/
RUN pnpm --filter @hitl/shared-types build
RUN pnpm --filter @hitl/web build

# ── Stage 4: nginx production image ───────────────────────────────────────────
FROM nginx:1.27-alpine AS prod
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
COPY infra/docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost/health || exit 1
CMD ["nginx", "-g", "daemon off;"]

# HITL Module — Human-in-the-Loop Document Review & AI Collaboration

A production-grade platform that lets human reviewers and AI agents collaborate on structured document review. Reviewers read EPUB-rendered documents, leave annotations, interact with an AI assistant, and approve or reject documents — all in real time.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Getting Started](#getting-started)
5. [Services](#services)
6. [Frontend](#frontend)
7. [Development Workflow](#development-workflow)
8. [Environment Variables](#environment-variables)
9. [Testing](#testing)
10. [Performance](#performance)
11. [Infrastructure & Deployment](#infrastructure--deployment)
12. [Project Structure](#project-structure)

---

## Overview

The HITL module accepts documents in five source formats — DOCX, PDF, XLSX, Markdown, and native EPUB — converts them to EPUB3, and presents them in a split-pane review interface. Each document passes through a structured review lifecycle:

```
Uploaded → Converting → Open → Pending Approval → Approved / Rejected
```

Core capabilities:

- **EPUB rendering** — epub.js-based viewer with configurable font profiles, zoom, and diff mode
- **Annotation system** — six annotation types (critical flags, attention markers, validation notices, comments, review requests, edit suggestions) pinned to EPUB CFI positions
- **Real-time collaboration** — Socket.IO presence and cursor sharing across concurrent reviewers
- **AI orchestration** — streaming Claude responses, knowledge-base retrieval, compliance checks, and confidence scoring
- **Document editing** — in-browser Markdown editor with live preview and XLSX cell editing overlay
- **Audit trail** — immutable append-only log of every state change with tenant isolation via PostgreSQL RLS
- **Notification service** — in-app and email notifications for annotation mentions and approval events

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser (React 19 + Vite 6)                                         │
│  epub.js · CodeMirror 6 · Socket.IO client · Zustand · TanStack Query│
└────────────────────────┬────────────────────────────────────────────┘
                         │ HTTP / WebSocket
          ┌──────────────▼──────────────┐
          │   API Gateway / Nginx       │
          └──┬───┬───┬───┬───┬───┬─────┘
             │   │   │   │   │   │
    ┌────────▼─┐ │   │   │   │   │
    │ document-│ │   │   │   │   │  Node.js 22 + Fastify 5
    │ storage  │ │   │   │   │   │  :3001
    └──────────┘ │   │   │   │   │
         ┌───────▼──┐ │   │   │   │
         │annotation│ │   │   │   │  :3003
         │-session  │ │   │   │   │
         └──────────┘ │   │   │   │
              ┌───────▼─┐ │   │   │
              │collabora│ │   │   │  :3004  (Socket.IO)
              │-tion    │ │   │   │
              └─────────┘ │   │   │
                   ┌──────▼─┐ │   │
                   │audit-  │ │   │  :3006
                   │trail   │ │   │
                   └────────┘ │   │
                        ┌─────▼─┐ │
                        │notifi-│ │  :3007
                        │cation │ │
                        └───────┘ │
                             ┌────▼────┐
                             │platform-│  :3008
                             │config   │
                             └─────────┘

    ┌──────────────┐    ┌────────────────┐
    │epub-         │    │ai-             │  Python 3.12 + FastAPI
    │conversion    │    │orchestration   │  :3002  /  :3005
    │(BullMQ worker│    │(streaming LLM) │
    └──────┬───────┘    └───────┬────────┘
           │                    │
    ┌──────▼────────────────────▼───────────────┐
    │  PostgreSQL 16  │  Redis 7  │  S3 / MinIO  │
    └───────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 6, TypeScript 5, Tailwind CSS 4 |
| State management | Zustand 5, TanStack Query 5 |
| Document rendering | epub.js, CodeMirror 6, react-markdown |
| Node.js services | Fastify 5, Prisma ORM, BullMQ, ioredis |
| Python services | FastAPI 0.115, SQLAlchemy 2 async, uvicorn |
| Real-time | Socket.IO 4 |
| Database | PostgreSQL 16 (with row-level security) |
| Cache / queue | Redis 7 |
| Object storage | S3-compatible (MinIO for local dev, AWS S3 in production) |
| Containerisation | Docker, Kubernetes 1.30+, KEDA 2 |
| CI/CD | GitHub Actions |
| Monorepo tooling | pnpm 10 workspaces |

---

## Prerequisites

| Tool | Minimum version | Install |
|---|---|---|
| Node.js | 22.0 | [nodejs.org](https://nodejs.org) |
| pnpm | 10.20 | `npm install -g pnpm` |
| Python | 3.12 | [python.org](https://python.org) |
| Docker Desktop | 4.x | [docker.com](https://docker.com) |
| kubectl | 1.30 | [kubernetes.io](https://kubernetes.io/docs/tasks/tools/) |
| Pandoc | 3.x | `brew install pandoc` |
| Poetry | 1.8 | `pip install poetry==1.8.5` |

---

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/your-org/hitl-module.git
cd hitl-module
pnpm install
```

### 2. Start infrastructure

```bash
docker compose up -d
```

This starts PostgreSQL 16 (port 5432), Redis 7 (port 6379), and MinIO (port 9000 / console 9001). A MinIO init container creates the `hitl-documents` bucket automatically.

### 3. Set up environment variables

```bash
cp apps/web/.env.example apps/web/.env.local
cp services/document-storage/.env.example services/document-storage/.env
# Repeat for other services as needed — see Environment Variables section
```

### 4. Run database migrations

```bash
cd services/document-storage
npx prisma migrate dev
npx prisma generate
```

### 5. Start all services in development mode

```bash
# From repo root — runs all services in parallel
pnpm dev
```

Or start individual services:

```bash
pnpm --filter @hitl/document-storage dev    # Node services
pnpm --filter @hitl/web dev                  # Frontend (http://localhost:5173)

cd services/epub-conversion && poetry run uvicorn src.main:app --reload --port 3002
cd services/ai-orchestration && poetry run uvicorn src.main:app --reload --port 3005
```

### 6. Open the app

Navigate to `http://localhost:5173`. Upload a DOCX, PDF, XLSX, Markdown, or EPUB file and the review interface will load once conversion completes.

---

## Services

### document-storage — port 3001

Owns document upload, S3 storage, versioning, signed URL generation, BullMQ job dispatch, and the approval gate.

**Key endpoints:**

| Method | Path | Description |
|---|---|---|
| `POST` | `/documents` | Upload document (multipart), creates version, enqueues conversion |
| `GET` | `/documents/:id` | Fetch document with current version |
| `GET` | `/documents/:id/epub` | Signed S3 URL — returns 202 while converting |
| `PATCH` | `/documents/:id/content` | Update Markdown source, trigger re-conversion |
| `POST` | `/documents/:id/cells` | XLSX cell edit — enqueues xlsx-edit worker |
| `GET` | `/documents/:id/versions` | List all document versions |
| `GET` | `/documents/:id/versions/:vId/epub` | Signed URL for a specific historical version |
| `POST` | `/documents/:id/approve` | Approve / reject — blocked if unresolved critical flags exist |
| `PUT` | `/documents/:id/rollback` | Roll back `currentVersionId` (non-destructive) |

**S3 key layout:**

```
{tenantId}/{documentId}/source/v{n}/{filename}     # original upload
{tenantId}/{documentId}/epub/v{n}/document.epub    # converted EPUB
{tenantId}/{documentId}/epub/v{n}/manifest.json    # ConversionManifest
```

---

### epub-conversion — port 3002

Python service that processes BullMQ jobs from the `epub-conversion` Redis queue and converts source documents to EPUB3.

**Supported formats:**

| Format | Converter | Notes |
|---|---|---|
| `.docx` | Pandoc (`--to epub3 --epub-embed-font --toc --toc-depth=3 --track-changes=all`) | |
| `.md` | Pandoc | |
| `.pdf` | PyMuPDF + pdfminer.six | One chapter per page; images embedded |
| `.epub` | Passthrough | Validates with ebooklib; adds degradation notice for EPUB2 |
| `.xlsx` | XlsxEpubConverter | Table rendering, charts, merged cells, pagination at 500 rows |

**XLSX conversion details:**
- Frozen rows → `<thead>`, body rows → `<tbody>`
- Merged cells → correct `colspan`/`rowspan`; covered cells skipped
- Sheets with > 5,000 rows are paginated at 500 rows per chapter
- Charts rasterised to PNG in parallel via `ThreadPoolExecutor(max_workers=4)`
- Formula cells show evaluated values; unevaluable formulas render `#EVAL_ERROR`
- Conditional formatting generates a `conditional_formatting_omitted` degradation notice

After conversion the worker:
1. Uploads EPUB and `manifest.json` to S3
2. Updates `DocumentVersion.conversionStatus` to `complete`
3. Publishes `hitl:epub:{documentId}` on the Redis pub/sub channel
4. Posts an audit event to the audit-trail service

**Job deduplication:** A Redis `SETEX hitl:conv:active:{docId}:{versionId}` key (TTL 300 s) prevents duplicate conversion jobs for the same version that arrive while the first is in flight.

---

### annotation-session — port 3003

Manages annotation CRUD, session lifecycle, and the approval gate.

**Key endpoints:**

| Method | Path | Description |
|---|---|---|
| `POST` | `/documents/:id/annotations` | Create annotation (CFI + typed payload) |
| `GET` | `/documents/:id/annotations` | List all annotations for a document |
| `POST` | `/documents/:id/annotations/:aid/resolve` | Resolve an annotation |
| `GET` | `/documents/:id/check-approval` | Returns 409 with `flagIds` if unresolved critical flags exist |

**Annotation types:** `critical_flag` · `attention_marker` · `validation_notice` · `human_comment` · `review_request` · `edit_suggestion`

---

### collaboration — port 3004

Real-time presence and cursor sharing via Socket.IO 4. Maintains per-document rooms with user presence state.

**Socket events:**

| Event | Direction | Description |
|---|---|---|
| `presence:join` | Client → Server | Join document room, receive current presence list |
| `presence:update` | Server → Client | Broadcast when a user joins/leaves |
| `cursor:update` | Client → Server | User moves to a new CFI position |
| `cursor:positions` | Server → Client | Broadcast cursor positions to all room members |
| `annotation:created` | Server → Client | New annotation broadcast |
| `annotation:resolved` | Server → Client | Annotation state change broadcast |
| `epub:updated` | Server → Client | New EPUB version available |

---

### ai-orchestration — port 3005

Python service providing streaming AI responses via the Anthropic Claude API, with knowledge-base retrieval and post-processing.

**Key endpoints:**

| Method | Path | Description |
|---|---|---|
| `POST` | `/ai/query` | Streaming SSE response with confidence scoring |
| `POST` | `/ai/compliance-check` | Structured compliance analysis |

**Quick actions:** `explain` · `validate` · `suggest_edit` · `compliance` · `summarise`

Knowledge-base cache metrics are tracked in Redis (`hitl:metrics:kb_cache_hits` / `hitl:metrics:kb_cache_misses`) for observability.

---

### audit-trail — port 3006

Immutable append-only audit log. All other services write events here via the shared `@hitl/audit-client` package. PostgreSQL row-level security on `audit_events` plus a restricted `audit_writer` role prevent modification.

---

### notification — port 3007

Delivers in-app and email notifications for annotation mentions and document approval events.

---

### platform-config — port 3008

Tenant font profile management. Supports up to 3 profiles per tenant; activation is atomic (deactivates all, activates one in a single transaction). Font families are validated against a CDN manifest (refreshed every 5 minutes) before persistence.

**Font profile parameters:**

| Parameter | Type | Default |
|---|---|---|
| `font.body.family` | string | `Inter` |
| `font.body.size` | `{n}rem` | `1rem` |
| `font.heading.family` | string | `Inter` |
| `font.heading.scale` | `{ h1–h6 }` | `{ h1: 2, h2: 1.5, … }` |
| `font.mono.family` | string | `JetBrains Mono` |
| `font.lineHeight` | number | `1.6` |
| `font.tableHeader.weight` | number | `600` |

---

## Frontend

The web application is a React 19 + Vite 6 SPA located in `apps/web/`.

### Key components

| Component | Path | Description |
|---|---|---|
| `EpubViewer` | `src/components/EpubViewer/` | epub.js rendition wrapper; diff mode; zoom; 2-chapter prefetch |
| `AnnotationOverlay` | `src/components/AnnotationOverlay/` | CFI-positioned overlays with viewport culling |
| `SelectionToolbar` | `src/components/AnnotationOverlay/` | Create annotations from text selections |
| `AttentionPanel` | `src/components/AttentionPanel/` | Filterable annotation list with resolve actions |
| `AiPanel` | `src/components/AiPanel/` | Streaming chat + quick actions + confidence badges |
| `MarkdownEditor` | `src/components/DocumentEditing/` | CodeMirror 6 split-pane with 150 ms debounced preview |
| `CellEditor` | `src/components/DocumentEditing/` | Floating XLSX cell editor overlaid on epub.js iframe |
| `VersionHistoryPanel` | `src/components/DocumentEditing/` | Load any historical EPUB version |
| `PresenceBar` | `src/components/Collaboration/` | Avatars + live cursor positions |

### State management

Global state lives in Zustand stores under `src/store/`:

| Store | Exports |
|---|---|
| `useSession` | `documentId`, `sessionId`, `reviewState` |
| `useAnnotations` | `annotations`, `focusedAnnotationId`, `upsertAnnotation`, `setFocusedAnnotation` |
| `useFont` | `fontProfile`, `setFontProfile` |
| `useVersionHistory` | `versionHistory`, `setVersionHistory` |

### Document editing

**Markdown editor** (`MarkdownEditor`): CodeMirror 6 + `@codemirror/lang-markdown`. Auto-saves every 30 seconds via a stable ref-based interval that survives re-renders. Supports `Cmd+S` / `Ctrl+S` for immediate save. Status badge cycles through `Saved` / `Saving…` / `Save failed`.

**XLSX cell editor** (`CellEditor` + `useXlsxCellInteraction`): Attaches a click listener inside the epub.js iframe; resolves `getBoundingClientRect()` through the iframe boundary to position the floating `<dialog>` in parent-frame coordinates. PATCHes to `POST /documents/:id/cells` and refreshes the EPUB on success.

---

## Development Workflow

### Commands

```bash
pnpm dev          # Start all services in parallel
pnpm build        # Build all packages and services
pnpm test         # Run all unit tests (Vitest)
pnpm lint         # Lint all TypeScript packages
```

### Service-specific commands

```bash
# Node services
pnpm --filter @hitl/<service> dev
pnpm --filter @hitl/<service> test
pnpm --filter @hitl/<service> build

# Python services
cd services/epub-conversion
poetry install
poetry run uvicorn src.main:app --reload --port 3002
poetry run pytest -v

# Frontend
pnpm --filter @hitl/web dev      # http://localhost:5173
pnpm --filter @hitl/web build
pnpm --filter @hitl/web test
```

### Database

```bash
# Run migrations (document-storage owns the schema)
cd services/document-storage
npx prisma migrate dev --name <migration-name>
npx prisma generate
npx prisma studio                    # Visual database browser
```

### MinIO (local S3)

Console at `http://localhost:9001` — login with `minioadmin` / `minioadmin`. The `hitl-documents` bucket is created automatically on first `docker compose up`.

---

## Environment Variables

### Shared (all Node services)

| Variable | Description | Default (dev) |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://hitl:hitl@localhost:5432/hitl` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `JWT_SECRET` | HS256 signing secret | — |
| `PORT` | HTTP listen port | per-service default |

### document-storage (port 3001)

| Variable | Description |
|---|---|
| `S3_ENDPOINT` | MinIO / S3 endpoint URL |
| `AWS_REGION` | S3 region |
| `AWS_ACCESS_KEY_ID` | S3 access key |
| `AWS_SECRET_ACCESS_KEY` | S3 secret key |
| `AWS_S3_BUCKET` | Bucket name (`hitl-documents`) |
| `ANNOTATION_SERVICE_URL` | `http://annotation-session:3003` |

### epub-conversion (port 3002)

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL (asyncpg driver) |
| `REDIS_URL` | Redis queue |
| `AWS_S3_BUCKET` | S3 bucket |
| `AUDIT_SERVICE_URL` | `http://audit-trail:3006` |

### ai-orchestration (port 3005)

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API key |
| `KB_CONNECTION_STRING` | Knowledge-base URL |
| `AUDIT_SERVICE_URL` | `http://audit-trail:3006` |

### platform-config (port 3008)

| Variable | Description |
|---|---|
| `CDN_MANIFEST_URL` | URL of approved-font-families JSON array |

### Frontend (`apps/web`)

| Variable | Description | Default |
|---|---|---|
| `VITE_API_BASE_URL` | Backend API base URL | `/api` |
| `VITE_WS_URL` | WebSocket URL for collaboration | `ws://localhost:3004` |

---

## Testing

### Unit tests (Vitest)

```bash
pnpm test                        # All packages
pnpm --filter @hitl/web test     # Frontend only
```

The frontend test suite (`src/__tests__/`) covers:
- `CellEditor` — accept, cancel via Escape, PATCH call
- `VersionHistoryPanel` — list rendering, version load
- `useMarkdownAutosave` — 30 s interval, Cmd+S immediate save

Vitest is configured to exclude `**/e2e/**` so Playwright specs are not collected.

### E2E tests (Playwright)

```bash
cd apps/web
pnpm exec playwright install --with-deps
E2E_BASE_URL=http://localhost:5173 pnpm exec playwright test
```

Four workers, HTML + GitHub reporter in CI. Test specs in `e2e/tests/`:

| Spec | Flow |
|---|---|
| `01-upload-and-render.spec.ts` | Upload DOCX → EPUB renders with Inter font |
| `02-critical-flag-resolution.spec.ts` | Approve blocked by flag → resolve flag → approve succeeds |
| `03-ai-compliance-check.spec.ts` | Compliance quick action → streaming response → confidence badge |
| `04-xlsx-cell-edit.spec.ts` | Edit cell → PATCH → EPUB reloads with new value; Escape cancels |
| `05-font-profile-change.spec.ts` | Admin activates Accessibility profile → reviewer picks up new font |

Global setup (`e2e/global-setup.ts`) seeds test data and saves reviewer/admin auth storage states to `e2e/.auth/`.

### Load tests (k6)

```bash
k6 run \
  -e TEST_TOKEN=<jwt> \
  -e TEST_DOCUMENT_ID=<uuid> \
  -e SESSION_ID=<uuid> \
  -e VERSION_ID=<uuid> \
  -e API_URL=http://localhost:3001 \
  tests/load/annotation-create.k6.js
```

**NFR targets:** P95 annotation create < 500 ms · error rate < 1% · 200 VUs × 60 s.

---

## Performance

### EPUB chapter prefetch (§10.1)

When the user navigates to a new chapter, `EpubViewer` schedules a 2-chapter lookahead via `requestIdleCallback` (falls back to `setTimeout`). This populates the browser cache before the user reaches those chapters.

### Annotation viewport culling (§10.2)

`AnnotationOverlay` partitions annotations into in-viewport (current chapter) and off-viewport sets. Off-viewport annotations are resolved with `requestIdleCallback({ timeout: 1000 })` to avoid blocking the main thread. Each render is bracketed with `performance.mark/measure("annotation-redraw")`; a warning is logged in development when the redraw exceeds 16 ms.

### Redis cache metrics (§10.3)

`ai-orchestration` increments `hitl:metrics:kb_cache_hits` on cache hit and `hitl:metrics:kb_cache_misses` before live KB calls. Scrape these with your metrics exporter for cache efficiency dashboards.

### BullMQ job deduplication (§10.4)

`epub-conversion` worker sets `SETEX hitl:conv:active:{docId}:{versionId} 300 1` before processing. Duplicate jobs arriving while one is in flight are dropped; the key is deleted in the `finally` block so re-queued retries succeed.

### Parallel chart rasterisation (§10.5)

`XlsxEpubConverter` rasterises charts concurrently using `ThreadPoolExecutor(max_workers=4)`. PNG bytes are generated in worker threads; `book.add_item()` is called in the main thread after `as_completed()` to keep ebooklib usage thread-safe.

### Web Vitals (§10.6)

`apps/web/src/main.tsx` reports CLS, LCP, TTFB, and INP to `/api/metrics` via `navigator.sendBeacon` (fire-and-forget, survives page unload).

---

## Infrastructure & Deployment

### Docker images

All service images are multi-stage builds in `infra/docker/`. Build context is the monorepo root.

```bash
# Build a single image
docker build -f infra/docker/document-storage.Dockerfile -t hitl/document-storage .

# Build all images via Compose
docker compose build
```

**Image characteristics:**
- Node services: `node:22-alpine` base; `pnpm deploy --prod` for minimal layer size; non-root `hitl` user
- Python services: `python:3.12-slim` base; Poetry dependency install in build stage; non-root `hitl` user
- Web: `nginx:1.27-alpine`; `HEALTHCHECK` via `/health` endpoint

### Kubernetes

Manifests use [Kustomize](https://kustomize.io/) overlays:

```
infra/k8s/
  base/                   # 9 Deployments, 9 Services, KEDA ScaledObject, Namespace
  overlays/
    staging/              # replicas=1 (epub-conversion=2), KEDA max=5, :staging tags
    production/           # replicas=3, KEDA max=50, :latest tags
```

```bash
# Validate manifests (no cluster required)
kubectl kustomize infra/k8s/overlays/staging/

# Apply to a cluster
kubectl apply -k infra/k8s/overlays/staging/
kubectl apply -k infra/k8s/overlays/production/
```

### KEDA autoscaling

The `epub-conversion` Deployment is autoscaled by [KEDA](https://keda.sh/) based on the BullMQ wait-list depth:

```yaml
trigger: redis list  bull:epub-conversion:wait
listLength: 5        # scale up if > 5 jobs per replica
minReplicaCount: 2
maxReplicaCount: 20  # production: 50
```

Each replica is sized at CPU: 2 cores / Memory: 4 Gi to accommodate Pandoc and PyMuPDF.

### GitHub Actions

| Workflow | Trigger | Description |
|---|---|---|
| `ci.yml` | Push / PR | Lint, typecheck, unit tests, Python pytest, Docker build (all 9 images), Kustomize dry-run |
| `deploy-staging.yml` | Push to `main` | Build + push to GHCR with SHA tag, `kubectl apply -k overlays/staging/`, rollout wait, smoke test |

Docker layer caching uses GitHub Actions cache (`type=gha`) scoped per service. All 9 images are built in parallel via `strategy.matrix`.

### Secrets required

Create a Kubernetes secret named `hitl-secrets` with these keys:

```bash
kubectl create secret generic hitl-secrets -n hitl \
  --from-literal=database-url='postgresql://...' \
  --from-literal=redis-url='redis://...' \
  --from-literal=s3-bucket='hitl-documents' \
  --from-literal=jwt-secret='...' \
  --from-literal=anthropic-api-key='sk-ant-...'
```

For the GitHub Actions deploy workflow, add `STAGING_KUBECONFIG` (base64-encoded kubeconfig) as a repository secret.

---

## Project Structure

```
hitl-module/
├── apps/
│   └── web/                        # React 19 frontend (Vite 6)
│       ├── src/
│       │   ├── components/         # UI components
│       │   │   ├── AiPanel/
│       │   │   ├── AnnotationOverlay/
│       │   │   ├── AttentionPanel/
│       │   │   ├── Collaboration/
│       │   │   ├── DocumentEditing/
│       │   │   └── EpubViewer/
│       │   ├── pages/              # Route-level pages (DocumentPage, etc.)
│       │   ├── store/              # Zustand stores
│       │   ├── lib/                # Utilities (platform stylesheet, etc.)
│       │   └── __tests__/          # Vitest unit tests
│       └── e2e/                    # Playwright E2E tests
│           ├── fixtures/
│           └── tests/
│
├── services/
│   ├── document-storage/           # Node.js — port 3001
│   ├── epub-conversion/            # Python — port 3002
│   ├── annotation-session/         # Node.js — port 3003
│   ├── collaboration/              # Node.js — port 3004
│   ├── ai-orchestration/           # Python — port 3005
│   ├── audit-trail/                # Node.js — port 3006
│   ├── notification/               # Node.js — port 3007
│   └── platform-config/            # Node.js — port 3008
│
├── packages/
│   ├── shared-types/               # Cross-service TypeScript interfaces
│   └── audit-client/               # Shared audit event emitter
│
├── infra/
│   ├── docker/                     # Multi-stage Dockerfiles (one per service)
│   │   └── nginx.conf              # SPA config for web container
│   └── k8s/
│       ├── base/                   # Base Kustomize resources
│       └── overlays/
│           ├── staging/
│           └── production/
│
├── tests/
│   └── load/
│       └── annotation-create.k6.js # k6 load test (200 VUs × 60 s)
│
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── deploy-staging.yml
│
├── docker-compose.yml              # Local dev: PostgreSQL, Redis, MinIO
├── pnpm-workspace.yaml
└── package.json
```

---

## Data Model Quick Reference

```
Document ──< DocumentVersion
    │
    └──< Session ──< Annotation ──< AnnotationReply
                         │
                         └── (type: critical_flag | attention_marker |
                                     validation_notice | human_comment |
                                     review_request | edit_suggestion)

Tenant ──< FontProfile (max 3, one active)
       └──< Notification
       └──< AuditEvent (append-only)
```

**Document review lifecycle:**

```
OPEN → PENDING_APPROVAL → APPROVED
              │
              └──────────→ REJECTED
```

Approval is blocked at the service level if any annotation with `type = critical_flag` has `status = OPEN`.

---

## License

Internal — Engineering. See `LICENSE` for details.

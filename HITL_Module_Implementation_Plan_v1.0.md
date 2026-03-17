# Implementation Plan: Human-in-the-Loop Document Review & AI Collaboration Module

**Status:** Ready for Engineering  
**Version:** 1.0  
**Date:** March 2026  
**Owner:** Engineering Lead  
**Relates to:** Functional Specification v1.1 · Technical Architecture Specification v1.0  
**Classification:** Internal — Engineering

---

## How to Use This Document

Each phase maps to a discrete vertical slice of the system. Within each phase, tasks are ordered by dependency. Each task contains:

- **Objective** — what is being built and why
- **Inputs** — source documents and prior tasks this work depends on
- **Acceptance criteria** — testable conditions that define completion
- **Claude Code prompt** — the exact prompt to paste into a Claude Code session

Claude Code prompts are written to be self-contained. They reference specific files Claude Code should read before writing anything, describe the expected output precisely, and include the verification steps to run after generation. Paste each prompt verbatim into a Claude Code session with the repository root open.

---

## Table of Contents

1. [Phase 0 — Repository & Infrastructure Scaffold](#phase-0--repository--infrastructure-scaffold)
2. [Phase 1 — Data Layer & Database Schema](#phase-1--data-layer--database-schema)
3. [Phase 2 — Platform Configuration Service](#phase-2--platform-configuration-service)
4. [Phase 3 — Document Storage Service](#phase-3--document-storage-service)
5. [Phase 4 — EPUB Conversion Service](#phase-4--epub-conversion-service)
6. [Phase 5 — XLSX-to-EPUB Pipeline](#phase-5--xlsx-to-epub-pipeline)
7. [Phase 6 — Annotation & Session Service](#phase-6--annotation--session-service)
8. [Phase 7 — Audit Trail Service](#phase-7--audit-trail-service)
9. [Phase 8 — Real-Time Collaboration Service](#phase-8--real-time-collaboration-service)
10. [Phase 9 — AI Orchestration Service](#phase-9--ai-orchestration-service)
11. [Phase 10 — Notification Service](#phase-10--notification-service)
12. [Phase 11 — Frontend Shell & State Management](#phase-11--frontend-shell--state-management)
13. [Phase 12 — EPUB Rendering Engine & Font System](#phase-12--epub-rendering-engine--font-system)
14. [Phase 13 — Annotation Overlay](#phase-13--annotation-overlay)
15. [Phase 14 — Attention Panel](#phase-14--attention-panel)
16. [Phase 15 — AI Interaction Panel](#phase-15--ai-interaction-panel)
17. [Phase 16 — Collaboration & Presence UI](#phase-16--collaboration--presence-ui)
18. [Phase 17 — Document Editing Overlays](#phase-17--document-editing-overlays)
19. [Phase 18 — Integration & E2E Testing](#phase-18--integration--e2e-testing)
20. [Phase 19 — Performance Hardening](#phase-19--performance-hardening)
21. [Phase 20 — Infrastructure & CI/CD](#phase-20--infrastructure--cicd)
22. [Appendix A — Phase Dependencies](#appendix-a--phase-dependencies)
23. [Appendix B — Environment Variables Reference](#appendix-b--environment-variables-reference)
24. [Appendix C — ADRs Required Before Implementation](#appendix-c--adrs-required-before-implementation)

---

## Phase 0 — Repository & Infrastructure Scaffold

### Task 0.1 — Monorepo Structure

**Objective:** Create the top-level monorepo layout that houses all services and the frontend. All subsequent tasks write files into this structure, so it must be established first.

**Inputs:** Technical Architecture §2 (service topology), §3 (technology stack)

**Acceptance criteria:**
- Running `ls` at repo root shows: `apps/`, `services/`, `packages/`, `infra/`, `docker-compose.yml`, `package.json`
- `apps/web` contains a valid Vite + React + TypeScript project that builds with `pnpm build`
- Each service directory under `services/` contains a valid `package.json` or `pyproject.toml`
- `docker-compose.yml` starts PostgreSQL 16, Redis 7, and MinIO with a single `docker compose up -d`

**Claude Code prompt:**
```
Read docs/HITL_Module_Technical_Architecture_Specification_v1.0.md sections 2, 3, and 9.

Create a monorepo scaffold with the following exact structure:

hitl-module/
  apps/
    web/                         # Vite 6 + React 19 + TypeScript 5 frontend
  services/
    document-storage/            # Node.js 22 + Fastify 5 — port 3001
    epub-conversion/             # Python 3.12 + FastAPI 0.115 — port 3002
    annotation-session/          # Node.js 22 + Fastify 5 — port 3003
    collaboration/               # Node.js 22 + Socket.IO 4 — port 3004
    ai-orchestration/            # Python 3.12 + FastAPI 0.115 — port 3005
    audit-trail/                 # Node.js 22 + Fastify 5 — port 3006
    notification/                # Node.js 22 + Fastify 5 — port 3007
    platform-config/             # Node.js 22 + Fastify 5 — port 3008
  packages/
    shared-types/                # TypeScript shared interfaces
    audit-client/                # Shared audit-event emitter used by all Node services
  infra/
    k8s/                         # Kubernetes manifests (stubs)
    docker/                      # Per-service Dockerfiles
  docker-compose.yml
  pnpm-workspace.yaml
  package.json

docker-compose.yml must define:
- postgres:16 on port 5432, database named hitl
- redis:7-alpine on port 6379
- minio/minio on port 9000 with MINIO_ROOT_USER=minioadmin MINIO_ROOT_PASSWORD=minioadmin,
  and a mc (MinIO client) init container that creates a bucket named hitl-documents on startup

apps/web: scaffold with vite, react, react-dom, typescript, tailwindcss 4,
@tanstack/react-query 5, zustand 5, react-router 7.
Include working vite.config.ts and tsconfig.json.

Each Node.js service: package.json with fastify 5 (socket.io 4 for collaboration service),
typescript 5, a src/index.ts that starts the server on the correct port, tsconfig.json.

Each Python service: pyproject.toml using Poetry with fastapi 0.115, uvicorn, pydantic 2,
and src/main.py with a basic FastAPI app and GET /health endpoint.

packages/shared-types: package.json and src/index.ts exporting empty placeholder
interfaces: Document, DocumentVersion, Annotation, AnnotationType, FontProfile,
ConversionManifest, AuditEvent, Session, PresenceUser, Permission, AiQueryPayload.

After creating all files verify:
1. docker-compose.yml passes `docker compose config` validation
2. cd apps/web && pnpm build succeeds (no missing peer deps)
3. Each Node service has a valid package.json with a correct main entry
```

---

### Task 0.2 — Shared Types Package

**Objective:** Define all cross-service TypeScript interfaces in `packages/shared-types` so every service and the frontend import from one source of truth.

**Inputs:** Technical Architecture §6 (Data Models)

**Acceptance criteria:**
- `packages/shared-types/src/index.ts` exports all interfaces listed below with exact field names from the architecture document
- `pnpm tsc --noEmit` passes in the shared-types package with zero errors

**Claude Code prompt:**
```
Read docs/HITL_Module_Technical_Architecture_Specification_v1.0.md section 6 (Data Models) carefully —
every field name, type, and union variant.
Read docs/HITL_Module_Functional_Specification_v1.1.md section 5.1.4 for the FontProfile
configurable parameters table.

Open packages/shared-types/src/index.ts and replace its contents with the following fully
typed TypeScript interfaces:

1. Document, DocumentVersion (§6.1)
   - sourceFormat: union 'docx' | 'pdf' | 'xlsx' | 'md' | 'epub'
   - conversionStatus: union 'pending' | 'processing' | 'complete' | 'failed'
   - reviewState: union 'open' | 'pending_approval' | 'approved' | 'rejected'

2. Annotation, AnnotationType, AnnotationPayload, AnnotationReply (§6.2)
   - AnnotationPayload must be a discriminated union with a 'type' discriminant
   - Each variant (critical_flag, attention_marker, validation_notice, human_comment,
     review_request, edit_suggestion) is its own interface

3. ConversionManifest, SheetManifest, DegradationNotice (§6.3)
   - DegradationNotice.type must be a string union of all 7 listed values

4. FontProfile and HeadingScale (§6.4)
   - config must be a nested object matching all 7 configurable parameters from
     Functional Specification §5.1.4 with correct TypeScript types

5. Session: { id, documentId, tenantId, userId, kbConnectionId?, createdAt,
   lastActiveAt, reviewState }

6. AuditEvent: { id, tenantId, documentId?, sessionId?, actorType, actorId,
   eventType, scope?, beforeState?, afterState?, metadata?, occurredAt }
   - actorType: 'user' | 'agent' | 'system'

7. AiQueryPayload: { sessionId, documentId, userQuery, selectionContext?, quickAction? }
   - selectionContext: { cfi, text, chapterTitle }
   - quickAction: 'explain' | 'validate' | 'suggest_edit' | 'compliance' | 'summarise'

8. PresenceUser: { userId, displayName, avatarUrl, currentCfi, lastSeenAt }

9. Permission: string union of all permission strings from the RBAC table in §8.1

Also create packages/shared-types/src/events.ts exporting:
export const SOCKET_EVENTS = {
  PRESENCE_JOIN: 'presence:join',
  PRESENCE_UPDATE: 'presence:update',
  CURSOR_UPDATE: 'cursor:update',
  CURSOR_POSITIONS: 'cursor:positions',
  ANNOTATION_CREATED: 'annotation:created',
  ANNOTATION_RESOLVED: 'annotation:resolved',
  ANNOTATION_SYNC: 'annotation:sync',
  EPUB_UPDATED: 'epub:updated',
} as const;

Export everything from a single index.ts.
Run tsc --noEmit and fix all errors before finishing.
```

---

## Phase 1 — Data Layer & Database Schema

### Task 1.1 — PostgreSQL Migrations (Prisma)

**Objective:** Create the full database schema using Prisma, covering all tables used by Node.js services, including tenant RLS policies.

**Inputs:** Technical Architecture §5.5, §5.8, §5.10

**Acceptance criteria:**
- `prisma migrate dev` applies cleanly against a fresh PostgreSQL 16 instance
- All tables exist with correct column types, constraints, and composite indexes
- RLS policies are created for `documents`, `sessions`, `annotations`, `audit_events`, `font_profiles`
- A restricted `audit_writer` PostgreSQL role is created with only INSERT and SELECT on `audit_events`

**Claude Code prompt:**
```
Read docs/HITL_Module_Technical_Architecture_Specification_v1.0.md sections 5.5, 5.8,
and 5.10 — study every SQL CREATE TABLE statement, every CHECK constraint, and every index.

Navigate to services/document-storage/. This service owns the primary Prisma schema.

1. If prisma/schema.prisma does not exist, run: npx prisma init

2. Write prisma/schema.prisma with these models:

   Document: id (uuid, default gen_random_uuid()), tenantId (String), title (String),
   sourceFormat (enum SourceFormat: DOCX PDF XLSX MD EPUB), currentVersionId (String?),
   reviewState (enum ReviewState: OPEN PENDING_APPROVAL APPROVED REJECTED, default OPEN),
   createdAt (DateTime, default now()), updatedAt (DateTime, updatedAt)

   DocumentVersion: id (uuid), documentId (FK→Document), versionNumber (Int),
   sourceS3Key (String), epubS3Key (String?), conversionStatus (enum ConversionStatus:
   PENDING PROCESSING COMPLETE FAILED, default PENDING), conversionManifest (Json?),
   createdAt (DateTime, default now()), createdBy (String)

   Session: id (uuid), documentId (FK→Document), tenantId (String), userId (String),
   kbConnectionId (String?), createdAt (DateTime, default now()),
   lastActiveAt (DateTime, default now()),
   reviewState (ReviewState, default OPEN)

   Annotation: id (uuid), sessionId (FK→Session), documentId (FK→Document),
   documentVersionId (String), authorId (String?), agentId (String?),
   type (enum AnnotationType: CRITICAL_FLAG ATTENTION_MARKER VALIDATION_NOTICE
   HUMAN_COMMENT REVIEW_REQUEST EDIT_SUGGESTION),
   cfi (String), cfiText (String?), payload (Json),
   status (enum AnnotationStatus: OPEN RESOLVED REJECTED, default OPEN),
   resolvedById (String?), resolvedAt (DateTime?),
   createdAt (DateTime, default now())
   @@index([documentId, status])
   @@index([type, status])

   AnnotationReply: id (uuid), annotationId (FK→Annotation), authorId (String),
   body (String), createdAt (DateTime, default now())

   AuditEvent: id (BigInt, autoincrement), tenantId (String), documentId (String?),
   sessionId (String?), actorType (enum ActorType: USER AGENT SYSTEM),
   actorId (String), eventType (String), scope (Json?), beforeState (Json?),
   afterState (Json?), metadata (Json?), occurredAt (DateTime, default now())
   @@map("audit_events")
   @@index([tenantId, occurredAt])

   FontProfile: id (uuid), tenantId (String), name (String), isActive (Boolean, default false),
   config (Json), createdBy (String),
   createdAt (DateTime, default now()), updatedAt (DateTime, updatedAt)

   Notification: id (uuid), tenantId (String), userId (String), type (String),
   payload (Json), read (Boolean, default false), createdAt (DateTime, default now())

3. Create prisma/migrations/001_initial/migration.sql that ADDITIONALLY includes
   (after the Prisma-generated CREATE TABLE statements):

   -- Row-level security
   ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
   CREATE POLICY tenant_isolation ON "Document"
     USING (tenant_id = current_setting('app.current_tenant')::text);
   -- Repeat for Session, Annotation, audit_events, FontProfile

   -- Restricted audit role
   DO $$ BEGIN
     CREATE ROLE audit_writer;
   EXCEPTION WHEN duplicate_object THEN NULL;
   END $$;
   GRANT SELECT, INSERT ON audit_events TO audit_writer;

4. Run: npx prisma migrate dev --name initial
   (against the docker-compose postgres instance — ensure DATABASE_URL is set)

5. Run: npx prisma generate
   Confirm client builds with no errors.

6. Verify RLS: connect as a different tenant and confirm documents from another tenant
   are invisible (write a SQL test script that sets app.current_tenant and runs a SELECT).
```

---

### Task 1.2 — SQLAlchemy Models (Python services)

**Objective:** Create SQLAlchemy 2.x async models for the Python services mirroring the Prisma schema.

**Inputs:** Technical Architecture §5.5; Task 1.1 Prisma schema

**Acceptance criteria:**
- `python -c "from src.models import *"` runs without import errors in both Python services
- `alembic check` reports no detected model/schema divergence

**Claude Code prompt:**
```
Read the Prisma schema at services/document-storage/prisma/schema.prisma created in Task 1.1.

Navigate to services/epub-conversion/.

1. Create src/db.py — SQLAlchemy 2.x async engine:
   from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
   from sqlalchemy.orm import DeclarativeBase
   Read DATABASE_URL from os.environ; use postgresql+asyncpg driver.
   Export: engine, AsyncSessionLocal, get_db (FastAPI async dependency that yields AsyncSession)

2. Create src/models.py — SQLAlchemy ORM models using Mapped[] and mapped_column() syntax:
   - Document: id (UUID), tenant_id, title, source_format, current_version_id, review_state, created_at, updated_at
   - DocumentVersion: id, document_id (FK), version_number, source_s3_key, epub_s3_key, conversion_status, conversion_manifest (JSONB), created_at, created_by
   - Session: id, document_id (FK), tenant_id, user_id, review_state, created_at
   Use Python Enum classes matching the Prisma enum values (lowercase strings for PostgreSQL)
   Use __tablename__ matching the Prisma @@map or default snake_case table names

3. Create alembic.ini and alembic/env.py configured for async engine autogenerate.
   Run `alembic check` — it should report "No new upgrade operations detected" since
   Prisma already created the tables.

Repeat steps 1–3 identically for services/ai-orchestration/src/db.py and src/models.py.
```

---

## Phase 2 — Platform Configuration Service

### Task 2.1 — Font Profile CRUD & CDN Validation

**Objective:** Build the Platform Configuration Service with full font profile management, CDN font validation, and atomic profile activation.

**Inputs:** Technical Architecture §5.10, §7.5; Functional Specification §5.1.4

**Acceptance criteria:**
- `GET /config/font-profile/active` returns the active profile for the requesting tenant
- `POST /config/font-profiles` with an unknown font family returns 422 `{ error: 'unknown_font_family', family }`
- `PUT /config/font-profiles/:id/activate` runs deactivate-all + activate-target in a single transaction
- The 3-profile-per-tenant limit returns 409 when exceeded
- Font profile changes emit an audit event through the audit-client package

**Claude Code prompt:**
```
Read docs/HITL_Module_Technical_Architecture_Specification_v1.0.md sections 5.10 and 7.5.
Read docs/HITL_Module_Functional_Specification_v1.1.md section 5.1.4 for the 7 configurable
font parameters and their default values.
Read packages/shared-types/src/index.ts for the FontProfile interface.

Navigate to services/platform-config/. Fastify 5 + TypeScript, port 3008.

Install: @prisma/client, ioredis, packages/shared-types (workspace), packages/audit-client (workspace).

1. src/index.ts — Fastify server:
   - Register @fastify/jwt with JWT_SECRET env var
   - Add preHandler hook: verify JWT, set request.userId and request.tenantId from claims
   - Add X-Tenant-ID header extraction (set by API gateway) as fallback
   - Register routes from src/routes/font-profiles.ts
   - GET /health → 200 { status: 'ok' }

2. src/validation/cdn-manifest.ts:
   export async function loadCdnManifest(): Promise<Set<string>>
   - Fetch CDN_MANIFEST_URL env var (a JSON array of approved font family names)
   - Cache in module-level Set; reload every 5 minutes
   
   export function validateFontFamilies(families: string[], manifest: Set<string>): string[]
   - Return array of families NOT found in manifest (unknown families)

3. src/validation/font-profile-schema.ts:
   JSON Schema object for FontProfileConfig with all 7 parameters from §5.1.4:
   font.body.family (string), font.body.size (string matching /^\d+(\.\d+)?rem$/),
   font.heading.family (string), font.heading.scale (object with h1–h6 number keys),
   font.mono.family (string), font.lineHeight (number), font.tableHeader.weight (number)
   All fields optional (use defaults if missing)

4. src/routes/font-profiles.ts:

   GET /config/font-profile/active
   - Prisma: findFirst where tenantId = tenantId AND isActive = true
   - 200 { fontProfile } or 404 { error: 'no_active_profile' }

   GET /config/font-profiles
   - findMany where tenantId = tenantId
   - 200 { profiles: FontProfile[] }

   POST /config/font-profiles
   - Validate body against font-profile-schema
   - Count existing profiles for tenant: if >= 3 return 409 { error: 'profile_limit_reached' }
   - Extract all font family values from body.config
   - Call validateFontFamilies; if unknown families: 422 { error: 'unknown_font_family', family: unknowns[0] }
   - Insert FontProfile with isActive: false
   - auditClient.emit({ eventType: 'font.profile_changed', actorType: 'user', actorId: userId, tenantId, afterState: { action: 'created', profileName: name } })
   - 201 { fontProfile }

   PUT /config/font-profiles/:id/activate
   - Read current active profile name for audit beforeState
   - Prisma.$transaction: updateMany isActive=false for tenantId, then update target to isActive=true
   - auditClient.emit with beforeState { profileName: prev } and afterState { profileName: new }
   - 200 { fontProfile }

5. src/__tests__/font-profiles.test.ts using Vitest + Fastify inject():
   - Mock Prisma client (vi.mock)
   - Test: 404 when no active profile, 422 for unknown font, 409 for profile limit,
     transaction correctness on activation (both updates called), audit event emitted
```

---

## Phase 3 — Document Storage Service

### Task 3.1 — Upload, Versioning, Signed URLs & Conversion Job Dispatch

**Objective:** Build the Document Storage Service with all endpoints from §7.1, S3 integration, version management, and BullMQ job dispatch.

**Inputs:** Technical Architecture §5.2, §7.1; Functional Specification §5.5.6

**Acceptance criteria:**
- `POST /documents` stores file in S3, creates Document and DocumentVersion rows, enqueues conversion job, returns 201
- `GET /documents/:id/epub` returns 202 while converting, 200 with signed URL once complete
- `POST /documents/:id/approve` returns 409 with `flagIds` when unresolved critical flags exist
- `PUT /documents/:id/rollback` updates `currentVersionId` without deleting any data
- All mutations emit audit events

**Claude Code prompt:**
```
Read docs/HITL_Module_Technical_Architecture_Specification_v1.0.md sections 5.2 and 7.1.
Read packages/shared-types/src/index.ts for Document, DocumentVersion, ConversionManifest.

Navigate to services/document-storage/. Fastify 5 + TypeScript, port 3001.

Install: @prisma/client, bullmq, ioredis, @aws-sdk/client-s3, @aws-sdk/s3-request-presigner,
@fastify/multipart, packages/shared-types, packages/audit-client.

1. src/s3.ts — S3 client wrapper:
   - createS3Client(): reads S3_ENDPOINT (for MinIO), AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
   - uploadDocument(tenantId, documentId, version, filename, buffer): upload to S3, return key
   - getSignedEpubUrl(s3Key): PutObjectCommand presigned URL, 900s expiry
     Return { url: string, expiresAt: string (ISO 8601) }
   - Key builders: sourceKey(t,d,v,f), epubKey(t,d,v), manifestKey(t,d,v)
     following the S3 layout in §5.2: {tenantId}/{documentId}/source/v{n}/{filename} etc.

2. src/queue.ts — BullMQ producer:
   - enqueueConversionJob(job: { documentId, versionId, s3SourceKey, sourceFormat, tenantId })
   - Queue name: 'epub-conversion'. Connection: Redis via REDIS_URL.

3. src/routes/documents.ts — all 8 endpoints from §7.1:

   POST /documents (multipart)
   - @fastify/multipart to read file
   - Detect sourceFormat from extension
   - Generate UUIDs for documentId, versionId
   - uploadDocument() to S3
   - Prisma: create Document, create DocumentVersion (PENDING)
   - enqueueConversionJob()
   - auditClient.emit({ eventType: 'document.opened', ... })
   - 201 { document, version }

   GET /documents/:id
   - findUnique + include currentVersion
   - 200 { document, currentVersion }

   GET /documents/:id/epub
   - Fetch currentVersion
   - If conversionStatus !== 'complete': 202 { conversionStatus: version.conversionStatus }
   - getSignedEpubUrl(version.epubS3Key)
   - 200 { signedUrl, expiresAt, conversionStatus: 'complete' }

   PATCH /documents/:id/content  (Markdown)
   - Read { markdown } from body
   - Buffer from string, upload new source version
   - Create new DocumentVersion (PENDING)
   - Update Document.currentVersionId
   - enqueueConversionJob()
   - 202 { versionId, conversionJobId: job.id }

   POST /documents/:id/cells  (XLSX cell edit)
   - Read { sheetName, row, col, value } from body
   - Enqueue to separate BullMQ queue 'xlsx-edit' with the cell edit parameters
   - Create new DocumentVersion stub (PENDING)
   - 202 { versionId, conversionJobId }

   GET /documents/:id/versions
   - findMany versions for document, ordered by versionNumber asc
   - 200 { versions }

   GET /documents/:id/versions/:vId/epub
   - getSignedEpubUrl for specified version
   - 200 { signedUrl, expiresAt }

   POST /documents/:id/approve
   - GET http://annotation-session:3003/documents/:id/check-approval
   - If response is 409: forward 409 { error, flagIds }
   - Else: update Document.reviewState from body.decision
   - auditClient.emit({ eventType: 'approval.state_changed', ... })
   - 200 { document }

   PUT /documents/:id/rollback
   - Body: { versionId }
   - update Document.currentVersionId = versionId (no S3 deletion)
   - auditClient.emit({ eventType: 'document.rolled_back', ... })
   - 200 { document }

4. src/workers/xlsx-edit.worker.ts — BullMQ worker for 'xlsx-edit' queue:
   - Download current XLSX from S3
   - Spawn: python3 -c "
       import openpyxl, sys, json
       args = json.loads(sys.argv[1])
       wb = openpyxl.load_workbook(args['path'])
       wb[args['sheet']][args['cellRef']] = args['value']
       wb.save(args['path'])
     " with JSON args
   - Re-upload modified XLSX as new version source
   - Create DocumentVersion (PENDING)
   - enqueueConversionJob()

5. Tests: upload flow (mock S3 + BullMQ), signed URL 202/200 state machine,
   rollback does not delete rows, approve 409 forwarding.
```

---

## Phase 4 — EPUB Conversion Service

### Task 4.1 — Conversion Worker, Format Dispatcher & Job Pipeline

**Objective:** Build the Python EPUB Conversion Service worker that consumes BullMQ jobs, converts documents to EPUB3 using format-specific converters, and notifies the system on completion.

**Inputs:** Technical Architecture §5.3; Functional Specification §5.1.1

**Acceptance criteria:**
- A DOCX file converts to a valid EPUB3 file in under 10 seconds for files under 10 MB
- The ConversionManifest JSON is written to S3 alongside the EPUB
- The `epub:ready` Redis pub/sub message fires after successful S3 upload
- Failed conversions set DocumentVersion.conversionStatus to FAILED and emit an audit event
- DOCX, MD, PDF, and native EPUB (passthrough) all convert without exception

**Claude Code prompt:**
```
Read docs/HITL_Module_Technical_Architecture_Specification_v1.0.md section 5.3 in full —
every step of the job flow, the Pandoc flags, and the PDF extraction approach.

Navigate to services/epub-conversion/. Python 3.12 + FastAPI, port 3002.

Install in pyproject.toml: fastapi, uvicorn, pydantic, sqlalchemy[asyncio], asyncpg,
redis, boto3, pdfminer.six, pymupdf, ebooklib, pillow, python-multipart.
Note: BullMQ has no Python client — implement polling via Redis LRANGE/LREM directly.

1. src/converters/base.py:
   from abc import ABC, abstractmethod
   class BaseConverter(ABC):
       @abstractmethod
       def convert(self, source_path: str) -> tuple[bytes, dict]: ...
       # Returns (epub_bytes, conversion_manifest_dict)

2. src/converters/pandoc_converter.py:
   Implements BaseConverter using subprocess.run with these exact Pandoc flags from §5.3:
   --to epub3, --epub-embed-font, --toc, --toc-depth=3, --track-changes=all
   Compute sourceFileHash as SHA-256 hex of the source file bytes.
   Return ConversionManifest dict: { sourceFormat, sourceFileHash, convertedAt (ISO),
   degradationNotices: [] }
   Raise ConversionError on non-zero returncode with stderr message.

3. src/converters/pdf_converter.py:
   Implements BaseConverter using pdfminer.six for text and PyMuPDF (fitz) for images.
   Each PDF page → one EpubHtml chapter in ebooklib.
   Images extracted via fitz.Page.get_images() → embedded as EpubImage items.
   Insert <div class="page-break" data-page-number="N"/> between pages.
   Return ConversionManifest with pageCount.

4. src/converters/passthrough_converter.py:
   Validate EPUB using ebooklib.epub.read_epub(). Return the raw bytes unchanged.
   Add a degradation notice if the EPUB is EPUB2 (not EPUB3).

5. src/dispatcher.py:
   def dispatch(source_format: str, source_path: str) -> tuple[bytes, dict]:
       converters = {
           'docx': PandocConverter, 'md': PandocConverter,
           'pdf': PdfConverter, 'epub': PassthroughConverter
       }
       # 'xlsx' handled by XlsxEpubConverter (Phase 5)
       converter = converters[source_format]()
       return converter.convert(source_path)

6. src/worker.py — BullMQ-compatible Redis worker loop:
   while True:
     # BRPOPLPUSH bull:epub-conversion:wait bull:epub-conversion:active 0
     job_json = redis_client.brpoplpush('bull:epub-conversion:wait',
                                         'bull:epub-conversion:active', 0)
     job = json.loads(job_json)
     try:
       # a. Update DocumentVersion conversionStatus = 'processing'
       # b. Download source from S3 to /tmp/{jobId}/
       # c. dispatch(job['sourceFormat'], local_path)
       # d. Upload EPUB and manifest to S3
       # e. Update DocumentVersion: conversionStatus='complete', epubS3Key, conversionManifest
       # f. redis_client.publish(f"hitl:epub:{job['documentId']}", json.dumps({...}))
       # g. POST audit event to http://audit-trail:3006/audit/events
     except Exception as e:
       # Update conversionStatus = 'failed'
       # POST audit event: epub.conversion_failed
     finally:
       # LREM bull:epub-conversion:active 1 job_json

7. src/main.py — FastAPI app with GET /health and startup event that launches worker
   in a background thread (threading.Thread(target=worker_loop, daemon=True).start()).

8. tests/test_pandoc_converter.py:
   Create a minimal DOCX fixture using python-docx programmatically.
   Assert output is a ZIP file (check magic bytes b'PK'), contains 'mimetype' entry
   equal to 'application/epub+zip', and manifest has correct sourceFileHash.
```

---

## Phase 5 — XLSX-to-EPUB Pipeline

### Task 5.1 — XlsxEpubConverter — Full Implementation

**Objective:** Implement the complete XLSX-to-EPUB conversion pipeline including table rendering, cell formatting, formula evaluation, merged cells, chart extraction, pagination, and all degradation behaviours.

**Inputs:** Technical Architecture §5.4; Functional Specification §5.1.3

**Acceptance criteria:**
- A workbook with 3 sheets produces an EPUB with 3 chapters and a correct NCX/Nav TOC
- Frozen rows render as `<thead>`; body rows as `<tbody>`
- Merged cells produce correct colspan/rowspan attributes; covered cells are skipped
- A sheet with 6,000 rows produces 12 paginated chapters (500 rows each)
- Formula cells display evaluated values; unevaluable formulas render `#EVAL_ERROR`
- Conditional formatting triggers a `conditional_formatting_omitted` degradation notice
- Conversion of a 5,000-row workbook completes in under 10 seconds

**Claude Code prompt:**
```
Read docs/HITL_Module_Technical_Architecture_Specification_v1.0.md section 5.4 in full.
Read every method of the XlsxEpubConverter class definition, the merged cell handling code,
and all comments about formula evaluation, chart extraction, and degradation.
Read docs/HITL_Module_Functional_Specification_v1.1.md section 5.1.3 in full —
particularly the table rendering rules, cell formatting fidelity, and limitations table.

Navigate to services/epub-conversion/src/converters/. Install: openpyxl, formulas, pillow.

Create xlsx_epub_converter.py. No method may have a pass or ... body.

Class constants:
  MAX_ROWS_PER_PAGE = 500
  PAGINATION_THRESHOLD = 5000

convert(self, source_path: str) -> tuple[bytes, dict]:
  - openpyxl.load_workbook(source_path, data_only=False)
  - Build EpubBook, iterate sheetnames, skip hidden sheets
  - For each visible sheet: call _convert_sheet(), collect chapter_items and degradation_notices
  - Build NCX/Nav TOC
  - Return epub bytes and ConversionManifest dict with sheets list and degradation_notices

_convert_sheet(self, ws, sheet_name, book):
  - Build merge_map as shown in §5.4: { (min_row,min_col): (rowspan,colspan), covered_cell: None }
  - Detect freeze_panes for header rows
  - Check ws.conditional_formatting → add DegradationNotice
  - Paginate data_rows if > PAGINATION_THRESHOLD
  - For each page: call _rows_to_html(), create EpubHtml chapter, set chapter.sheet = sheet_name
  - Return SheetManifest, notices, chapter_items

_rows_to_html(self, ws, merge_map, header_rows, data_rows, page_idx, total_pages) -> str:
  Build a complete XHTML document string (with proper XML declaration and DOCTYPE).
  Structure:
  - <table class="sheet-table">
  - <thead>: for each header row, render <th> cells
  - <tbody>: for each data row, render <td> cells
  Cell rendering rules per §5.1.3:
    * If cell position is in merge_map and value is None: skip the cell (covered)
    * If cell position is master of a merge: add colspan=N rowspan=M attributes
    * data-row="{row}" data-col="{col}" attributes on every <td> (for the XLSX cell editor)
    * Apply number format via _format_cell()
    * Bold → <strong>, Italic → <em>
    * text-align CSS from cell.alignment.horizontal
    * background-color CSS from cell.fill.fgColor.rgb (skip if '00000000' or None)
    * Font family is NOT set inline — platform CSS overrides all fonts
  If page_idx > 0 or total_pages > 1:
    Insert <div class="sheet-pagination">Page {page_idx+1} of {total_pages}</div>
    before and after the table
  End XHTML with: <link rel="stylesheet" href="../styles/platform.css"/>
    so the platform font stylesheet injected at render time takes effect

_format_cell(self, cell) -> str:
  - None value → ""
  - Formula cell (data_type == 'f'):
      Try self._formula_cache.get(cell.coordinate)
      Fall back to openpyxl data_only re-read value
      If still None → "#EVAL_ERROR"
  - Apply number_format string: detect currency (contains '$' or '€'), percentage ('%'),
    date (contains 'yy' or 'dd'), decimal precision (count '0' after '.')
  - Return formatted string

_build_formula_cache(self, ws) -> dict:
  - Re-open workbook with data_only=True to get computed values
  - Return { cellRef: value } for all formula cells
  - Call this once per sheet at the start of _convert_sheet and store as self._formula_cache

Chart extraction in _convert_sheet:
  - for chart in ws._charts:
      Use Pillow to create a 400×200 px placeholder PNG with the chart.title text
      (use ImageDraw.Draw to write the title; use a white background)
      Add to book as EpubImage item, file_name=f"images/chart_{chart_id}.png"
      Insert <figure><img src="../images/chart_{chart_id}.png" alt="{title}"/>
             <figcaption>{title}</figcaption></figure>
      at the cell position of chart.anchor.editAs top-left cell

Wire into dispatcher.py: add 'xlsx': XlsxEpubConverter to the converters dict.

tests/test_xlsx_converter.py — create all fixtures programmatically with openpyxl:
  test_three_sheets: assert EPUB has 3 chapters, NCX lists all sheet names
  test_frozen_header: assert <thead> exists in generated HTML
  test_merged_cells: assert colspan=2 attribute present for merged range
  test_pagination: 6100-row sheet → 12 EpubHtml chapters
  test_formula_cell: formula cell displays evaluated value, not formula string
  test_conditional_formatting: assert DegradationNotice type='conditional_formatting_omitted'
  test_performance: 5000-row sheet converts in under 10 seconds (use time.time())
```

---

## Phase 6 — Annotation & Session Service

### Task 6.1 — Session Lifecycle, Annotation CRUD & Review Enforcement

**Objective:** Build the Annotation & Session Service with session management, all annotation types, comment threading, mention extraction, and approval-block enforcement.

**Inputs:** Technical Architecture §5.5, §7.2; Functional Specification §5.2, §5.4

**Acceptance criteria:**
- `POST /sessions` creates a session row and emits a `document.opened` audit event
- `POST /documents/:id/annotations` validates CFI format and returns 400 on invalid CFI
- `PATCH /annotations/:id/resolve` publishes to Redis `hitl:annotation:{docId}` channel
- `POST /documents/:id/check-approval` returns 409 when any open CRITICAL_FLAG exists
- @mention extraction from comment bodies enqueues a notification job

**Claude Code prompt:**
```
Read docs/HITL_Module_Technical_Architecture_Specification_v1.0.md sections 5.5 and 7.2.
Read docs/HITL_Module_Functional_Specification_v1.1.md sections 5.2.1, 5.4.1, 5.4.2.
Read packages/shared-types/src/index.ts for Annotation, AnnotationType, AnnotationPayload, Session.

Navigate to services/annotation-session/. Fastify 5 + TypeScript, port 3003.
Install: @prisma/client, ioredis, bullmq, packages/shared-types, packages/audit-client.

1. src/lib/cfi-validator.ts:
   export function validateCfi(cfi: string): boolean
   // EPUB CFI must match: /^epubcfi\(.+\)$/
   // Return true if valid

2. src/lib/mention-extractor.ts:
   export function extractMentions(text: string): string[]
   // Regex: /@(\w+)/g → return array of usernames (without @)

3. src/routes/sessions.ts:
   POST /sessions
   - Body: { documentId: string, kbConnectionId?: string }
   - Create Session row with userId, tenantId from JWT
   - auditClient.emit({ eventType: 'document.opened', sessionId: session.id, documentId, ... })
   - 201 { session }

   GET /sessions/:id
   - Include Document relation
   - 200 { session, document }

4. src/routes/annotations.ts:
   GET /documents/:id/annotations
   - Query params: status?, type?, authorId?, from?, to?
   - Dynamic WHERE clause + date range filter on createdAt
   - Also COUNT: totalCritical (type=CRITICAL_FLAG), resolvedCritical (type=CRITICAL_FLAG, status=RESOLVED)
   - 200 { annotations, totalCritical, resolvedCritical }

   POST /documents/:id/annotations
   - Body: { sessionId, documentVersionId, authorId?, agentId?, type, cfi, cfiText?, payload }
   - validateCfi(cfi) → 400 { error: 'invalid_cfi' } if invalid
   - Create Annotation with status: 'open'
   - If type === 'HUMAN_COMMENT':
       mentions = extractMentions(payload.body)
       for each mention: enqueue BullMQ job { queue: 'notifications', type: 'mention',
         data: { mentionerUserId: authorId, mentionedUsername: mention, documentId, annotationId } }
   - Redis: ioredis.publish('hitl:annotation:{documentId}', JSON.stringify({ action: 'created', annotation }))
   - auditClient.emit({ eventType: 'annotation.created', ... })
   - 201 { annotation }

   PATCH /annotations/:id/resolve
   - Body: { decision: 'resolved' | 'rejected', comment?: string }
   - Fetch annotation, capture beforeState
   - Update: status = decision, resolvedById, resolvedAt
   - If comment: create AnnotationReply
   - Redis publish: hitl:annotation:{documentId} { action: 'resolved', annotationId }
   - auditClient.emit({ eventType: 'annotation.' + decision, beforeState, afterState, ... })
   - 200 { annotation }

   POST /annotations/:id/replies
   - Create AnnotationReply
   - extractMentions(body) → enqueue notification jobs
   - 201 { reply }

5. src/routes/approval.ts (INTERNAL — add X-Internal-Service: true header check):
   POST /documents/:id/check-approval
   - SELECT id FROM annotations WHERE document_id = :id AND type = 'CRITICAL_FLAG' AND status = 'OPEN'
   - If any: 409 { error: 'unresolved_critical_flags', flagIds: ids }
   - Else: 200 { approved: true }

6. Tests: CFI validation accepts/rejects correctly, mention extraction, 409 approval block,
   Redis publish called on resolve (mock ioredis), audit event emitted.
```

---

## Phase 7 — Audit Trail Service

### Task 7.1 — Append-Only Event Log & Streaming Export

**Objective:** Build the Audit Trail Service with append-only PostgreSQL storage (enforced at the database role level), cursor-based pagination, and background CSV/JSON export.

**Inputs:** Technical Architecture §5.8, §7.4; Functional Specification §5.7

**Acceptance criteria:**
- A direct SQL UPDATE on `audit_events` using the `audit_writer` role fails with a permission error
- `GET /audit/events` with date filters returns correctly paginated results using keyset pagination
- Export job completes and returns a signed S3 URL for a 100,000-event export in under 60 seconds
- The audit-client package from packages/audit-client fires-and-forgets with no thrown exceptions

**Claude Code prompt:**
```
Read docs/HITL_Module_Technical_Architecture_Specification_v1.0.md sections 5.8 and 7.4.
Read docs/HITL_Module_Functional_Specification_v1.1.md section 5.7 for the complete event type list.
Read packages/shared-types/src/index.ts for AuditEvent.

Navigate to services/audit-trail/. Fastify 5 + TypeScript, port 3006.
Install: @prisma/client, bullmq, ioredis, @aws-sdk/client-s3, @aws-sdk/s3-request-presigner,
fast-csv, packages/shared-types.

1. src/db.ts — Prisma client using DATABASE_URL_AUDIT env var (connects as audit_writer role).
   This role has only INSERT and SELECT on audit_events.

2. src/routes/events.ts:
   POST /audit/events (INTERNAL ONLY)
   - Check request header 'X-Internal-Service' === 'true'; else 403
   - Validate body: tenantId, actorType, actorId, eventType required
   - prisma.auditEvent.create({ data: event })
   - 204

   GET /audit/events
   - REQUIRE JWT; filter by tenantId from JWT (never accept tenantId from query params)
   - Query params: documentId?, sessionId?, actorId?, eventType?, from (ISO), to (ISO),
     cursor? (BigInt encoded as string), limit (default 50, max 500)
   - WHERE occurred_at >= from AND occurred_at <= to
   - Keyset pagination: WHERE id > BigInt(cursor) ORDER BY id ASC LIMIT limit+1
   - If results.length > limit: return results.slice(0,limit) + nextCursor = results[limit-1].id.toString()
   - 200 { events, nextCursor? }

3. src/routes/export.ts:
   POST /audit/export
   - Body: { documentId?, from, to, format: 'csv' | 'json' }
   - enqueue BullMQ job on queue 'audit-export'
   - 202 { jobId }

   GET /audit/export/:jobId
   - Check Redis key audit:export:{jobId}
   - 200 { status: 'pending' | 'ready', downloadUrl? }

4. src/workers/export.worker.ts:
   - Pull all matching audit_events in batches of 1000 using cursor pagination
   - For CSV: use fast-csv, write header row then data rows
   - For JSON: write newline-delimited JSON (one JSON object per line)
   - Upload to S3: audit-exports/{tenantId}/{jobId}.{format}
   - Generate signed URL (86400s expiry)
   - Redis SETEX audit:export:{jobId} 86400 JSON.stringify({ status: 'ready', downloadUrl })

5. packages/audit-client/src/index.ts — complete implementation:
   export class AuditClient {
     constructor(private readonly auditServiceUrl: string) {}
     async emit(event: Omit<AuditEvent, 'id' | 'occurredAt'>): Promise<void> {
       try {
         await fetch(`${this.auditServiceUrl}/audit/events`, {
           method: 'POST',
           headers: { 'Content-Type': 'application/json', 'X-Internal-Service': 'true' },
           body: JSON.stringify(event),
         });
       } catch (err) {
         // Fire-and-forget: log to console.error only, never throw
         console.error('[AuditClient] Failed to emit event:', err);
       }
     }
   }

6. Tests:
   - Verify UPDATE on audit_events fails: use pg client with audit_writer credentials,
     attempt UPDATE audit_events SET actor_id='x' WHERE id=1; assert pg error
   - Keyset pagination: insert 150 events, GET page 1 (limit=100), use nextCursor for page 2,
     assert total retrieved = 150 with no duplicates
   - Export job: mock S3, assert CSV/JSON file structure is correct
```

---

## Phase 8 — Real-Time Collaboration Service

### Task 8.1 — Socket.IO Server, Presence, Cursors & Redis Pub/Sub Bridge

**Objective:** Build the Collaboration Service with room management, presence tracking, rate-limited cursor sync, and a Redis pub/sub bridge that pushes annotation and EPUB events to connected clients.

**Inputs:** Technical Architecture §5.6, §4.6; Functional Specification §5.4.3

**Acceptance criteria:**
- Two clients joining the same documentId both appear in each other's presence list within 500ms
- Cursor updates are rate-limited to one broadcast per 50ms per user
- Redis publish on `hitl:annotation:{documentId}` pushes `annotation:sync` to all room members
- Redis publish on `hitl:epub:{documentId}` pushes `epub:updated` to all room members

**Claude Code prompt:**
```
Read docs/HITL_Module_Technical_Architecture_Specification_v1.0.md section 5.6 in full —
room model, Redis pub/sub channels, cursor throttling, and the complete event list.
Read section 4.6 for all Socket.IO event payloads.
Read packages/shared-types/src/events.ts for SOCKET_EVENTS.
Read packages/shared-types/src/index.ts for PresenceUser.

Navigate to services/collaboration/. Node.js 22 + Socket.IO 4, port 3004.
Install: socket.io, ioredis, @fastify/jwt, packages/shared-types.

1. src/index.ts:
   - Fastify HTTP server (health endpoint)
   - Attach Socket.IO to Fastify's underlying HTTP server
   - Socket.IO middleware: verify JWT from socket.handshake.auth.token
     Extract userId, tenantId from JWT claims; attach to socket.data
   - On connection: presenceHandler(socket, io, redis)
   - GET /health → 200 { status: 'ok', connections: io.engine.clientsCount }

2. src/presence.ts — presenceHandler(socket, io, redis):

   Helper: getDocumentId(sessionId) → HTTP GET http://annotation-session:3003/sessions/{sessionId}
           Cache result in Redis for 60s to avoid repeated HTTP calls

   On SOCKET_EVENTS.PRESENCE_JOIN ({ sessionId, userId, displayName, avatarUrl }):
   - documentId = await getDocumentId(sessionId)
   - roomId = `${socket.data.tenantId}:${documentId}`
   - socket.join(roomId)
   - Store in Redis HSET hitl:presence:{documentId} {userId} JSON.stringify({ userId, displayName, avatarUrl, currentCfi: '', lastSeenAt: new Date().toISOString() })
   - EXPIRE hitl:presence:{documentId} 3600
   - Broadcast: io.to(roomId).emit(SOCKET_EVENTS.PRESENCE_UPDATE, await getAllPresence(documentId, redis))

   On SOCKET_EVENTS.CURSOR_UPDATE ({ userId, cfi }):
   - Rate limit: Map<userId, lastBroadcastMs>; skip if Date.now() - last < 50
   - HSET presence: update currentCfi
   - Broadcast: io.to(roomId).emit(SOCKET_EVENTS.CURSOR_POSITIONS, await getCursorPositions(documentId, redis))

   On disconnect:
   - HDEL hitl:presence:{documentId} {userId}
   - Broadcast updated presence

3. src/redis-subscriber.ts:
   - Create a dedicated Redis subscriber connection
   - PSUBSCRIBE 'hitl:annotation:*' and 'hitl:epub:*'
   - On pmessage(pattern, channel, message):
       If channel starts with 'hitl:annotation:':
         documentId = channel.split(':')[2]
         roomId = ... (need to look up from active rooms)
         io.to(`*:${documentId}`).emit(SOCKET_EVENTS.ANNOTATION_SYNC, JSON.parse(message))
       If channel starts with 'hitl:epub:':
         documentId = channel.split(':')[2]
         io.to(`*:${documentId}`).emit(SOCKET_EVENTS.EPUB_UPDATED, JSON.parse(message))

4. Helper functions in src/presence.ts:
   getAllPresence(documentId, redis) → HGETALL hitl:presence:{documentId} → parse values → PresenceUser[]
   getCursorPositions(documentId, redis) → same but return Record<userId, cfi>

5. Tests (socket.io-client + ioredis-mock):
   - Two clients join same document → both get presence:update with 2 users
   - Cursor throttle: 10 emits in 40ms → assert room receives ≤ 2 broadcasts
   - Redis publish annotation message → assert room members get annotation:sync
   - Redis publish epub message → assert room members get epub:updated
```

---

## Phase 9 — AI Orchestration Service

### Task 9.1 — LangChain Proxy, KB Context, SSE Streaming & Post-Processing

**Objective:** Build the AI Orchestration Service with KB context enrichment, LLM proxy, SSE streaming, confidence/citation/edit-suggestion extraction, and graceful KB degradation.

**Inputs:** Technical Architecture §5.7, §7.3; Functional Specification §5.3

**Acceptance criteria:**
- `POST /ai/query` starts streaming tokens within 2 seconds
- The `[DONE]` SSE event contains a JSON object with `confidence`, `citations`, optional `editSuggestion`, `promptHash`, `modelVersion`
- KB unavailability causes the request to proceed with `kbUnavailable: true` in metadata — no error thrown
- Every completed query emits an audit event with the SHA-256 prompt hash
- `[citation:source-id]` tokens are removed from streamed text and promoted to the metadata citations array

**Claude Code prompt:**
```
Read docs/HITL_Module_Technical_Architecture_Specification_v1.0.md section 5.7 completely —
the enrichment flow, the SYSTEM_PROMPT string, the confidence extraction, citation format,
and edit suggestion detection.
Read docs/HITL_Module_Functional_Specification_v1.1.md section 5.3.
Read packages/shared-types/src/index.ts for AiQueryPayload.

Navigate to services/ai-orchestration/. Python 3.12 + FastAPI, port 3005.
Install: fastapi, uvicorn, langchain, langchain-openai, redis, httpx, pydantic,
python-jose, sse-starlette, hashlib (stdlib).

1. src/prompts.py:
   SYSTEM_PROMPT = (exact string from §5.7)
   
   def build_prompt(query_payload: dict, kb_articles: list[dict], selection_text: str | None) -> list:
   # Returns LangChain messages list: [SystemMessage(...), HumanMessage(...)]
   # HumanMessage content:
   #   "User query: {query_payload['userQuery']}\n\n"
   #   + (f"Selected text:\n{selection_text}\n\n" if selection_text else "")
   #   + "KB Context:\n" + "\n".join(f"[{a['articleId']}] {a['title']}: {a['excerpt']}" for a in kb_articles)

2. src/kb_client.py:
   async def fetch_kb_context(tenant_id: str, chapter_text: str, cache: Redis) -> tuple[list[dict], bool]:
   # Cache key: f"{tenant_id}:{hashlib.sha256(chapter_text.encode()).hexdigest()[:16]}"
   # Check Redis GET — return cached result if hit
   # If miss: httpx.AsyncClient().post(KB_API_URL + '/search', json={...}, timeout=0.8)
   # On any exception (timeout, connection error): return ([], True) — kb_unavailable=True
   # On success: SETEX cache_key 60 JSON result; return (articles, False)

3. src/post_processor.py:
   def extract_confidence(text: str) -> str | None:
   # r'Confidence:\s*(High|Medium|Low)'
   
   def extract_citations(text: str) -> list[dict]:
   # r'\[citation:([^\]]+)\]' → [{ 'sourceId': match }]
   
   def extract_edit_suggestion(text: str) -> dict | None:
   # Find ```diff ... ``` fenced block → return { 'unifiedDiff': content } or None
   
   def clean_response_text(text: str) -> str:
   # Remove [citation:...] tokens from display text

4. src/routes/ai.py:
   POST /ai/query (Accept: text/event-stream)
   - Verify JWT (python-jose)
   - Parse AiQueryPayload
   - Fetch KB context (with cache)
   - Build prompt using build_prompt()
   - Compute promptHash = hashlib.sha256(str(messages).encode()).hexdigest()
   - Init ChatOpenAI(model='gpt-4o', streaming=True, api_key=OPENAI_API_KEY)
   - Use EventSourceResponse from sse-starlette:
       async def stream_generator():
           accumulated = ""
           async for chunk in llm.astream(messages):
               token = chunk.content
               accumulated += token
               yield f"data: {token}\n\n"
           # Post-process accumulated text
           metadata = {
               'confidence': extract_confidence(accumulated),
               'citations': extract_citations(accumulated),
               'editSuggestion': extract_edit_suggestion(accumulated),
               'kbUnavailable': kb_unavailable,
               'promptHash': promptHash,
               'modelVersion': 'gpt-4o',
           }
           yield f"data: [DONE] {json.dumps(metadata)}\n\n"
           # Fire-and-forget audit event
           asyncio.create_task(emit_audit(promptHash, metadata, query_payload))
   - return EventSourceResponse(stream_generator())

   POST /ai/feedback
   - Body: { queryId, rating, comment? }
   - Redis SETEX f"ai:feedback:{queryId}" 86400 JSON.stringify(...)
   - 204

5. Tests (httpx.AsyncClient, mock ChatOpenAI with patch):
   - Assert SSE stream contains data: lines followed by [DONE]
   - Assert [DONE] metadata structure
   - Assert KB unavailability (mock httpx to raise Timeout) → kbUnavailable=True, stream continues
   - Assert citation tokens removed from display text, appear in metadata
```

---

## Phase 10 — Notification Service

### Task 10.1 — BullMQ Worker, Handlebars Email & In-App Notifications

**Objective:** Build the Notification Service that processes mention, review request, and flag notification jobs, dispatches email via SES, and persists in-app notifications.

**Inputs:** Technical Architecture §5.9; Functional Specification §5.4.1, §5.4.2

**Acceptance criteria:**
- A `mention` job results in one Notification row and one SES send call
- Failed email jobs are retried 3 times with exponential backoff before moving to DLQ
- `GET /notifications/unread` returns only the authenticated user's unread notifications
- `POST /notifications/:id/read` marks as read and returns 204

**Claude Code prompt:**
```
Read docs/HITL_Module_Technical_Architecture_Specification_v1.0.md section 5.9.
Read docs/HITL_Module_Functional_Specification_v1.1.md sections 5.4.1 and 5.4.2.

Navigate to services/notification/. Fastify 5 + TypeScript, port 3007.
Install: @prisma/client, bullmq, ioredis, @aws-sdk/client-ses, handlebars, packages/audit-client.

1. src/templates/: create Handlebars .hbs files:
   mention.hbs: subject "{{mentionedBy}} mentioned you", body "{{mentionedBy}} mentioned you in {{documentTitle}}"
   review_request.hbs: subject "Review requested: {{documentTitle}}", body with deadline if present
   critical_flag.hbs: subject "Action required: {{documentTitle}}", body with urgency context
   document_approved.hbs, document_rejected.hbs

2. src/email.ts:
   async function sendEmail(to: string, subject: string, htmlBody: string): Promise<void>
   - If SES_FROM_ADDRESS env var is set: SESClient.send(SendEmailCommand)
   - Else: console.log('[EMAIL DEV]', { to, subject, htmlBody }) (no-throw dev fallback)
   - Throw SESServiceException on SES failure (BullMQ retries)

3. src/workers/notification.worker.ts — BullMQ Worker on queue 'notifications':
   - BullMQ Worker with concurrency: 5
   - defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 1000 } }
   - failedQueueName: 'notifications:failed'
   - On job:
       Resolve recipient email from USER_API_URL env var: GET {USER_API_URL}/users/{userId}
       Load and compile Handlebars template for job.data.type
       Insert Notification row in Prisma
       Call sendEmail(email, subject, html)

4. src/routes/notifications.ts:
   GET /notifications/unread
   - Where: userId = request.userId AND read = false
   - Order by createdAt desc
   - 200 { notifications }

   POST /notifications/:id/read
   - Update Notification.read = true where id = :id AND userId = request.userId
   - 204

5. Tests: mock SES client, mock Prisma. Assert:
   - mention job → 1 Notification row created, sendEmail called once
   - SES failure → BullMQ retries (assert worker attempts < 3)
   - /notifications/unread returns only the requesting user's notifications
```

---

## Phase 11 — Frontend Shell & State Management

### Task 11.1 — HitlModuleProvider, Zustand Store Slices & Bootstrap Sequence

**Objective:** Build the React application shell with all Zustand store slices and the 9-step bootstrap sequence that gates document rendering on font load completion.

**Inputs:** Technical Architecture §4.1; Functional Specification §1, §3

**Acceptance criteria:**
- All 5 Zustand store slices match the interfaces in `packages/shared-types` exactly
- Document rendering is blocked until `fontsLoaded === true` (verified by test)
- Bootstrap failure at any step renders an error boundary with a retry button
- The loading screen displays a step-specific progress message

**Claude Code prompt:**
```
Read docs/HITL_Module_Technical_Architecture_Specification_v1.0.md section 4.1 in full —
every bootstrap step, every Zustand slice interface, and the font-blocking requirement.
Read packages/shared-types/src/index.ts for all interfaces.

Navigate to apps/web/src/.

1. store/sessionSlice.ts — createSessionSlice using Zustand slice pattern:
   State: sessionId, documentId, currentUser (User type), permissions (Permission[]), reviewState
   Actions: setSession(session), setReviewState(state), setPermissions(perms)

2. store/documentSlice.ts:
   State: epubUrl (string), sourceFormat, currentLocation (string CFI), currentChapter (string),
   conversionManifest (ConversionManifest | null), versionHistory (DocumentVersion[])
   Actions: setEpubUrl, setCurrentLocation, setCurrentChapter, setConversionManifest, setVersionHistory

3. store/annotationSlice.ts:
   State: annotations (Annotation[]), focusedAnnotationId (string | null),
   filterState (AnnotationFilter type you define), resolvedCount (number), totalCriticalCount (number)
   Actions: setAnnotations, addAnnotation, updateAnnotation, resolveAnnotation(id, decision),
   setFocusedAnnotation(id), setFilter(filter)
   Computed getter: sortedCriticalFlags — annotations filtered to CRITICAL_FLAG type,
   sorted by cfi string lexicographically

4. store/presenceSlice.ts:
   State: activeUsers (PresenceUser[]), cursorPositions (Record<string, string>)
   Actions: setActiveUsers, updateCursorPosition(userId, cfi)

5. store/fontSlice.ts:
   State: fontProfile (FontProfile | null), fontsLoaded (boolean), fontLoadError (boolean)
   Actions: setFontProfile, setFontsLoaded, setFontLoadError

6. store/index.ts — combine all slices:
   export const useStore = create<AllSlices>()(immer((...args) => ({
     ...createSessionSlice(...args), ...createDocumentSlice(...args),
     ...createAnnotationSlice(...args), ...createPresenceSlice(...args),
     ...createFontSlice(...args),
   })));
   Export named selector hooks: useSession, useDocument, useAnnotations, usePresence, useFonts

7. lib/fonts.ts:
   export async function preloadFonts(profile: FontProfile): Promise<void>
   Exact implementation from §4.8:
   - document.fonts.load(`16px "${family}"`) for each of the 3 font families
   - Promise.allSettled() (never rejects)
   - await document.fonts.ready
   - setFontsLoaded(true)
   - On any font failure: setFontLoadError(true), log audit event fire-and-forget

8. providers/HitlModuleProvider.tsx:
   Props: { sessionId: string, children: ReactNode }
   - Local state: bootstrapStep (0–9), bootstrapError (Error | null)
   - Async bootstrap function: execute steps 1–9 from §4.1 in sequence
     Step 2: GET /api/config/font-profile → setFontProfile
     Step 3: GET /api/sessions/:sessionId → setSession
     Step 4–5: preloadFonts(profile)
     Step 6: GET /api/documents/:docId/epub → setEpubUrl
     Steps 7–9: epub.js Book.open (handled by EpubViewer in Phase 12)
   - Block rendering children while bootstrapStep < 6 OR fontsLoaded === false
   - On any step error: setBootstrapError(err)
   - Wrap children in React ErrorBoundary

9. components/BootstrapLoader.tsx:
   Props: { step: number }
   - Progress bar: value={step} max={9}
   - Messages: step 2 "Loading configuration...", 3 "Loading session...",
     4 "Loading fonts...", 5 "Fonts ready", 6 "Fetching document...",
     7–9 "Opening document..."

10. Tests (Vitest + React Testing Library, mock all fetch calls):
    - Children not rendered before fontsLoaded=true
    - Children render after all steps complete
    - Error boundary visible on step 3 failure
    - preloadFonts calls document.fonts.load for all 3 families
```

---

## Phase 12 — EPUB Rendering Engine & Font System

### Task 12.1 — EpubViewer Component & Platform Stylesheet Injection

**Objective:** Build the EpubViewer React component with epub.js, platform CSS injection, zoom/reflow modes, and side-by-side diff view.

**Inputs:** Technical Architecture §4.2, §4.8; Functional Specification §5.1.2

**Acceptance criteria:**
- An EPUB URL renders the first chapter with the platform font stylesheet applied
- `!important` overrides in the injected stylesheet are confirmed by DOM computed style assertions
- Zoom level change from 100% to 150% scales content without breaking annotation coordinates
- Side-by-side diff view mounts two synchronised renditions
- CFI location persists to sessionStorage on every chapter change

**Claude Code prompt:**
```
Read docs/HITL_Module_Technical_Architecture_Specification_v1.0.md sections 4.2 and 4.8 —
every code sample and every styling rule exactly.
Read docs/HITL_Module_Functional_Specification_v1.1.md section 5.1.2 for preview pane capabilities.

Navigate to apps/web/src/. Install: epubjs (npm install epubjs).

1. lib/platform-stylesheet.ts:
   export function buildPlatformStylesheet(profile: FontProfile): string
   - Generate the exact CSS from §4.2:
     :root variables, body/p/li/td/th/span !important override,
     h1–h6 !important override, pre/code/samp !important override,
     thead th sticky + font-weight
   - Substitute CSS custom property values from profile.config fields
   
   export function getPlatformStylesheetUrl(profile: FontProfile): string
   - Create Blob URL: URL.createObjectURL(new Blob([css], { type: 'text/css' }))
   - Cache per profile.id in a Map<string, string>

2. components/EpubViewer/EpubViewer.tsx:
   Props interface EpubViewerProps:
   { epubUrl, initialCfi?, zoomLevel (50-200, default 100), zoomMode: 'fixed'|'reflow',
     diffMode?: boolean, diffEpubUrl?: string,
     onLocationChange: (cfi: string, chapter: string) => void,
     onSelectionChange: (cfi: string, text: string) => void }
   
   - containerRef, diffContainerRef (for diff mode)
   - bookRef, renditionRef, diffRenditionRef
   
   On mount (useEffect):
   - const book = Epub(epubUrl)
   - const rendition = book.renderTo(containerRef.current, { width:'100%', height:'100%', spread:'none',
       flow: zoomMode === 'reflow' ? 'scrolled-doc' : 'paginated' })
   - rendition.hooks.content.register((contents) => {
       contents.addStylesheet(getPlatformStylesheetUrl(fontProfile))
       // Inject selection listener (see AnnotationOverlay phase)
     })
   - rendition.on('relocated', (location) => {
       onLocationChange(location.start.cfi, location.start.href)
       sessionStorage.setItem(`hitl:location:${documentId}`, location.start.cfi)
     })
   - rendition.on('selected', (cfi, contents) => {
       const text = contents.window.getSelection()?.toString() || ''
       onSelectionChange(cfi, text)
     })
   - rendition.display(initialCfi || undefined)
   
   If diffMode && diffEpubUrl:
   - const diffBook = Epub(diffEpubUrl)
   - const diffRendition = diffBook.renderTo(diffContainerRef.current, same options)
   - Synchronise: rendition.on('relocated', loc => diffRendition.display(loc.start.cfi))
   
   Zoom effect (useEffect on [zoomLevel, zoomMode]):
   - Fixed mode: apply CSS transform scale(zoomLevel/100) to containerRef.current
   - Reflow mode: rendition.themes.override('font-size', `${zoomLevel}%`)
   
   Expose imperative handle via useImperativeHandle(ref):
   { navigate(cfi), getCurrentCfi(), getTextByCfi(cfi) }

3. components/EpubViewer/useEpubLocation.ts:
   export function useEpubLocation(documentId: string):
   { savedCfi: string | null, saveLocation(cfi: string): void }
   - sessionStorage key: 'hitl:location:{documentId}'

4. pages/DocumentPage.tsx (create or update):
   - Read epubUrl, sourceFormat, currentLocation from useDocument()
   - Render <EpubViewer epubUrl={epubUrl} initialCfi={currentLocation} ... />
   - onLocationChange → dispatch setCurrentLocation and setCurrentChapter
   - onSelectionChange → local useState selectionState { cfi, text }

5. Tests (Vitest + jsdom, mock epubjs):
   - Stylesheet injection called with correct CSS on mount
   - onLocationChange fired with correct CFI when relocated event fires
   - sessionStorage written on location change
   - Zoom useEffect applies transform scale correctly
```

---

## Phase 13 — Annotation Overlay

### Task 13.1 — SVG Overlay, CFI-to-Rect Resolution & Selection Toolbar

**Objective:** Build the AnnotationOverlay SVG layer with correct coordinate translation, all annotation type renderings, relocation redraw, and the selection-to-annotation toolbar.

**Inputs:** Technical Architecture §4.3; Functional Specification §5.2.1

**Acceptance criteria:**
- Each annotation type renders the correct SVG element with the correct fill colour from §4.3
- The overlay redraws correctly on `relocated` event with accurate rect coordinates
- The focused annotation pulses with a CSS keyframe animation
- Selecting text in the EPUB triggers the SelectionToolbar with Add Comment, Flag, Suggest Edit buttons
- `pointer-events: none` on the SVG canvas allows text selection through it

**Claude Code prompt:**
```
Read docs/HITL_Module_Technical_Architecture_Specification_v1.0.md section 4.3 completely —
the DOM tree diagram, the cfiToScreenRects function, the annotation type rendering table,
and the selection-to-CFI mechanism via postMessage.
Read packages/shared-types/src/index.ts for Annotation and AnnotationType.

Navigate to apps/web/src/components/AnnotationOverlay/.

1. cfi-utils.ts:
   export function cfiToScreenRects(cfi: string, rendition: any): DOMRect[]
   - Implementation exactly as in §4.3:
     rendition.getRange(cfi) → range.getClientRects() → translate by iframeRect
   - Return [] if range is null

2. AnnotationOverlay.tsx:
   Props: { annotations: Annotation[], rendition: any | null,
     focusedAnnotationId: string | null, onAnnotationClick: (id: string) => void }
   
   State: rects Map<string, DOMRect[]>
   
   redrawAll():
   - For each annotation: cfiToScreenRects(annotation.cfi, rendition) → store in rects
   - Single batch setState
   
   useEffect([annotations, rendition]):
   - Register rendition.on('relocated', redrawAll)
   - Call redrawAll() immediately
   - Cleanup: rendition.off('relocated', redrawAll)
   
   Render:
   <div style={{ position:'absolute', inset:0, pointerEvents:'none', zIndex:10 }}>
     <svg width="100%" height="100%">
       {annotations.map(ann => {
         const annRects = rects.get(ann.id) || []
         return annRects.map((rect, i) => (
           <g key={i} style={{ pointerEvents:'all', cursor:'pointer' }}
              onClick={() => onAnnotationClick(ann.id)}>
             {renderAnnotationShape(ann, rect, ann.id === focusedAnnotationId)}
           </g>
         ))
       })}
     </svg>
   </div>
   
   renderAnnotationShape(annotation, rect, isFocused):
   - critical_flag: <rect x y width height fill="rgba(239,68,68,0.25)" className={isFocused?'annotation-pulse':''}/>
   - attention_marker: <rect ... fill="rgba(251,191,36,0.25)" />
   - validation_notice: left-margin <line> + <circle> (blue, x=8 from left, y=rect.top+rect.height/2)
   - human_comment: <rect> with stroke only (underline style) + comment icon SVG path in right margin
   - edit_suggestion: <rect> with red fill + horizontal <line> through center (strikethrough)
   - resolved: <rect ... fill="rgba(156,163,175,0.15)" />
   Add CSS in global stylesheet: @keyframes annotation-pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }

3. Update EpubViewer.tsx (from Phase 12):
   In rendition.hooks.content.register callback, ALSO inject:
   const scriptContent = `
     document.addEventListener('selectionchange', function() {
       var sel = document.getSelection();
       if (!sel || sel.isCollapsed) return;
       var range = sel.getRangeAt(0);
       parent.postMessage({ type: 'EPUB_SELECTION', rangeText: sel.toString() }, '*');
     });
   `;
   contents.document.head.insertAdjacentHTML('beforeend', '<script>' + scriptContent + '</script>');
   
   In EpubViewer component: listen to window 'message' event; on type='EPUB_SELECTION':
   call onSelectionChange with the CFI (use rendition.currentLocation().start.cfi as approximation)
   and the rangeText.

4. SelectionToolbar.tsx:
   Props: { selectionCfi: string | null, selectionText: string | null,
     documentId: string, onDismiss: () => void }
   - Float above selection using a fixed-position div (top: selectionAnchorY - 48px)
   - Buttons: 'Comment' (type=HUMAN_COMMENT), 'Flag' (type=CRITICAL_FLAG), 'Suggest Edit' (type=EDIT_SUGGESTION)
   - On button click: POST /documents/:id/annotations with correct type and CFI
   - After POST success: call onDismiss()
   - Show only when selectionCfi is not null

5. Tests: renderAnnotationShape produces correct SVG for each type,
   cfiToScreenRects translates iframe coords correctly (mock getBoundingClientRect),
   AnnotationOverlay calls redrawAll on relocated event.
```

---

## Phase 14 — Attention Panel

### Task 14.1 — Virtualised List, Jump Navigation & Progress Bar

**Objective:** Build the Attention Panel with virtualised annotation list, keyboard navigation shortcuts, jump-to-annotation, and filtering.

**Inputs:** Technical Architecture §4.4; Functional Specification §5.2.2

**Acceptance criteria:**
- 500 annotations render without DOM bloat (≤ 20 nodes in the list at any time)
- Clicking an annotation calls `rendition.display(cfi)` and focuses it in the overlay
- `Ctrl+]` / `Ctrl+[` cycle through critical flags; wraps at list boundaries
- Progress bar updates accurately in real time as annotations are resolved

**Claude Code prompt:**
```
Read docs/HITL_Module_Technical_Architecture_Specification_v1.0.md section 4.4 in full.
Read docs/HITL_Module_Functional_Specification_v1.1.md section 5.2.2.
Read packages/shared-types/src/index.ts for Annotation, AnnotationType.

Navigate to apps/web/src/components/AttentionPanel/.
Install in apps/web: @tanstack/react-virtual@3, react-hotkeys-hook@4.

1. annotation-sorter.ts:
   export function sortAnnotations(annotations: Annotation[]): Annotation[]
   Priority: CRITICAL_FLAG=0, ATTENTION_MARKER=1, others=2
   Within priority: sort by cfi string (lexicographic EPUB CFI ordering)

2. AnnotationFilter type:
   { type: AnnotationType | 'all', initiator: 'human' | 'ai' | 'all',
     status: 'open' | 'resolved' | 'all', fromDate?: Date, toDate?: Date }
   
   export function matchesFilter(ann: Annotation, filter: AnnotationFilter): boolean

3. AttentionPanel.tsx:
   Props: { rendition: any | null }
   
   - Read from useAnnotations(): annotations, focusedAnnotationId, filterState, resolvedCount, totalCriticalCount
   - Read from useStore: setFocusedAnnotation
   - sortedAnnotations = sortAnnotations(annotations).filter(a => matchesFilter(a, filterState))
   - virtualizer = useVirtualizer({ count: sortedAnnotations.length, getScrollElement: () => scrollRef.current, estimateSize: () => 72 })
   
   Render:
   - Panel header with title and <FilterBar> (collapsible)
   - <ProgressBar resolved={resolvedCount} total={totalCriticalCount} />
   - Scroll container ref={scrollRef}:
       virtualizer.getVirtualItems().map(vRow =>
         <AnnotationItem key={sortedAnnotations[vRow.index].id}
           annotation={sortedAnnotations[vRow.index]}
           isFocused={sortedAnnotations[vRow.index].id === focusedAnnotationId}
           style={{ position:'absolute', top:vRow.start, height:vRow.size }}
           onClick={() => handleAnnotationClick(sortedAnnotations[vRow.index])} />)

   handleAnnotationClick(annotation):
   - setFocusedAnnotation(annotation.id)
   - rendition?.display(annotation.cfi)

4. AnnotationItem.tsx:
   Props: { annotation, isFocused, onClick, style }
   - Type badge: coloured dot (red/amber/blue/grey based on type)
   - Excerpt: annotation.cfiText?.slice(0,80) || '(no text)'
   - Author: annotation.authorId ? 'User' : 'AI Agent' (resolve name via session store)
   - Date: relative time string (e.g. "2 hours ago")
   - Status badge: OPEN/RESOLVED/REJECTED in colour
   - If isFocused: ring border

5. ProgressBar.tsx:
   Props: { resolved: number, total: number }
   - <progress value={resolved} max={total || 1} aria-label={`${resolved} of ${total} critical items resolved`}>
   - Text: "{resolved} of {total} critical items resolved"
   - If resolved === total && total > 0: show green checkmark icon

6. useAnnotationNavigation.ts:
   - Get sortedCriticalFlags = sortAnnotations(annotations).filter(type===CRITICAL_FLAG)
   - Local state: currentIndex (starts at focused annotation's index)
   - useHotkeys('ctrl+]', () => { next index (mod length); setFocusedAnnotation; rendition.display(cfi) })
   - useHotkeys('ctrl+[', () => { prev index (mod length); ... })

7. FilterBar.tsx:
   - Dropdowns for type (all/critical_flag/attention_marker/.../), initiator (all/human/ai), status (all/open/resolved)
   - Date range inputs
   - On change: dispatch setFilter action in annotationSlice

8. Tests: sort order (CRITICAL_FLAG first), virtualizer renders only visible items (assert DOM node count),
   keyboard nav wraps at boundaries, matchesFilter all cases.
```

---

## Phase 15 — AI Interaction Panel

### Task 15.1 — SSE Streaming, Quick Actions, Citations & Edit Suggestions

**Objective:** Build the AI Interaction Panel with streaming responses, quick action toolbar, selection context injection, KB citation links, and edit suggestion diff view.

**Inputs:** Technical Architecture §4.5; Functional Specification §5.3

**Acceptance criteria:**
- Streaming tokens appear incrementally in the message area via react-markdown
- `[DONE]` metadata renders confidence badge and clickable citation links
- An edit suggestion in the metadata renders DiffView with Accept/Reject buttons
- Accepting an edit POSTs a new annotation and triggers EPUB reload
- Quick action buttons set `quickAction` field and submit immediately when selection is active

**Claude Code prompt:**
```
Read docs/HITL_Module_Technical_Architecture_Specification_v1.0.md section 4.5 completely —
the AiQueryPayload interface, the streaming generator, edit suggestion acceptance flow.
Read docs/HITL_Module_Functional_Specification_v1.1.md sections 5.3.1 and 5.3.2.
Read packages/shared-types/src/index.ts for AiQueryPayload.

Navigate to apps/web/src/components/AiPanel/.
Install in apps/web: react-markdown@9, remark-gfm, diff-match-patch@1.

1. hooks/useAiStream.ts:
   async function* streamAiResponse(payload: AiQueryPayload, signal: AbortSignal)
   - Exact implementation from §4.5 using fetch ReadableStream + TextDecoder
   - Yield each decoded chunk
   - Last chunk contains '[DONE] {...}' — detect with startsWith('[DONE]')
   
   interface AiMessage { id: string, role: 'user'|'assistant', content: string, metadata?: AiResponseMetadata }
   interface AiResponseMetadata { confidence?: string, citations?: {sourceId:string}[], editSuggestion?: {unifiedDiff:string}, kbUnavailable?: boolean }
   
   export function useAiStream() {
     const [messages, setMessages] = useState<AiMessage[]>([])
     const [isStreaming, setIsStreaming] = useState(false)
     
     async function submitQuery(payload: AiQueryPayload) {
       setIsStreaming(true)
       // Append user message
       // Create empty assistant message
       // Stream chunks: append to assistant message content
       // On [DONE]: parse metadata, update assistant message metadata
       setIsStreaming(false)
     }
     
     return { messages, isStreaming, submitQuery, clearMessages: () => setMessages([]) }
   }

2. AiPanel.tsx:
   Props: { documentId: string, selectionContext: { cfi: string, text: string } | null }
   
   - useAiStream()
   - Local state: inputText, selectedQuickAction
   
   Render:
   - Panel header: "AI Assistant" + clear button
   - Quick action toolbar (5 buttons as specified in §5.3.2):
       Clicking sets quickAction AND auto-submits if selectionContext is present
       If no selection: clicking pre-fills a prompt prefix in inputText
   - Selection chip: if selectionContext, show truncated text chip with × dismiss button
   - Message thread: map messages → <AiMessage message={m} documentId={documentId} />
   - Input: <textarea> disabled while isStreaming + Send button
   
   handleSubmit():
   - Build AiQueryPayload: { sessionId, documentId, userQuery: inputText, selectionContext, quickAction }
   - submitQuery(payload)
   - Clear inputText

3. AiMessage.tsx:
   Props: { message: AiMessage, documentId: string }
   
   For assistant messages:
   - <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
   - If metadata?.confidence: <ConfidenceBadge level={metadata.confidence} />
   - If metadata?.citations?.length: <CitationList citations={metadata.citations} />
   - If metadata?.editSuggestion: <DiffView diff={metadata.editSuggestion.unifiedDiff} documentId={documentId} />
   - If metadata?.kbUnavailable: amber banner with warning text

4. DiffView.tsx:
   Props: { diff: string, documentId: string }
   - Parse unified diff: lines starting with '+' are additions (green), '-' are deletions (red),
     ' ' are context (default)
   - Render as monospace code block with coloured lines
   - Accept button: POST /documents/{documentId}/annotations { type: 'EDIT_SUGGESTION', payload: { unifiedDiff: diff, proposedText: addedLines.join(''), originalText: removedLines.join(''), confidence: 'Medium' } }
   - Reject button: show confirmation then dismiss

5. ConfidenceBadge.tsx: High=green, Medium=amber, Low=red pill badge
   CitationList.tsx: list of clickable links; onClick opens KB source URL (construct from sourceId)

6. Tests: streaming accumulation (mock fetch generator), [DONE] metadata parsing,
   DiffView renders correct line colours, Accept posts correct annotation payload.
```

---

## Phase 16 — Collaboration & Presence UI

### Task 16.1 — Socket.IO Client, Avatar Stack & EPUB Reload on Conversion

**Objective:** Build the collaboration UI with Socket.IO connection management, the presence avatar stack, and EPUB reload triggered by the `epub:updated` event.

**Inputs:** Technical Architecture §4.6; Functional Specification §5.4.3

**Acceptance criteria:**
- Second user's avatar appears in the stack within 500ms of joining
- Clicking another user's avatar calls `rendition.display(user.currentCfi)`
- `epub:updated` event causes epub.js rendition to reload the new EPUB URL at the same CFI
- Connection loss shows an amber toast; reconnection clears it

**Claude Code prompt:**
```
Read docs/HITL_Module_Technical_Architecture_Specification_v1.0.md section 4.6 in full.
Read packages/shared-types/src/events.ts for SOCKET_EVENTS.
Read packages/shared-types/src/index.ts for PresenceUser.

Navigate to apps/web/src/.
Install in apps/web: socket.io-client@4.

1. lib/socket.ts:
   let _socket: Socket | null = null
   export function initSocket(token: string): Socket
   - If _socket is connected: return _socket
   - Create io(VITE_COLLAB_URL, { auth: { token }, reconnectionAttempts: Infinity, reconnectionDelay: 1000 })
   - Store in _socket; return
   export function getSocket(): Socket { return _socket! }
   export function useSocket(): Socket { ... }

2. hooks/useCollaboration.ts:
   export function useCollaboration(params: { sessionId: string, documentId: string, rendition: any | null })
   
   On mount:
   - socket = initSocket(jwtToken from sessionSlice)
   - socket.emit(SOCKET_EVENTS.PRESENCE_JOIN, { sessionId, userId, displayName, avatarUrl })
   - socket.on(SOCKET_EVENTS.PRESENCE_UPDATE, users => setActiveUsers(users))
   - socket.on(SOCKET_EVENTS.CURSOR_POSITIONS, positions => { for (userId, cfi) of Object.entries(positions) updateCursorPosition(userId, cfi) })
   - socket.on(SOCKET_EVENTS.ANNOTATION_SYNC, annotation => addAnnotation(annotation) or updateAnnotation(annotation))
   - socket.on(SOCKET_EVENTS.EPUB_UPDATED, async ({ documentId: dId, epubS3Key }) => {
       if (dId !== documentId) return
       const { signedUrl } = await fetch(`/api/documents/${documentId}/epub`).then(r=>r.json())
       const currentCfi = rendition?.currentLocation()?.start?.cfi
       await rendition?.book?.open(signedUrl)
       if (currentCfi) rendition?.display(currentCfi)
     })
   - socket.on('disconnect', () => showToast('Connection lost...', 'warning'))
   - socket.on('reconnect', () => dismissToast())
   
   Cursor emit (throttled to 100ms):
   - rendition?.on('relocated', throttle((location) => {
       socket.emit(SOCKET_EVENTS.CURSOR_UPDATE, { sessionId, userId, cfi: location.start.cfi })
     }, 100))
   
   On unmount: socket.disconnect()

3. components/Toolbar/PresenceAvatarStack.tsx:
   Props: { rendition: any | null }
   - activeUsers from usePresence()
   - Show first 5; "+N more" if >5
   - Each: <button aria-label={`Go to ${user.displayName}'s position`}
               onClick={() => rendition?.display(user.currentCfi)}>
               <img src={user.avatarUrl} title={user.displayName} />
             </button>
   - Self user: add ring ring-blue-500 Tailwind class
   - Tooltip: displayName + "· " + relativeTime(user.lastSeenAt)

4. Wire useCollaboration into DocumentPage.tsx.
   Wire PresenceAvatarStack into the Toolbar component.

5. Tests (mock socket.io-client):
   - presence:update updates Zustand activeUsers
   - epub:updated triggers fetch and rendition.book.open (mock both)
   - Cursor throttle: 10 emits in 40ms → socket.emit cursor called ≤ 2 times
   - disconnect → toast called with 'warning'
```

---

## Phase 17 — Document Editing Overlays

### Task 17.1 — Markdown Editor with Live Preview & XLSX Cell Editor

**Objective:** Build the Markdown split-pane editor with CodeMirror 6 and live EPUB-styled preview, plus the XLSX cell editing overlay that coordinates with the EPUB table view.

**Inputs:** Technical Architecture §4.7; Functional Specification §5.5.1, §5.5.3

**Acceptance criteria:**
- Markdown preview updates within 150ms of typing (debounced)
- Autosave fires every 30 seconds and on `Cmd+S`; status indicator shows Saving/Saved/Failed
- Clicking a table cell in the XLSX EPUB view mounts a floating CellEditor at the exact cell position
- Accepting a cell edit POSTs to `/documents/:id/cells` and EPUB reloads via `epub:updated`
- Version history panel shows all versions; clicking one loads the historical EPUB

**Claude Code prompt:**
```
Read docs/HITL_Module_Technical_Architecture_Specification_v1.0.md section 4.7 fully —
the CodeMirror extensions, the 150ms debounce, the XLSX cell edit flow, and the
DOCX tracked changes TextEdit interface.
Read docs/HITL_Module_Functional_Specification_v1.1.md sections 5.5.1, 5.5.3, 5.5.6.

Navigate to apps/web/src/components/DocumentEditing/.
Install in apps/web: @codemirror/lang-markdown, @codemirror/language, @codemirror/commands,
@codemirror/view, @codemirror/state, remark, remark-gfm, rehype-react, rehype-parse.

1. MarkdownEditor.tsx:
   Props: { documentId: string, initialContent: string }
   Only rendered when sourceFormat === 'md'.
   
   - Left pane: CodeMirror 6 editor with extensions from §4.7:
     markdown({ base: markdownLanguage }), syntaxHighlighting(defaultHighlightStyle),
     EditorView.updateListener.of(handleChange), keymap.of([...defaultKeymap, indentWithTab])
   - handleChange: debounce 150ms → call renderPreview(value)
   - renderPreview: remark().use(remarkGfm).process(md) → rehype → React nodes
     Render in right pane inside a <div className="epub-preview"> with inline style
     applying platform font CSS (body font family, line height from fontProfile)
   - Autosave: useEffect setInterval(saveDraft, 30000)
     saveDraft: PATCH /documents/:id/content { markdown: value }
     Show status: 'idle' | 'saving' | 'saved' | 'error' → display label
   - useHotkeys('meta+s, ctrl+s', () => saveDraft())
   - Emit audit event edit.applied on explicit save

2. useXlsxCellInteraction.ts:
   export function useXlsxCellInteraction(rendition: any | null, documentId: string)
   Returns: { cellEditorState: CellEditorState | null, closeCellEditor: () => void }
   
   CellEditorState: { sheetName: string, row: number, col: number,
     currentValue: string, anchorRect: DOMRect }
   
   On mount with rendition:
   - Inject click listener into iframe via rendition.hooks.content (or use rendition.on('click')):
       Listen for clicks on <td> elements with data-row and data-col attributes
       Extract data-row, data-col, innerText, getBoundingClientRect()
       Translate rect to parent coords (same pattern as annotation overlay)
       Set cellEditorState
       Stop event propagation to prevent text selection
   
   closeCellEditor: () => setCellEditorState(null)

3. XlsxCellEditor.tsx:
   Props: { state: CellEditorState, documentId: string, onClose: () => void }
   - Portal to document.body
   - Position: fixed at { left: state.anchorRect.left, top: state.anchorRect.top }
   - Input pre-filled with state.currentValue
   - On Enter / blur with changed value:
       POST /documents/:id/cells { sheetName, row, col, value }
       Show spinner during POST
       On success: onClose() (EPUB will reload via epub:updated Socket.IO event from useCollaboration)
   - On Escape: onClose() without saving
   - On error: show inline error message

4. VersionHistoryPanel.tsx:
   Props: { documentId: string, rendition: any | null }
   - useQuery: GET /documents/:id/versions (TanStack Query, refetch on window focus)
   - List of versions: versionNumber, createdAt (relative), createdBy
   - Active version (from documentSlice.currentVersionId): highlighted with checkmark
   - On version click:
       GET /documents/:id/versions/:vId/epub → signedUrl
       rendition?.book?.open(signedUrl)
       dispatch setCurrentLocation('')  (go to start)

5. Wire into DocumentPage.tsx:
   - if sourceFormat === 'md': render MarkdownEditor in left-split layout
   - if sourceFormat === 'xlsx': attach useXlsxCellInteraction(rendition, documentId);
     render <XlsxCellEditor> when cellEditorState is set
   - Always: render VersionHistoryPanel in AttentionPanel's "Versions" tab

6. Tests: autosave interval fires after 30s (use fake timers), Cmd+S triggers immediate save,
   XlsxCellEditor positions at anchorRect.left/top, cell POST body matches state,
   VersionHistoryPanel click fetches correct signed URL.
```

---

## Phase 18 — Integration & E2E Testing

### Task 18.1 — Playwright E2E Suite for All 5 Key Flows

**Objective:** Write the complete Playwright E2E test suite covering all 5 user flows from the architecture document, fully isolated and runnable in CI.

**Inputs:** Technical Architecture §11.3; Functional Specification §5.1–§5.7

**Acceptance criteria:**
- All 5 flows pass against a locally running docker-compose stack
- Tests run in under 5 minutes on 4 Playwright workers
- Each test is self-contained — creates its own document, session, and annotations via API

**Claude Code prompt:**
```
Read docs/HITL_Module_Technical_Architecture_Specification_v1.0.md section 11.3 for all 5
E2E flows. Read each flow's steps carefully.

Navigate to apps/web/. Install: @playwright/test. Run: npx playwright install chromium.

Create playwright.config.ts:
- baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173'
- workers: 4
- retries: 1 (CI), 0 (local) — detect via process.env.CI
- reporter: [['html'], ['github']] in CI; [['list']] locally
- globalSetup: './e2e/global-setup.ts'

e2e/global-setup.ts:
- POST http://localhost:3001/auth/seed-test-data (a test-only endpoint added to document-storage
  that creates: 1 test tenant, 1 reviewer user, 1 platform admin user)
- Store credentials in process.env.TEST_REVIEWER_TOKEN, process.env.TEST_ADMIN_TOKEN

e2e/fixtures/api.ts — typed helper:
export async function uploadDocument(token: string, filePath: string): Promise<{ documentId: string }>
export async function waitForEpubReady(token: string, documentId: string, maxWaitMs=30000): Promise<string>
export async function createAnnotation(token: string, documentId: string, annotation: object): Promise<string>

e2e/tests/01-upload-and-render.spec.ts — Flow 1:
test('Upload DOCX renders with correct fonts', async ({ page }) => {
  const { documentId } = await uploadDocument(TEST_REVIEWER_TOKEN, 'fixtures/sample.docx')
  await waitForEpubReady(TEST_REVIEWER_TOKEN, documentId)
  await page.goto(`/documents/${documentId}`)
  await page.waitForSelector('[data-testid="epub-viewer"] iframe')
  const fontFamily = await page.evaluate(() => {
    const iframe = document.querySelector('[data-testid="epub-viewer"] iframe') as HTMLIFrameElement
    const body = iframe?.contentDocument?.body
    return body ? window.getComputedStyle(body).fontFamily : ''
  })
  expect(fontFamily).toContain('Inter')
})

e2e/tests/02-critical-flag-resolution.spec.ts — Flow 2:
test('Critical flag blocks approval until resolved', async ({ page }) => {
  const { documentId } = await uploadDocument(...)
  await waitForEpubReady(...)
  const flagId = await createAnnotation(TOKEN, documentId, { type: 'CRITICAL_FLAG', cfi: 'epubcfi(/6/4!)', ... })
  await page.goto(`/documents/${documentId}`)
  await expect(page.locator('[data-annotation-type="critical_flag"]')).toBeVisible()
  await expect(page.locator('[data-testid="progress-bar"]')).toHaveText(/0 of 1/)
  await page.locator('[data-annotation-id="' + flagId + '"]').click()
  await page.locator('[data-testid="resolve-button"]').click()
  await expect(page.locator('[data-testid="progress-bar"]')).toHaveText(/1 of 1/)
  const approveRes = await page.request.post(`/api/documents/${documentId}/approve`, { data: { decision: 'approved' } })
  expect(approveRes.status()).toBe(200)
})

e2e/tests/03-ai-compliance-check.spec.ts — Flow 3:
test('AI compliance check streams and shows citations', async ({ page }) => {
  ... navigate, wait for render, click "Compliance" quick action button ...
  await expect(page.locator('[data-testid="ai-panel-stream"]')).not.toBeEmpty()
  await page.waitForSelector('[data-testid="confidence-badge"]', { timeout: 30000 })
  await expect(page.locator('[data-testid="confidence-badge"]')).toBeVisible()
})

e2e/tests/04-xlsx-cell-edit.spec.ts — Flow 4:
test('XLSX cell edit triggers EPUB reload', async ({ page }) => {
  ... upload XLSX, wait for conversion, navigate ...
  await page.waitForSelector('[data-testid="epub-viewer"] iframe td[data-row="2"]')
  await page.frameLocator('[data-testid="epub-viewer"] iframe').locator('td[data-row="2"][data-col="1"]').click()
  await expect(page.locator('[data-testid="cell-editor"]')).toBeVisible()
  await page.locator('[data-testid="cell-editor"] input').fill('UPDATED')
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => /* iframe reloaded with new EPUB */)
  await expect(page.frameLocator('[data-testid="epub-viewer"] iframe').locator('td[data-row="2"][data-col="1"]')).toHaveText('UPDATED')
})

e2e/tests/05-font-profile-change.spec.ts — Flow 5:
test('Font profile change applies to new sessions', async ({ browser }) => {
  ... admin context: navigate to /admin/typography, activate Accessibility profile ...
  const userCtx = await browser.newContext({ storageState: reviewerStorageState })
  const page2 = await userCtx.newPage()
  await page2.goto(`/documents/${documentId}`)
  await page2.waitForSelector('[data-testid="epub-viewer"] iframe')
  const font = await page2.evaluate(() => { ... getComputedStyle ... })
  expect(font).toContain(ACCESSIBILITY_FONT_FAMILY)
})

Create e2e/fixtures/sample.docx using a seeded binary file (commit a minimal DOCX to the repo).
Create e2e/fixtures/sample.xlsx similarly.

Run: npx playwright test --dry-run to confirm syntax.
```

---

## Phase 19 — Performance Hardening

### Task 19.1 — Lazy Loading, Viewport Culling, Caching & Load Tests

**Objective:** Implement the performance optimisations from §10 of the architecture document to meet NFR targets: EPUB < 3s, XLSX conversion < 10s, AI stream start < 2s.

**Inputs:** Technical Architecture §10; Functional Specification §6 (NFRs)

**Acceptance criteria:**
- k6 load test: 200 VUs, P95 annotation create < 500ms, error rate < 1%
- EPUB load time < 3s for 10 MB file (measured via Playwright `page.metrics()`)
- Annotation SVG redraws in < 16ms for 200 annotations (measured with performance.mark)
- XLSX conversion cache hit rate > 50% for repeated formula evaluation (Redis INCR metric)

**Claude Code prompt:**
```
Read docs/HITL_Module_Technical_Architecture_Specification_v1.0.md section 10 in full
(all 4 subsections). Implement every optimisation described.

1. EPUB chapter pre-fetching (§10.1) — update EpubViewer.tsx:
   In the 'relocated' event handler, after calling onLocationChange:
   const currentIndex = book.spine.items.findIndex(i => i.href === location.start.href)
   ;[currentIndex+1, currentIndex+2].forEach(idx => {
     const item = book.spine.get(idx)
     if (item) requestIdleCallback(() => rendition.display(item.href).catch(() => {}))
   })
   // Note: this pre-fetches in the background without changing the displayed chapter

2. Annotation viewport culling (§10.3) — update AnnotationOverlay.tsx:
   Add prop: currentChapterHref: string
   In redrawAll(): 
   const [inViewport, offViewport] = partition(annotations, a => a.cfi.includes(currentChapterHref))
   // Resolve in-viewport annotations synchronously
   inViewport.forEach(ann => { rects.set(ann.id, cfiToScreenRects(ann.cfi, rendition)) })
   // Resolve off-viewport in idle time
   requestIdleCallback(() => {
     offViewport.forEach(ann => { rects.set(ann.id, cfiToScreenRects(ann.cfi, rendition)) })
     forceUpdate()  // trigger re-render with off-viewport rects now resolved
   }, { timeout: 1000 })
   
   Add performance marks:
   performance.mark('annotation-redraw-start')
   // ... redrawAll logic ...
   performance.mark('annotation-redraw-end')
   performance.measure('annotation-redraw', 'annotation-redraw-start', 'annotation-redraw-end')
   if (process.env.NODE_ENV === 'development') {
     const measure = performance.getEntriesByName('annotation-redraw').at(-1)
     if (measure && measure.duration > 16) console.warn(`Annotation redraw took ${measure.duration.toFixed(1)}ms`)
   }

3. Redis KB cache hit/miss counters (§10.4) — update services/ai-orchestration/src/kb_client.py:
   On cache hit: redis_client.incr('hitl:metrics:kb_cache_hits')
   On cache miss: redis_client.incr('hitl:metrics:kb_cache_misses')

4. BullMQ job deduplication — update services/epub-conversion/src/worker.py:
   Before processing a job, check Redis:
   dedup_key = f"hitl:conv:active:{job['documentId']}:{job['versionId']}"
   if redis_client.get(dedup_key):
       logger.info(f"Skipping duplicate conversion job for {dedup_key}")
       continue
   redis_client.setex(dedup_key, 300, '1')  # TTL 5 min
   # ... process job ...
   redis_client.delete(dedup_key)

5. Parallel chart rasterisation — update services/epub-conversion/src/converters/xlsx_epub_converter.py:
   In _convert_sheet, replace sequential chart processing with:
   from concurrent.futures import ThreadPoolExecutor
   with ThreadPoolExecutor(max_workers=4) as executor:
       chart_futures = { executor.submit(self._rasterise_chart, chart, chart_id): chart_id
                         for chart_id, chart in enumerate(ws._charts) }
       for future in chart_futures:
           chart_id = chart_futures[future]
           chart_png_bytes = future.result()
           # Add to epub book

6. k6 load test at tests/load/annotation-create.k6.js:
   import http from 'k6/http'
   import { check, sleep } from 'k6'
   export const options = {
     vus: 200, duration: '60s',
     thresholds: {
       'http_req_duration{name:annotation_create}': ['p(95)<500'],
       'http_req_failed': ['rate<0.01'],
     }
   }
   export default function() {
     const token = __ENV.TEST_TOKEN
     const docId = __ENV.TEST_DOCUMENT_ID
     const r = http.post(`${__ENV.API_URL}/documents/${docId}/annotations`,
       JSON.stringify({ type:'HUMAN_COMMENT', cfi:'epubcfi(/6/4!)', payload:{ body:'test', mentions:[] }, sessionId: __ENV.SESSION_ID, documentVersionId: __ENV.VERSION_ID }),
       { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, tags: { name:'annotation_create' } })
     check(r, { 'status is 201': r => r.status === 201 })
     sleep(0.1)
   }

7. Web Vitals reporting in apps/web/src/main.tsx:
   import { onCLS, onLCP, onTTFB, onFID } from 'web-vitals'
   ;[onCLS, onLCP, onTTFB, onFID].forEach(fn => fn(metric => {
     navigator.sendBeacon('/api/metrics', JSON.stringify({ name: metric.name, value: metric.value }))
   }))
```

---

## Phase 20 — Infrastructure & CI/CD

### Task 20.1 — Dockerfiles, Kubernetes Manifests & GitHub Actions

**Objective:** Create production-ready Dockerfiles for all services, Kubernetes manifests with KEDA autoscaling, and a GitHub Actions pipeline for CI and deployment.

**Inputs:** Technical Architecture §9.1, §9.2, §9.3; Functional Specification §6 (availability)

**Acceptance criteria:**
- `docker build` succeeds for every service Dockerfile without errors
- `kubectl apply --dry-run=client -k infra/k8s/overlays/staging/` passes with no validation errors
- GitHub Actions CI runs unit tests, Python tests, and builds Docker images on every PR
- KEDA ScaledObject for epub-conversion is valid YAML

**Claude Code prompt:**
```
Read docs/HITL_Module_Technical_Architecture_Specification_v1.0.md section 9 in full —
the KEDA ScaledObject YAML, resource limits (CPU 2 cores / Memory 4GB for epub-conversion),
and the graceful degradation table.

1. Create Dockerfiles in infra/docker/:

   Dockerfile.node — multi-stage for all Node.js services:
   FROM node:22-alpine AS builder
   WORKDIR /app
   COPY pnpm-workspace.yaml package.json ./
   COPY packages/ ./packages/
   COPY services/SERVICE_NAME/ ./services/SERVICE_NAME/
   RUN corepack enable && pnpm install --frozen-lockfile
   RUN pnpm --filter SERVICE_NAME build
   
   FROM node:22-alpine AS runner
   WORKDIR /app
   COPY --from=builder /app/services/SERVICE_NAME/dist ./dist
   COPY --from=builder /app/node_modules ./node_modules
   EXPOSE SERVICE_PORT
   HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:SERVICE_PORT/health || exit 1
   CMD ["node", "dist/index.js"]

   Create concrete Dockerfiles for each of 6 Node services substituting name and port:
   document-storage (3001), annotation-session (3003), collaboration (3004),
   audit-trail (3006), notification (3007), platform-config (3008)
   
   Dockerfile.python — multi-stage for Python services:
   FROM python:3.12-slim AS builder
   RUN apt-get update && apt-get install -y pandoc wget && rm -rf /var/lib/apt/lists/*
   WORKDIR /app
   COPY services/SERVICE_NAME/pyproject.toml services/SERVICE_NAME/poetry.lock ./
   RUN pip install poetry==1.8 && poetry config virtualenvs.create false && poetry install --no-dev
   COPY services/SERVICE_NAME/src ./src
   
   FROM python:3.12-slim AS runner
   COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
   COPY --from=builder /usr/local/bin/pandoc /usr/local/bin/pandoc
   COPY --from=builder /app/src ./src
   EXPOSE SERVICE_PORT
   HEALTHCHECK --interval=30s CMD curl -f http://localhost:SERVICE_PORT/health || exit 1
   CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "SERVICE_PORT"]

   Create: Dockerfile.epub-conversion (3002) and Dockerfile.ai-orchestration (3005)
   
   Dockerfile.web — for the React frontend:
   FROM node:22-alpine AS builder
   ... build Vite app ...
   FROM nginx:alpine AS runner
   COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
   COPY infra/docker/nginx.conf /etc/nginx/conf.d/default.conf

2. Create infra/k8s/base/ with manifests for each service:

   For each of the 8 services, create deployment.yaml:
   - 2 replicas
   - Resource requests: cpu:100m, memory:128Mi
   - Resource limits: cpu:500m, memory:512Mi (except epub-conversion: cpu:2000m, memory:4096Mi)
   - liveness probe: httpGet /health initialDelaySeconds:10 periodSeconds:30 failureThreshold:3
   - readiness probe: httpGet /health initialDelaySeconds:5 periodSeconds:10

   Create service.yaml for each: ClusterIP, port matching service port.
   
   Create infra/k8s/base/epub-conversion-scaler.yaml:
   The exact KEDA ScaledObject from §9.1 with minReplicaCount:2, maxReplicaCount:20,
   listLength:'5', listName:bull:epub-conversion:wait

   Create infra/k8s/base/kustomization.yaml listing all resources.
   
   Create infra/k8s/overlays/staging/kustomization.yaml:
   - bases: ../../base
   - patches: set replicas to 1 for all deployments except epub-conversion (keep 2)
   
   Create infra/k8s/overlays/production/kustomization.yaml:
   - replicas: 3 for all services, epub-conversion maxReplicaCount: 50

3. Create .github/workflows/ci.yml:
   name: CI
   on: [push, pull_request]
   
   jobs:
     node-unit-tests:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: pnpm/action-setup@v3 with { version: 9 }
         - uses: actions/setup-node@v4 with { node-version: 22, cache: pnpm }
         - run: pnpm install --frozen-lockfile
         - run: pnpm --filter "./services/!(epub-conversion|ai-orchestration)" run test
         - run: pnpm --filter apps/web run test
     
     python-unit-tests:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-python@v5 with { python-version: "3.12" }
         - run: pip install poetry
         - run: cd services/epub-conversion && poetry install && poetry run pytest -v
         - run: cd services/ai-orchestration && poetry install && poetry run pytest -v
     
     integration-tests:
       runs-on: ubuntu-latest
       needs: [node-unit-tests, python-unit-tests]
       services:
         postgres: { image: postgres:16, env: { POSTGRES_DB: hitl, POSTGRES_USER: hitl, POSTGRES_PASSWORD: hitl }, options: "--health-cmd pg_isready" }
         redis: { image: redis:7-alpine }
         minio: { image: minio/minio, ports: ["9000:9000"], env: { MINIO_ROOT_USER: minioadmin, MINIO_ROOT_PASSWORD: minioadmin }, command: server /data }
       steps:
         - run: cd services/document-storage && pnpm test:integration
         - run: cd services/annotation-session && pnpm test:integration
     
     build-docker-images:
       runs-on: ubuntu-latest
       needs: integration-tests
       steps:
         - uses: docker/build-push-action@v5
           with: { context: ., file: infra/docker/Dockerfile.{service}, push: ${{ github.ref == 'refs/heads/main' }}, tags: ghcr.io/org/hitl-{service}:${{ github.sha }} }
         # Repeat for each service

4. Create .github/workflows/deploy-staging.yml:
   on: { push: { branches: [main] } }
   needs: ci workflow passes
   steps:
     - Configure kubectl with staging kubeconfig (from GitHub Secret KUBE_CONFIG_STAGING)
     - kubectl apply -k infra/k8s/overlays/staging/
     - kubectl set image deployment/document-storage document-storage=ghcr.io/org/hitl-document-storage:$GITHUB_SHA

After all files are created:
- Run: docker build -f infra/docker/Dockerfile.document-storage . (dry-run: check for syntax errors)
- Run: kubectl apply --dry-run=client -k infra/k8s/overlays/staging/
  Fix any validation errors before finishing.
```

---

## Appendix A — Phase Dependencies

```
Phase 0 (Scaffold)
  └── Phase 1 (Database Schema)
        ├── Phase 2 (Platform Config Service)
        ├── Phase 3 (Document Storage Service)
        │     └── Phase 4 (EPUB Conversion Service)
        │           └── Phase 5 (XLSX Pipeline)
        ├── Phase 6 (Annotation & Session Service)
        ├── Phase 7 (Audit Trail Service)  ← audit-client used by all services
        ├── Phase 8 (Collaboration Service)
        ├── Phase 9 (AI Orchestration Service)
        └── Phase 10 (Notification Service)

Phase 11 (Frontend Shell)  ← depends on Phase 2 font profile API
  └── Phase 12 (EPUB Viewer)  ← depends on Phase 3 signed URL
        ├── Phase 13 (Annotation Overlay)  ← depends on Phase 6
        ├── Phase 14 (Attention Panel)  ← depends on Phase 13
        ├── Phase 15 (AI Panel)  ← depends on Phase 9
        ├── Phase 16 (Collaboration UI)  ← depends on Phase 8
        └── Phase 17 (Editing Overlays)  ← depends on Phase 3, 5

Phase 18 (E2E Tests)  ← depends on all prior phases
Phase 19 (Performance)  ← depends on Phase 18
Phase 20 (Infrastructure)  ← depends on Phase 19
```

---

## Appendix B — Environment Variables Reference

| Variable | Services | Description |
|----------|----------|-------------|
| `DATABASE_URL` | All Node services | PostgreSQL connection string (hitl user) |
| `DATABASE_URL_AUDIT` | audit-trail | Restricted `audit_writer` role connection |
| `REDIS_URL` | All services | Redis connection string |
| `S3_BUCKET` | document-storage, epub-conversion | S3 bucket name (`hitl-documents`) |
| `S3_ENDPOINT` | document-storage, epub-conversion | S3 endpoint URL (MinIO in dev) |
| `AWS_REGION` | document-storage | AWS region |
| `AWS_ACCESS_KEY_ID` | document-storage, epub-conversion | AWS / MinIO access key |
| `AWS_SECRET_ACCESS_KEY` | document-storage, epub-conversion | AWS / MinIO secret |
| `JWT_SECRET` | All services | JWT signing secret (OIDC public key in prod) |
| `CDN_MANIFEST_URL` | platform-config | URL to JSON array of approved font family names |
| `KB_API_URL` | ai-orchestration | Knowledge base search API base URL |
| `OPENAI_API_KEY` | ai-orchestration | OpenAI API key |
| `SES_FROM_ADDRESS` | notification | SES sender address (blank = dev console mode) |
| `USER_API_URL` | notification | User & Permissions API endpoint |
| `AUDIT_SERVICE_URL` | All Node services | audit-trail service URL (via audit-client) |
| `VITE_API_URL` | apps/web | Backend REST API base URL |
| `VITE_COLLAB_URL` | apps/web | WebSocket collaboration service URL |
| `E2E_BASE_URL` | e2e tests | Frontend base URL for Playwright |
| `TEST_REVIEWER_TOKEN` | e2e tests | JWT for reviewer test user (set by global-setup) |
| `TEST_ADMIN_TOKEN` | e2e tests | JWT for admin test user (set by global-setup) |

---

## Appendix C — ADRs Required Before Implementation

The following decisions from the functional specification open questions must be resolved as Architecture Decision Records before the relevant phases begin:

| ADR | Blocking Phase | Decision Required |
|-----|---------------|-------------------|
| ADR-001: EPUB conversion library | Phase 4 | Pandoc vs Calibre vs commercial API — fidelity, licensing, maintenance |
| ADR-002: Font upload policy | Phase 2 | Pre-approved registry only vs per-tenant font uploads (requires CDN hosting pipeline) |
| ADR-003: Conflict resolution model | Phase 6, Phase 8 | Operational Transform vs CRDT vs lock-based for concurrent human edits |
| ADR-004: Real-time collaborative editing scope | Phase 8 | Multi-cursor editing for v1.0 or deferred to v1.1 |
| ADR-005: XLSX large-sheet UX | Phase 5, Phase 17 | Inline pagination vs lazy-loading vs dedicated large-data view |
| ADR-006: LLM provider | Phase 9 | OpenAI GPT-4o vs Anthropic Claude vs Azure OpenAI — cost, latency, data residency |

---

*— End of Document —*

*Implementation Plan v1.0 | HITL Module | Future Platform | March 2026 | Internal — Engineering*

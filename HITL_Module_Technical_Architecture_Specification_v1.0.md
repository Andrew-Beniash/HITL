# Technical Architecture Specification: Human-in-the-Loop Document Review & AI Collaboration Module

**Status:** Draft  
**Version:** 1.0  
**Date:** March 2026  
**Owner:** Engineering  
**Relates to:** Functional Specification v1.1  
**Classification:** Internal — Engineering

---

## Table of Contents

1. [Document Purpose & Scope](#1-document-purpose--scope)
2. [System Architecture Overview](#2-system-architecture-overview)
3. [Technology Stack](#3-technology-stack)
4. [Frontend Architecture](#4-frontend-architecture)
   - 4.1 [Application Shell & State Management](#41-application-shell--state-management)
   - 4.2 [EPUB Rendering Engine](#42-epub-rendering-engine)
   - 4.3 [Annotation Layer](#43-annotation-layer)
   - 4.4 [Attention Panel](#44-attention-panel)
   - 4.5 [AI Interaction Panel](#45-ai-interaction-panel)
   - 4.6 [Collaboration & Presence](#46-collaboration--presence)
   - 4.7 [Document Editing Overlays](#47-document-editing-overlays)
   - 4.8 [Font Configuration System](#48-font-configuration-system)
5. [Backend Architecture](#5-backend-architecture)
   - 5.1 [API Gateway & Service Topology](#51-api-gateway--service-topology)
   - 5.2 [Document Storage Service](#52-document-storage-service)
   - 5.3 [EPUB Conversion Service](#53-epub-conversion-service)
   - 5.4 [XLSX-to-EPUB Conversion Pipeline](#54-xlsx-to-epub-conversion-pipeline)
   - 5.5 [Annotation & Session Service](#55-annotation--session-service)
   - 5.6 [Real-Time Collaboration Service](#56-real-time-collaboration-service)
   - 5.7 [AI Orchestration Service](#57-ai-orchestration-service)
   - 5.8 [Audit Trail Service](#58-audit-trail-service)
   - 5.9 [Notification Service](#59-notification-service)
   - 5.10 [Platform Configuration Service](#510-platform-configuration-service)
6. [Data Models](#6-data-models)
7. [API Contracts](#7-api-contracts)
8. [Security Architecture](#8-security-architecture)
9. [Infrastructure & Deployment](#9-infrastructure--deployment)
10. [Performance Strategy](#10-performance-strategy)
11. [Testing Strategy](#11-testing-strategy)
12. [Dependency Summary](#12-dependency-summary)

---

## 1. Document Purpose & Scope

This document defines the technical architecture, library selections, data models, and implementation approach for the HITL Document Review and AI Collaboration Module as specified in Functional Specification v1.1.

It is the authoritative reference for engineering decisions. It resolves the open questions in the functional spec where possible, and identifies the remaining decisions that require a formal ADR (Architecture Decision Record) before implementation begins.

**What this document covers:**

- Full-stack component architecture
- Selected libraries and rationale for each major subsystem
- Server-side service decomposition and responsibilities
- Data models for documents, annotations, sessions, and audit events
- API contract sketches for all internal service boundaries
- Security, deployment, and performance approaches

**What this document does not cover:**

- UI/UX design and visual specifications (see Design System documentation)
- Business logic for AI agent prompt engineering (see AI Agent Specification)
- Knowledge base schema and ingestion pipeline (out of scope for this module)

---

## 2. System Architecture Overview

The module follows a **service-oriented architecture** with a clear separation between a stateless React frontend, a set of purpose-built backend microservices, and a real-time WebSocket layer for collaboration. All document content is delivered to the client exclusively as EPUB; source-format processing is contained entirely on the server side.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          CLIENT (Browser)                                │
│                                                                          │
│  ┌─────────────┐  ┌────────────────────┐  ┌──────────────────────────┐  │
│  │  Attention  │  │   EPUB Viewer      │  │  Context / Collaboration  │  │
│  │  Panel      │  │   (epub.js)        │  │  Panel                   │  │
│  │  (React)    │  │   + Annotation     │  │  (AI Chat + KB + Thread) │  │
│  └─────────────┘  │   Overlay          │  └──────────────────────────┘  │
│                   │   (Fabric.js/SVG)  │                                 │
│                   └────────────────────┘                                 │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                     Zustand Global Store                           │  │
│  │    session · document · annotations · presence · font profile      │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────────┐   │
│  │  REST API Client │  │  WebSocket Client│  │  SSE Stream Client  │   │
│  │  (ky / Axios)    │  │  (Socket.IO)     │  │  (AI responses)     │   │
│  └──────────────────┘  └──────────────────┘  └─────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
                          │                 │
              ┌───────────┘                 └──────────────┐
              ▼                                            ▼
┌─────────────────────────┐              ┌──────────────────────────────┐
│     API Gateway         │              │   WebSocket Gateway          │
│     (Kong / nginx)      │              │   (Socket.IO / Node)         │
└────────────┬────────────┘              └──────────────┬───────────────┘
             │                                          │
    ┌────────┴────────────────────────────────────────┐ │
    │              Internal Service Mesh               │ │
    │                                                  │ │
    │  ┌──────────────┐  ┌──────────────────────────┐ │ │
    │  │ Document     │  │ EPUB Conversion Service   │ │ │
    │  │ Storage Svc  │  │ (Pandoc / openpyxl)       │ │ │
    │  └──────────────┘  └──────────────────────────┘ │ │
    │                                                  │ │
    │  ┌──────────────┐  ┌──────────────────────────┐ │ │
    │  │ Annotation & │  │ AI Orchestration Service  │ │ │
    │  │ Session Svc  │  │ (LangChain / LLM proxy)   │ │ │
    │  └──────────────┘  └──────────────────────────┘ │ │
    │                                                  │ │
    │  ┌──────────────┐  ┌──────────────────────────┐ │ │
    │  │ Audit Trail  │  │ Notification Service      │ │ │
    │  │ Service      │  │ (email + in-app)          │ │ │
    │  └──────────────┘  └──────────────────────────┘ │ │
    │                                                  │ │
    │  ┌──────────────┐  ┌──────────────────────────┐ │ │
    │  │ Collab /     │  │ Platform Config Service   │ │ │
    │  │ Presence Svc │◄─┤ (font profiles, settings) │ │ │
    │  └──────────────┘  └──────────────────────────┘ │ │
    └──────────────────────────────────────────────────┘ │
                          ▲                              │
              ┌───────────┘                              │
              │        Real-time presence / cursors ◄────┘
              ▼
    ┌──────────────────────────────────────────┐
    │            Data Layer                    │
    │                                          │
    │  PostgreSQL      Redis          S3/GCS   │
    │  (relational)    (session/pub-  (blobs)  │
    │                   sub/cache)             │
    └──────────────────────────────────────────┘
```

### 2.1 Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Client display format | EPUB via epub.js | Single renderer for all source formats; normalises the annotation and font-injection problem |
| Conversion runtime | Python (server-side) | Pandoc + openpyxl are mature Python libraries; isolated from frontend bundle |
| State management | Zustand | Lightweight; avoids Redux boilerplate; scales to module-level complexity without global app coupling |
| Real-time transport | Socket.IO over WebSocket | Handles reconnection, rooms, and namespaces out of the box; broad browser support |
| AI streaming | Server-Sent Events (SSE) | Stateless; simpler than WebSocket for unidirectional AI token streams |
| Persistence | PostgreSQL + S3 | PostgreSQL for structured data (annotations, audit, sessions); S3 for document blobs and EPUB artefacts |
| Caching | Redis | Session state, presence, pub/sub for real-time events, short-lived conversion job status |
| API style | REST + OpenAPI 3.1 | Predictable; cacheable; easy to generate typed clients |

---

## 3. Technology Stack

### 3.1 Frontend

| Layer | Library / Tool | Version | Purpose |
|-------|---------------|---------|---------|
| Framework | React | 19.x | Component model; concurrent rendering |
| Language | TypeScript | 5.x | Type safety across the module |
| Build | Vite | 6.x | Fast HMR; ES module output; easy code splitting |
| State | Zustand | 5.x | Global module state (session, annotations, presence) |
| Server state | TanStack Query | 5.x | REST data fetching, caching, invalidation |
| EPUB renderer | epub.js | 0.3.x | EPUB3 rendering; CFI-based location API; spine navigation |
| Annotation overlay | Rangy + custom SVG layer | — | CFI-to-DOM resolution; highlight/underline/sticky note |
| Rich text editing (MD) | CodeMirror 6 | 6.x | Raw Markdown editing; syntax highlighting; extensible |
| MD preview | remark + rehype | 15.x / 9.x | CommonMark parse → HAST → React; used for live preview pane |
| Diff rendering | diff-match-patch | 1.x | Character-level diff for inline change display |
| Real-time client | Socket.IO client | 4.x | WebSocket with auto-reconnect and room support |
| HTTP client | ky | 1.x | Fetch-based; interceptors; lightweight |
| Routing | React Router | 7.x | Module-level routes (document, admin, audit views) |
| Styling | Tailwind CSS | 4.x | Utility-first; design token integration |
| Accessibility | Radix UI Primitives | 1.x | Unstyled accessible components (dialogs, menus, tooltips) |
| i18n | i18next + react-i18next | 24.x | Namespace-based translation; locale detection |
| Testing | Vitest + React Testing Library | — | Unit and component tests |
| E2E | Playwright | 1.x | Cross-browser automation |

### 3.2 Backend

| Layer | Library / Tool | Version | Purpose |
|-------|---------------|---------|---------|
| Runtime | Node.js | 22 LTS | API Gateway, Collaboration Service, Notification Service |
| Framework (Node) | Fastify | 5.x | High-throughput REST; JSON Schema validation; plugin architecture |
| Runtime (conversion) | Python | 3.12 | EPUB Conversion Service; XLSX pipeline |
| Framework (Python) | FastAPI | 0.115.x | Async REST; Pydantic models; OpenAPI generation |
| EPUB conversion | Pandoc (subprocess) | 3.x | DOCX/MD/HTML → EPUB3 with high fidelity |
| XLSX parsing | openpyxl | 3.x | Read cell values, formatting, formulas, charts, merged cells |
| XLSX formula evaluation | formulas (Python) | 1.x | Server-side formula evaluation for display values |
| PDF extraction | pdfminer.six | 20231228 | Text layer extraction; page structure analysis |
| EPUB packaging | ebooklib | 0.18 | Programmatic EPUB3 construction from Python |
| ORM | Prisma | 6.x (Node) / SQLAlchemy 2.x (Python) | Type-safe DB access |
| Database | PostgreSQL | 16 | Primary relational store |
| Cache / Pub-Sub | Redis (via ioredis / redis-py) | 7.x | Session cache; real-time pub/sub; job status |
| Object storage | AWS S3 / GCS | — | Document blobs; EPUB artefacts; audit log exports |
| Real-time | Socket.IO server | 4.x | Collaborative presence; cursor sync |
| AI proxy | LangChain (Python) | 0.3.x | LLM abstraction; chain management; KB context injection |
| Message queue | BullMQ (Node) | 5.x | Async conversion jobs; retry logic; dead-letter queue |
| Auth | JWT + OpenID Connect | — | Stateless session tokens; SSO integration |
| API Gateway | Kong OSS or nginx | — | Routing; rate limiting; auth middleware |
| Observability | OpenTelemetry + Grafana | — | Traces, metrics, logs |

### 3.3 Infrastructure

| Component | Technology | Notes |
|-----------|-----------|-------|
| Container runtime | Docker + Kubernetes | Each service in its own deployment |
| CI/CD | GitHub Actions | Build, test, deploy pipeline |
| Secrets | HashiCorp Vault / AWS Secrets Manager | Injected at runtime |
| CDN | CloudFront / Fastly | Font delivery; static asset delivery |
| Region isolation | Kubernetes Namespace per tenant region | Satisfies data residency requirement |

---

## 4. Frontend Architecture

### 4.1 Application Shell & State Management

The module mounts as a self-contained React application within the platform shell. It uses a single `HitlModuleProvider` context at the root to initialise the Zustand store and fire the session bootstrap sequence.

**Session bootstrap sequence:**

```
1. HitlModuleProvider mounts
2. → GET /api/config/font-profile        (Platform Configuration API)
3. → GET /api/sessions/:sessionId        (Session + document metadata)
4. → Preload WOFF2 fonts from CDN        (font.body.family, font.heading.family, font.mono.family)
5. → Font load confirmed via FontFaceSet.ready
6. → GET /api/documents/:docId/epub      (signed S3 URL for EPUB blob)
7. → epub.js Book.open(url)
8. → Socket.IO connect → join session room
9. → Render document pane
```

Document rendering is intentionally blocked at step 5 — no EPUB content is shown until the configured fonts are confirmed loaded. This prevents flash-of-unstyled-content (FOUC) in font-critical compliance documents.

**Zustand store slices:**

```typescript
// store/sessionSlice.ts
interface SessionSlice {
  sessionId: string;
  documentId: string;
  currentUser: User;
  permissions: Permission[];
  reviewState: 'open' | 'pending_approval' | 'approved' | 'rejected';
}

// store/documentSlice.ts
interface DocumentSlice {
  epubUrl: string;
  sourceFormat: 'docx' | 'pdf' | 'xlsx' | 'md' | 'epub';
  currentLocation: EpubCFI;        // epub.js CFI
  currentChapter: string;
  conversionManifest: ConversionManifest | null;
  versionHistory: DocumentVersion[];
}

// store/annotationSlice.ts
interface AnnotationSlice {
  annotations: Annotation[];
  focusedAnnotationId: string | null;
  filterState: AnnotationFilter;
  resolvedCount: number;
  totalCriticalCount: number;
}

// store/presenceSlice.ts
interface PresenceSlice {
  activeUsers: PresenceUser[];
  cursorPositions: Record<string, EpubCFI>;
}

// store/fontSlice.ts
interface FontSlice {
  fontProfile: FontProfile;
  fontsLoaded: boolean;
  fontLoadError: boolean;
}
```

### 4.2 EPUB Rendering Engine

**Library: epub.js 0.3.x**

epub.js is the only mature open-source library that provides EPUB3 rendering with a programmatic CFI location API, which is essential for anchoring annotations. It renders each spine item (chapter) inside an `<iframe>` sandbox and exposes events for location changes, selection, and content load.

**Integration approach:**

```typescript
// components/EpubViewer/EpubViewer.tsx

import Epub, { Book, Rendition } from 'epubjs';

const book: Book = Epub(epubUrl);
const rendition: Rendition = book.renderTo(containerRef.current, {
  width: '100%',
  height: '100%',
  spread: 'none',
  flow: zoomMode === 'reflow' ? 'scrolled' : 'paginated',
});

// Inject platform font stylesheet into every iframe chapter as it loads
rendition.hooks.content.register((contents) => {
  contents.addStylesheet(platformEpubStylesheetUrl);
});

// Restore scroll position from session store
rendition.display(sessionStore.currentLocation || book.spine.first().href);
```

**Platform EPUB stylesheet injection:**

The font configuration is compiled into a CSS stylesheet at session start and injected via `rendition.hooks.content`. This is the mechanism that enforces platform font override over any font declarations inside the EPUB's own stylesheet.

```css
/* Generated from FontProfile at session boot */
:root {
  --font-body: "Inter", system-ui, -apple-system, sans-serif;
  --font-heading: "Inter", system-ui, -apple-system, sans-serif;
  --font-mono: "JetBrains Mono", monospace;
  --font-size-base: 1.0rem;
  --line-height-body: 1.6;
  --font-weight-table-header: 600;
}

/* Reset any source-document fonts */
body, p, li, td, th, span { font-family: var(--font-body) !important; }
h1, h2, h3, h4, h5, h6    { font-family: var(--font-heading) !important; }
pre, code, samp            { font-family: var(--font-mono) !important; }

thead th { font-weight: var(--font-weight-table-header); position: sticky; top: 0; }
```

The `!important` declarations are deliberate and scoped only to the injected platform stylesheet — this is the specified override behaviour from §5.1.4.

**Zoom and reflow:**

- Fixed-zoom mode (50–200%): epub.js `flow: 'paginated'` with CSS `transform: scale()` applied to the rendition container.
- Reflow mode: epub.js `flow: 'scrolled-doc'` — the EPUB content reflows to the container width; zoom is achieved via `font-size` scaling on the root element of each iframe.

**Side-by-side diff view:**

Two independent `Rendition` instances are mounted on split containers with the same `Book` instance. The left rendition loads the prior EPUB version; the right loads the AI-proposed EPUB. Both are synchronised on scroll using a shared scroll event handler that translates CFI positions between the two renditions.

### 4.3 Annotation Layer

Annotations are stored in the backend and rendered as an overlay on top of the epub.js iframe. Because epub.js renders each chapter in a sandboxed `<iframe>`, the annotation overlay must coordinate between the iframe's DOM and the parent document.

**Architecture:**

```
Parent DOM
└── EpubViewer container (position: relative)
    ├── epub.js iframe (chapter content)
    └── AnnotationOverlay (position: absolute, pointer-events: none)
        └── SVG canvas (full container dimensions)
            ├── HighlightRect[] (critical flag, attention marker, etc.)
            ├── SidebarMarker[] (validation notice)
            └── StickyNote[] (human comments)
```

**CFI-to-screen-rect resolution:**

epub.js exposes `rendition.getRange(cfi)` which returns a DOM `Range` within the iframe. The annotation layer calls `range.getClientRects()` and translates those iframe-relative rectangles to parent-document coordinates using `iframe.getBoundingClientRect()`.

```typescript
function cfiToScreenRects(cfi: string, rendition: Rendition): DOMRect[] {
  const range = rendition.getRange(cfi);
  if (!range) return [];
  const iframeRect = rendition.manager.container.getBoundingClientRect();
  return Array.from(range.getClientRects()).map(r => new DOMRect(
    r.left + iframeRect.left,
    r.top + iframeRect.top,
    r.width,
    r.height,
  ));
}
```

This function is called on every annotation whenever the rendition fires a `relocated` event (page turn or reflow). The SVG overlay is redrawn from scratch on each relocation.

**Annotation type rendering:**

| Annotation Type | SVG Element | Visual |
|-----------------|-------------|--------|
| Critical Flag | `<rect>` with fill `rgba(239,68,68,0.25)` | Red highlight |
| Attention Marker | `<rect>` with fill `rgba(251,191,36,0.25)` | Amber highlight |
| Validation Notice | `<line>` left margin + `<circle>` icon | Blue sidebar marker |
| Human Comment | `<rect>` underline + comment icon in margin | Underline + icon |
| Edit Suggestion | `<rect>` with strikethrough line | Redline |
| Resolved Marker | `<rect>` with fill `rgba(156,163,175,0.15)` | Grey highlight |

**Selection-to-CFI (for new annotations):**

When a user selects text in the epub.js iframe, the `selectionchange` event is intercepted via a message posted from the iframe's content script. The selection is converted to a CFI using epub.js `book.getCfiFromRange(range)`, which is then passed to the annotation creation flow.

```typescript
// Injected into iframe content via rendition.hooks.content
document.addEventListener('selectionchange', () => {
  const selection = document.getSelection();
  if (!selection || selection.isCollapsed) return;
  const range = selection.getRangeAt(0);
  parent.postMessage({ type: 'SELECTION_CHANGED', range: rangeToSerializable(range) }, '*');
});
```

### 4.4 Attention Panel

The Attention Panel is a virtualised list of annotations, sorted by severity then document order.

**Virtualisation:** `@tanstack/react-virtual` is used for the annotation list. This handles documents with hundreds of annotations without DOM bloat. Each annotation item renders at a fixed estimated height of 72px; the virtualiser measures actual heights after mount.

**Jump-to-annotation:** Clicking an annotation item calls `rendition.display(annotation.cfi)`. epub.js navigates to the correct chapter and the annotation overlay fires a redraw, highlighting the target annotation with a brief pulse animation via a CSS keyframe.

**Progress bar:** Derived from Zustand `annotationSlice`: `(resolvedCount / totalCriticalCount) * 100`. Rendered as an accessible `<progress>` element in the toolbar, duplicated as a compact indicator in the attention panel header.

**Keyboard navigation (`Ctrl+]` / `Ctrl+[`):** A `useHotkeys` hook (from the `react-hotkeys-hook` library) listens globally. It increments/decrements a `focusedAnnotationIndex` into the sorted critical-flags-only list, then calls `rendition.display` with the selected CFI.

### 4.5 AI Interaction Panel

The AI panel communicates with the AI Orchestration Service over **Server-Sent Events** for streaming responses, and standard REST for non-streaming actions.

**Selection context injection:**

When the user has a text selection in the epub.js viewer, the panel captures the selected text and CFI range and injects them as hidden context into every AI request:

```typescript
interface AiQueryPayload {
  sessionId: string;
  documentId: string;
  userQuery: string;
  selectionContext?: {
    cfi: string;
    text: string;
    chapterTitle: string;
  };
  quickAction?: 'explain' | 'validate' | 'suggest_edit' | 'compliance' | 'summarise';
}
```

**Streaming response rendering:**

```typescript
// hooks/useAiStream.ts
async function* streamAiResponse(payload: AiQueryPayload) {
  const response = await fetch('/api/ai/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
    body: JSON.stringify(payload),
  });
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    yield chunk;  // Accumulated in component state, rendered via react-markdown
  }
}
```

Streamed Markdown is rendered incrementally using `react-markdown` with `remark-gfm` for table support. KB citations arrive as structured `[citation:source-id]` tokens that are post-processed into inline `<KbCitation>` components linking to the KB source.

**Edit suggestion acceptance:**

When the AI returns an edit suggestion (a unified diff), the panel renders it using `diff-match-patch` in a styled `<DiffView>` component. Accept/reject buttons POST to the annotation service, which records the decision in the audit trail and triggers a re-conversion of the source document to EPUB.

### 4.6 Collaboration & Presence

**Library: Socket.IO client 4.x**

Each document session joins a Socket.IO room identified by `sessionId`. The server broadcasts presence and cursor events to all members of the room.

**Events:**

```typescript
// Client → Server
socket.emit('presence:join', { sessionId, userId, displayName, avatarUrl });
socket.emit('cursor:update', { sessionId, userId, cfi: currentCfi });
socket.emit('annotation:created', { sessionId, annotation });
socket.emit('annotation:resolved', { sessionId, annotationId });

// Server → Client
socket.on('presence:update', (users: PresenceUser[]) => { /* update store */ });
socket.on('cursor:positions', (positions: Record<string, string>) => { /* CFIs */ });
socket.on('annotation:sync', (annotation: Annotation) => { /* merge into store */ });
```

**Presence indicators:** Rendered as avatar stack in the toolbar. Each avatar is a `<button>` that, on click, scrolls the local viewer to that user's current CFI (read-only observation mode).

**Comment threading:** Comments are stored in PostgreSQL and fetched via TanStack Query with a 10-second polling interval as a fallback. Real-time comment creation is pushed via Socket.IO `annotation:sync`, triggering a query invalidation to refetch the full thread.

### 4.7 Document Editing Overlays

#### Markdown Editor

**Library: CodeMirror 6**

CodeMirror 6 is used for the raw Markdown editing pane. Its extension architecture allows precise control over key bindings, syntax highlighting, and collaborative editing (for future Y.js integration).

```typescript
const extensions = [
  markdown({ base: markdownLanguage, codeLanguages: languages }),
  syntaxHighlighting(defaultHighlightStyle),
  EditorView.updateListener.of(handleChange),
  keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
];
```

The live preview pane uses `remark` + `rehype` to transform the CodeMirror document value into React elements on each debounced change (150ms debounce). The preview is served inside a `<div>` with the platform EPUB stylesheet applied, so the preview matches what the EPUB viewer renders.

Autosave is a debounced `useEffect` that triggers `PATCH /api/documents/:docId/content` every 30 seconds or on explicit save (`Cmd+S`).

#### XLSX Cell Editing Overlay

When the EPUB viewer is displaying an XLSX-derived chapter, hovering over a table cell in the EPUB reveals an edit overlay. Clicking a cell opens a floating `<CellEditor>` component positioned over the cell using the cell's `getBoundingClientRect()` (resolved through the iframe boundary, same as annotation rects).

```
User clicks cell in EPUB table
  → Resolve iframe-relative rect to parent coords
  → Mount <CellEditor> overlay at those coords
  → User edits value, presses Enter
  → PATCH /api/documents/:docId/cells  { sheetName, row, col, value }
  → Server writes to source XLSX via openpyxl
  → Server queues re-conversion job
  → Client receives 'epub:updated' Socket.IO event with new EPUB URL
  → epub.js rendition re-opens new EPUB at same CFI location
```

#### DOCX Tracked Changes

DOCX editing is not performed directly in the browser. The reviewed EPUB is display-only; when a user proposes an edit, the change is transmitted to the server as a structured `TextEdit` object:

```typescript
interface TextEdit {
  cfi: string;       // location in the EPUB (resolves to the DOCX paragraph)
  originalText: string;
  proposedText: string;
  author: string;
}
```

The Document Storage Service maps the EPUB CFI back to the corresponding DOCX paragraph via the conversion manifest's CFI-to-OOXML-id mapping, applies the change as a tracked insertion/deletion in the DOCX XML, and queues a re-conversion to produce an updated EPUB with the tracked change surfaced as an EPUB annotation.

### 4.8 Font Configuration System

Font configuration is fetched from the Platform Configuration API at session boot and stored in the `fontSlice`.

**Font preloading:**

```typescript
async function preloadFonts(profile: FontProfile): Promise<void> {
  const families = [profile.body.family, profile.heading.family, profile.mono.family];
  const loadPromises = families.map(family =>
    document.fonts.load(`16px "${family}"`).catch(() => {
      fontSlice.setFontLoadError(true);
      auditLogger.log('font_load_failure', { family });
    })
  );
  await Promise.allSettled(loadPromises);
  await document.fonts.ready;
  fontSlice.setFontsLoaded(true);
}
```

**Fallback:** If any configured font fails to load, `fontSlice.fontLoadError` is set to `true`, a toast notification is shown to the user ("Some fonts could not be loaded; using system fonts"), and the failure is logged to the audit service. Rendering proceeds with the system font stack.

**No user override surface:** The Typography section under Display Settings is accessible only to Platform Administrators. No font controls are exposed in the document reviewer or SME UI.

---

## 5. Backend Architecture

### 5.1 API Gateway & Service Topology

All client requests flow through an API Gateway (Kong OSS in the reference implementation, replaceable with nginx + Lua or a cloud-native equivalent). The gateway handles:

- JWT validation and claims extraction
- Tenant routing (adding `X-Tenant-ID` header to internal requests)
- Rate limiting (per-tenant, per-user)
- Request logging for observability

**Internal service topology:**

| Service | Language | Port | Owns |
|---------|----------|------|------|
| Document Storage Service | Node.js / Fastify | 3001 | Document blobs, versions, metadata |
| EPUB Conversion Service | Python / FastAPI | 3002 | Source-format → EPUB pipeline, conversion jobs |
| Annotation & Session Service | Node.js / Fastify | 3003 | Annotations, sessions, review requests |
| Collaboration Service | Node.js / Socket.IO | 3004 | Real-time presence, cursor sync, annotation push |
| AI Orchestration Service | Python / FastAPI | 3005 | LLM proxy, KB context injection, SSE streaming |
| Audit Trail Service | Node.js / Fastify | 3006 | Append-only event log, export |
| Notification Service | Node.js / Fastify | 3007 | Email (SMTP/SES) and in-app notifications |
| Platform Configuration Service | Node.js / Fastify | 3008 | Font profiles, module settings |

Services communicate over HTTP/1.1 within the cluster. Async operations (conversion jobs, notification dispatch) use BullMQ with a shared Redis instance as the broker.

### 5.2 Document Storage Service

**Responsibilities:** Upload, version, fetch, and delete document content. Manages signed URLs for direct S3 access by the client.

**Storage layout in S3:**

```
s3://hitl-documents/
  {tenantId}/
    {documentId}/
      source/
        v1/  original.docx
        v2/  original.docx   (after edit)
      epub/
        v1/  document.epub   (converted from source v1)
        v2/  document.epub   (converted from source v2)
      manifest/
        v1.json              (ConversionManifest)
```

**Key endpoints:**

```
POST   /documents                         Upload new document
GET    /documents/:id                     Document metadata + latest version info
GET    /documents/:id/epub                Returns signed S3 URL for EPUB (15-min expiry)
POST   /documents/:id/cells              XLSX cell edit → triggers conversion job
PATCH  /documents/:id/content            MD content update → triggers conversion job
GET    /documents/:id/versions            Version list
GET    /documents/:id/versions/:vId/epub  Signed URL for historical EPUB version
POST   /documents/:id/approve             Set approval state
```

**Versioning:** Every document save creates a new version record in PostgreSQL and a new object in S3. The `current_version_id` on the document row points to the active version. Rollback updates this pointer; no data is deleted.

### 5.3 EPUB Conversion Service

**Responsibilities:** Accept a source document (by S3 reference), convert it to EPUB3, store the result in S3, and return a `ConversionManifest`.

**Job flow:**

```
1. Document Storage Service POSTs conversion job to BullMQ
2. EPUB Conversion Service worker picks up the job
3. Downloads source document from S3 to ephemeral /tmp
4. Dispatches to format-specific converter:
   - .docx  → PandocConverter
   - .pdf   → PdfExtractConverter
   - .md    → PandocConverter
   - .xlsx  → XlsxEpubConverter   (see §5.4)
   - .epub  → PassthroughConverter (validate + repackage only)
5. Converter returns EPUB3 bytes + ConversionManifest JSON
6. Uploads EPUB to S3; uploads manifest to S3
7. Updates document version record with epub_s3_key
8. Publishes 'epub:ready' event to Redis pub/sub
9. Collaboration Service receives event; pushes 'epub:updated' to Socket.IO room
```

**Pandoc invocation (DOCX and MD):**

```python
import subprocess, tempfile, pathlib

def convert_with_pandoc(source_path: str, output_format: str = 'epub3') -> bytes:
    with tempfile.NamedTemporaryFile(suffix='.epub', delete=False) as out:
        result = subprocess.run([
            'pandoc',
            source_path,
            '--to', output_format,
            '--epub-embed-font',           # embed any source fonts (will be overridden by platform CSS)
            '--toc',                       # generate nav/NCX TOC
            '--toc-depth=3',
            '--track-changes=all',         # surface tracked changes as annotations
            '-o', out.name,
        ], capture_output=True, timeout=120)
        if result.returncode != 0:
            raise ConversionError(result.stderr.decode())
        return pathlib.Path(out.name).read_bytes()
```

**PDF extraction:**

pdfminer.six extracts the text layer. Pages become EPUB chapters. Images are extracted with PyMuPDF (`fitz`) and embedded as EPUB figures. Page boundary markers are inserted as `<div class="page-break" data-page-number="N"/>` elements for the client to render as visual dividers.

```python
import fitz  # PyMuPDF
from pdfminer.high_level import extract_pages
from pdfminer.layout import LTTextContainer

def convert_pdf_to_epub(source_path: str) -> tuple[bytes, ConversionManifest]:
    doc = fitz.open(source_path)
    chapters = []
    for page_num, page in enumerate(doc):
        text_html = extract_page_html(source_path, page_num)  # pdfminer
        images = extract_page_images(page)                     # PyMuPDF
        chapters.append(EpubChapter(
            title=f"Page {page_num + 1}",
            html=text_html,
            images=images,
        ))
    return package_as_epub(chapters)
```

### 5.4 XLSX-to-EPUB Conversion Pipeline

This pipeline is implemented as `XlsxEpubConverter` in the EPUB Conversion Service. It uses **openpyxl** for workbook parsing and **ebooklib** for EPUB3 assembly.

**Full pipeline implementation:**

```python
import openpyxl
from openpyxl.utils import get_column_letter
from ebooklib import epub
import formulas  # for formula evaluation

class XlsxEpubConverter:

    MAX_ROWS_PER_PAGE = 500
    PAGINATION_THRESHOLD = 5000

    def convert(self, source_path: str) -> tuple[bytes, ConversionManifest]:
        wb = openpyxl.load_workbook(source_path, data_only=False)
        book = epub.EpubBook()
        book.set_title(pathlib.Path(source_path).stem)
        book.set_language('en')

        chapters = []
        manifest = ConversionManifest(source_format='xlsx', sheets=[])
        degradation_notices = []

        for sheet_name in wb.sheetnames:
            ws = wb[sheet_name]
            if ws.sheet_state == 'hidden':
                continue  # excluded by default per spec

            sheet_manifest, notices, chapter_items = self._convert_sheet(
                ws, sheet_name, book
            )
            manifest.sheets.append(sheet_manifest)
            degradation_notices.extend(notices)
            chapters.extend(chapter_items)

        # Build NCX/Nav TOC
        book.toc = [(epub.Section(s.name), [c for c in chapters if c.sheet == s.name])
                    for s in manifest.sheets]
        book.add_item(epub.EpubNcx())
        book.add_item(epub.EpubNav())

        manifest.degradation_notices = degradation_notices
        epub_bytes = self._package(book, chapters)
        return epub_bytes, manifest

    def _convert_sheet(self, ws, sheet_name: str, book: epub.EpubBook):
        notices = []
        chapter_items = []
        rows = list(ws.iter_rows())

        # Detect frozen rows (header)
        freeze_row = ws.freeze_panes.min_row - 1 if ws.freeze_panes else 0

        # Warn on unsupported features
        if ws.conditional_formatting:
            notices.append(DegradationNotice(sheet=sheet_name, type='conditional_formatting_omitted'))
        if any(ws._charts):
            pass  # charts handled separately as static images

        # Paginate large sheets
        data_rows = rows[freeze_row:]
        if len(data_rows) > self.PAGINATION_THRESHOLD:
            pages = [data_rows[i:i+self.MAX_ROWS_PER_PAGE]
                     for i in range(0, len(data_rows), self.MAX_ROWS_PER_PAGE)]
        else:
            pages = [data_rows]

        header_rows = rows[:freeze_row]

        for page_idx, page_rows in enumerate(pages):
            html = self._rows_to_html(ws, header_rows, page_rows, page_idx, len(pages))
            chapter = epub.EpubHtml(
                title=f"{sheet_name}" if len(pages) == 1 else f"{sheet_name} ({page_idx+1}/{len(pages)})",
                file_name=f"sheet_{sheet_name}_{page_idx}.xhtml",
                lang='en'
            )
            chapter.content = html.encode('utf-8')
            chapter.sheet = sheet_name
            book.add_item(chapter)
            chapter_items.append(chapter)

        return SheetManifest(name=sheet_name, rows=len(rows), pages=len(pages)), notices, chapter_items

    def _rows_to_html(self, ws, header_rows, data_rows, page_idx, total_pages) -> str:
        # Build <table> with <thead> for frozen rows and <tbody> for data rows
        # Apply cell formatting: number format, alignment, bold/italic, background color
        # Override font-family via platform CSS (not inline styles)
        # Handle merged cells via colspan/rowspan from ws.merged_cells
        # Embed chart images as <figure> elements
        # Insert sparkline omission notices
        # Insert pivot table static value notice
        ...
```

**Formula evaluation:** openpyxl is loaded with `data_only=False` to retain formula strings. The `formulas` library evaluates them server-side to produce display values. If evaluation fails (unsupported function, circular reference), the cell is rendered with a `#EVAL_ERROR` notice.

**Chart extraction:** Static chart images are extracted using openpyxl's chart drawing API and Pillow to rasterise to PNG. Each chart is inserted as an `<figure><img/><figcaption/></figure>` in the EPUB at the position of the chart's top-left anchor cell.

**Merged cell handling:**

```python
merged = {cell for rng in ws.merged_cells.ranges for cell in rng.cells}
merge_map = {}
for rng in ws.merged_cells.ranges:
    min_row, min_col = rng.min_row, rng.min_col
    merge_map[(min_row, min_col)] = (rng.max_row - min_row + 1, rng.max_col - min_col + 1)
    for cell in rng.cells:
        if cell != (min_row, min_col):
            merge_map[cell] = None  # skip rendering; covered by master cell
```

### 5.5 Annotation & Session Service

**Responsibilities:** Create, read, update, and resolve annotations; manage session lifecycle; handle review requests.

**PostgreSQL schema (core tables):**

```sql
-- Sessions
CREATE TABLE sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   UUID NOT NULL REFERENCES documents(id),
  tenant_id     UUID NOT NULL,
  user_id       UUID NOT NULL,
  kb_connection_id UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  review_state  TEXT NOT NULL DEFAULT 'open'
    CHECK (review_state IN ('open', 'pending_approval', 'approved', 'rejected'))
);

-- Annotations
CREATE TABLE annotations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES sessions(id),
  document_id     UUID NOT NULL REFERENCES documents(id),
  document_version_id UUID NOT NULL,
  author_id       UUID,          -- NULL means AI agent
  agent_id        TEXT,          -- NULL means human
  type            TEXT NOT NULL  -- 'critical_flag' | 'attention_marker' | 'validation_notice'
                                 -- | 'human_comment' | 'review_request' | 'edit_suggestion'
    CHECK (type IN ('critical_flag','attention_marker','validation_notice',
                    'human_comment','review_request','edit_suggestion')),
  cfi             TEXT NOT NULL, -- EPUB CFI range
  cfi_text        TEXT,          -- Plain text of annotated range (for search/display)
  payload         JSONB NOT NULL, -- Type-specific data (comment text, edit diff, etc.)
  status          TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved', 'rejected')),
  resolved_by_id  UUID,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_annotations_document_status ON annotations(document_id, status);
CREATE INDEX idx_annotations_type_status     ON annotations(type, status);

-- Comment threads (replies to annotations)
CREATE TABLE annotation_replies (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  annotation_id  UUID NOT NULL REFERENCES annotations(id),
  author_id      UUID NOT NULL,
  body           TEXT NOT NULL,  -- Markdown
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Review request enforcement:** When `review_state = 'pending_approval'` is requested, the service queries for any unresolved `critical_flag` annotations on the document. If any exist, the state transition is rejected with a `409 Conflict` response listing the unresolved flag IDs.

### 5.6 Real-Time Collaboration Service

**Library: Socket.IO 4.x on Node.js**

The Collaboration Service maintains WebSocket connections and acts as the real-time event bus. It does not own any persistent state; it reads from and publishes to Redis pub/sub channels.

**Room model:** Each `sessionId` is a Socket.IO room. All users viewing the same document in the same tenant context join the same room (identified by `documentId + tenantId` for cross-session collaboration).

**Redis pub/sub channels:**

```
hitl:presence:{documentId}        → User join/leave events
hitl:cursor:{documentId}          → CFI cursor position updates (high frequency)
hitl:annotation:{documentId}      → Annotation create/update/resolve events
hitl:epub:{documentId}            → EPUB ready events from conversion service
```

**Cursor throttling:** Client cursor position updates are throttled to 100ms on the client. The Collaboration Service further rate-limits cursor broadcast to once per 50ms per user to prevent flooding.

### 5.7 AI Orchestration Service

**Library: LangChain 0.3.x (Python)**

The AI Orchestration Service acts as a proxy and context-enrichment layer between the client and the underlying LLM.

**Request enrichment flow:**

```
Client sends AiQueryPayload
  ↓
1. Resolve session → fetch KB connection credentials
2. Retrieve KB context for current CFI/chapter:
   → Search KB API with chapter text as query
   → Retrieve top-3 relevant KB articles
3. Retrieve document context:
   → Fetch selected text (if cfi provided)
   → Fetch chapter summary from conversion manifest
4. Construct LangChain prompt:
   SystemMessage: role + compliance constraints
   HumanMessage: user query + document context + KB context
5. Stream response from LLM (GPT-4o or Claude via API)
6. Post-process:
   → Extract [citation:source-id] tokens → resolve to KB article titles
   → Extract structured edit suggestions → convert to unified diff format
7. Stream processed tokens to client via SSE
8. On completion: log full interaction to Audit Trail Service
```

**Prompt construction (system message excerpt):**

```python
SYSTEM_PROMPT = """You are a document review assistant operating within a
compliance-sensitive document review platform. You have access to the customer's
knowledge base (KB). When making factual claims, always cite the KB source using
the format [citation:article-id]. Always state your confidence level for
validation outputs as one of: High / Medium / Low. You are not the final
decision-maker; all your outputs require human confirmation."""
```

**Confidence level extraction:** The LLM is instructed to include a structured confidence statement. A regex post-processor extracts `Confidence: High|Medium|Low` from the response and promotes it to a structured metadata field returned alongside the SSE stream in the final `[DONE]` event.

**Edit suggestion format:** Edit suggestions are returned as unified diffs. The service parses the LLM output for a fenced `diff` code block and validates it against the document's current text before forwarding to the client.

### 5.8 Audit Trail Service

**Responsibilities:** Accept append-only audit events; store them in PostgreSQL; provide queryable export for compliance officers.

**Design constraints:** No `UPDATE` or `DELETE` SQL is issued against audit tables. The application role used by the Audit Trail Service is granted only `INSERT` and `SELECT`. `UPDATE`/`DELETE` privileges are withheld at the database level.

**PostgreSQL schema:**

```sql
CREATE TABLE audit_events (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     UUID NOT NULL,
  document_id   UUID,
  session_id    UUID,
  actor_type    TEXT NOT NULL CHECK (actor_type IN ('user', 'agent', 'system')),
  actor_id      TEXT NOT NULL,       -- user UUID or agent identifier string
  event_type    TEXT NOT NULL,       -- e.g. 'annotation.created', 'epub.converted'
  scope         JSONB,               -- { documentId, cfi, cellRange, sheetName, ... }
  before_state  JSONB,               -- snapshot before action (nullable)
  after_state   JSONB,               -- snapshot after action (nullable)
  metadata      JSONB,               -- event-specific extras (model version, prompt hash, etc.)
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (occurred_at);

-- Monthly partitions for retention management
CREATE TABLE audit_events_2026_03 PARTITION OF audit_events
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
```

**Event types:**

```
document.opened            document.closed
annotation.created         annotation.resolved         annotation.rejected
ai.query.submitted         ai.response.completed
edit.applied               edit.accepted               edit.rejected
review_request.created     review_request.resolved
approval.state_changed
epub.converted             epub.conversion_failed
font.load_failed           font.profile_changed
document.exported          document.rolled_back
```

**Export:** `GET /audit/export?documentId=&from=&to=&format=csv|json` streams events using a cursor-based pagination query. Large exports are processed as background jobs and delivered as a signed S3 download link.

**Retention:** Partition pruning is scheduled via a monthly cron job. Partitions beyond the configured retention period (default: 7 years) are dropped. The partition boundary ensures no cross-retention-period rows are deleted inadvertently.

### 5.9 Notification Service

**Email:** AWS SES or SMTP with a templated email system. Templates are stored in S3 and rendered server-side with `handlebars`. Notification types: mention, review request, review request resolved, document approved/rejected, critical flag created.

**In-app:** Notifications are stored in PostgreSQL (`notifications` table). The client polls `GET /notifications/unread` every 60 seconds. Real-time delivery for high-priority notifications (critical flag, review request) is via Socket.IO to the user's personal room (joined on authentication).

**@mention resolution:** When a comment body contains `@username`, the Annotation Service emits a `notification.mention` event to the Notification Service via BullMQ. The Notification Service resolves the user ID via the User & Permissions API and dispatches both in-app and email notifications.

### 5.10 Platform Configuration Service

**Responsibilities:** Store and serve font profiles and module-level settings; log profile change events.

**Font profile storage:**

```sql
CREATE TABLE font_profiles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  name        TEXT NOT NULL,           -- 'Default', 'Accessibility', 'Print'
  is_active   BOOLEAN NOT NULL DEFAULT FALSE,
  config      JSONB NOT NULL,          -- FontProfile JSON
  created_by  UUID NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- At most 3 profiles per tenant (enforced in application layer)
-- Exactly 1 is_active = TRUE per tenant (enforced in application layer via transaction)
```

**Font CDN validation:** When a Platform Administrator saves a font profile, the service validates that each configured font family resolves to a URL in the platform's approved CDN manifest before committing. Unknown fonts are rejected with a `422 Unprocessable Entity`.

---

## 6. Data Models

### 6.1 Document

```typescript
interface Document {
  id: string;                          // UUID
  tenantId: string;
  title: string;
  sourceFormat: 'docx' | 'pdf' | 'xlsx' | 'md' | 'epub';
  currentVersionId: string;
  reviewState: 'open' | 'pending_approval' | 'approved' | 'rejected';
  createdAt: string;                   // ISO 8601
  updatedAt: string;
}

interface DocumentVersion {
  id: string;
  documentId: string;
  versionNumber: number;
  sourceS3Key: string;
  epubS3Key: string | null;           // null while conversion is pending
  conversionStatus: 'pending' | 'processing' | 'complete' | 'failed';
  conversionManifest: ConversionManifest | null;
  createdAt: string;
  createdBy: string;                  // user ID or 'system'
}
```

### 6.2 Annotation

```typescript
interface Annotation {
  id: string;
  sessionId: string;
  documentId: string;
  documentVersionId: string;
  authorId: string | null;           // null = AI agent
  agentId: string | null;            // null = human
  type: AnnotationType;
  cfi: string;                       // EPUB CFI range
  cfiText: string;                   // plain text of annotated range
  payload: AnnotationPayload;
  status: 'open' | 'resolved' | 'rejected';
  resolvedById: string | null;
  resolvedAt: string | null;
  createdAt: string;
  replies: AnnotationReply[];
}

type AnnotationType =
  | 'critical_flag'
  | 'attention_marker'
  | 'validation_notice'
  | 'human_comment'
  | 'review_request'
  | 'edit_suggestion';

type AnnotationPayload =
  | { type: 'critical_flag'; reason: string; kbSourceId?: string }
  | { type: 'attention_marker'; reason: string }
  | { type: 'validation_notice'; kbSourceId: string; validationResult: 'pass' | 'fail'; detail: string }
  | { type: 'human_comment'; body: string; mentions: string[] }
  | { type: 'review_request'; assignedTo: string; deadline?: string; instructions: string; urgency: 'low' | 'normal' | 'high' }
  | { type: 'edit_suggestion'; originalText: string; proposedText: string; unifiedDiff: string; confidence: 'High' | 'Medium' | 'Low' };
```

### 6.3 ConversionManifest

```typescript
interface ConversionManifest {
  sourceFormat: string;
  sourceFileHash: string;            // SHA-256
  convertedAt: string;              // ISO 8601
  // XLSX-specific
  sheets?: SheetManifest[];
  // DOCX-specific
  cfiToOoxmlMap?: Record<string, string>;  // EPUB CFI → OOXML paragraph ID
  // PDF-specific
  pageCount?: number;
  // All formats
  degradationNotices: DegradationNotice[];
}

interface SheetManifest {
  name: string;
  rowCount: number;
  columnCount: number;
  pageCount: number;                // 1 unless > 5000 rows
  chartsExtracted: number;
  degradationNotices: DegradationNotice[];
}

interface DegradationNotice {
  sheet?: string;
  type: 'conditional_formatting_omitted' | 'sparkline_omitted'
      | 'pivot_table_static' | 'sheet_paginated' | 'formula_eval_error'
      | 'chart_rasterised' | 'password_protected';
  detail?: string;
  cellRef?: string;
}
```

### 6.4 FontProfile

```typescript
interface FontProfile {
  id: string;
  tenantId: string;
  name: string;
  isActive: boolean;
  config: {
    body: { family: string; size: string };        // e.g. '"Inter"', '1.0rem'
    heading: { family: string; scale: HeadingScale };
    mono: { family: string };
    lineHeight: number;
    tableHeader: { weight: number };
  };
}

interface HeadingScale {
  h1: number;  // 2.0
  h2: number;  // 1.5
  h3: number;  // 1.25
  h4: number;
  h5: number;
  h6: number;
}
```

---

## 7. API Contracts

All APIs follow OpenAPI 3.1. The gateway enforces JWT auth on all routes. Tenant ID is extracted from JWT claims and injected as `X-Tenant-ID`; services do not accept tenant IDs from request bodies.

### 7.1 Document Storage Service

```
POST   /documents
  Body: multipart/form-data { file, title }
  → 201 { document: Document, version: DocumentVersion }

GET    /documents/:id
  → 200 { document: Document, currentVersion: DocumentVersion }

GET    /documents/:id/epub
  → 200 { signedUrl: string, expiresAt: string, conversionStatus: string }
  Note: If conversion is still pending, returns 202 with conversionStatus: 'processing'
        Client should poll or wait for 'epub:ready' Socket.IO event

PATCH  /documents/:id/content
  Body: { markdown: string }
  → 202 { versionId: string, conversionJobId: string }

POST   /documents/:id/cells
  Body: { sheetName: string, row: number, col: number, value: string | number }
  → 202 { versionId: string, conversionJobId: string }

GET    /documents/:id/versions
  → 200 { versions: DocumentVersion[] }

POST   /documents/:id/approve
  Body: { decision: 'approved' | 'rejected', comment?: string }
  → 200 { document: Document }
  → 409 { error: 'unresolved_critical_flags', flagIds: string[] }
```

### 7.2 Annotation & Session Service

```
POST   /sessions
  Body: { documentId, kbConnectionId? }
  → 201 { session: Session }

GET    /sessions/:id
  → 200 { session: Session, document: Document }

GET    /documents/:id/annotations
  Query: { status?, type?, authorId?, from?, to? }
  → 200 { annotations: Annotation[], totalCritical: number, resolvedCritical: number }

POST   /documents/:id/annotations
  Body: Omit<Annotation, 'id' | 'createdAt' | 'replies' | 'status'>
  → 201 { annotation: Annotation }

PATCH  /annotations/:id/resolve
  Body: { decision: 'resolved' | 'rejected', comment?: string }
  → 200 { annotation: Annotation }

POST   /annotations/:id/replies
  Body: { body: string }
  → 201 { reply: AnnotationReply }
```

### 7.3 AI Orchestration Service

```
POST   /ai/query
  Body: AiQueryPayload
  Accept: text/event-stream
  → 200 SSE stream of text tokens
  Final event: { type: 'done', metadata: { confidence, citations, editSuggestion? } }

POST   /ai/feedback
  Body: { queryId: string, rating: 'helpful' | 'not_helpful', comment?: string }
  → 204
```

### 7.4 Audit Trail Service

```
POST   /audit/events
  Body: AuditEvent   (internal use only; not exposed through API Gateway)
  → 204

GET    /audit/events
  Query: { documentId?, sessionId?, actorId?, eventType?, from, to, cursor?, limit? }
  → 200 { events: AuditEvent[], nextCursor?: string }

POST   /audit/export
  Body: { documentId?, from, to, format: 'csv' | 'json' }
  → 202 { jobId: string }

GET    /audit/export/:jobId
  → 200 { status: 'pending' | 'ready', downloadUrl?: string }
```

### 7.5 Platform Configuration Service

```
GET    /config/font-profile/active
  → 200 { fontProfile: FontProfile }

GET    /config/font-profiles
  → 200 { profiles: FontProfile[] }

PUT    /config/font-profiles/:id/activate
  → 200 { fontProfile: FontProfile }

POST   /config/font-profiles
  Body: Omit<FontProfile, 'id' | 'tenantId' | 'isActive'>
  → 201 { fontProfile: FontProfile }
  → 422 { error: 'unknown_font_family', family: string }
```

---

## 8. Security Architecture

### 8.1 Authentication & Authorisation

**Authentication:** All API requests carry a short-lived JWT (15-minute expiry) issued by the platform identity provider (OpenID Connect). The API Gateway validates the JWT signature against the JWKS endpoint before forwarding requests. The JWT payload contains: `sub` (user ID), `tid` (tenant ID), `roles` (array), `doc_permissions` (document-level ACL snapshot).

**Authorisation model:**

```
Role                  Permissions
─────────────────     ───────────────────────────────────────────
document_reviewer     read:document, create:annotation, read:annotation, use:ai
subject_matter_expert read:document, create:annotation, read:annotation
compliance_officer    read:document, read:annotation, read:audit, export:audit
platform_admin        all + write:font_profile, read:usage_metrics
ai_agent              read:document (scoped), write:annotation (critical/attention)
```

Document-level permissions (who can access which document) are resolved by the User & Permissions API and cached in Redis for the duration of the session (TTL: 5 minutes). The Annotation Service validates document-level permission on every write.

### 8.2 Data Encryption

- **At rest:** S3 server-side encryption (AES-256, SSE-S3 or SSE-KMS with per-tenant keys). PostgreSQL volume encryption via cloud provider disk encryption.
- **In transit:** TLS 1.3 on all external connections. mTLS between internal services within the Kubernetes cluster using a service mesh (Istio or Linkerd).
- **EPUB signed URLs:** 15-minute expiry with IP binding where supported by the cloud provider. URLs are single-use where the S3 implementation allows.

### 8.3 Tenant Isolation

- Each tenant's data is partitioned by `tenant_id` in all PostgreSQL tables. Row-level security (RLS) is enabled; the application role's connection includes `SET app.current_tenant = '{tenantId}'` to activate the RLS policy.
- S3 key prefixes are tenant-scoped (`{tenantId}/...`). IAM bucket policies deny cross-prefix access.
- EPUB conversion runs in isolated ephemeral containers (one container per job); containers are destroyed after the job completes. Source documents are not persisted to the container filesystem beyond the job lifetime.
- AI Orchestration Service enforces tenant KB isolation: KB API calls are made with tenant-scoped credentials; the LLM prompt explicitly states the tenant boundary and does not receive any cross-tenant context.

### 8.4 Audit Immutability

The `audit_events` table is owned by a dedicated PostgreSQL role (`audit_writer`) which is granted only `INSERT` and `SELECT`. The application service connects as this role. `UPDATE`, `DELETE`, and `TRUNCATE` are not granted. A superuser-only trigger logs any DDL changes to the audit table structure to a separate immutable log.

---

## 9. Infrastructure & Deployment

### 9.1 Kubernetes Deployment

Each service is deployed as a Kubernetes `Deployment` with at least 2 replicas for high availability. The EPUB Conversion Service is deployed as a `Deployment` with horizontal pod autoscaling based on BullMQ queue depth (custom metric via KEDA).

```yaml
# Example: EPUB Conversion Service HPA via KEDA
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: epub-conversion-scaler
spec:
  scaleTargetRef:
    name: epub-conversion-service
  minReplicaCount: 2
  maxReplicaCount: 20
  triggers:
    - type: redis
      metadata:
        listName: bull:epub-conversion:wait
        listLength: '5'        # scale up when > 5 jobs waiting
```

**Resource limits (EPUB Conversion):** CPU: 2 cores, Memory: 4 GB. Pandoc and PyMuPDF are memory-intensive for large documents. Conversion jobs for files > 50 MB are allocated to a dedicated high-memory node pool.

### 9.2 Data Residency

The platform supports multiple cloud regions. Each tenant is assigned a primary region at onboarding. The following components run exclusively in the tenant's designated region:

- PostgreSQL (primary + read replica)
- Redis
- S3 bucket
- Document Storage Service
- EPUB Conversion Service
- Annotation & Session Service
- Collaboration Service
- Audit Trail Service

The AI Orchestration Service may make inference calls to LLM APIs in other regions unless the tenant has enabled the **in-region AI inference** option, which routes requests to a regional LLM endpoint (e.g. Azure OpenAI with regional deployment).

### 9.3 Graceful Degradation

As required by the functional specification, subsystem failures must not cascade to block the core review workflow.

| Failing Subsystem | Impact | Degraded Behaviour |
|-------------------|--------|-------------------|
| AI Orchestration Service | AI panel unavailable | Panel shows "AI features temporarily unavailable" banner; document review and annotation continue normally |
| EPUB Conversion Service | New conversions blocked | Existing EPUBs still viewable; upload of new documents blocked with user-facing notice |
| Collaboration Service (WebSocket) | Real-time presence lost | Presence indicators hidden; annotation changes require manual refresh (polling fallback activates) |
| Notification Service | Notifications not delivered | In-app queue persists events; email delivery retried via BullMQ dead-letter queue |
| KB API | KB context unavailable | AI queries proceed without KB context; panel shows "KB unavailable" indicator; KB context panel shows error state |
| Font CDN | Configured fonts not loadable | System font fallback activates; audit event logged; user notified via toast |

### 9.4 Observability

**Tracing:** OpenTelemetry traces span from the API Gateway through all downstream services. Each document session has a `sessionId` injected as a span attribute, enabling per-session trace filtering.

**Metrics:** Key Prometheus metrics per service:
- `epub_conversion_duration_seconds` (histogram, by source format)
- `annotation_create_total` (counter, by type and author_type)
- `ai_query_duration_seconds` (histogram, by quick_action)
- `audit_event_write_total` (counter, by event_type)
- `websocket_connections_active` (gauge, by documentId)

**Alerting:** PagerDuty integration for: conversion queue depth > 50 for > 5 minutes; error rate > 1% on any service; audit write failures (any); P95 EPUB load time > 5 seconds.

---

## 10. Performance Strategy

### 10.1 EPUB Load Time (< 3 seconds for files up to 50 MB)

- EPUB files are pre-generated at upload time, not on first request. The signed S3 URL is available immediately after conversion completes.
- epub.js loads EPUB spine items lazily: only the current chapter's XHTML is parsed and rendered initially. Subsequent chapters are pre-fetched on a 2-chapter lookahead basis.
- Large EPUB files (> 10 MB) are served via CloudFront CDN with an `Accept-Ranges` header, enabling the browser to begin rendering the first chapter before the full download completes.

### 10.2 XLSX-to-EPUB Conversion Time (< 10 seconds for up to 10,000 rows)

- openpyxl loads the workbook once; all sheets are converted in a single pass.
- Formula evaluation (via the `formulas` library) is the bottleneck for large workbooks. Evaluated values are cached in Redis keyed by `{documentId}:{versionId}:{sheetName}:{cellRef}` for the duration of the conversion job.
- Chart rasterisation is parallelised using Python's `concurrent.futures.ThreadPoolExecutor` (I/O-bound; no GIL contention for image encoding).
- Sheets with > 5,000 rows generate multiple EPUB chapters. Each chapter HTML is generated independently and can be written to the EPUB archive concurrently.

### 10.3 Annotation Rendering Performance

- The SVG annotation overlay is redrawn on every epub.js `relocated` event. For documents with > 200 annotations, only annotations in the current viewport chapter are resolved to screen rects. Off-screen annotations are queued for resolution in a `requestIdleCallback`.
- `@tanstack/react-virtual` in the attention panel ensures the annotation list renders at constant DOM cost regardless of annotation count.
- Annotation data is fetched once on session open and updated via Socket.IO deltas. Full refetch is triggered only on reconnect.

### 10.4 AI Response Latency (streaming starts within 2 seconds)

- The AI Orchestration Service performs KB context retrieval and prompt construction before the first LLM token is returned. Target: KB retrieval + prompt construction < 800ms (P95).
- KB search results are cached in Redis with a 60-second TTL keyed by `{tenantId}:{chapterSummaryHash}`. Repeated queries on the same chapter section hit the cache.
- SSE streaming begins as soon as the first token is returned by the LLM; the client renders tokens incrementally without waiting for the full response.

---

## 11. Testing Strategy

### 11.1 Unit Tests

- All Zustand store slices are unit tested in isolation using Vitest with mocked API responses.
- CFI-to-screen-rect resolution logic is tested with a headless epub.js instance.
- XLSX conversion pipeline tested with a suite of openpyxl fixture workbooks covering: merged cells, formula evaluation, frozen rows, charts, conditional formatting (degradation), large sheets (pagination boundary), password-protected sheets.
- All Fastify/FastAPI route handlers tested with injected requests; no real database connections in unit tests.

### 11.2 Integration Tests

- Conversion pipeline end-to-end: upload fixture DOCX/PDF/XLSX/MD → poll for EPUB → validate EPUB structure using ebooklib.
- Annotation lifecycle: create session → create annotation → resolve annotation → verify audit event persisted.
- Font override: load EPUB with embedded fonts → inject platform stylesheet → assert computed font-family in iframe matches platform config.
- WebSocket presence: two clients join the same session → assert both receive each other's presence events within 500ms.

### 11.3 E2E Tests (Playwright)

Key user flows covered:

1. Upload DOCX → wait for EPUB render → verify first chapter is visible with correct fonts
2. AI creates critical flag → reviewer sees red highlight → reviewer resolves → progress bar updates → document can now be approved
3. Reviewer selects text → opens AI panel → submits compliance check query → AI response streams → citation link navigates to KB source
4. XLSX upload → EPUB renders table correctly → reviewer edits cell → EPUB re-renders with updated value
5. Platform Administrator changes font profile → active session receives page-reload prompt → after reload, new font is applied

### 11.4 Performance Tests

- k6 load test: 200 concurrent users each with an active document session, simulating annotation creation, AI queries, and cursor updates. Pass criteria: P95 annotation create < 500ms; P95 AI stream start < 2s; no WebSocket disconnects under load.
- EPUB conversion stress test: 50 concurrent conversion jobs with mixed formats. Pass criteria: all complete within 30 seconds; no job failures.

---

## 12. Dependency Summary

### 12.1 Frontend Dependencies

| Package | Version | Licence | Purpose |
|---------|---------|---------|---------|
| react | 19.x | MIT | UI framework |
| typescript | 5.x | Apache-2.0 | Type safety |
| vite | 6.x | MIT | Build tool |
| zustand | 5.x | MIT | State management |
| @tanstack/react-query | 5.x | MIT | Server state |
| @tanstack/react-virtual | 3.x | MIT | Annotation list virtualisation |
| epubjs | 0.3.x | BSD-2-Clause | EPUB renderer |
| @codemirror/lang-markdown | 6.x | MIT | Markdown editor |
| remark | 15.x | MIT | Markdown parser |
| rehype-react | 8.x | MIT | HAST → React |
| diff-match-patch | 1.x | Apache-2.0 | Diff rendering |
| socket.io-client | 4.x | MIT | WebSocket client |
| ky | 1.x | MIT | HTTP client |
| react-router | 7.x | MIT | Routing |
| tailwindcss | 4.x | MIT | Styling |
| @radix-ui/react-* | 1.x | MIT | Accessible primitives |
| i18next | 24.x | MIT | Internationalisation |
| react-hotkeys-hook | 4.x | MIT | Keyboard shortcuts |
| react-markdown | 9.x | MIT | AI response rendering |

### 12.2 Backend Dependencies

| Package | Version | Licence | Purpose |
|---------|---------|---------|---------|
| fastify | 5.x | MIT | Node.js API framework |
| fastapi | 0.115.x | MIT | Python API framework |
| prisma | 6.x | Apache-2.0 | Node.js ORM |
| sqlalchemy | 2.x | MIT | Python ORM |
| openpyxl | 3.x | MIT | XLSX parsing |
| formulas | 1.x | MIT | XLSX formula evaluation |
| pdfminer.six | 20231228 | MIT | PDF text extraction |
| pymupdf (fitz) | 1.x | AGPL-3.0* | PDF image extraction |
| ebooklib | 0.18 | LGPL-3.0 | EPUB3 construction |
| pandoc | 3.x | GPL-2.0* | DOCX/MD/HTML → EPUB |
| langchain | 0.3.x | MIT | LLM orchestration |
| bullmq | 5.x | MIT | Job queue |
| socket.io | 4.x | MIT | WebSocket server |
| ioredis | 5.x | MIT | Redis client (Node) |
| redis-py | 5.x | MIT | Redis client (Python) |
| pillow | 10.x | PIL | Image processing |

> **⚠️ Licence notes:**
> - **PyMuPDF (fitz):** AGPL-3.0 for open-source use; a commercial licence is available and required for proprietary SaaS deployment. Evaluate licence cost at procurement.
> - **Pandoc:** GPL-2.0. Used as a subprocess (not linked), which avoids GPL propagation to the calling service. Confirm with legal counsel.
> - **ebooklib:** LGPL-3.0. Dynamic linking is fine for proprietary use.

### 12.3 Infrastructure Dependencies

| Component | Technology | Notes |
|-----------|-----------|-------|
| Container orchestration | Kubernetes 1.30+ | EKS / GKE / AKS |
| Autoscaling | KEDA 2.x | Conversion queue scaling |
| Database | PostgreSQL 16 | RDS / Cloud SQL |
| Cache / Queue | Redis 7.x | ElastiCache / Memorystore |
| Object storage | S3 / GCS | Regional buckets per tenant |
| CDN | CloudFront / Fastly | Fonts + static assets |
| API Gateway | Kong OSS 3.x | Route management, auth |
| Service mesh | Istio / Linkerd | mTLS, observability |
| Observability | OpenTelemetry + Grafana + Loki | Traces, metrics, logs |
| Alerting | PagerDuty | On-call integration |
| Secrets | HashiCorp Vault | Dynamic secrets rotation |
| CI/CD | GitHub Actions | Build → test → deploy |

---

*— End of Document —*

*Technical Architecture Specification v1.0 | HITL Module | Future Platform | March 2026 | Internal — Engineering*

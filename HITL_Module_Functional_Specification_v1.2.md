# Functional Specification: Human-in-the-Loop Document Review & AI Collaboration Module

**Status:** Draft for Review  
**Version:** 1.1  
**Date:** March 2026  
**Owner:** Product Team  
**Classification:** Internal Document

> **v1.1 Changes:** Added EPUB as a supported display format across all relevant sections. Added detailed XLSX-to-EPUB conversion requirements (§5.1.3). Added Client Default Font Configuration requirements (§5.1.4).

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Context & Problem Statement](#2-context--problem-statement)
3. [Module Scope](#3-module-scope)
4. [User Roles](#4-user-roles)
5. [Functional Requirements](#5-functional-requirements)
   - 5.1 [Document Preview & Format Fidelity](#51-document-preview--format-fidelity)
   - 5.2 [Attention Guidance System](#52-attention-guidance-system)
   - 5.3 [AI Agent Interaction](#53-ai-agent-interaction)
   - 5.4 [Human Collaboration](#54-human-collaboration)
   - 5.5 [Document Editing](#55-document-editing)
   - 5.6 [Knowledge Base Integration](#56-knowledge-base-integration)
   - 5.7 [Audit Trail](#57-audit-trail)
6. [Non-Functional Requirements](#6-non-functional-requirements)
7. [UX Layout Principles](#7-ux-layout-principles)
8. [Integration Points](#8-integration-points)
9. [Open Questions](#9-open-questions)
10. [Glossary](#10-glossary)

---

## 1. Executive Summary

This document defines the functional requirements for the **Human-in-the-Loop (HITL) Document Review and AI Collaboration Module** — a core component of the Future Platform.

The module creates a unified workspace in which **human reviewers, AI agents, and automated knowledge base integrations** collaborate on documents throughout high-stakes review, validation, and editing workflows.

| Goal | Scope | Key Constraint |
|------|-------|----------------|
| Provide structured, auditable human oversight of AI-generated and AI-validated documents | Document preview, attention guidance, AI/human collaboration, multi-format editing | Formatting fidelity must be preserved on-screen for all supported formats; client-side font rendering must use the typography defined in platform configuration |

---

## 2. Context & Problem Statement

### 2.1 Background

Enterprise customers operate complex knowledge bases — process documentation, contracts, compliance policies, technical manuals — and are increasingly relying on AI agents to generate, validate, and transform these documents.

However, fully autonomous AI operation is not viable for high-stakes decisions. A **structured human review layer** is required.

The Future Platform connects documents to a customer's knowledge base at the session level. AI agents generate or validate documents contextually. This module provides the front-end workspace where humans interact with those outputs before they are accepted, corrected, or escalated.

### 2.2 Core Problems

- Reviewers working with AI-generated documents have no structured mechanism to understand which parts require their attention
- There is no in-context way to request clarification or alternative suggestions from AI or colleagues without leaving the document
- Editing documents in PDF, XLSX, DOCX, EPUB, and MD formats requires different tools for each format, breaking the workflow
- Format fidelity is lost when documents are rendered in browser environments, reducing reviewer confidence
- Inconsistent font rendering across client environments degrades readability and breaks visual consistency for compliance-sensitive documents

### 2.3 Opportunity

By unifying format-faithful preview, AI interaction, human collaboration, and editing in a single module — connected to the customer knowledge base — the platform can dramatically reduce review cycle time while maintaining the audit standards required for compliance-sensitive use cases.

---

## 3. Module Scope

### 3.1 In Scope

- Document preview with faithful format rendering for XLSX, PDF, MD, DOCX, and **EPUB**
- **EPUB** as the standard client-side display format; server-side conversion pipeline for XLSX-to-EPUB and other source formats where applicable
- **Client default font configuration**: platform-level font settings applied uniformly to all rendered EPUB documents
- Attention guidance system: highlighting, annotations, and critical section flagging
- AI agent interaction panel: context-aware queries, suggestions, and validation responses
- Human collaboration: comments, mentions, review requests, and resolution tracking
- Inline editing for Markdown; structured editing for XLSX and DOCX; annotation layer for PDF; read-with-annotation mode for EPUB
- Knowledge base context injection at the session and document level
- Audit trail for all human and AI agent actions within the module

### 3.2 Out of Scope (v1.0)

- Document generation (handled by the upstream AI agent pipeline)
- Knowledge base management or content ingestion
- Document routing and workflow orchestration beyond review state transitions
- Native mobile application (responsive web design is in scope)

---

## 4. User Roles

| Role | Responsibilities | Key Needs |
|------|-----------------|-----------|
| **Document Reviewer** | Reviews flagged sections, accepts or rejects AI output, requests clarification | Clear attention guidance, fast AI responses, convenient accept/reject actions |
| **Subject Matter Expert (SME)** | Provides expert validation on specific sections, responds to review requests | Section-scoped context; ability to comment without reviewing the full document |
| **Compliance Officer** | Ensures regulatory compliance, maintains the audit trail, reviews the resolution log | Full audit history, traceability of changes, export capabilities |
| **AI Agent (System)** | Flags critical sections, suggests edits, responds to queries, validates against the KB | Structured interaction protocol, KB context, clear user intent signals |
| **Platform Administrator** | Configures the module, manages agent access, monitors usage; **defines the client default font configuration** | Configuration UI, usage metrics, integration management, font profile management |

---

## 5. Functional Requirements

### 5.1 Document Preview & Format Fidelity

The module must render source documents in a preview pane that faithfully preserves the visual structure of the original. This is a **non-negotiable requirement**: reviewers must see what the document actually looks like, not a reinterpreted text representation.

All supported formats are displayed to the client in **EPUB**. Source documents that are not natively EPUB are converted server-side prior to delivery to the preview pane. The client rendering engine is a single, consistent EPUB renderer; format-specific rendering differences are resolved at the conversion layer, not the display layer.

#### 5.1.1 Format Rendering Requirements

| Source Format | Client Display Format | Conversion Method | Editing Mode |
|--------------|----------------------|-------------------|--------------|
| **DOCX (Word)** | EPUB | Server-side OOXML-to-EPUB pipeline; preserves headings, tables, tracked changes as EPUB annotations, and inline comments | Read + annotation overlay; tracked changes surfaced as EPUB highlights |
| **PDF** | EPUB | Server-side PDF-to-EPUB extraction; text layer reflow with page boundary markers retained; images embedded as EPUB figures | Annotation overlay; no direct text editing |
| **XLSX (Excel)** | EPUB | Server-side XLSX-to-EPUB conversion pipeline (see §5.1.3 for full specification) | Cell-level data review via structured EPUB table; value editing via overlay grid |
| **Markdown (MD)** | EPUB | CommonMark-to-EPUB conversion; syntax highlighting for code blocks rendered as EPUB `<pre>` elements; front matter displayed as EPUB metadata | Inline rich-text or raw Markdown editing with live EPUB preview |
| **EPUB (native)** | EPUB | Served directly; no conversion required | Read + annotation overlay |

#### 5.1.2 Preview Pane Capabilities

- Zoom control (50%–200%) with fit-to-width as default; EPUB reflow mode available as an alternative to fixed-zoom
- Page/chapter navigation with thumbnail strip for multi-chapter EPUB documents
- Toggle between original and clean (annotation-free) view
- Side-by-side diff view when AI has proposed edits (original vs. proposed), both rendered as EPUB
- Persistent scroll position and chapter location across browser sessions
- Print-to-PDF export from the rendered EPUB view, preserving the formatted layout

#### 5.1.3 XLSX-to-EPUB Conversion Pipeline

XLSX files cannot be rendered natively in an EPUB reader and require a dedicated server-side conversion pipeline before display. The following requirements govern this conversion.

**Conversion Scope**

- All worksheets in the workbook are converted and included in the EPUB as separate EPUB chapters, one per sheet, in workbook tab order
- The EPUB table of contents (NCX/Nav) lists all sheet names, allowing direct chapter navigation
- Sheets marked as hidden in the source XLSX are excluded from the EPUB output by default; a reviewer option to include hidden sheets is configurable per session

**Table Rendering**

- Each worksheet is rendered as an HTML table within its EPUB chapter
- Cell values are rendered as their display-formatted output (e.g. currency, date, percentage formats applied), not raw underlying values
- Formula cells display the evaluated result; formula expressions are not shown in the EPUB view but are accessible via a hover tooltip in the annotation overlay
- Merged cells are preserved using EPUB/HTML `colspan` and `rowspan` attributes
- Static chart images are embedded as EPUB figures with alt-text derived from the chart title; dynamic chart rendering is not supported in the EPUB output
- Frozen rows (header rows) are identified and rendered with a `<thead>` element; the EPUB renderer applies sticky-header styling defined in the client font and style configuration (see §5.1.4)

**Cell Formatting Fidelity**

- Number formats (currency, date, time, percentage, decimal precision) are applied to cell values at conversion time and reflected in the rendered text
- Bold and italic cell-level formatting is preserved via standard HTML inline elements within the EPUB
- Text alignment (left, centre, right) is preserved via CSS within the EPUB stylesheet
- Background cell colour is preserved as CSS background-color in the EPUB; colours are passed through without modification unless the Platform Administrator has configured a forced-light-mode override
- Font family and size applied at the cell level in the source XLSX are **overridden** by the client default font configuration (see §5.1.4); source-file fonts are not embedded in the EPUB

**Limitations and Degradation Behaviour**

- Conditional formatting rules are not evaluated or rendered in the EPUB output; affected cells display without conditional styling
- Sparklines are not supported and are omitted from the EPUB output; a conversion notice is inserted in the relevant cell position
- Pivot tables are rendered as their static display values at the time of conversion; pivot table interactivity is not available
- Sheets exceeding 5,000 rows are paginated within the EPUB chapter at 500-row page boundaries, with navigation controls inserted between pages
- Password-protected sheets cannot be converted; the EPUB chapter displays an error notice with instructions to unlock the sheet and re-upload

**Conversion Audit**

- Every XLSX-to-EPUB conversion event is logged in the audit trail (see §5.7) with: source file hash, conversion timestamp, sheet count, row counts per sheet, and any degradation notices generated

#### 5.1.4 Client Default Font Configuration

All documents displayed in the preview pane are rendered using **client-configured default fonts**. This ensures visual consistency across all document types and reviewer sessions, regardless of the fonts embedded or specified in the source file.

**Configuration Scope**

Font configuration is defined at the **platform level** by the Platform Administrator and applies uniformly to all EPUB documents rendered in the module. Document-level or session-level font overrides by individual users are not permitted.

**Configurable Font Parameters**

| Parameter | Description | Default Value |
|-----------|-------------|---------------|
| `font.body.family` | Font family for body text and table cell content | `"Inter"` |
| `font.body.size` | Base font size for body text (in `rem`; EPUB renderer scales proportionally) | `1.0rem` (≈ 16px) |
| `font.heading.family` | Font family for headings (H1–H6 in EPUB) | `"Inter"` |
| `font.heading.scale` | Scale factor applied per heading level relative to body size | H1: 2.0×, H2: 1.5×, H3: 1.25× |
| `font.mono.family` | Font family for code blocks and monospace content | `"JetBrains Mono"` |
| `font.lineHeight` | Line height multiplier applied to all body text | `1.6` |
| `font.tableHeader.weight` | Font weight for table header cells (`<thead>`) | `600` |

**Font Loading**

- All configured fonts must be loaded from the platform's self-hosted font CDN or a pre-approved external font provider specified in the platform configuration
- Fonts are preloaded at module initialisation; document rendering does not begin until the primary body and heading font families have loaded successfully
- If a configured font fails to load, the renderer falls back to the browser system font stack (`system-ui, -apple-system, sans-serif`) and logs a font-load failure event in the audit trail
- Web font formats WOFF2 (preferred) and WOFF are supported; TTF/OTF are not served to the client

**Override Behaviour**

- Source document fonts (embedded in DOCX, EPUB, or specified in XLSX cell styles) are **ignored** at render time; the client default font configuration takes precedence in all cases
- EPUB documents that include their own stylesheet `font-family` declarations have those declarations overridden by the platform EPUB stylesheet injected at delivery time
- This override is applied consistently across all source formats and conversion paths; there is no mechanism for a source document to propagate its fonts to the client display

**Configuration Management**

- Font configuration is managed through the Platform Administration UI under **Display Settings > Typography**
- Changes to font configuration take effect for new document sessions immediately; active sessions require a page reload to apply updated font settings
- The Platform Administrator can define up to **three named font profiles** (e.g. "Default", "Accessibility", "Print") and assign a profile as the active client default
- Font profile changes are logged in the platform-level audit log with the administrator's identity, the previous and new profile names, and a timestamp

---

### 5.2 Attention Guidance System

The Attention Guidance System allows AI agents and human reviewers to direct attention to specific document sections. This is the **primary mechanism** for surfacing critical review items within the normal document reading flow.

#### 5.2.1 Highlight & Annotation Types

| Annotation Type | Initiator | Description |
|-----------------|-----------|-------------|
| **Critical Flag** | AI Agent | Red highlight on a section requiring mandatory human decision; blocks approval until resolved |
| **Attention Marker** | AI Agent | Amber highlight on a section recommended for review; non-blocking but tracked |
| **Validation Notice** | AI Agent | Blue sidebar marker indicating the section was validated against the knowledge base |
| **Human Comment** | Human | Threaded comment anchored to a text range, table cell, or EPUB text node; supports @mentions |
| **Review Request** | Human | Directed annotation requesting a specific named user or role to review a section |
| **Edit Suggestion** | AI or Human | Inline redline showing a proposed text change; can be accepted or rejected individually |
| **Resolved Marker** | System | Greyed annotation indicating the item was addressed; remains visible in audit view |

#### 5.2.2 Attention Navigation

- **Attention panel**: collapsible sidebar listing all open annotations sorted by severity, then by position
- **Jump-to-annotation**: clicking any item in the panel scrolls and focuses the relevant document section (for EPUB, navigates to the containing chapter and highlights the anchored node)
- **Keyboard navigation**: next/previous critical flag (`Ctrl+]`, `Ctrl+[`)
- **Progress indicator**: shows N of M critical flags resolved with a visual completion bar
- **Filtering** of annotations by type, initiator, status (open/resolved), or date

---

### 5.3 AI Agent Interaction

The AI interaction panel provides a structured, context-aware interface for communicating with AI agents connected to the customer knowledge base. All interactions are scoped to the current document and optionally to a selected text range.

#### 5.3.1 AI Panel Layout

- Persistent side panel (collapsible, resizable) with a conversation thread per document
- **Selection-scoped mode**: when text, table cells, or EPUB text nodes are selected, AI queries are automatically contextualised to that range
- **Quick action toolbar**: pre-defined prompts (Explain this section, Validate against KB, Suggest edit, Check compliance, Summarise)
- Freeform query input with document and selection context injected automatically
- Response rendering: Markdown-formatted AI responses with inline code and table support

#### 5.3.2 AI Interaction Capabilities

| Capability | Description | Priority |
|------------|-------------|----------|
| **Section Explanation** | AI explains the meaning, intent, or implications of a selected document section using KB context | Must Have |
| **KB Validation** | AI validates selected content against the connected knowledge base and reports discrepancies | Must Have |
| **Edit Suggestion** | AI proposes specific text edits in redline format; the user can accept or reject each | Must Have |
| **Compliance Check** | AI checks a section against regulatory rules defined in the KB; returns pass/fail with citations | Must Have |
| **Summarisation** | AI generates a summary of the full document or a selected section | Should Have |
| **Alternative Phrasing** | AI suggests alternative formulations for selected text | Should Have |
| **Cross-reference Check** | AI identifies references to other documents and validates consistency | Could Have |
| **Risk Scoring** | AI assigns a risk score to flagged sections based on KB rules | Could Have |

#### 5.3.3 AI Response Behaviour

- All AI responses must **cite the knowledge base source** when making factual claims
- AI must clearly indicate the **confidence level** for validation outputs (High / Medium / Low)
- AI interactions are logged with timestamp, model version, and prompt hash for audit purposes
- AI responses are **not presented as final** — all require human confirmation before affecting document state

---

### 5.4 Human Collaboration

The module supports asynchronous and synchronous collaboration between multiple human reviewers, enabling review requests, threaded comments, and resolution workflows without leaving the document context.

#### 5.4.1 Commenting & Mentions

- Anchor comments to any text range, table cell, or EPUB text node across all supported formats
- Threaded replies within each comment; supports Markdown formatting in the comment body
- `@mention` any user with platform access to the document; generates in-app and email notifications
- Emoji reactions on comments (lightweight acknowledgement without creating a reply)

#### 5.4.2 Review Request Workflow

- Any reviewer can direct a named review request to a specific user, role, or team
- Review requests appear in the recipient's notification queue and attention panel
- The request includes: section context, deadline (optional), instructions, and urgency level
- The requester is notified when the review request is resolved or when the reviewer adds a response
- Unresolved review requests block document approval (configurable)

#### 5.4.3 Presence & Awareness

- Real-time presence indicators showing which users are currently viewing the document
- Cursor/selection broadcasting in collaborative editing sessions (DOCX and MD formats)
- Last-viewed timestamp per user, visible to collaborators

---

### 5.5 Document Editing

Editing capabilities are format-specific and designed to maintain the structural integrity of the source document. The module does not aim to replace dedicated desktop editors but must support review-quality editing sufficient for the HITL workflow. EPUB is the display format; edits made within the module are written back to the source document format and trigger a re-conversion to EPUB for updated display.

#### 5.5.1 Markdown Editing

- Split-pane editor: raw Markdown on the left, live EPUB preview on the right (toggleable)
- Toolbar for common formatting: bold, italic, heading levels, lists, tables, code blocks, links
- Autosave with a 30-second interval and a manual save trigger
- Full-document and selection-level diff against the last saved version
- Version history with restore capability (last 50 versions retained)

#### 5.5.2 DOCX Editing

- **Tracked-changes mode is enforced** during review (all edits recorded as insertions/deletions)
- Accept/reject individual tracked changes or all changes within a selection
- In-document comment addition and resolution
- Table cell and paragraph text editing; layout changes are not supported in-browser
- Export with tracked changes preserved or with all changes accepted (clean copy)

#### 5.5.3 XLSX Editing

- Cell-level value editing via the structured overlay grid displayed over the EPUB table view
- Edits are applied to the source XLSX file; the EPUB display is regenerated following each save
- Cell formatting adjustments: number format, alignment; style changes are not in scope for v1.0
- Comment/note addition at the cell level
- Row/column insertion and deletion with a downstream formula impact warning
- Protected cell indicators: AI-flagged cells display a lock icon; editing requires an override confirmation

#### 5.5.4 PDF Interaction

- PDF is read-only in terms of content; no text editing of the PDF source
- Annotation overlay: highlight, underline, strikethrough, sticky note (applied to the EPUB display layer)
- Annotation export as a separate FDF/XFDF file or embedded into a copy of the source PDF
- Form field completion where the PDF contains AcroForm fields

#### 5.5.5 EPUB Interaction

- Native EPUB documents are read-only in terms of content; no text editing of the EPUB source
- Annotation overlay: highlight, underline, sticky note anchored to EPUB text nodes (CFI-based)
- Annotations are stored separately from the EPUB file and associated via the document session
- Annotation export as a W3C Web Annotation JSON file

#### 5.5.6 Edit History & Versioning

- All edits are timestamped and attributed to the acting user or AI agent
- Full edit history is accessible from the version panel; each version is browsable in the EPUB preview
- Rollback to any prior version requires explicit confirmation
- Version branching is not supported in v1.0; linear history only

---

### 5.6 Knowledge Base Integration

Each document session is connected to the customer's knowledge base at the platform level. The module surfaces KB context within the editing and review experience without requiring reviewers to navigate away.

- **KB context panel**: shows KB articles and rules relevant to the current document section as the user scrolls through the EPUB
- **Explicit KB search**: reviewers can search the KB from within the module and pin results to the session
- AI agents are automatically provided with **KB context scoped to the current section** when responding to queries
- **KB citations** appear inline when AI makes a KB-backed claim; clicking navigates to the KB source
- **KB connection status indicator** is visible at all times; degraded mode if the KB is unavailable

---

### 5.7 Audit Trail

All actions within the module — by humans and AI agents — are recorded in an **immutable audit log** accessible to compliance roles.

- **Logged events**: document open/close, annotation create/resolve, AI query/response, edit (with diff), accept/reject change, review request create/complete, approval state change, **XLSX-to-EPUB conversion events (see §5.1.3)**, **font-load failure events**, **font profile changes (platform-level)**
- **Each event records**: timestamp (UTC), actor (user ID or agent ID), action type, scope (document ID, section, EPUB CFI range, or cell range), and before/after state where applicable
- The audit log is exportable in **CSV and JSON** formats
- **Log retention**: minimum 7 years (configurable per customer compliance tier)
- The audit log is **append-only**; no delete or modification operations are permitted

---

## 6. Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| **Performance** | EPUB document preview renders within 3 seconds for files up to 50 MB. XLSX-to-EPUB conversion completes within 10 seconds for workbooks up to 10,000 rows; larger files display a progress indicator. AI panel response begins streaming within 2 seconds of submission |
| **Scalability** | Module supports up to 200 concurrent sessions per tenant without degradation. File size limit: 200 MB per source document |
| **Availability** | 99.5% uptime SLA. Graceful degradation: AI features and conversion pipeline fail independently of EPUB preview and annotation |
| **Security** | All document content is encrypted at rest and in transit. AI agent access is scoped to the tenant KB only. No cross-tenant data leakage. EPUB conversion is performed in an isolated server-side process |
| **Accessibility** | WCAG 2.1 AA compliance. All annotation types have keyboard-accessible equivalents. Screen-reader compatible attention panel. EPUB display format supports accessible reading order and semantic structure |
| **Browser Support** | Chrome 120+, Firefox 120+, Edge 120+, Safari 17+. No native app required |
| **Localisation** | UI text supports an i18n framework. Date/time formats respect the user's locale. RTL layout support in v1.1; EPUB RTL reading direction is respected for RTL-locale documents |
| **Data Residency** | Document content and EPUB conversion is processed in the tenant's designated cloud region. AI inference may be cross-region (configurable) |

---

## 7. UX Layout Principles

The module is structured as a **three-zone workspace**:

```
┌─────────────────────────────────────────────────────────────────┐
│                           TOOLBAR                                │
├──────────────────┬──────────────────────────────┬───────────────┤
│                  │                              │               │
│   ATTENTION      │     DOCUMENT                 │  CONTEXT /    │
│   PANEL          │     PREVIEW                  │  COLLABORATION│
│   (15–20%)       │     (55–65%)                 │  (25–30%)     │
│                  │                              │               │
│  • Annotations   │  • EPUB render (all formats) │  • AI chat    │
│  • Navigation    │  • Annotation overlay        │  • KB context │
│  • Versions      │  • Review progress           │  • Comments   │
│                  │                              │               │
└──────────────────┴──────────────────────────────┴───────────────┘
```

### 7.1 Layout States

| State | Description |
|-------|-------------|
| **Default** | All three zones visible on screens wider than 1280px |
| **Focus mode** | Left and right panels collapsed; EPUB document pane fills available width |
| **Side-by-side diff** | Document pane splits vertically showing original and AI-proposed EPUB versions |
| **Mobile/tablet** | Panels accessed via bottom drawer; single-zone view at all times |

### 7.2 Key UX Principles

- **The document is always the primary surface** — panels are secondary and collapsible
- Critical flags must be visible **without requiring panel expansion** (inline margin indicators)
- All AI interactions are **clearly attributed** and visually distinct from human actions
- Destructive actions (accept all, rollback) require a **two-step confirmation**
- Current review progress (N flags resolved) is **always visible** in the toolbar
- **Font rendering is always platform-controlled** — no per-user typography overrides are exposed in the UI

---

## 8. Integration Points

### 8.1 Platform APIs

| API | Purpose |
|-----|---------|
| **Document Storage API** | Fetch, save, and version document content |
| **EPUB Conversion API** | Server-side conversion of DOCX, PDF, XLSX, and MD to EPUB; returns conversion manifest and any degradation notices |
| **Knowledge Base API** | Search, retrieve, and subscribe to KB updates |
| **AI Agent Orchestration API** | Submit queries, receive streaming responses, register feedback |
| **User & Permissions API** | Resolve user identities, roles, and document access rights |
| **Notification API** | Dispatch in-app and email notifications for mentions and review requests |
| **Platform Configuration API** | Read active font profile and typography settings at session initialisation |

### 8.2 Export & Downstream Integrations

- Approved documents are pushed to the Document Storage API with approval metadata in both source format and EPUB
- Audit logs are streamed to the customer's configured SIEM or data warehouse
- Review completion triggers a configurable webhook for downstream workflow systems

---

## 9. Open Questions

| # | Question | Implication |
|---|----------|-------------|
| 1 | Should DOCX editing use a WASM-based renderer (e.g. ONLYOFFICE, Collabora) or a server-side image pipeline? | WASM enables true native editing but adds significant bundle size and licensing complexity; in v1.1, all display is EPUB so the question becomes: which pipeline produces the highest-fidelity EPUB from DOCX? |
| 2 | What is the conflict resolution model when AI and human edits overlap on the same text range? | Determines whether the system uses operational transform, CRDT, or a lock-based approach |
| 3 | Should AI-flagged Critical sections block document export/approval or only block state transitions within the workflow? | Affects the strictness of the enforcement model and the reviewer experience |
| 4 | Is real-time collaborative editing (multi-cursor) required for v1.0 or v1.1? | Real-time sync infrastructure (WebSocket + OT/CRDT) represents significant engineering scope |
| 5 | What is the maximum number of annotations expected per document in practice? | Informs the virtualisation strategy for the annotation panel and the rendering performance budget |
| 6 | Which EPUB conversion library or service will be used for the server-side pipeline? | Candidates include Pandoc, Calibre (headless), or a commercial EPUB conversion API; choice affects conversion fidelity, licensing, and maintenance burden |
| 7 | Should the client font configuration support per-tenant font uploads, or only fonts from a pre-approved registry? | Custom font uploads require a font validation and CDN hosting pipeline; pre-approved registries are simpler but less flexible for enterprise brand requirements |
| 8 | How should the EPUB viewer handle XLSX sheets that exceed the 5,000-row pagination threshold? | Inline pagination vs. lazy-loading vs. a separate "large data" view mode each have different UX and performance implications |

---

## 10. Glossary

| Term | Definition |
|------|------------|
| **HITL** | Human-in-the-Loop — a process design pattern requiring human review and decision-making at defined points in an otherwise automated workflow |
| **KB (Knowledge Base)** | The customer's structured repository of documents, rules, policies, and reference material connected to the platform |
| **Critical Flag** | An annotation placed by an AI agent indicating a document section requires mandatory human decision before the document can be approved |
| **Attention Marker** | A non-blocking annotation suggesting (but not requiring) human review of a section |
| **Tracked Change** | A document edit recorded with author attribution and timestamp, which can be individually accepted or rejected — consistent with the OOXML tracked changes standard |
| **AI Agent** | An automated process connected to the platform that can read, validate, flag, and suggest edits to documents using the customer KB as context |
| **Session** | A single instance of the module loaded for a specific document by a specific user, with an active KB connection |
| **Audit Trail** | The immutable, append-only log of all human and AI actions taken within the module for a given document |
| **Graceful Degradation** | System behaviour whereby the failure of one component (e.g. AI) does not block the functioning of the remaining components |
| **Diff** | A visual comparison of two document versions with changes highlighted |
| **CRDT** | Conflict-free Replicated Data Type — a data structure that allows concurrent changes without merge conflicts |
| **FDF/XFDF** | Forms Data Format / XML Forms Data Format — formats for storing PDF annotations and form data separately from the main file |
| **EPUB** | Electronic Publication — an open e-book standard (IDPF/W3C) used as the unified client-side display format for all documents in the module |
| **EPUB CFI** | EPUB Canonical Fragment Identifier — a standard addressing scheme for identifying precise locations within an EPUB document, used to anchor annotations to specific text nodes |
| **XLSX-to-EPUB Conversion Pipeline** | The server-side process that transforms Excel workbooks into EPUB documents with one chapter per worksheet, applying the client font configuration and resolving unsupported features with defined degradation behaviour |
| **Font Profile** | A named set of client typography configuration parameters (font families, sizes, weights, line height) defined by the Platform Administrator and applied uniformly to all EPUB documents rendered in the module |
| **Conversion Manifest** | A machine-readable record produced by the EPUB Conversion API documenting the source file, output file, sheet/page counts, degradation notices, and conversion timestamp for a given conversion event |

---

*— End of Document —*

*Functional Specification v1.1 | Future Platform | March 2026 | Internal Use Only*

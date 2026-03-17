export type SourceFormat = "docx" | "pdf" | "xlsx" | "md" | "epub";
export type ConversionStatus = "pending" | "processing" | "complete" | "failed";
export type ReviewState = "open" | "pending_approval" | "approved" | "rejected";
export interface Document {
    id: string;
    tenantId: string;
    title: string;
    sourceFormat: SourceFormat;
    currentVersionId: string;
    reviewState: ReviewState;
    createdAt: string;
    updatedAt: string;
}
export interface DocumentVersion {
    id: string;
    documentId: string;
    versionNumber: number;
    sourceS3Key: string;
    epubS3Key: string | null;
    conversionStatus: ConversionStatus;
    conversionManifest: ConversionManifest | null;
    createdAt: string;
    createdBy: string;
}
export interface Annotation {
    id: string;
    sessionId: string;
    documentId: string;
    documentVersionId: string;
    authorId: string | null;
    agentId: string | null;
    type: AnnotationType;
    cfi: string;
    cfiText: string;
    payload: AnnotationPayload;
    status: "open" | "resolved" | "rejected";
    resolvedById: string | null;
    resolvedAt: string | null;
    createdAt: string;
    replies: AnnotationReply[];
}
export type AnnotationType = "critical_flag" | "attention_marker" | "validation_notice" | "human_comment" | "review_request" | "edit_suggestion";
export interface CriticalFlagPayload {
    type: "critical_flag";
    reason: string;
    kbSourceId?: string;
}
export interface AttentionMarkerPayload {
    type: "attention_marker";
    reason: string;
}
export interface ValidationNoticePayload {
    type: "validation_notice";
    kbSourceId: string;
    validationResult: "pass" | "fail";
    detail: string;
}
export interface HumanCommentPayload {
    type: "human_comment";
    body: string;
    mentions: string[];
}
export interface ReviewRequestPayload {
    type: "review_request";
    assignedTo: string;
    deadline?: string;
    instructions: string;
    urgency: "low" | "normal" | "high";
}
export interface EditSuggestionPayload {
    type: "edit_suggestion";
    originalText: string;
    proposedText: string;
    unifiedDiff: string;
    confidence: "High" | "Medium" | "Low";
}
export type AnnotationPayload = CriticalFlagPayload | AttentionMarkerPayload | ValidationNoticePayload | HumanCommentPayload | ReviewRequestPayload | EditSuggestionPayload;
export interface AnnotationReply {
    id: string;
    annotationId: string;
    authorId: string;
    body: string;
    createdAt: string;
}
export interface ConversionManifest {
    sourceFormat: string;
    sourceFileHash: string;
    convertedAt: string;
    sheets?: SheetManifest[];
    cfiToOoxmlMap?: Record<string, string>;
    pageCount?: number;
    degradationNotices: DegradationNotice[];
}
export interface SheetManifest {
    name: string;
    rowCount: number;
    columnCount: number;
    pageCount: number;
    chartsExtracted: number;
    degradationNotices: DegradationNotice[];
}
export type DegradationNoticeType = "conditional_formatting_omitted" | "sparkline_omitted" | "pivot_table_static" | "sheet_paginated" | "formula_eval_error" | "chart_rasterised" | "password_protected";
export interface DegradationNotice {
    sheet?: string;
    type: DegradationNoticeType;
    detail?: string;
    cellRef?: string;
}
export interface FontProfile {
    id: string;
    tenantId: string;
    name: string;
    isActive: boolean;
    config: {
        font: {
            body: {
                family: string;
                size: string;
            };
            heading: {
                family: string;
                scale: HeadingScale;
            };
            mono: {
                family: string;
            };
            lineHeight: number;
            tableHeader: {
                weight: number;
            };
        };
    };
}
export interface HeadingScale {
    h1: number;
    h2: number;
    h3: number;
    h4: number;
    h5: number;
    h6: number;
}
export interface Session {
    id: string;
    documentId: string;
    tenantId: string;
    userId: string;
    kbConnectionId?: string;
    createdAt: string;
    lastActiveAt: string;
    reviewState: ReviewState;
}
export interface AuditEvent {
    id: string;
    tenantId: string;
    documentId?: string;
    sessionId?: string;
    actorType: "user" | "agent" | "system";
    actorId: string;
    eventType: string;
    scope?: Record<string, unknown>;
    beforeState?: Record<string, unknown>;
    afterState?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    occurredAt: string;
}
export interface AiQueryPayload {
    sessionId: string;
    documentId: string;
    userQuery: string;
    selectionContext?: {
        cfi: string;
        text: string;
        chapterTitle: string;
    };
    quickAction?: "explain" | "validate" | "suggest_edit" | "compliance" | "summarise";
}
export interface PresenceUser {
    userId: string;
    displayName: string;
    avatarUrl: string;
    currentCfi: string;
    lastSeenAt: string;
}
export type Permission = "read:document" | "create:annotation" | "read:annotation" | "use:ai" | "read:audit" | "export:audit" | "all" | "write:font_profile" | "read:usage_metrics" | "write:annotation";
export * from "./events.js";

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "source_format" AS ENUM ('docx', 'pdf', 'xlsx', 'md', 'epub');
CREATE TYPE "review_state" AS ENUM ('open', 'pending_approval', 'approved', 'rejected');
CREATE TYPE "conversion_status" AS ENUM ('pending', 'processing', 'complete', 'failed');
CREATE TYPE "annotation_type" AS ENUM (
  'critical_flag',
  'attention_marker',
  'validation_notice',
  'human_comment',
  'review_request',
  'edit_suggestion'
);
CREATE TYPE "annotation_status" AS ENUM ('open', 'resolved', 'rejected');
CREATE TYPE "actor_type" AS ENUM ('user', 'agent', 'system');

CREATE TABLE "documents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "source_format" "source_format" NOT NULL,
  "current_version_id" UUID,
  "review_state" "review_state" NOT NULL DEFAULT 'open',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "document_versions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "document_id" UUID NOT NULL,
  "version_number" INTEGER NOT NULL,
  "source_s3_key" TEXT NOT NULL,
  "epub_s3_key" TEXT,
  "conversion_status" "conversion_status" NOT NULL DEFAULT 'pending',
  "conversion_manifest" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" TEXT NOT NULL,
  CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "document_id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "kb_connection_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_active_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "review_state" "review_state" NOT NULL DEFAULT 'open',
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "annotations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "session_id" UUID NOT NULL,
  "document_id" UUID NOT NULL,
  "document_version_id" UUID NOT NULL,
  "author_id" UUID,
  "agent_id" TEXT,
  "type" "annotation_type" NOT NULL,
  "cfi" TEXT NOT NULL,
  "cfi_text" TEXT,
  "payload" JSONB NOT NULL,
  "status" "annotation_status" NOT NULL DEFAULT 'open',
  "resolved_by_id" UUID,
  "resolved_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "annotations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "annotation_replies" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "annotation_id" UUID NOT NULL,
  "author_id" UUID NOT NULL,
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "annotation_replies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_events" (
  "id" BIGSERIAL NOT NULL,
  "tenant_id" UUID NOT NULL,
  "document_id" UUID,
  "session_id" UUID,
  "actor_type" "actor_type" NOT NULL,
  "actor_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "scope" JSONB,
  "before_state" JSONB,
  "after_state" JSONB,
  "metadata" JSONB,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "font_profiles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT false,
  "config" JSONB NOT NULL,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "font_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notifications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "read" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_documents_tenant_id" ON "documents" ("tenant_id");
CREATE INDEX "idx_document_versions_document_id" ON "document_versions" ("document_id");
CREATE INDEX "idx_sessions_tenant_id" ON "sessions" ("tenant_id");
CREATE INDEX "idx_sessions_document_id" ON "sessions" ("document_id");
CREATE INDEX "idx_annotations_document_status" ON "annotations" ("document_id", "status");
CREATE INDEX "idx_annotations_type_status" ON "annotations" ("type", "status");
CREATE INDEX "idx_annotations_session_id" ON "annotations" ("session_id");
CREATE INDEX "idx_annotation_replies_annotation_id" ON "annotation_replies" ("annotation_id");
CREATE INDEX "idx_audit_events_tenant_occurred_at" ON "audit_events" ("tenant_id", "occurred_at");
CREATE INDEX "idx_font_profiles_tenant_id" ON "font_profiles" ("tenant_id");
CREATE INDEX "idx_notifications_tenant_user_read" ON "notifications" ("tenant_id", "user_id", "read");

ALTER TABLE "document_versions"
  ADD CONSTRAINT "document_versions_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "documents"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "documents"
  ADD CONSTRAINT "documents_current_version_id_fkey"
  FOREIGN KEY ("current_version_id") REFERENCES "document_versions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "documents"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "annotations"
  ADD CONSTRAINT "annotations_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "annotations"
  ADD CONSTRAINT "annotations_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "documents"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "annotation_replies"
  ADD CONSTRAINT "annotation_replies_annotation_id_fkey"
  FOREIGN KEY ("annotation_id") REFERENCES "annotations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "documents" FORCE ROW LEVEL SECURITY;
CREATE POLICY "documents_tenant_isolation" ON "documents"
  USING ("tenant_id" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "sessions_tenant_isolation" ON "sessions"
  USING ("tenant_id" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "annotations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "annotations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "annotations_tenant_isolation" ON "annotations"
  USING (
    EXISTS (
      SELECT 1
      FROM "documents" d
      WHERE d."id" = "annotations"."document_id"
        AND d."tenant_id" = current_setting('app.current_tenant', true)::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM "documents" d
      WHERE d."id" = "annotations"."document_id"
        AND d."tenant_id" = current_setting('app.current_tenant', true)::uuid
    )
  );

ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "audit_events_tenant_isolation" ON "audit_events"
  USING ("tenant_id" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "font_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "font_profiles" FORCE ROW LEVEL SECURITY;
CREATE POLICY "font_profiles_tenant_isolation" ON "font_profiles"
  USING ("tenant_id" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE "document_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_versions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "document_versions_tenant_isolation" ON "document_versions"
  USING (
    EXISTS (
      SELECT 1
      FROM "documents" d
      WHERE d."id" = "document_versions"."document_id"
        AND d."tenant_id" = current_setting('app.current_tenant', true)::uuid
    )
  );

ALTER TABLE "annotation_replies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "annotation_replies" FORCE ROW LEVEL SECURITY;
CREATE POLICY "annotation_replies_tenant_isolation" ON "annotation_replies"
  USING (
    EXISTS (
      SELECT 1
      FROM "annotations" a
      JOIN "documents" d ON d."id" = a."document_id"
      WHERE a."id" = "annotation_replies"."annotation_id"
        AND d."tenant_id" = current_setting('app.current_tenant', true)::uuid
    )
  );

ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;
CREATE POLICY "notifications_tenant_isolation" ON "notifications"
  USING ("tenant_id" = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.current_tenant', true)::uuid);

DO $$
BEGIN
  CREATE ROLE audit_writer;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

GRANT SELECT, INSERT ON TABLE "audit_events" TO audit_writer;
GRANT USAGE, SELECT ON SEQUENCE "audit_events_id_seq" TO audit_writer;

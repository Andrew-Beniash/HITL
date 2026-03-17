-- Fix RLS policies: use NULLIF(...,'')::uuid so that RESET/missing tenant
-- returns NULL (no rows) instead of throwing an invalid-uuid cast error.
-- In application code the tenant is always set via SET LOCAL inside a transaction.

-- documents
DROP POLICY IF EXISTS "documents_tenant_isolation" ON "documents";
CREATE POLICY "documents_tenant_isolation" ON "documents"
  USING (NULLIF(current_setting('app.current_tenant', true), '')::uuid = "tenant_id")
  WITH CHECK (NULLIF(current_setting('app.current_tenant', true), '')::uuid = "tenant_id");

-- sessions
DROP POLICY IF EXISTS "sessions_tenant_isolation" ON "sessions";
CREATE POLICY "sessions_tenant_isolation" ON "sessions"
  USING (NULLIF(current_setting('app.current_tenant', true), '')::uuid = "tenant_id")
  WITH CHECK (NULLIF(current_setting('app.current_tenant', true), '')::uuid = "tenant_id");

-- audit_events
DROP POLICY IF EXISTS "audit_events_tenant_isolation" ON "audit_events";
CREATE POLICY "audit_events_tenant_isolation" ON "audit_events"
  USING (NULLIF(current_setting('app.current_tenant', true), '')::uuid = "tenant_id")
  WITH CHECK (NULLIF(current_setting('app.current_tenant', true), '')::uuid = "tenant_id");

-- font_profiles
DROP POLICY IF EXISTS "font_profiles_tenant_isolation" ON "font_profiles";
CREATE POLICY "font_profiles_tenant_isolation" ON "font_profiles"
  USING (NULLIF(current_setting('app.current_tenant', true), '')::uuid = "tenant_id")
  WITH CHECK (NULLIF(current_setting('app.current_tenant', true), '')::uuid = "tenant_id");

-- annotations (joined via documents)
DROP POLICY IF EXISTS "annotations_tenant_isolation" ON "annotations";
CREATE POLICY "annotations_tenant_isolation" ON "annotations"
  USING (
    EXISTS (
      SELECT 1 FROM "documents" d
      WHERE d."id" = "annotations"."document_id"
        AND NULLIF(current_setting('app.current_tenant', true), '')::uuid = d."tenant_id"
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "documents" d
      WHERE d."id" = "annotations"."document_id"
        AND NULLIF(current_setting('app.current_tenant', true), '')::uuid = d."tenant_id"
    )
  );

-- document_versions (joined via documents)
DROP POLICY IF EXISTS "document_versions_tenant_isolation" ON "document_versions";
CREATE POLICY "document_versions_tenant_isolation" ON "document_versions"
  USING (
    EXISTS (
      SELECT 1 FROM "documents" d
      WHERE d."id" = "document_versions"."document_id"
        AND NULLIF(current_setting('app.current_tenant', true), '')::uuid = d."tenant_id"
    )
  );

-- annotation_replies (joined via annotations → documents)
DROP POLICY IF EXISTS "annotation_replies_tenant_isolation" ON "annotation_replies";
CREATE POLICY "annotation_replies_tenant_isolation" ON "annotation_replies"
  USING (
    EXISTS (
      SELECT 1
      FROM "annotations" a
      JOIN "documents" d ON d."id" = a."document_id"
      WHERE a."id" = "annotation_replies"."annotation_id"
        AND NULLIF(current_setting('app.current_tenant', true), '')::uuid = d."tenant_id"
    )
  );

-- notifications
DROP POLICY IF EXISTS "notifications_tenant_isolation" ON "notifications";
CREATE POLICY "notifications_tenant_isolation" ON "notifications"
  USING (NULLIF(current_setting('app.current_tenant', true), '')::uuid = "tenant_id")
  WITH CHECK (NULLIF(current_setting('app.current_tenant', true), '')::uuid = "tenant_id");

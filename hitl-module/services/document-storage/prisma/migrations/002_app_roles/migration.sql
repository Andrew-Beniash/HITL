-- Create a non-superuser application role used by all services at runtime.
-- RLS policies are enforced for this role (superusers bypass RLS unconditionally).
DO $$
BEGIN
  CREATE ROLE app_user NOINHERIT NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Allow the hitl superuser to assume app_user for RLS testing
GRANT app_user TO hitl;

-- app_user needs full CRUD on all application tables
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "documents",
  "document_versions",
  "sessions",
  "annotations",
  "annotation_replies",
  "font_profiles",
  "notifications"
TO app_user;

-- app_user gets read-only access to audit events (audit_writer role handles writes)
GRANT SELECT, INSERT ON TABLE "audit_events" TO app_user;
GRANT USAGE, SELECT ON SEQUENCE "audit_events_id_seq" TO app_user;

-- audit_writer (created in 001_initial) also needs GRANT app_user for SET ROLE tests
DO $$
BEGIN
  GRANT app_user TO audit_writer;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

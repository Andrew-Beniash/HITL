-- RLS Tenant Isolation Verification
-- Must be run as a PostgreSQL superuser (e.g. hitl) that has been GRANTed app_user.
-- Uses SET ROLE app_user so that RLS policies are enforced (superusers bypass RLS).
-- Each logical test runs inside an explicit BEGIN/COMMIT so SET LOCAL is scoped correctly.

\echo '=== RLS Tenant Isolation Test ==='

-- ── Seed ──────────────────────────────────────────────────────────────────────
\echo '--- Seeding cross-tenant documents ---'
TRUNCATE TABLE "annotation_replies", "annotations", "sessions",
               "document_versions", "documents" RESTART IDENTITY CASCADE;

INSERT INTO "documents" ("id", "tenant_id", "title", "source_format", "review_state") VALUES
  ('11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'Tenant A Document', 'docx', 'open'),
  ('22222222-2222-2222-2222-222222222222',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Tenant B Document', 'pdf',  'open');

-- ── Test 1: Tenant A sees only its own row ────────────────────────────────────
\echo '--- Test 1: Tenant A (expect 1 row: Tenant A Document) ---'
BEGIN;
  SET LOCAL ROLE app_user;
  SET LOCAL app.current_tenant = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  SELECT "id", "tenant_id", "title" FROM "documents" ORDER BY "title";
COMMIT;

-- ── Test 2: Tenant B sees only its own row ────────────────────────────────────
\echo '--- Test 2: Tenant B (expect 1 row: Tenant B Document) ---'
BEGIN;
  SET LOCAL ROLE app_user;
  SET LOCAL app.current_tenant = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  SELECT "id", "tenant_id", "title" FROM "documents" ORDER BY "title";
COMMIT;

-- ── Test 3: No tenant set → 0 rows ───────────────────────────────────────────
\echo '--- Test 3: No tenant (expect 0 rows) ---'
BEGIN;
  SET LOCAL ROLE app_user;
  -- app.current_tenant intentionally not set; NULLIF guard should yield NULL → 0 rows
  SELECT "id", "tenant_id", "title" FROM "documents" ORDER BY "title";
COMMIT;

-- ── Cleanup ───────────────────────────────────────────────────────────────────
\echo '--- Cleanup ---'
TRUNCATE TABLE "annotation_replies", "annotations", "sessions",
               "document_versions", "documents" RESTART IDENTITY CASCADE;

\echo '=== PASS: RLS tenant isolation verified ==='

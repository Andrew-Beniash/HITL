-- CreateTable: audit_events with monthly partitioning
CREATE TABLE audit_events (
  id            BIGSERIAL,
  tenant_id     UUID NOT NULL,
  document_id   UUID,
  session_id    UUID,
  actor_type    TEXT NOT NULL CHECK (actor_type IN ('user', 'agent', 'system')),
  actor_id      TEXT NOT NULL,
  event_type    TEXT NOT NULL,
  scope         JSONB,
  before_state  JSONB,
  after_state   JSONB,
  metadata      JSONB,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

-- Initial partition
CREATE TABLE audit_events_2026_03 PARTITION OF audit_events
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

-- Create the restricted role for application access
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'audit_writer') THEN
    CREATE ROLE audit_writer LOGIN PASSWORD 'changeme';
  END IF;
END
$$;

-- Grant only INSERT and SELECT — no UPDATE, no DELETE
GRANT INSERT, SELECT ON audit_events TO audit_writer;
GRANT USAGE, SELECT ON SEQUENCE audit_events_id_seq TO audit_writer;

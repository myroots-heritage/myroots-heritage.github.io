BEGIN;
CREATE TABLE entry_flows (
  id uuid PRIMARY KEY,
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES accounts(id),
  event_type text NOT NULL,
  encrypted_payload text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','completed','dead')),
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  remote_file_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  last_error text
);
CREATE INDEX entry_flows_pending_idx ON entry_flows(available_at) WHERE status IN ('pending','processing');
CREATE INDEX entry_flows_family_idx ON entry_flows(family_id,created_at DESC);
INSERT INTO schema_migrations(version) VALUES ('002');
COMMIT;

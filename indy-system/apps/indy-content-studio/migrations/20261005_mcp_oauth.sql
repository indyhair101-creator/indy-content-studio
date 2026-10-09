-- Apply once to the same Neon database used by this dashboard.
-- Plaintext codes, access tokens, refresh tokens and passwords are never stored here.
CREATE TABLE IF NOT EXISTS mcp_oauth_grants (
  token_hash text PRIMARY KEY,
  grant_type text NOT NULL CHECK (grant_type IN ('code', 'refresh')),
  payload jsonb NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS mcp_oauth_grants_expiry_idx ON mcp_oauth_grants (expires_at);

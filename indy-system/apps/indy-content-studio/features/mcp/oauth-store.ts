import { createNeonExecutor, type SqlExecutor } from "../data/server/neon-client";
import type { OAuthCodeBinding, OAuthGrant, OAuthGrantStore } from "./oauth";

export class NeonOAuthGrantStore implements OAuthGrantStore {
  constructor(private readonly execute: SqlExecutor = createNeonExecutor()) {}

  private async save(kind: string, key: string, grant: OAuthGrant, expires: number) {
    await this.execute("INSERT INTO mcp_oauth_grants (token_hash, grant_type, payload, expires_at) VALUES ($1, $2, $3, $4)",
      [key, kind, grant, new Date(expires).toISOString()]);
  }
  saveCode(key: string, grant: OAuthGrant, expires: number) { return this.save("code", key, grant, expires); }
  saveRefresh(key: string, grant: OAuthGrant, expires: number) { return this.save("refresh", key, grant, expires); }

  async consumeCode(key: string, binding: OAuthCodeBinding) {
    const rows = await this.execute(
      "DELETE FROM mcp_oauth_grants WHERE token_hash = $1 AND grant_type = 'code' AND expires_at > now()"
      + " AND payload->>'clientId' = $2 AND payload->>'resource' = $3 AND payload->>'redirectUri' = $4"
      + " AND payload->>'challenge' = $5 AND ($6::text IS NULL OR payload->>'scope' = $6) RETURNING payload",
      [key, binding.clientId, binding.resource, binding.redirectUri, binding.challenge, binding.scope ?? null]);
    return rows.length ? rows[0].payload as OAuthGrant : null;
  }

  async rotateRefresh(key: string, clientId: string, resource: string, nextKey: string, expires: number, scope?: string) {
    const rows = await this.execute(
      "UPDATE mcp_oauth_grants SET token_hash = $4, expires_at = $5 WHERE token_hash = $1 AND grant_type = 'refresh'"
      + " AND expires_at > now() AND payload->>'clientId' = $2 AND payload->>'resource' = $3"
      + " AND ($6::text IS NULL OR payload->>'scope' = $6) RETURNING payload",
      [key, clientId, resource, nextKey, new Date(expires).toISOString(), scope ?? null]);
    return rows.length ? rows[0].payload as OAuthGrant : null;
  }

  async revokeRefresh(key: string, clientId: string) {
    await this.execute("DELETE FROM mcp_oauth_grants WHERE token_hash = $1 AND grant_type = 'refresh' AND payload->>'clientId' = $2", [key, clientId]);
  }
}

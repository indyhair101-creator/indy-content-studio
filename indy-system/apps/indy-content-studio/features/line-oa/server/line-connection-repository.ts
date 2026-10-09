import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createNeonExecutor, type SqlExecutor } from "../../data/server/neon-client";
import { decryptLineUserId, encryptLineUserId } from "./line-user-encryption";

const CONNECTION_KEY = "primary";
const PAIRING_TTL_MS = 10 * 60_000;
const PAIRING_CODE_PATTERN = /^INDY-[A-F0-9]{8}-[A-F0-9]{8}$/;

export type LineConnectionStatus = "not_connected" | "pairing" | "connected" | "disabled";
export type PairingClaimResult = "paired" | "duplicate" | "invalid" | "already_connected";

export type PublicLineConnection = {
  status: LineConnectionStatus;
  maskedRecipient: string | null;
  pairedAt: string | null;
};

export class ActiveLineRecipientError extends Error {
  constructor() {
    super("A LINE recipient is already paired");
    this.name = "ActiveLineRecipientError";
  }
}

type RepositoryOptions = {
  execute?: SqlExecutor;
  encryptionKey?: string;
  now?: () => number;
  generatePairingCode?: () => string;
};

function normalizePairingCode(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!PAIRING_CODE_PATTERN.test(normalized)) throw new Error("Invalid LINE pairing code");
  return normalized;
}

function hashPairingCode(value: string): string {
  return createHash("sha256").update(normalizePairingCode(value), "utf8").digest("hex");
}

function randomPairingCode(): string {
  const bytes = randomBytes(8).toString("hex").toUpperCase();
  return `INDY-${bytes.slice(0, 8)}-${bytes.slice(8)}`;
}

function connectionStatus(value: unknown): LineConnectionStatus {
  if (value === "not_connected" || value === "pairing" || value === "connected" || value === "disabled") return value;
  return "not_connected";
}

export class NeonLineConnectionRepository {
  private readonly execute: SqlExecutor;
  private readonly encryptionKey: string;
  private readonly now: () => number;
  private readonly generatePairingCode: () => string;

  constructor(options: RepositoryOptions = {}) {
    this.execute = options.execute ?? createNeonExecutor();
    this.encryptionKey = options.encryptionKey ?? process.env.LINE_RECIPIENT_ENCRYPTION_KEY ?? "";
    this.now = options.now ?? Date.now;
    this.generatePairingCode = options.generatePairingCode ?? randomPairingCode;
  }

  async createPairingCode(): Promise<{ pairingCode: string; expiresAt: string }> {
    const pairingCode = normalizePairingCode(this.generatePairingCode());
    const expiresAt = new Date(this.now() + PAIRING_TTL_MS).toISOString();
    const codeId = randomUUID();
    await this.execute(
      "INSERT INTO line_connections (connection_key, status) VALUES ($1, 'not_connected') ON CONFLICT (connection_key) DO NOTHING",
      [CONNECTION_KEY],
    );
    const rows = await this.execute(
      `WITH locked_connection AS (
         SELECT status FROM line_connections WHERE connection_key = $1 FOR UPDATE
       ), retired_codes AS (
         UPDATE line_pairing_codes SET used_at = $4::timestamptz
         WHERE used_at IS NULL AND EXISTS (SELECT 1 FROM locked_connection WHERE status <> 'connected')
         RETURNING id
       ), created_code AS (
         INSERT INTO line_pairing_codes (id, code_hash, expires_at)
         SELECT $2, $3, $4::timestamptz FROM locked_connection WHERE status <> 'connected'
         RETURNING expires_at
       ), pairing_status AS (
         UPDATE line_connections SET status = 'pairing', updated_at = $4::timestamptz
         WHERE connection_key = $1 AND status <> 'connected' AND EXISTS (SELECT 1 FROM created_code)
         RETURNING connection_key
       )
       SELECT expires_at FROM created_code`,
      [CONNECTION_KEY, codeId, hashPairingCode(pairingCode), expiresAt],
    );
    if (!rows[0]) throw new ActiveLineRecipientError();
    return { pairingCode, expiresAt: new Date(String(rows[0].expires_at)).toISOString() };
  }

  async claimPairingCode(input: {
    pairingCode: string;
    recipientUserId: string;
    webhookEventId: string;
  }): Promise<PairingClaimResult> {
    if (!input.recipientUserId || !input.webhookEventId) return "invalid";
    let codeHash: string;
    try {
      codeHash = hashPairingCode(input.pairingCode);
    } catch {
      return "invalid";
    }
    const encryptedUserId = encryptLineUserId(input.recipientUserId, this.encryptionKey);
    const rows = await this.execute(
      `WITH inserted_event AS (
         INSERT INTO line_webhook_events (webhook_event_id) VALUES ($1)
         ON CONFLICT (webhook_event_id) DO NOTHING
         RETURNING webhook_event_id
       ), claimed_code AS (
         UPDATE line_pairing_codes SET used_at = $5::timestamptz
         WHERE code_hash = $2 AND used_at IS NULL AND expires_at > $5::timestamptz
           AND EXISTS (SELECT 1 FROM inserted_event)
         RETURNING id
       ), connected_recipient AS (
         UPDATE line_connections
         SET status = 'connected', encrypted_user_id = $3, display_name = NULL,
             paired_at = $5::timestamptz, updated_at = $5::timestamptz
         WHERE connection_key = $4 AND status <> 'connected'
           AND EXISTS (SELECT 1 FROM claimed_code)
         RETURNING connection_key
       )
       SELECT CASE
         WHEN NOT EXISTS (SELECT 1 FROM inserted_event) THEN 'duplicate'
         WHEN EXISTS (SELECT 1 FROM connected_recipient) THEN 'paired'
         WHEN EXISTS (SELECT 1 FROM claimed_code) THEN 'already_connected'
         ELSE 'invalid'
       END AS result`,
      [input.webhookEventId, codeHash, encryptedUserId, CONNECTION_KEY, new Date(this.now()).toISOString()],
    );
    const result = rows[0]?.result;
    if (result === "paired" || result === "duplicate" || result === "already_connected") return result;
    return "invalid";
  }

  async getActiveRecipient(): Promise<string | null> {
    const rows = await this.execute(
      "SELECT encrypted_user_id FROM line_connections WHERE connection_key = $1 AND status = 'connected'",
      [CONNECTION_KEY],
    );
    const encryptedUserId = rows[0]?.encrypted_user_id;
    if (typeof encryptedUserId !== "string" || !encryptedUserId) return null;
    return decryptLineUserId(encryptedUserId, this.encryptionKey);
  }

  async getConnectionStatus(): Promise<PublicLineConnection> {
    const rows = await this.execute(
      "SELECT status, encrypted_user_id, paired_at FROM line_connections WHERE connection_key = $1",
      [CONNECTION_KEY],
    );
    const row = rows[0];
    const status = connectionStatus(row?.status);
    const encryptedUserId = row?.encrypted_user_id;
    const recipient = status === "connected" && typeof encryptedUserId === "string"
      ? decryptLineUserId(encryptedUserId, this.encryptionKey)
      : null;
    return {
      status,
      maskedRecipient: recipient ? `••••${recipient.slice(-4)}` : null,
      pairedAt: row?.paired_at ? new Date(String(row.paired_at)).toISOString() : null,
    };
  }

  async resetConnection(): Promise<void> {
    await this.execute(
      `WITH invalidated_codes AS (
         UPDATE line_pairing_codes SET used_at = COALESCE(used_at, now()) WHERE used_at IS NULL RETURNING id
       )
       UPDATE line_connections
       SET status = 'not_connected', encrypted_user_id = NULL, display_name = NULL,
           paired_at = NULL, updated_at = now()
       WHERE connection_key = $1`,
      [CONNECTION_KEY],
    );
  }
}

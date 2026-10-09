import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ENCRYPTION_CONTEXT = Buffer.from("indy-line-recipient:v1", "utf8");

function encryptionKeyFromEnvironment(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) throw new Error("LINE recipient encryption is not configured");
  const key = Buffer.from(value, "base64url");
  if (key.byteLength !== 32) throw new Error("LINE recipient encryption is not configured");
  return key;
}

export function encryptLineUserId(userId: string, encodedKey: string): string {
  const key = encryptionKeyFromEnvironment(encodedKey);
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(ENCRYPTION_CONTEXT);
  const ciphertext = Buffer.concat([cipher.update(userId, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", nonce.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptLineUserId(encryptedValue: string, encodedKey: string): string {
  const [version, encodedNonce, encodedTag, encodedCiphertext, extra] = encryptedValue.split(".");
  if (version !== "v1" || !encodedNonce || !encodedTag || encodedCiphertext === undefined || extra !== undefined) {
    throw new Error("Invalid encrypted LINE recipient");
  }

  try {
    const key = encryptionKeyFromEnvironment(encodedKey);
    const nonce = Buffer.from(encodedNonce, "base64url");
    const tag = Buffer.from(encodedTag, "base64url");
    const ciphertext = Buffer.from(encodedCiphertext, "base64url");
    if (nonce.byteLength !== 12 || tag.byteLength !== 16) throw new Error("Invalid encrypted LINE recipient");
    const decipher = createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAAD(ENCRYPTION_CONTEXT);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Invalid encrypted LINE recipient");
  }
}

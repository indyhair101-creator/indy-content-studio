import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const scryptAsync = (password: string, salt: Buffer, length: number) => new Promise<Buffer>((resolve, reject) => {
  scrypt(password, salt, length, (error, key) => error ? reject(error) : resolve(key as Buffer));
});

function encodeBase64Url(value: Buffer): string {
  return value.toString("base64url");
}

export async function hashAdminPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = await scryptAsync(password, salt, 64);
  return `scrypt$${encodeBase64Url(salt)}$${encodeBase64Url(derivedKey)}`;
}

export async function verifyAdminPassword(password: string, encodedHash: string): Promise<boolean> {
  const [algorithm, encodedSalt, encodedKey, extra] = encodedHash.split("$");
  if (algorithm !== "scrypt" || !encodedSalt || !encodedKey || extra !== undefined) return false;

  try {
    const salt = Buffer.from(encodedSalt, "base64url");
    const expectedKey = Buffer.from(encodedKey, "base64url");
    if (salt.length < 16 || expectedKey.length !== 64) return false;
    const actualKey = await scryptAsync(password, salt, expectedKey.length);
    return timingSafeEqual(actualKey, expectedKey);
  } catch {
    return false;
  }
}

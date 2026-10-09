import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const password = readFileSync(0, "utf8").replace(/\r?\n$/, "");

if (password.length < 12) {
  process.stderr.write("Password must contain at least 12 characters; pass it through stdin.\n");
  process.exitCode = 1;
} else {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  process.stdout.write(`scrypt$${salt.toString("base64url")}$${key.toString("base64url")}\n`);
}

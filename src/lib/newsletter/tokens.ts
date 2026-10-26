import crypto from "node:crypto";

// Same algorithms as hashToken/randomToken in src/lib/auth.ts, without auth's
// next/navigation imports (so the engine also runs from scripts and cron).
export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

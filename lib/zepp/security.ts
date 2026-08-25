import "server-only";

import crypto from "node:crypto";

function serverSecret(): string {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) {
    throw new Error("SUPABASE_SECRET_KEY è obbligatoria per proteggere le credenziali Zepp.");
  }
  return secret;
}

export function hashZeppCredential(value: string): string {
  return crypto
    .createHmac("sha256", serverSecret())
    .update(`zittoandcorri:zepp:v1:${value}`)
    .digest("hex");
}

export function createZeppToken(): string {
  return `zep_${crypto.randomBytes(32).toString("hex")}`;
}

export function createPairingCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

// Verification of the Zepp pairing code (6 digits, so guessable if attempts
// aren't counted properly). Rules:
// - every attempt, right or wrong and from whoever it comes, first consumes an
//   attempt on ALL active codes (counted in the database, not per IP or
//   per client); a code is compared only if this attempt managed to
//   reserve it, so each code sees at most PAIRING_MAX_ATTEMPTS
//   guesses in its whole life, even with parallel requests;
// - the comparison happens in memory in constant time, on all candidates;
// - the code expires after PAIRING_CODE_TTL_MS.
// Pure module: the store is injected, so tests don't touch Supabase.

import crypto from "node:crypto";

/** Aligned with the `check (attempts between 0 and 5)` constraint of migration 0014. */
export const PAIRING_MAX_ATTEMPTS = 5;
export const PAIRING_CODE_TTL_MS = 5 * 60_000;

export interface PairingCandidate {
  id: string;
  user_id: string;
  code_hash: string;
  attempts: number;
  expires_at: string;
  used_kinds: string[];
}

export interface PairingStore {
  /** Codes not expired, not exhausted and with attempts < PAIRING_MAX_ATTEMPTS. */
  listActive(nowIso: string): Promise<PairingCandidate[]>;
  /** Compare-and-set: attempts from `from` to `from + 1`; false if it changed meanwhile. */
  bumpAttempts(id: string, from: number): Promise<boolean>;
}

/**
 * Reserves an attempt on every active code. Returns only the codes on which
 * the reservation succeeded: they are the only ones the attempt can match.
 */
export async function reservePairingAttempt(
  store: PairingStore,
  nowIso: string,
  rounds = 3,
): Promise<PairingCandidate[]> {
  const reserved = new Map<string, PairingCandidate>();
  for (let round = 0; round < rounds; round++) {
    const pending = (await store.listActive(nowIso)).filter(
      (c) => !reserved.has(c.id) && c.attempts < PAIRING_MAX_ATTEMPTS && c.expires_at > nowIso,
    );
    if (pending.length === 0) break;
    const results = await Promise.all(pending.map((c) => store.bumpAttempts(c.id, c.attempts)));
    pending.forEach((c, i) => {
      if (results[i]) reserved.set(c.id, { ...c, attempts: c.attempts + 1 });
    });
    if (results.every(Boolean)) break;
  }
  return [...reserved.values()];
}

function hashesEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  // Different lengths: compare anyway so as not to exit early.
  if (left.length !== right.length) {
    crypto.timingSafeEqual(left, left);
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

/** Looks for the code among the reserved ones, without exiting at the first comparison. */
export function findPairingMatch(
  reserved: PairingCandidate[],
  codeHash: string,
  clientKind: string,
): PairingCandidate | null {
  let match: PairingCandidate | null = null;
  for (const candidate of reserved) {
    if (hashesEqual(candidate.code_hash, codeHash) && match === null) match = candidate;
  }
  if (!match || match.used_kinds.includes(clientKind)) return null;
  return match;
}

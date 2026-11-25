import assert from "node:assert/strict";
import test from "node:test";
import {
  findPairingMatch,
  PAIRING_MAX_ATTEMPTS,
  reservePairingAttempt,
  type PairingCandidate,
  type PairingStore,
} from "../lib/zepp/pairing.ts";

const NOW = "2026-11-22T10:00:00.000Z";

function memoryStore(rows: PairingCandidate[]): PairingStore & { rows: PairingCandidate[] } {
  return {
    rows,
    async listActive(nowIso) {
      return rows
        .filter((r) => r.expires_at > nowIso && r.attempts < PAIRING_MAX_ATTEMPTS)
        .map((r) => ({ ...r }));
    },
    async bumpAttempts(id, from) {
      const row = rows.find((r) => r.id === id);
      // Like the table's check constraint: past the maximum the update fails.
      if (!row || row.attempts !== from || from + 1 > PAIRING_MAX_ATTEMPTS) return false;
      row.attempts = from + 1;
      return true;
    },
  };
}

function code(id: string, hash: string, extra: Partial<PairingCandidate> = {}): PairingCandidate {
  return { id, user_id: `user-${id}`, code_hash: hash, attempts: 0, expires_at: "2026-11-22T10:05:00.000Z", used_kinds: [], ...extra };
}

async function attempt(store: PairingStore, hash: string, kind = "health") {
  return findPairingMatch(await reservePairingAttempt(store, NOW), hash, kind);
}

test("pairing: the right code matches and uses up an attempt", async () => {
  const store = memoryStore([code("a", "hash-a")]);
  const match = await attempt(store, "hash-a");
  assert.equal(match?.id, "a");
  assert.equal(store.rows[0].attempts, 1);
});

test("pairing: wrong attempts count against the code even when changing client or IP", async () => {
  const store = memoryStore([code("a", "hash-a")]);
  for (let i = 0; i < PAIRING_MAX_ATTEMPTS; i++) {
    assert.equal(await attempt(store, `sbagliato-${i}`), null);
  }
  assert.equal(store.rows[0].attempts, PAIRING_MAX_ATTEMPTS);
  // Locked: not even the right code passes any more.
  assert.equal(await attempt(store, "hash-a"), null);
});

test("pairing: parallel requests don't exceed the limit", async () => {
  const store = memoryStore([code("a", "hash-a")]);
  const guesses = Array.from({ length: 50 }, (_, i) => `sbagliato-${i}`);
  guesses.push("hash-a");
  const results = await Promise.all(guesses.map((g) => attempt(store, g)));
  assert.ok(store.rows[0].attempts <= PAIRING_MAX_ATTEMPTS);
  // At most 5 guesses were compared: with 51 parallel
  // requests the right one passes only if it reserved one of the 5 attempts.
  assert.ok(results.filter(Boolean).length <= 1);
});

test("pairing: an expired code or one already used for that app doesn't match", async () => {
  const expired = memoryStore([code("a", "hash-a", { expires_at: "2026-11-22T09:59:59.000Z" })]);
  assert.equal(await attempt(expired, "hash-a"), null);

  const used = memoryStore([code("a", "hash-a", { used_kinds: ["health"] })]);
  assert.equal(await attempt(used, "hash-a", "health"), null);
  assert.equal((await attempt(used, "hash-a", "workout"))?.id, "a");
});

test("pairing: a code created after the reservation isn't compared", () => {
  assert.equal(findPairingMatch([], "hash-a", "health"), null);
});

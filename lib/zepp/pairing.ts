// Verifica del codice di abbinamento Zepp (6 cifre, quindi indovinabile se i
// tentativi non sono contati bene). Regole:
// - ogni tentativo, giusto o sbagliato e da chiunque arrivi, consuma prima un
//   tentativo su TUTTI i codici attivi (conteggio nel database, non per IP o
//   per client); un codice si confronta solo se questo tentativo è riuscito a
//   prenotarlo, quindi ogni codice vede al massimo PAIRING_MAX_ATTEMPTS
//   ipotesi in tutta la sua vita, anche con richieste in parallelo;
// - il confronto avviene in memoria a tempo costante, su tutti i candidati;
// - il codice scade dopo PAIRING_CODE_TTL_MS.
// Modulo puro: lo store è iniettato, così i test non toccano Supabase.

import crypto from "node:crypto";

/** Allineato al vincolo `check (attempts between 0 and 5)` della migrazione 0014. */
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
  /** Codici non scaduti, non esauriti e con attempts < PAIRING_MAX_ATTEMPTS. */
  listActive(nowIso: string): Promise<PairingCandidate[]>;
  /** Compare-and-set: attempts da `from` a `from + 1`; false se nel frattempo è cambiato. */
  bumpAttempts(id: string, from: number): Promise<boolean>;
}

/**
 * Prenota un tentativo su ogni codice attivo. Restituisce solo i codici su cui
 * la prenotazione è riuscita: sono gli unici con cui il tentativo può combaciare.
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
  // Lunghezze diverse: confronta comunque per non uscire prima.
  if (left.length !== right.length) {
    crypto.timingSafeEqual(left, left);
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

/** Cerca il codice fra quelli prenotati, senza uscire al primo confronto. */
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

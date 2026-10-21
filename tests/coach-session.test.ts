import assert from "node:assert/strict";
import test from "node:test";
import { currentSession, isSessionMarker, splitSessions } from "../lib/coach-session.ts";

const msg = (id: string, kind = "chat", metadata: Record<string, unknown> = {}) => ({ id, kind, metadata, created_at: `2026-10-21T10:${id.padStart(2, "0")}:00Z` });
const marker = (id: string) => msg(id, "status", { type: "new_session" });

test("il coach vede solo la conversazione dopo l'ultima nuova chat", () => {
  // Dal più recente, come la query del contesto.
  const newestFirst = [msg("9"), msg("8", "plan_proposal"), marker("7"), msg("6"), marker("3"), msg("2")];
  const session = currentSession(newestFirst);
  assert.deepEqual(session.messages.map((m) => m.id), ["9", "8"]);
  assert.equal(session.startedAt, "2026-10-21T10:07:00Z");
  // Senza nuova chat vale tutta la conversazione; altri messaggi di stato non contano.
  const all = currentSession([msg("5"), msg("4", "status", { type: "altro" }), msg("3")]);
  assert.deepEqual(all.messages.map((m) => m.id), ["5", "3"]);
  assert.equal(all.startedAt, null);
});

test("la chat mostra la conversazione corrente e conta le precedenti", () => {
  const oldestFirst = [msg("1"), msg("2"), marker("3"), msg("4"), marker("5"), msg("6"), msg("7")];
  const { current, earlier } = splitSessions(oldestFirst);
  assert.deepEqual(current.map((m) => m.id), ["6", "7"]);
  assert.equal(earlier, 3);
  // Appena iniziata: nessun messaggio corrente, le precedenti restano da mostrare.
  const fresh = splitSessions([msg("1"), marker("2")]);
  assert.deepEqual(fresh, { current: [], earlier: 1 });
  assert.deepEqual(splitSessions([msg("1"), msg("2")]).earlier, 0);
  assert.equal(isSessionMarker(marker("1")), true);
  assert.equal(isSessionMarker(msg("1", "status")), false);
});

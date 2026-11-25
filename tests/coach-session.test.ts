import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { currentSession, isSessionMarker, splitSessions } from "../lib/coach-session.ts";

const msg = (id: string, kind = "chat", metadata: Record<string, unknown> = {}) => ({ id, kind, metadata, created_at: `2026-10-21T10:${id.padStart(2, "0")}:00Z` });
const marker = (id: string) => msg(id, "status", { type: "new_session" });

test("the coach sees only the conversation after the last new chat", () => {
  // Most recent first, like the context query.
  const newestFirst = [msg("9"), msg("8", "plan_proposal"), marker("7"), msg("6"), marker("3"), msg("2")];
  const session = currentSession(newestFirst);
  assert.deepEqual(session.messages.map((m) => m.id), ["9", "8"]);
  assert.equal(session.startedAt, "2026-10-21T10:07:00Z");
  // With no new chat the whole conversation counts; other status messages do not.
  const all = currentSession([msg("5"), msg("4", "status", { type: "altro" }), msg("3")]);
  assert.deepEqual(all.messages.map((m) => m.id), ["5", "3"]);
  assert.equal(all.startedAt, null);
});

test("the chat shows the current conversation and counts the previous ones", () => {
  const oldestFirst = [msg("1"), msg("2"), marker("3"), msg("4"), marker("5"), msg("6"), msg("7")];
  const { current, earlier } = splitSessions(oldestFirst);
  assert.deepEqual(current.map((m) => m.id), ["6", "7"]);
  assert.equal(earlier, 3);
  // Just started: no current messages, the previous ones are still to be shown.
  const fresh = splitSessions([msg("1"), marker("2")]);
  assert.deepEqual(fresh, { current: [], earlier: 1 });
  assert.deepEqual(splitSessions([msg("1"), msg("2")]).earlier, 0);
  assert.equal(isSessionMarker(marker("1")), true);
  assert.equal(isSessionMarker(msg("1", "status")), false);
});

test("the coach can exclude, restore and annotate recorded runs", () => {
  // lib/ai/prompt.ts imports with the "@/" alias: here we check the contract on the source.
  const prompt = readFileSync(new URL("../lib/ai/prompt.ts", import.meta.url), "utf8");
  const actions = readFileSync(new URL("../app/coach/actions.ts", import.meta.url), "utf8");
  assert.match(prompt, /activity_updates: lenientArray/);
  assert.match(prompt, /enum: \["exclude", "restore", "annotate"\]/);
  assert.match(prompt, /"activity_updates", "workouts"\]/);
  assert.match(prompt, /past=true/);
  assert.match(actions, /applyActivityUpdates\(admin, userId, result\.activity_updates\)/);
  assert.match(actions, /REMOVE_LOOKBACK_DAYS\)/);
});

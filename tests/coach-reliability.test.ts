import assert from "node:assert/strict";
import test from "node:test";
import { InvalidAiResponseError, isInvalidResponse, isTransientAiError, withAiRetry } from "../lib/ai/retry.ts";
import { proposalExpiry, withProposalExpiry } from "../lib/plan/proposal-expiry.ts";
import { failedMessageIds, markSendError, sendErrorOf, withFailureMarks, withoutFailedMessages } from "../lib/coach-failures.ts";
import { openRouterMessages, promptText, splitContextJson, supportsCacheControl } from "../lib/ai/prompt-cache.ts";
import { discardedPlanNote, workoutDiscardReason } from "../lib/plan/proposal-notes.ts";

const httpError = (status: number, message = `HTTP ${status}`) => Object.assign(new Error(message), { name: "OpenRouterError", status });
const zodError = () => Object.assign(new Error("Required"), { name: "ZodError" });
const noSleep = async () => {};

// ── Retry ──────────────────────────────────────────────────────────

test("an invalid reply is retried once and then succeeds", async () => {
  let calls = 0;
  const failures: number[] = [];
  const value = await withAiRetry(async () => {
    calls++;
    if (calls === 1) throw new InvalidAiResponseError("JSON rotto");
    return "ok";
  }, { sleep: noSleep, onFailure: (_e, attempt) => { failures.push(attempt); } });
  assert.equal(value, "ok");
  assert.equal(calls, 2);
  assert.deepEqual(failures, [1]);
});

test("the limit is two attempts: on the second failure the error arrives", async () => {
  let calls = 0;
  const failures: number[] = [];
  await assert.rejects(withAiRetry(async () => {
    calls++;
    throw zodError();
  }, { sleep: noSleep, onFailure: (_e, attempt) => { failures.push(attempt); } }), /Required/);
  assert.equal(calls, 2);
  // The last failed attempt is also recorded.
  assert.deepEqual(failures, [1, 2]);
});

test("key, credit, quota and timeout errors are not retried", async () => {
  for (const error of [httpError(401), httpError(402), httpError(404), httpError(504), new Error("RESOURCE_EXHAUSTED: quota"), Object.assign(new Error("x"), { name: "AiTimeoutError" })]) {
    let calls = 0;
    await assert.rejects(withAiRetry(async () => { calls++; throw error; }, { sleep: noSleep }));
    assert.equal(calls, 1, error.message);
  }
});

test("transient provider errors and unreadable replies are recognised", () => {
  assert.equal(isTransientAiError(httpError(503)), true);
  assert.equal(isTransientAiError(new Error("fetch failed")), true);
  assert.equal(isTransientAiError(httpError(429, "rate limit")), true);
  assert.equal(isTransientAiError(httpError(400)), false);
  assert.equal(isInvalidResponse(httpError(422)), true);
  assert.equal(isInvalidResponse(new SyntaxError("Unexpected token")), true);
  assert.equal(isInvalidResponse(zodError()), true);
  assert.equal(isInvalidResponse(httpError(503)), false);
});

test("with not enough time before the deadline there is no retry", async () => {
  let calls = 0;
  const now = 1_000_000;
  await assert.rejects(withAiRetry(async () => { calls++; throw zodError(); }, {
    deadlineAt: now + 20_000, now: () => now, sleep: noSleep,
  }));
  assert.equal(calls, 1);
});

test("with a filter only for invalid replies a 503 is not retried", async () => {
  let calls = 0;
  await assert.rejects(withAiRetry(async () => { calls++; throw httpError(503); }, { retryable: isInvalidResponse, sleep: noSleep }));
  assert.equal(calls, 1);
});

// ── Proposal expiry ──────────────────────────────────────────────────

const proposal = (id: string, created: string, days: string[], status = "pending") => ({
  id,
  status,
  created_at: created,
  range_end: days[days.length - 1],
  workouts: days.map((date) => ({ date })),
  remove_dates: [],
});
const NOW = Date.parse("2026-11-22T10:00:00Z");
const TODAY = "2026-11-22";

test("a proposal pending for more than 7 days expires", () => {
  const old = proposal("a", "2026-08-24T09:00:00Z", ["2026-11-25"]);
  assert.equal(proposalExpiry(old, [old], TODAY, NOW), "too_old");
  const fresh = proposal("b", "2026-11-20T09:00:00Z", ["2026-11-25"]);
  assert.equal(proposalExpiry(fresh, [fresh], TODAY, NOW), null);
});

test("a proposal superseded by a more recent one on the same days is no longer applicable", () => {
  const first = proposal("a", "2026-11-20T09:00:00Z", ["2026-11-24", "2026-11-25"]);
  const second = proposal("b", "2026-11-21T09:00:00Z", ["2026-11-25"]);
  const otherDays = proposal("c", "2026-11-21T10:00:00Z", ["2026-11-28"]);
  const rejected = proposal("d", "2026-11-21T11:00:00Z", ["2026-11-28"], "rejected");
  const otherWeek = proposal("e", "2026-11-20T08:00:00Z", ["2026-11-28"]);
  const all = [first, second, otherDays, rejected, otherWeek];
  assert.equal(proposalExpiry(first, all, TODAY, NOW), "superseded");
  assert.equal(proposalExpiry(second, all, TODAY, NOW), null);
  // Superseded by "c" (on the same days), not by the rejected "d".
  assert.equal(proposalExpiry(otherWeek, all, TODAY, NOW), "superseded");
  assert.equal(proposalExpiry(otherDays, all, TODAY, NOW), null);
});

test("a proposal with all days in the past expires; the others stay identical", () => {
  const past = proposal("a", "2026-11-19T09:00:00Z", ["2026-11-20", "2026-11-21"]);
  const applied = proposal("b", "2026-08-01T09:00:00Z", ["2026-08-02"], "applied");
  const valid = proposal("c", "2026-11-21T09:00:00Z", ["2026-11-23"]);
  const view = withProposalExpiry([past, applied, valid], TODAY, NOW);
  assert.equal(view[0].status, "expired");
  assert.equal((view[0] as { expired_reason?: string }).expired_reason, "past");
  assert.equal(view[1], applied);
  assert.equal(view[2], valid);
});

// ── Unsent messages ─────────────────────────────────────────────────────

const msg = (id: string, role: string, created: string, metadata: Record<string, unknown> = {}, kind = "chat") =>
  ({ id, role, kind, content: id, created_at: created, metadata });

test("a message with send_error or left without a reply counts as unsent", () => {
  const messages = [
    msg("q1", "user", "2026-11-22T09:00:00Z"),
    msg("r1", "assistant", "2026-11-22T09:01:00Z", { reply_to: "q1" }),
    msg("q2", "user", "2026-11-22T09:02:00Z"), // no reply, then another question
    msg("q3", "user", "2026-11-22T09:03:00Z", markSendError({}, { message: "Risposta non leggibile", at: "x" })),
    msg("q4", "user", "2026-11-22T09:04:00Z"),
    msg("r4", "assistant", "2026-11-22T09:05:00Z"), // old reply without reply_to
    msg("q5", "user", "2026-11-22T09:58:00Z"), // just sent: still in progress
  ];
  const failed = failedMessageIds(messages, NOW);
  assert.deepEqual([...failed].sort(), ["q2", "q3"]);
  assert.deepEqual(withoutFailedMessages(messages, NOW).map((m) => m.id), ["q1", "r1", "q4", "r4", "q5"]);
  const marked = withFailureMarks(messages, NOW);
  assert.ok(sendErrorOf(marked[2]));
  assert.equal(sendErrorOf(marked[3])?.message, "Risposta non leggibile");
  assert.equal(marked[0], messages[0]);
});

test("Retry removes the error mark without losing the other metadata", () => {
  const meta = markSendError({ client_id: "abc" }, { message: "x", at: "y" });
  assert.ok(sendErrorOf({ metadata: meta }));
  assert.deepEqual(markSendError(meta, null), { client_id: "abc" });
});

// ── Prompt cache ─────────────────────────────────────────────────────────

const parts = { system: "ISTRUZIONI", stable: "STABILE", variable: "VARIABILE" };

test("with Claude the fixed part and the stable context carry cache_control, the rest does not", () => {
  const messages = openRouterMessages(parts, "SCHEMA", "anthropic/claude-sonnet-5-5");
  assert.equal(messages[0].role, "system");
  const system = messages[0].content as Array<{ text: string; cache_control?: unknown }>;
  assert.equal(system.length, 1);
  assert.match(system[0].text, /^SCHEMA[\s\S]*ISTRUZIONI$/);
  assert.deepEqual(system[0].cache_control, { type: "ephemeral" });
  const user = messages[1].content as Array<{ text: string; cache_control?: unknown }>;
  assert.deepEqual(user.map((part) => part.text), ["STABILE", "VARIABILE"]);
  assert.deepEqual(user[0].cache_control, { type: "ephemeral" });
  assert.equal(user[1].cache_control, undefined);
  // At most 4 cache points per request: here 2.
  assert.equal(JSON.stringify(messages).match(/cache_control/g)?.length, 2);
});

test("with other models no cache_control but the fixed prefix comes first", () => {
  assert.equal(supportsCacheControl("openai/gpt-5.6"), false);
  assert.equal(supportsCacheControl("anthropic/claude-opus-5-5"), true);
  const messages = openRouterMessages(parts, "SCHEMA", "google/gemini-3.5-flash");
  assert.equal(typeof messages[0].content, "string");
  assert.equal(messages[1].content, "STABILE\n\nVARIABILE");
  assert.doesNotMatch(JSON.stringify(messages), /cache_control/);
  assert.equal(promptText(parts), "ISTRUZIONI\n\nSTABILE\n\nVARIABILE");
  assert.equal(promptText("tutto"), "tutto");
});

test("the context is split: meta and conversation after, the rest stable and compact", () => {
  const context = { meta: { as_of: "2026-11-22T10:00:00Z" }, athlete: { name: "A" }, conversation: { recent_messages: [] }, current_plan: { calendar: [] }, focus_activity: null };
  const { stable, variable } = splitContextJson(context);
  assert.deepEqual(Object.keys(JSON.parse(stable)), ["athlete", "current_plan"]);
  assert.deepEqual(Object.keys(JSON.parse(variable)), ["meta", "conversation", "focus_activity"]);
  assert.doesNotMatch(stable, /\n/);
  // Same stable context with a different hour: identical prefix, hence cached.
  const later = splitContextJson({ ...context, meta: { as_of: "2026-11-22T10:03:00Z" } });
  assert.equal(later.stable, stable);
});

// ── Proposals discarded by validation ──────────────────────────────────────

test("sessions discarded by validation are reported in one line", () => {
  assert.equal(discardedPlanNote({ workouts: [], removeDates: 0 }), "");
  const types = ["easy", "long"];
  assert.equal(workoutDiscardReason({ date: "2026-11-20", type: "easy" }, TODAY, "2026-12-19", types, 1), "past");
  assert.equal(workoutDiscardReason({ date: "2027-01-10", type: "easy" }, TODAY, "2026-12-19", types, 1), "out_of_window");
  assert.equal(workoutDiscardReason({ date: "2026-11-25", type: "yoga" }, TODAY, "2026-12-19", types, 1), "bad_type");
  assert.equal(workoutDiscardReason({ date: "2026-11-25", type: "easy" }, TODAY, "2026-12-19", types, 0), "no_steps");
  assert.equal(workoutDiscardReason({ date: "2026-11-25", type: "easy" }, TODAY, "2026-12-19", types, 2), null);
  const note = discardedPlanNote({ workouts: ["past", "out_of_window", "out_of_window"], removeDates: 1 });
  assert.doesNotMatch(note, /\n/);
  assert.match(note, /^_Non tutta la proposta è arrivata nel piano/);
  assert.match(note, /una seduta in un giorno già passato, 2 sedute oltre le prossime 4 settimane e un giorno da togliere/);
});

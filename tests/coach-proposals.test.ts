import assert from "node:assert/strict";
import test from "node:test";
import { itLabels } from "../lib/italian-translator.ts";
import { planProposalDiff, type PlanDayWorkout } from "../lib/plan/proposal-diff.ts";

// Typical week: today is Friday 23 October 2026.
const today = "2026-10-23";
const windowEnd = "2026-11-19";

const session = (date: string, type: PlanDayWorkout["type"], km: number, status = "planned"): PlanDayWorkout => ({
  date,
  type,
  status,
  target_distance_m: km * 1000,
  target_duration_s: null,
  target_pace_s_km: null,
  target_hr_bpm: null,
  workout_steps: [{ kind: "steady", label: "Corsa", completion_type: "distance", completion_value: km * 1000, pace_min_s_km: null, pace_max_s_km: null, hr_min_bpm: null, hr_max_bpm: null }],
});

const plan = [
  session("2026-10-20", "easy", 7),     // Tuesday, already run
  session("2026-10-22", "interval", 8), // yesterday, run but not marked as done
  session("2026-10-24", "easy", 6),     // Saturday
  session("2026-10-25", "long", 16),    // Sunday
  session("2026-10-27", "easy", 7),     // next week
  session("2026-10-29", "tempo", 9),
  session("2026-11-01", "long", 18),
];
const ran = new Set(["2026-10-20", "2026-10-22"]);

test("changing only the last two workouts of the week touches only those days", () => {
  const diff = planProposalDiff({
    today, windowEnd, existing: plan, activityDates: ran,
    proposed: [session("2026-10-24", "recovery", 5), session("2026-10-25", "long", 14)],
    removeDates: [],
  });
  assert.deepEqual(diff.touched, ["2026-10-24", "2026-10-25"]);
  assert.deepEqual(diff.removeDates, []);
  assert.equal(diff.changes[1].before[0].meters, 16000);
  assert.equal(diff.changes[1].after[0].meters, 14000);
});

test("if the model resends the whole plan, only the days that really differ change", () => {
  const resent = plan.filter((w) => w.date >= today).map((w) => (w.date === "2026-10-29" ? session(w.date, "interval", 8) : { ...w }));
  const diff = planProposalDiff({ today, windowEnd, existing: plan, activityDates: ran, proposed: resent, removeDates: [] });
  assert.deepEqual(diff.touched, ["2026-10-29"]);
});

test("changing next week does not touch the current one", () => {
  const diff = planProposalDiff({
    today, windowEnd, existing: plan, activityDates: ran,
    proposed: [session("2026-10-27", "easy", 8), session("2026-10-30", "easy", 6), session("2026-11-01", "long", 20)],
    removeDates: ["2026-10-29"],
  });
  assert.deepEqual(diff.touched, ["2026-10-27", "2026-10-29", "2026-10-30", "2026-11-01"]);
  assert.ok(diff.touched.every((date) => date >= "2026-10-26"));
  assert.deepEqual(diff.removeDates, ["2026-10-29"]);
  assert.deepEqual(diff.changes.find((c) => c.date === "2026-10-29")!.after, []);
});

test("past days and days already run are untouchable", () => {
  const diff = planProposalDiff({
    today, windowEnd, existing: plan, activityDates: new Set([...ran, today]),
    proposed: [session("2026-10-22", "easy", 5), session("2026-10-24", "easy", 6)],
    removeDates: ["2026-10-20", today],
  });
  // Saturday was already like that: no change. Yesterday and Tuesday are locked; today, already run, is not emptied.
  assert.deepEqual(diff.touched, []);
  assert.deepEqual(diff.locked, ["2026-10-20", "2026-10-22"]);
});

test("a day can have two sessions: the proposal replaces all of that day's sessions", () => {
  const diff = planProposalDiff({
    today, windowEnd, existing: plan, activityDates: ran,
    proposed: [session("2026-10-24", "easy", 6), session("2026-10-24", "recovery", 4)],
    removeDates: [],
  });
  assert.deepEqual(diff.touched, ["2026-10-24"]);
  assert.equal(diff.workouts.length, 2);
  assert.deepEqual(diff.changes[0].before.map((b) => b.meters), [6000]);
  assert.deepEqual(diff.changes[0].after.map((b) => b.meters), [6000, 4000]);
  // Resending the same two sessions is not a change.
  const twice = [...plan, { ...session("2026-10-24", "recovery", 4), day_order: 2 }];
  const same = planProposalDiff({
    today, windowEnd, existing: twice, activityDates: ran,
    proposed: [session("2026-10-24", "easy", 6), session("2026-10-24", "recovery", 4)],
    removeDates: [],
  });
  assert.deepEqual(same.touched, []);
});

test("today already run: a second session is added without touching the first", () => {
  const existing = [...plan, session(today, "easy", 6)];
  const diff = planProposalDiff({
    today, windowEnd, existing, activityDates: new Set([...ran, today]),
    proposed: [session(today, "easy", 6), session(today, "recovery", 4)],
    removeDates: [],
  });
  assert.deepEqual(diff.touched, [today]);
  assert.deepEqual(diff.added, [today]);
  assert.equal(diff.workouts.length, 1);
  assert.equal(diff.workouts[0].type, "recovery");
  assert.deepEqual(diff.changes[0].after.map((b) => b.meters), [6000, 4000]);
  // Repeating only the session already done changes nothing.
  const repeat = planProposalDiff({
    today, windowEnd, existing, activityDates: new Set([...ran, today]),
    proposed: [session(today, "easy", 6)], removeDates: [],
  });
  assert.deepEqual(repeat.touched, []);
});

test("a day is emptied only if requested and if there is something to remove", () => {
  const diff = planProposalDiff({
    today, windowEnd, existing: plan, activityDates: ran,
    proposed: [],
    removeDates: ["2026-10-24", "2026-10-26", "2026-10-24"],
  });
  assert.deepEqual(diff.removeDates, ["2026-10-24"]);
  assert.deepEqual(diff.touched, ["2026-10-24"]);
});

test("a completed session is not replaced: the new one is added", () => {
  const existing = [...plan, session("2026-10-28", "easy", 6, "completed")];
  const diff = planProposalDiff({ today, windowEnd, existing, activityDates: ran, proposed: [session("2026-10-28", "tempo", 8)], removeDates: ["2026-10-28"] });
  assert.deepEqual(diff.removeDates, []);
  assert.deepEqual(diff.added, ["2026-10-28"]);
  assert.deepEqual(diff.changes[0].before.map((b) => b.type), ["easy"]);
  assert.deepEqual(diff.changes[0].after.map((b) => b.type), ["easy", "tempo"]);
});

test("the coach calendar states the week and locked days", async () => {
  const { planCalendar } = await import("../lib/ai/plan-calendar.ts");
  const days = planCalendar({
    today, from: "2026-10-19", to: "2026-11-01",
    workouts: plan.map((w) => ({ date: w.date, type: w.type, status: w.status ?? "planned", target_distance_m: w.target_distance_m, target_duration_s: null, workout_steps: w.workout_steps })),
    activities: [{ day: "2026-10-22", sport: "running", distance_m: 8200, seconds: 2700 }],
  });
  const day = (date: string) => days.find((d) => d.date === date)!;
  assert.equal(day("2026-10-22").weekday, "giovedì");
  assert.equal(day("2026-10-22").locked, true);
  assert.equal(day("2026-10-22").add_only, false);
  assert.equal(day("2026-10-22").done[0].km, 8.2);
  assert.equal(day("2026-10-24").locked, false);
  assert.equal(day("2026-10-24").week, "questa settimana");
  assert.equal(day("2026-10-27").week, "settimana prossima");
  assert.match(day("2026-10-25").planned[0].what, /^long · 16 km$/);
});

test("the Gemini schema becomes JSON Schema and the JSON is extracted from replies", async () => {
  const { toJsonSchema, extractJson } = await import("../lib/ai/json-schema.ts");
  const schema = toJsonSchema({
    type: "OBJECT" as never,
    properties: {
      reply: { type: "STRING" as never },
      plan_summary: { type: "STRING" as never, nullable: true },
      remove_dates: { type: "ARRAY" as never, items: { type: "STRING" as never } },
      variant: { type: "STRING" as never, enum: ["sprint", "jog"], nullable: true },
    },
    required: ["reply"],
  });
  assert.deepEqual(schema, {
    type: "object",
    properties: {
      reply: { type: "string" },
      plan_summary: { type: ["string", "null"] },
      remove_dates: { type: "array", items: { type: "string" } },
      variant: { type: ["string", "null"], enum: ["sprint", "jog", null] },
    },
    required: ["reply"],
    additionalProperties: false,
  });
  assert.deepEqual(extractJson('```json\n{"reply":"ok"}\n```'), { reply: "ok" });
  assert.deepEqual(extractJson('Ecco: {"reply":"ok","n":1} spero vada bene'), { reply: "ok", n: 1 });
  assert.throws(() => extractJson("nessun json"));
});

test("yesterday's session that wasn't run can be removed and redone today", () => {
  const diff = planProposalDiff({
    today, windowEnd, removeFrom: "2026-10-09",
    existing: [...plan, session("2026-10-21", "tempo", 8)], // Wednesday, not run
    activityDates: ran,
    proposed: [session("2026-10-23", "tempo", 8)],
    removeDates: ["2026-10-21", "2026-10-22", "2026-10-20"],
  });
  // Yesterday (22) and Tuesday (20) were run: they stay. Wednesday (21) is emptied.
  assert.deepEqual(diff.removeDates, ["2026-10-21"]);
  assert.deepEqual(diff.touched, ["2026-10-21", "2026-10-23"]);
  assert.deepEqual(diff.locked, ["2026-10-20", "2026-10-22"]);
  assert.equal(diff.changes[0].after.length, 0);
});

test("no sessions are added in the past and without removeFrom nothing changes", () => {
  const existing = [...plan, session("2026-10-21", "tempo", 8)];
  const added = planProposalDiff({
    today, windowEnd, removeFrom: "2026-10-09", existing, activityDates: ran,
    proposed: [session("2026-10-21", "easy", 5)], removeDates: [],
  });
  assert.deepEqual(added.touched, []);
  assert.deepEqual(added.locked, ["2026-10-21"]);
  const strict = planProposalDiff({
    today, windowEnd, existing, activityDates: ran,
    proposed: [], removeDates: ["2026-10-21"],
  });
  assert.deepEqual(strict.touched, []);
});

test("split session: the second part is chained and follows the first", async () => {
  const { sessionStartTime, sessionPlacement } = await import("../lib/plan/day-sessions.ts");
  const diff = planProposalDiff({
    today, windowEnd, existing: plan, activityDates: ran,
    proposed: [
      { ...session("2026-10-29", "easy", 2), chained: true }, // the first one cannot be chained
      { ...session("2026-10-29", "interval", 6), chained: true },
    ],
    removeDates: [],
  });
  assert.deepEqual(diff.workouts.map((w) => [w.day_order, w.chained]), [[1, false], [2, true]]);
  assert.deepEqual(diff.changes[0].after.map((b) => b.chained), [false, true]);
  assert.equal(sessionPlacement(itLabels, diff.workouts[1], 2), "Subito dopo la precedente");
  assert.equal(sessionPlacement(itLabels, diff.workouts[0], 1), null);
  // On the watch calendar the two parts stay in a row.
  assert.deepEqual(diff.workouts.map((w) => sessionStartTime(w)), ["00:00:00", "00:01:00"]);
});

test("double session: morning and evening separate, the chained one inherits the time of day", async () => {
  const { numberDaySessions, sessionStartTime } = await import("../lib/plan/day-sessions.ts");
  const input: Array<{ date: string; day_part?: "morning" | "evening"; chained?: boolean }> = [
    { date: "2026-10-29", day_part: "morning" },
    { date: "2026-10-29", day_part: "evening" },
    { date: "2026-10-29", chained: true },
  ];
  const day = numberDaySessions(input);
  assert.deepEqual(day.map((s) => [s.day_order, s.day_part, s.chained]), [[1, "morning", false], [2, "evening", false], [3, "evening", true]]);
  assert.deepEqual(day.map((s) => sessionStartTime(s)), ["07:00:00", "18:01:00", "18:02:00"]);
});

test("changing only the link between two sessions is a change; repeating it is not", () => {
  const existing = [
    ...plan.filter((w) => w.date !== "2026-10-29"),
    { ...session("2026-10-29", "easy", 2), day_order: 1 },
    { ...session("2026-10-29", "interval", 6), day_order: 2, chained: true },
  ];
  const same = planProposalDiff({
    today, windowEnd, existing, activityDates: ran,
    proposed: [session("2026-10-29", "easy", 2), { ...session("2026-10-29", "interval", 6), chained: true }],
    removeDates: [],
  });
  assert.deepEqual(same.touched, []);
  const split = planProposalDiff({
    today, windowEnd, existing, activityDates: ran,
    proposed: [{ ...session("2026-10-29", "easy", 2), day_part: "morning" }, { ...session("2026-10-29", "interval", 6), day_part: "evening" }],
    removeDates: [],
  });
  assert.deepEqual(split.touched, ["2026-10-29"]);
});

test("today already run: the added session goes after the existing ones", () => {
  const existing = [...plan, { ...session(today, "easy", 6), day_part: "morning" as const }];
  const diff = planProposalDiff({
    today, windowEnd, existing, activityDates: new Set([...ran, today]),
    proposed: [{ ...session(today, "recovery", 4), day_part: "evening" }],
    removeDates: [],
  });
  assert.deepEqual(diff.workouts.map((w) => [w.day_order, w.day_part, w.chained]), [[2, "evening", false]]);
});

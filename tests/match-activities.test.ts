import assert from "node:assert/strict";
import test from "node:test";
import { adherence, buildDays } from "../lib/plan/day-status.ts";
import { matchDay, matchPlan, planWorkoutForActivity, withinWindow, workoutForActivity, type MatchActivity, type MatchWorkout, type PlanMatchActivity, type PlanMatchWorkout } from "../lib/plan/match-activities.ts";

const workout = (id: string, km: number, extra: Partial<MatchWorkout> = {}): MatchWorkout => ({
  id, type: "easy", status: "planned", target_distance_m: km * 1000, target_duration_s: null, workout_steps: [], ...extra,
});
// started_at in UTC: novembre = UTC+1 a Roma.
const run = (id: string, startedAt: string, km: number, minutes: number, sport = "running"): MatchActivity => ({
  id, started_at: startedAt, sport, distance_m: km * 1000, duration_s: minutes * 60,
});

test("riscaldamento e ripetute: ogni corsa va con la sua seduta", () => {
  const plan = [workout("warmup", 2, { day_order: 1 }), workout("reps", 6, { type: "interval", day_order: 2, chained: true } as Partial<MatchWorkout>)];
  const done = [run("a", "2026-11-14T16:00:00Z", 2.1, 12), run("b", "2026-11-14T16:14:00Z", 6.3, 32)];
  const match = matchDay(plan, done);
  assert.equal(match.get("warmup"), "a");
  assert.equal(match.get("reps"), "b");
});

test("non è per forza la prima corsa: conta quanto si somigliano", () => {
  // In programma una sola seduta da 10 km; al mattino 3 km di sciolto, la sera i 10 km.
  const plan = [workout("long", 10)];
  const done = [run("morning", "2026-11-14T06:30:00Z", 3, 18), run("evening", "2026-11-14T17:30:00Z", 10.2, 55)];
  assert.equal(matchDay(plan, done).get("long"), "evening");
  assert.equal(workoutForActivity("morning", plan, done), null);
  assert.equal(workoutForActivity("evening", plan, done)?.id, "long");
});

test("mattina e sera: decide il momento della giornata a parità di distanza", () => {
  const plan = [workout("am", 8, { day_part: "morning", day_order: 1 }), workout("pm", 8, { day_part: "evening", day_order: 2 })];
  // Elencate al contrario: l'ordine di arrivo non conta.
  const done = [run("evening", "2026-11-14T18:00:00Z", 8, 44), run("morning", "2026-11-14T06:00:00Z", 8, 45)];
  const match = matchDay(plan, done);
  assert.equal(match.get("am"), "morning");
  assert.equal(match.get("pm"), "evening");
});

test("una seduta di corsa non si abbina a un'altra attività; le sedute in pausa non contano", () => {
  const plan = [workout("easy", 6), workout("paused", 6, { status: "skipped" })];
  const done = [run("bike", "2026-11-14T08:00:00Z", 20, 50, "cycling")];
  assert.equal(matchDay(plan, done).size, 0);
  const cross = [workout("gym", 0, { type: "cross", target_distance_m: null, target_duration_s: 3600 })];
  assert.equal(matchDay(cross, done).get("gym"), "bike");
});

test("una sola seduta e una sola corsa diversa: è comunque quella", () => {
  const plan = [workout("tempo", 10, { type: "tempo" })];
  const done = [run("short", "2026-11-14T08:00:00Z", 4, 25)];
  assert.equal(matchDay(plan, done).get("tempo"), "short");
});

// ── Sedute spostate di giorno ───────────────────────────────────────────────

const session = (id: string, date: string, type: PlanMatchWorkout["type"], km: number, extra: Partial<PlanMatchWorkout> = {}): PlanMatchWorkout & { status: string } => ({
  id, date, type, status: "planned", target_distance_m: km * 1000, target_duration_s: null, workout_steps: [], ...extra,
});
const typedRun = (id: string, day: string, type: string, km: number, minutes = km * 5.5): PlanMatchActivity => ({
  id, started_at: `${day}T17:00:00Z`, sport: "running", distance_m: km * 1000, duration_s: minutes * 60, type,
});

test("seduta di martedì fatta mercoledì o giovedì: vale fatta", () => {
  const plan = [session("tue", "2026-11-17", "tempo", 10)];
  assert.equal(matchPlan(plan, [typedRun("wed", "2026-11-18", "tempo", 10)]).get("tue"), "wed");
  assert.equal(matchPlan(plan, [typedRun("thu", "2026-11-19", "tempo", 10)]).get("tue"), "thu");
  assert.equal(matchPlan(plan, [typedRun("mon", "2026-11-16", "tempo", 10)]).get("tue"), "mon");
  // Tre giorni dopo è un'altra cosa.
  assert.equal(matchPlan(plan, [typedRun("fri", "2026-11-20", "tempo", 10)]).size, 0);
});

test("tipo incompatibile: un lento non vale per le ripetute di un altro giorno", () => {
  const plan = [session("reps", "2026-11-17", "interval", 8)];
  assert.equal(matchPlan(plan, [typedRun("wed", "2026-11-18", "easy", 8)]).size, 0);
  // Facile e recupero si equivalgono.
  const easy = [session("easy", "2026-11-17", "easy", 6)];
  assert.equal(matchPlan(easy, [typedRun("wed", "2026-11-18", "recovery", 6)]).get("easy"), "wed");
  // Gara e cross restano nel loro giorno.
  const race = [session("race", "2026-11-17", "race", 10)];
  assert.equal(matchPlan(race, [typedRun("wed", "2026-11-18", "race", 10)]).size, 0);
});

test("corsa non ancora classificata: vale solo se somiglia alla seduta", () => {
  const plan = [session("long", "2026-11-15", "long", 18)];
  assert.equal(matchPlan(plan, [typedRun("mon", "2026-11-16", "unclassified", 17.5, 100)]).get("long"), "mon");
  assert.equal(matchPlan(plan, [typedRun("mon", "2026-11-16", "unclassified", 6, 33)]).size, 0);
});

test("due sedute candidate: vince la più vicina, poi quella rimasta indietro", () => {
  const run = [typedRun("wed", "2026-11-18", "tempo", 10)];
  const near = matchPlan([session("mon", "2026-11-16", "tempo", 10), session("tue", "2026-11-17", "tempo", 10)], run);
  assert.equal(near.get("tue"), "wed");
  assert.equal(near.has("mon"), false);
  const tie = matchPlan([session("thu", "2026-11-19", "tempo", 10), session("tue", "2026-11-17", "tempo", 10)], run);
  assert.equal(tie.get("tue"), "wed");
  assert.equal(tie.has("thu"), false);
  // Una corsa vale per una sola seduta, una seduta per una sola corsa.
  const two = matchPlan(
    [session("tue", "2026-11-17", "tempo", 10), session("thu", "2026-11-19", "tempo", 10)],
    [typedRun("wed", "2026-11-18", "tempo", 10), typedRun("wed2", "2026-11-18", "tempo", 10)],
  );
  assert.equal(two.size, 2);
  assert.notEqual(two.get("tue"), two.get("thu"));
});

test("la corsa dello stesso giorno ha la precedenza e nessuna seduta già fatta si perde", () => {
  // Martedì un tempo saltato; mercoledì in programma un lento e fatto un tempo: è il lento di mercoledì.
  const plan = [session("tue", "2026-11-17", "tempo", 10), session("wed", "2026-11-18", "easy", 8)];
  const match = matchPlan(plan, [typedRun("run", "2026-11-18", "tempo", 10)]);
  assert.equal(match.get("wed"), "run");
  assert.equal(match.has("tue"), false);
  // Il tempo di martedì fatto martedì resta suo anche con un altro tempo mercoledì.
  const done = matchPlan(
    [session("tue", "2026-11-17", "tempo", 10), session("thu", "2026-11-19", "tempo", 10)],
    [typedRun("t", "2026-11-17", "tempo", 10), typedRun("w", "2026-11-18", "tempo", 10)],
  );
  assert.equal(done.get("tue"), "t");
  assert.equal(done.get("thu"), "w");
});

test("una seduta in pausa non prende la corsa di un altro giorno", () => {
  const plan = [session("tue", "2026-11-17", "tempo", 10, { status: "skipped" })];
  assert.equal(matchPlan(plan, [typedRun("wed", "2026-11-18", "tempo", 10)]).size, 0);
});

test("abbinamento stabile con una finestra più ampia e seduta per la pagina della corsa", () => {
  const plan = [session("tue", "2026-11-17", "tempo", 10), session("sat", "2026-11-21", "long", 16)];
  const runs = [typedRun("wed", "2026-11-18", "tempo", 10)];
  const wide = [...plan, session("fri-next", "2026-11-27", "tempo", 10)];
  assert.equal(matchPlan(plan, runs).get("tue"), matchPlan(wide, [...runs, typedRun("thu-next", "2026-11-26", "tempo", 10)]).get("tue"));
  assert.equal(planWorkoutForActivity("wed", plan, runs)?.id, "tue");
});

test("piano: la seduta spostata risulta fatta e conta nell'aderenza", () => {
  const plan = [session("tue", "2026-11-17", "tempo", 10), session("thu", "2026-11-19", "easy", 6)];
  const runs = [typedRun("wed", "2026-11-18", "tempo", 10)];
  const days = buildDays("2026-11-16", 4, "2026-11-20", plan, runs);
  const [mon, tue, wed, thu] = days;
  assert.equal(mon.state, "rest");
  assert.equal(tue.state, "done");
  assert.equal(tue.doneOn.tue.date, "2026-11-18");
  assert.equal(wed.state, "extra");
  assert.equal(wed.countsFor.wed, "2026-11-17");
  assert.equal(thu.state, "missed");
  assert.deepEqual(adherence(days.map((day) => day.state)), { done: 1, due: 2 });
});

test("bordi della finestra: una corsa senza le sue sedute caricate non viene presa", () => {
  // Mostrati 17-18 (finestra 13-22): la corsa del 23 ha le sue sedute fuori finestra.
  const plan = [session("edge", "2026-11-21", "tempo", 10)];
  const runs = [typedRun("out", "2026-11-23", "tempo", 10)];
  const [day] = buildDays("2026-11-17", 2, "2026-11-25", plan, runs);
  assert.equal(day.state, "rest");
  assert.equal(withinWindow(runs, { from: "2026-11-13", to: "2026-11-22" }).length, 0);
});

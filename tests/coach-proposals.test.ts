import assert from "node:assert/strict";
import test from "node:test";
import { planProposalDiff, type PlanDayWorkout } from "../lib/plan/proposal-diff.ts";

// Settimana tipo: oggi è venerdì 23 ottobre 2026.
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
  session("2026-10-20", "easy", 7),     // martedì, già corso
  session("2026-10-22", "interval", 8), // ieri, corso ma non segnato come fatto
  session("2026-10-24", "easy", 6),     // sabato
  session("2026-10-25", "long", 16),    // domenica
  session("2026-10-27", "easy", 7),     // settimana prossima
  session("2026-10-29", "tempo", 9),
  session("2026-11-01", "long", 18),
];
const ran = new Set(["2026-10-20", "2026-10-22"]);

test("cambiare solo gli ultimi due allenamenti della settimana tocca solo quei giorni", () => {
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

test("se il modello rimanda tutto il piano, cambiano solo i giorni davvero diversi", () => {
  const resent = plan.filter((w) => w.date >= today).map((w) => (w.date === "2026-10-29" ? session(w.date, "interval", 8) : { ...w }));
  const diff = planProposalDiff({ today, windowEnd, existing: plan, activityDates: ran, proposed: resent, removeDates: [] });
  assert.deepEqual(diff.touched, ["2026-10-29"]);
});

test("modificare la settimana prossima non tocca quella attuale", () => {
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

test("i giorni passati e quelli già corsi sono intoccabili", () => {
  const diff = planProposalDiff({
    today, windowEnd, existing: plan, activityDates: new Set([...ran, today]),
    proposed: [session("2026-10-22", "easy", 5), session("2026-10-24", "easy", 6)],
    removeDates: ["2026-10-20", today],
  });
  // Sabato era già così: nessuna modifica. Ieri e martedì bloccati; oggi già corso non si svuota.
  assert.deepEqual(diff.touched, []);
  assert.deepEqual(diff.locked, ["2026-10-20", "2026-10-22"]);
});

test("un giorno può avere due sedute: la proposta sostituisce tutte quelle del giorno", () => {
  const diff = planProposalDiff({
    today, windowEnd, existing: plan, activityDates: ran,
    proposed: [session("2026-10-24", "easy", 6), session("2026-10-24", "recovery", 4)],
    removeDates: [],
  });
  assert.deepEqual(diff.touched, ["2026-10-24"]);
  assert.equal(diff.workouts.length, 2);
  assert.deepEqual(diff.changes[0].before.map((b) => b.meters), [6000]);
  assert.deepEqual(diff.changes[0].after.map((b) => b.meters), [6000, 4000]);
  // Rimandare le stesse due sedute non è una modifica.
  const twice = [...plan, { ...session("2026-10-24", "recovery", 4), day_order: 2 }];
  const same = planProposalDiff({
    today, windowEnd, existing: twice, activityDates: ran,
    proposed: [session("2026-10-24", "easy", 6), session("2026-10-24", "recovery", 4)],
    removeDates: [],
  });
  assert.deepEqual(same.touched, []);
});

test("oggi già corso: una seconda seduta si aggiunge senza toccare la prima", () => {
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
  // Ripetere solo la seduta già fatta non cambia nulla.
  const repeat = planProposalDiff({
    today, windowEnd, existing, activityDates: new Set([...ran, today]),
    proposed: [session(today, "easy", 6)], removeDates: [],
  });
  assert.deepEqual(repeat.touched, []);
});

test("un giorno si svuota solo se richiesto e se c'è qualcosa da togliere", () => {
  const diff = planProposalDiff({
    today, windowEnd, existing: plan, activityDates: ran,
    proposed: [],
    removeDates: ["2026-10-24", "2026-10-26", "2026-10-24"],
  });
  assert.deepEqual(diff.removeDates, ["2026-10-24"]);
  assert.deepEqual(diff.touched, ["2026-10-24"]);
});

test("una seduta completata non viene sostituita: la nuova si aggiunge", () => {
  const existing = [...plan, session("2026-10-28", "easy", 6, "completed")];
  const diff = planProposalDiff({ today, windowEnd, existing, activityDates: ran, proposed: [session("2026-10-28", "tempo", 8)], removeDates: ["2026-10-28"] });
  assert.deepEqual(diff.removeDates, []);
  assert.deepEqual(diff.added, ["2026-10-28"]);
  assert.deepEqual(diff.changes[0].before.map((b) => b.type), ["easy"]);
  assert.deepEqual(diff.changes[0].after.map((b) => b.type), ["easy", "tempo"]);
});

test("il calendario del coach dice settimana e giorni bloccati", async () => {
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

test("lo schema Gemini diventa JSON Schema e il JSON si estrae dalle risposte", async () => {
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

test("una seduta di ieri non corsa si può togliere e rifare oggi", () => {
  const diff = planProposalDiff({
    today, windowEnd, removeFrom: "2026-10-09",
    existing: [...plan, session("2026-10-21", "tempo", 8)], // mercoledì, non corso
    activityDates: ran,
    proposed: [session("2026-10-23", "tempo", 8)],
    removeDates: ["2026-10-21", "2026-10-22", "2026-10-20"],
  });
  // Ieri (22) e martedì (20) sono stati corsi: restano. Mercoledì (21) si svuota.
  assert.deepEqual(diff.removeDates, ["2026-10-21"]);
  assert.deepEqual(diff.touched, ["2026-10-21", "2026-10-23"]);
  assert.deepEqual(diff.locked, ["2026-10-20", "2026-10-22"]);
  assert.equal(diff.changes[0].after.length, 0);
});

test("nel passato non si aggiungono sedute e senza removeFrom nulla cambia", () => {
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

test("seduta divisa: la seconda parte è concatenata e segue la prima", async () => {
  const { sessionStartTime, sessionPlacement } = await import("../lib/plan/day-sessions.ts");
  const diff = planProposalDiff({
    today, windowEnd, existing: plan, activityDates: ran,
    proposed: [
      { ...session("2026-10-29", "easy", 2), chained: true }, // la prima non può essere concatenata
      { ...session("2026-10-29", "interval", 6), chained: true },
    ],
    removeDates: [],
  });
  assert.deepEqual(diff.workouts.map((w) => [w.day_order, w.chained]), [[1, false], [2, true]]);
  assert.deepEqual(diff.changes[0].after.map((b) => b.chained), [false, true]);
  assert.equal(sessionPlacement(diff.workouts[1], 2), "Subito dopo la precedente");
  assert.equal(sessionPlacement(diff.workouts[0], 1), null);
  // Sul calendario dell'orologio le due parti restano in fila.
  assert.deepEqual(diff.workouts.map((w) => sessionStartTime(w)), ["00:00:00", "00:01:00"]);
});

test("doppia seduta: mattina e sera separate, la concatenata eredita il momento", async () => {
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

test("cambiare solo il legame tra due sedute è una modifica; ripeterlo no", () => {
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

test("oggi già corso: la seduta aggiunta va dopo quelle esistenti", () => {
  const existing = [...plan, { ...session(today, "easy", 6), day_part: "morning" as const }];
  const diff = planProposalDiff({
    today, windowEnd, existing, activityDates: new Set([...ran, today]),
    proposed: [{ ...session(today, "recovery", 4), day_part: "evening" }],
    removeDates: [],
  });
  assert.deepEqual(diff.workouts.map((w) => [w.day_order, w.day_part, w.chained]), [[2, "evening", false]]);
});

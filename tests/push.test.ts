import assert from "node:assert/strict";
import test from "node:test";
import {
  computeWeeklyStats,
  deterministicWeeklyRecap,
  formatKm,
  previousWeek,
  romeDate,
  weeklyPushBody,
} from "../lib/push/weekly-stats.ts";
import { analysisPushBody, firstSentence, reminderBody } from "../lib/push/messages.ts";

test("la settimana precedente è lunedì–domenica secondo l'ora di Roma", () => {
  // Lunedì 12/10 alle 08:00 di Roma (06:00 UTC, orario del cron).
  assert.deepEqual(previousWeek(new Date("2026-10-12T06:00:00Z")), { start: "2026-10-05", end: "2026-10-11" });
  // Domenica 11/10 alle 23:30 UTC è già lunedì 12/10 a Roma.
  assert.deepEqual(previousWeek(new Date("2026-10-11T23:30:00Z")), { start: "2026-10-05", end: "2026-10-11" });
  // Domenica sera a Roma: la settimana corrente non è ancora conclusa.
  assert.deepEqual(previousWeek(new Date("2026-10-11T20:00:00Z")), { start: "2026-09-28", end: "2026-10-04" });
  // Cambio d'ora (25/10/2026): lunedì 26/10 alle 00:30 di Roma = 23:30 UTC del 25.
  assert.deepEqual(previousWeek(new Date("2026-10-25T23:30:00Z")), { start: "2026-10-19", end: "2026-10-25" });
  assert.equal(romeDate(new Date("2026-10-15T22:30:00Z")), "2026-10-16");
});

test("le statistiche usano le date di Roma e contano l'aderenza per giorno", () => {
  const week = { start: "2026-10-05", end: "2026-10-11" };
  const stats = computeWeeklyStats(
    week,
    [
      // Domenica 4/10 23:30 UTC = lunedì 5/10 01:30 a Roma: dentro.
      { started_at: "2026-10-04T23:30:00Z", sport: "running", distance_m: 8_040 },
      { started_at: "2026-10-07T17:00:00+02:00", sport: "running", distance_m: 6_000 },
      { started_at: "2026-10-07T19:00:00+02:00", sport: "strength", distance_m: 0 },
      { started_at: "2026-10-10T08:00:00Z", sport: "running", distance_m: 12_345 },
      { started_at: "2026-10-09T18:00:00Z", sport: "cycling", distance_m: 30_000 },
      // Domenica 11/10 22:30 UTC = lunedì 12/10 a Roma: fuori.
      { started_at: "2026-10-11T22:30:00Z", sport: "running", distance_m: 10_000 },
    ],
    [
      { date: "2026-10-05", type: "easy" },
      { date: "2026-10-07", type: "interval" },
      { date: "2026-10-08", type: "tempo" },
      { date: "2026-10-09", type: "cross" },
      { date: "2026-10-11", type: "long" },
      { date: "2026-10-12", type: "easy" },
    ],
  );
  assert.deepEqual(stats, {
    week_start: "2026-10-05",
    week_end: "2026-10-11",
    running_km: 26.4,
    activities: 5,
    planned: 5,
    planned_done: 3,
    longest_run_km: 12.3,
  });
  assert.equal(weeklyPushBody(stats), "26,4 km · 5 uscite · piano 3/5");
});

test("km arrotondati a un decimale e testi senza piano o senza attività", () => {
  const week = { start: "2026-10-05", end: "2026-10-11" };
  const one = computeWeeklyStats(week, [{ started_at: "2026-10-06T07:00:00Z", sport: "running", distance_m: 9_951 }], []);
  assert.equal(one.running_km, 10);
  assert.equal(formatKm(one.running_km), "10,0 km");
  assert.equal(weeklyPushBody(one), "10,0 km · 1 uscita");
  assert.match(deterministicWeeklyRecap(one), /10,0 km di corsa in 1 uscita/);

  const none = computeWeeklyStats(week, [], [{ date: "2026-10-06", type: "easy" }]);
  assert.equal(weeklyPushBody(none), "Nessuna uscita · piano 0/1");
  assert.match(deterministicWeeklyRecap(none), /senza attività registrate/);

  const full = computeWeeklyStats(
    week,
    [{ started_at: "2026-10-06T07:00:00Z", sport: "running", distance_m: 5_000 }],
    [{ date: "2026-10-06", type: "easy" }],
  );
  assert.match(deterministicWeeklyRecap(full), /Piano rispettato in pieno/);
});

test("il corpo dell'analisi è la prima frase, troncata con ellissi", () => {
  assert.equal(firstSentence("Ottima corsa a 5.2 km di media. Il cuore è rimasto basso."), "Ottima corsa a 5.2 km di media.");
  assert.equal(firstSentence("**Bene** così!  Continua"), "Bene così!");
  const long = `${"parola ".repeat(40)}fine.`;
  const cut = firstSentence(long);
  assert.ok(cut.length <= 120);
  assert.ok(cut.endsWith("…"));
  assert.ok(!cut.includes(" …"));
  assert.equal(analysisPushBody(""), "Il coach ha commentato la tua corsa.");
});

test("il promemoria riassume ripetute e distanza", () => {
  const step = {
    label: "Veloce",
    completion_type: "distance" as const,
    pace_min_s_km: 260,
    pace_max_s_km: 270,
    hr_min_bpm: null,
    hr_max_bpm: null,
  };
  const recovery = { ...step, kind: "recovery" as const, completion_type: "time" as const, completion_value: 90, pace_min_s_km: null, pace_max_s_km: null };
  const work = { ...step, kind: "work" as const, completion_value: 400 };
  assert.equal(
    reminderBody({
      workout_steps: Array.from({ length: 6 }, () => [work, recovery]).flat(),
      target_duration_s: 2700,
      target_pace_s_km: 360,
    }),
    "6 × 400 m · ~7,50 km",
  );
  assert.equal(reminderBody({ target_distance_m: 10_000 }), "10,00 km");
  assert.equal(reminderBody({ target_duration_s: 2700 }), "45 min");
  assert.equal(reminderBody({}), "Apri per i dettagli della seduta.");
});

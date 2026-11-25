import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createTranslator } from "next-intl";
import type { Locale, Translator } from "../i18n/config.ts";
import { localeOrDefault } from "../lib/push/locale.ts";
import {
  computeWeeklyStats,
  deterministicWeeklyRecap,
  formatKm,
  previousWeek,
  romeDate,
  weeklyPushBody,
} from "../lib/push/weekly-stats.ts";
import { analysisPushBody, firstSentence, reminderBody } from "../lib/push/messages.ts";

// Same translator the cron builds (staticTranslator), without server-only.
const pushT = (locale: Locale): Translator => {
  const messages = JSON.parse(readFileSync(new URL(`../messages/${locale}/push.json`, import.meta.url), "utf8"));
  return createTranslator({ locale, messages: { push: messages }, namespace: "push" }) as unknown as Translator;
};
const it = pushT("it");
const en = pushT("en");

test("the saved profile language counts only if it is an app language", () => {
  assert.equal(localeOrDefault("en"), "en");
  assert.equal(localeOrDefault("it"), "it");
  assert.equal(localeOrDefault("fr"), "it");
  assert.equal(localeOrDefault(null), "it");
  assert.equal(localeOrDefault(undefined, "en"), "en");
});

test("notifications go out in the user's language, with local numbers and plurals", () => {
  const week = { start: "2026-10-05", end: "2026-10-11" };
  const stats = computeWeeklyStats(
    week,
    [
      { started_at: "2026-10-06T07:00:00Z", sport: "running", distance_m: 10_040 },
      { started_at: "2026-10-08T07:00:00Z", sport: "running", distance_m: 5_000 },
    ],
    [{ date: "2026-10-06", type: "easy" }],
  );
  assert.equal(weeklyPushBody(stats, it, "it"), "15,0 km · 2 uscite · piano 1/1");
  assert.equal(weeklyPushBody(stats, en, "en"), "15.0 km · 2 outings · plan 1/1");
  assert.equal(it("weekly.title"), "La tua settimana");
  assert.equal(en("weekly.title"), "Your week");
  assert.match(deterministicWeeklyRecap(stats, en, "en"), /15\.0 km of running in 2 outings/);
  assert.match(deterministicWeeklyRecap(stats, en, "en"), /Plan followed in full/);
  assert.equal(analysisPushBody("", en), "Your coach has commented on your run.");
  assert.equal(reminderBody({ target_duration_s: 2700 }, en, "en"), "45 min");
  assert.equal(reminderBody({}, en, "en"), "Open for the session details.");
  assert.equal(reminderBody({ target_distance_m: 10_500 }, en, "en"), "10.50 km");
  assert.equal(en("reminder.title", { types: "Easy + Long" }), "Tomorrow: Easy + Long");
});

test("the previous week is Monday–Sunday by Rome time", () => {
  // Monday 12/10 at 08:00 Rome time (06:00 UTC, cron time).
  assert.deepEqual(previousWeek(new Date("2026-10-12T06:00:00Z")), { start: "2026-10-05", end: "2026-10-11" });
  // Sunday 11/10 at 23:30 UTC is already Monday 12/10 in Rome.
  assert.deepEqual(previousWeek(new Date("2026-10-11T23:30:00Z")), { start: "2026-10-05", end: "2026-10-11" });
  // Sunday evening in Rome: the current week is not over yet.
  assert.deepEqual(previousWeek(new Date("2026-10-11T20:00:00Z")), { start: "2026-09-28", end: "2026-10-04" });
  // Clock change (25/10/2026): Monday 26/10 at 00:30 Rome = 23:30 UTC on the 25th.
  assert.deepEqual(previousWeek(new Date("2026-10-25T23:30:00Z")), { start: "2026-10-19", end: "2026-10-25" });
  assert.equal(romeDate(new Date("2026-10-15T22:30:00Z")), "2026-10-16");
});

test("statistics use Rome dates and count adherence per day", () => {
  const week = { start: "2026-10-05", end: "2026-10-11" };
  const stats = computeWeeklyStats(
    week,
    [
      // Sunday 4/10 23:30 UTC = Monday 5/10 01:30 in Rome: inside.
      { started_at: "2026-10-04T23:30:00Z", sport: "running", distance_m: 8_040 },
      { started_at: "2026-10-07T17:00:00+02:00", sport: "running", distance_m: 6_000 },
      { started_at: "2026-10-07T19:00:00+02:00", sport: "strength", distance_m: 0 },
      { started_at: "2026-10-10T08:00:00Z", sport: "running", distance_m: 12_345 },
      { started_at: "2026-10-09T18:00:00Z", sport: "cycling", distance_m: 30_000 },
      // Sunday 11/10 22:30 UTC = Monday 12/10 in Rome: outside.
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
  assert.equal(weeklyPushBody(stats, it, "it"), "26,4 km · 5 uscite · piano 3/5");
});

test("km rounded to one decimal and texts without plan or without activity", () => {
  const week = { start: "2026-10-05", end: "2026-10-11" };
  const one = computeWeeklyStats(week, [{ started_at: "2026-10-06T07:00:00Z", sport: "running", distance_m: 9_951 }], []);
  assert.equal(one.running_km, 10);
  assert.equal(formatKm(one.running_km), "10,0 km");
  assert.equal(weeklyPushBody(one, it, "it"), "10,0 km · 1 uscita");
  assert.match(deterministicWeeklyRecap(one, it, "it"), /10,0 km di corsa in 1 uscita/);

  const none = computeWeeklyStats(week, [], [{ date: "2026-10-06", type: "easy" }]);
  assert.equal(weeklyPushBody(none, it, "it"), "Nessuna uscita · piano 0/1");
  assert.match(deterministicWeeklyRecap(none, it, "it"), /senza attività registrate/);

  const full = computeWeeklyStats(
    week,
    [{ started_at: "2026-10-06T07:00:00Z", sport: "running", distance_m: 5_000 }],
    [{ date: "2026-10-06", type: "easy" }],
  );
  assert.match(deterministicWeeklyRecap(full, it, "it"), /Piano rispettato in pieno/);
});

test("the analysis body is the first sentence, truncated with an ellipsis", () => {
  assert.equal(firstSentence("Ottima corsa a 5.2 km di media. Il cuore è rimasto basso."), "Ottima corsa a 5.2 km di media.");
  assert.equal(firstSentence("**Bene** così!  Continua"), "Bene così!");
  const long = `${"parola ".repeat(40)}fine.`;
  const cut = firstSentence(long);
  assert.ok(cut.length <= 120);
  assert.ok(cut.endsWith("…"));
  assert.ok(!cut.includes(" …"));
  assert.equal(analysisPushBody("", it), "Il coach ha commentato la tua corsa.");
});

test("the reminder summarises repeats and distance", () => {
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
    }, it, "it"),
    "6 × 400 m · ~7,50 km",
  );
  assert.equal(reminderBody({ target_distance_m: 10_000 }, it, "it"), "10,00 km");
  assert.equal(reminderBody({ target_duration_s: 2700 }, it, "it"), "45 min");
  assert.equal(reminderBody({}, it, "it"), "Apri per i dettagli della seduta.");
});

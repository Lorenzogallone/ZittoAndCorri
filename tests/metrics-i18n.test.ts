import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createTranslator } from "next-intl";
import type { Translator } from "../i18n/config.ts";
import { countdownLabel, formatDistance, formatPlannedDistance } from "../lib/format.ts";
import { effortLabel } from "../lib/metrics/best-efforts.ts";
import { trendFor } from "../lib/metrics/body-trends.ts";
import { metricsIt } from "../lib/metrics/italian.ts";
import { paceAdviceText } from "../lib/metrics/race-prediction.ts";
import { periodTotals } from "../lib/metrics/totals.ts";

const messages = (locale: string) => JSON.parse(readFileSync(new URL(`../messages/${locale}/metrics.json`, import.meta.url), "utf8"));
const metricsEn = createTranslator({ locale: "en", messages: { metrics: messages("en") }, namespace: "metrics" }) as unknown as Translator;

test("distanze: il separatore decimale segue la lingua", () => {
  assert.equal(formatDistance(8_500), "8,50 km");
  assert.equal(formatDistance(8_500, "en"), "8.50 km");
  assert.equal(formatDistance(null, "en"), "—");
  assert.equal(formatPlannedDistance({ target_duration_s: 3_000, target_pace_s_km: 300 }), "~10,00 km");
  assert.equal(formatPlannedDistance({ target_distance_m: 7_500 }, "en"), "7.50 km");
});

test("conto alla rovescia e nomi delle distanze nelle due lingue", () => {
  const inDays = (days: number) => new Date(Date.now() + days * 86_400_000 - 3_600_000).toISOString();
  assert.equal(countdownLabel(inDays(0), metricsIt), "Oggi!");
  assert.equal(countdownLabel(inDays(1), metricsIt), "1 giorno");
  assert.equal(countdownLabel(inDays(142), metricsIt), "142 giorni");
  assert.equal(countdownLabel(inDays(1), metricsEn), "1 day");
  assert.equal(countdownLabel(inDays(142), metricsEn), "142 days");
  assert.equal(countdownLabel(null, metricsEn), null);
  assert.equal(effortLabel("half", metricsIt), "Mezza");
  assert.equal(effortLabel("half", metricsEn), "Half");
});

test("totali per periodo in inglese: mesi e confronti", () => {
  const totals = periodTotals([{ started_at: "2026-09-10T07:00:00Z", sport: "running", distance_m: 10_000, duration_s: 3_000 }], "2026-10-16", metricsEn, "en");
  const byKey = Object.fromEntries(totals.map((total) => [total.key, total]));
  assert.equal(byKey.week.label, "Week");
  assert.equal(byKey.month.caption, "October 2026");
  assert.equal(byKey.month.previous_label, "the same point in September");
  assert.equal(byKey.year.previous_label, "the same point in 2025");
  assert.equal(byKey.all.caption, "since September 2026");
});

test("trend del corpo in inglese", () => {
  const today = "2026-11-11";
  const days = (from: number, to: number, value: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => ({ date: new Date(Date.parse(`${today}T12:00:00Z`) - (from + i) * 86_400_000).toISOString().slice(0, 10), value }));
  const rhr = trendFor("restingHr", [...days(0, 13, 48), ...days(28, 41, 52)], today, metricsEn, "en");
  assert.equal(rhr.label, "Resting HR");
  assert.match(rhr.sentence, /^Improving: average of the last 2 weeks 48 bpm, a month ago 52 bpm\. A sign of adaptation\.$/);
  const efficiency = trendFor("efficiency", [...days(0, 13, 1.18), ...days(28, 41, 1.1)], today, metricsEn, "en");
  assert.match(efficiency.sentence, /1\.18/);
});

test("consiglio sul passo in inglese", () => {
  const advice = { fast_s_km: 320, slow_s_km: 335, goal_fit: "inside", goal_ambitious: false, goal_pace_s_km: 330 } as Parameters<typeof paceAdviceText>[0];
  const range = { optimistic_s: 6_800, central_s: 7_100, prudent_s: 7_400 } as Parameters<typeof paceAdviceText>[1];
  assert.equal(paceAdviceText(advice, range, 7_200, metricsEn), "Your goal of 2:00:00 is inside the range: start at 5:20–5:35/km.");
  assert.equal(paceAdviceText(advice, range, 7_200), "L'obiettivo 2:00:00 è dentro la forbice: parti a 5:20–5:35/km.");
});

test("spiegazione della forbice in inglese", async () => {
  const { goalRaceRange } = await import("../lib/metrics/race-prediction.ts");
  const athlete = { meters: 5_000, time_s: 1_520, activity_id: "t", started_at: "2026-11-14T08:00:00Z" };
  const lowBase = { weekly_km: 20, longest_m: 13_000, durability: { drift_pct: 3.9, runs: 4 } };
  const result = goalRaceRange(athlete, lowBase, { distance_m: 21_097, target_time_s: 7_199 }, "2026-11-22", metricsEn, "en");
  assert.match(result.explanation, /^Based on your 5 km from 14 Nov\./);
  assert.match(result.explanation, /drift 3\.9%/);
  assert.match(result.explanation, /Low weekly volume \(20 km a week\) and a long run that is too short \(longest 13 km\) keep the range wide toward the cautious end\./);
  assert.match(result.advice_text, /^Your goal of 1:59:59 is inside the range but on the fast side/);
  const italian = goalRaceRange(athlete, lowBase, { distance_m: 21_097, target_time_s: 7_199 }, "2026-11-22");
  assert.match(italian.explanation, /deriva 3,9%/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { durabilityFactor, predictRange } from "../lib/metrics/predict.ts";
import { durabilityEvidence, enduranceBase, rangeExplanation, thresholdEvidence, type EnduranceActivity } from "../lib/metrics/race-prediction.ts";

const today = "2026-11-22";
const seg = (kind: string, duration_s: number, pace_s_km: number, variant: string | null = null) =>
  ({ kind, variant, duration_s, pace_s_km, distance_m: Math.round((duration_s / pace_s_km) * 1000) });
const run = (date: string, extra: Partial<EnduranceActivity>): EnduranceActivity =>
  ({ sport: "running", started_at: `${date}T07:00:00Z`, distance_m: 6000, moving_time_s: 2100, ...extra });

// L'atleta: 5 km in 25:28, 17 km a settimana, lungo 13 km, soglie a 5:32 e 5:18.
const tempo19 = run("2026-11-19", { intervals: { source: "laps", segments: [seg("warmup", 300, 411), seg("work", 480, 327), seg("recovery", 120, 441), seg("work", 480, 314), seg("recovery", 121, 720), seg("work", 484, 312)] } });
const tempo04 = run("2026-11-04", { intervals: { source: "laps", segments: [seg("work", 20, 264, "sprint"), seg("work", 480, 333), seg("recovery", 90, 450), seg("work", 481, 331)] } });
const test5k = run("2026-11-14", { intervals: { source: "laps", segments: [327, 318, 308, 285, 296].map((s) => seg("work", s, s)) } });
const reps = run("2026-10-28", { intervals: { source: "laps", segments: [seg("work", 277, 275), seg("recovery", 119, 700), seg("work", 296, 295), seg("recovery", 119, 700), seg("work", 315, 313)] } });
const reference = { meters: 5000, time_s: 1528 };
const base = { weekly_km: 16.5, longest_m: 13_006 };

test("soglia: contano solo i tratti da 6 a 30 minuti, con almeno 15 minuti di lavoro", () => {
  const evidence = thresholdEvidence([tempo19, tempo04, test5k, reps], today)!;
  // Il test sui 5 km (tratti da un km) e le ripetute da 5 minuti restano fuori.
  assert.deepEqual(evidence.dates, ["2026-11-19", "2026-11-04"]);
  assert.equal(evidence.sessions, 2);
  assert.equal(evidence.age_days, 3);
  // Più vicina alla seduta recente (5:18) che a quella vecchia (5:32).
  assert.ok(evidence.pace_s_km > 318 && evidence.pace_s_km < 325, `passo ${evidence.pace_s_km}`);
  assert.equal(thresholdEvidence([test5k, reps], today), null);
  // Oltre 6 settimane non descrive più la forma di oggi.
  assert.equal(thresholdEvidence([tempo04], "2026-12-20"), null);
});

test("tenuta: deriva mediana dei lunghi da almeno 70 minuti, letture sballate escluse", () => {
  const long = (date: string, minutes: number, drift: number) => run(date, { moving_time_s: minutes * 60, distance_m: 12_000, hr_drift_pct: drift });
  const evidence = durabilityEvidence([long("2026-10-18", 73, 3.9), long("2026-10-25", 74, 3.3), long("2026-11-01", 85, 0.5), long("2026-11-08", 87, 4.1), long("2026-11-10", 35, 12), long("2026-11-02", 80, 38.6)], today)!;
  assert.equal(evidence.runs, 4);
  assert.equal(evidence.drift_pct, 3.9);
  assert.ok(durabilityFactor(evidence) < 1 && durabilityFactor(evidence) >= 0.75);
  assert.equal(durabilityFactor({ drift_pct: 12, runs: 2 }), 1.25);
  assert.equal(durabilityFactor(null), 1);
});

test("due stime: la centrale sta in mezzo, la forbice è più stretta di quella da una prova sola", () => {
  const single = predictRange({ reference, reference_age_days: 8, target_m: 21_097, base });
  const full = enduranceBase([tempo19, tempo04, test5k], today);
  const both = predictRange({ reference, reference_age_days: 8, target_m: 21_097, base: { ...base, threshold: full.threshold } });
  const [effort, pace] = both.sources!;
  assert.equal(effort.kind, "effort");
  assert.ok(Math.abs(effort.weight + pace.weight - 1) < 1e-9);
  // La soglia estrapola meno della prova sui 5 km: pesa un po' di più.
  assert.ok(pace.weight > effort.weight);
  assert.ok(both.central_s >= Math.min(effort.central_s, pace.central_s) && both.central_s <= Math.max(effort.central_s, pace.central_s));
  assert.ok(both.prudent_s - both.optimistic_s < single.prudent_s - single.optimistic_s, "forbice non più stretta");
  // Resta onesta: con 17 km a settimana e lungo di 13 km la prudente è oltre 3 minuti sopra la centrale.
  assert.ok(both.prudent_s - both.central_s >= 180, `margine prudente ${both.prudent_s - both.central_s}s`);
  assert.ok(both.optimistic_s < both.central_s && both.central_s < both.prudent_s);
});

test("stime in disaccordo: la forbice le contiene entrambe e non si stringe", () => {
  const fast = { pace_s_km: 290, sessions: 2, age_days: 3, dates: ["2026-11-19"] };
  const range = predictRange({ reference, reference_age_days: 8, target_m: 21_097, base: { ...base, threshold: fast } });
  assert.equal(range.agreement, 0);
  for (const source of range.sources!) {
    assert.ok(source.central_s >= range.optimistic_s && source.central_s <= range.prudent_s, `${source.kind} fuori forbice`);
  }
});

test("spiegazione: dice su quali dati si basa e se concordano", () => {
  const full = { ...base, ...{ threshold: thresholdEvidence([tempo19, tempo04], today), durability: { drift_pct: 3.9, runs: 4 } } };
  const range = predictRange({ reference, reference_age_days: 8, target_m: 21_097, base: full });
  const text = rangeExplanation({ ...reference, activity_id: "a", started_at: "2026-11-14T11:11:20Z" }, range, full, today);
  assert.match(text, /^Combina i 5 km del 14 nov \(da soli: \d:\d\d:\d\d\) e le sedute di soglia del 4 nov e del 19 nov a 5:2\d\/km/);
  assert.match(text, /Nei lunghi il cuore resta stabile \(deriva 3,9%\)/);
  assert.match(text, /volume basso \(17 km a settimana\) e il lungo corto \(massimo 13 km\) tengono larga la forbice/);
  // Senza soglie resta la frase di prima.
  const alone = predictRange({ reference, reference_age_days: 8, target_m: 21_097, base });
  assert.match(rangeExplanation({ ...reference, activity_id: "a", started_at: "2026-11-14T11:11:20Z" }, alone, base, today), /^Si basa sui 5 km del 14 nov\./);
});

import assert from "node:assert/strict";
import test from "node:test";
import { classifyRun } from "../lib/metrics/run-type.ts";

const seg = (kind: string, duration_s: number, variant: string | null = null) => ({ kind, variant, duration_s });
const run = { distance_m: 6000, moving_time_s: 2100, duration_s: 2100 };

test("tipo di corsa: il piano vale se i dati lo confermano", () => {
  const tempo = { source: "laps", segments: [seg("warmup", 300), seg("work", 480), seg("recovery", 120), seg("work", 480), seg("recovery", 120), seg("work", 484)] };
  assert.equal(classifyRun({ ...run, intervals: tempo, planned: "tempo" }), "tempo");
  // Il piano chiedeva ripetute ma la corsa è stata tutta facile: vincono i dati.
  assert.equal(classifyRun({ ...run, intervals: null, planned: "interval" }), "easy");
});

test("tipo di corsa senza piano: ripetute, soglia, lungo, facile", () => {
  const reps = { source: "auto", segments: Array.from({ length: 5 }, () => [seg("work", 240), seg("recovery", 120)]).flat() };
  assert.equal(classifyRun({ ...run, intervals: reps, planned: null }), "interval");
  const threshold = { source: "notes", segments: [seg("warmup", 600), seg("work", 1200), seg("cooldown", 300)] };
  assert.equal(classifyRun({ ...run, intervals: threshold, planned: null }), "tempo");
  const strides = { source: "laps", segments: [seg("steady", 1800), seg("work", 20, "sprint"), seg("recovery", 60), seg("work", 20, "sprint")] };
  assert.equal(classifyRun({ ...run, intervals: strides, planned: null }), "easy");
  assert.equal(classifyRun({ distance_m: 12_000, moving_time_s: 4500, duration_s: 4600, intervals: null, planned: null }), "long");
  assert.equal(classifyRun({ ...run, intervals: null, planned: "long" }), "long");
});

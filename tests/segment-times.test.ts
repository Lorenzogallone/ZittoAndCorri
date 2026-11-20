import assert from "node:assert/strict";
import test from "node:test";
import { segmentSpans } from "../lib/metrics/segment-times.ts";
import { movingClock } from "../lib/metrics/pauses.ts";

test("tratti nel tempo: fine al tratto dopo, pause dentro, orologio in movimento", () => {
  const segments = [
    { kind: "warmup", variant: null, label: "Riscaldamento", start_s: 0, duration_s: 300, paused_s: 0 },
    { kind: "work", variant: null, label: "8'", start_s: 300, duration_s: 480, paused_s: 30 },
    { kind: "recovery", variant: "jog", label: "Jogging", start_s: 810, duration_s: 120, paused_s: 0 },
  ];
  // 30" di pausa dell'orologio a metà della ripetuta (da 500 a 531).
  const spans = segmentSpans(segments, movingClock([{ from: 500, to: 531, removed: 30 }]));
  assert.deepEqual(spans.map((s) => [s.start, s.end]), [[0, 300], [300, 810], [810, 930]]);
  assert.deepEqual(spans.map((s) => [s.movingStart, s.movingEnd]), [[0, 300], [300, 780], [780, 900]]);
});

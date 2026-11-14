import assert from "node:assert/strict";
import test from "node:test";
import { detectPauses, movingClock, withoutPauses } from "../lib/metrics/pauses.ts";
import { computeSplits } from "../lib/metrics/splits.ts";
import type { GpsPoint } from "../lib/types.ts";

// Corsa a 5:10/km (≈3,23 m/s) verso nord, un punto al secondo.
const SPEED = 1000 / 310;
const METERS_PER_DEG_LAT = 111_195;

/** Traccia GPS: `pauses` sono [secondo di corsa, durata] in cui l'orologio è fermo. */
function track(runSeconds: number, pauses: Array<[number, number]> = []): GpsPoint[] {
  const points: GpsPoint[] = [];
  let clock = 0;
  for (let s = 0; s <= runSeconds; s++) {
    const pause = pauses.find(([at]) => at === s);
    if (pause) clock += pause[1];
    points.push({ t: clock + s, lat: 45 + (s * SPEED) / METERS_PER_DEG_LAT, lon: 9 });
  }
  return points;
}

test("una pausa dell'orologio non allunga il km", () => {
  const plain = computeSplits(track(1300))!;
  const paused = computeSplits(track(1300, [[200, 50], [700, 10]]))!;
  assert.equal(plain[0].time_s, 310);
  assert.deepEqual(paused.map((s) => s.time_s), plain.map((s) => s.time_s));
});

test("le pause si riconoscono dal buco senza avanzare; la registrazione smart no", () => {
  const distance = [
    { t: 0, d: 0 }, { t: 1, d: 3 }, { t: 2, d: 6 },
    { t: 12, d: 7 },   // 10" fermo: pausa
    { t: 13, d: 10 }, { t: 18, d: 26 }, // 5" correndo (registrazione smart): non è pausa
    { t: 19, d: 29 }, { t: 20, d: 32 },
  ];
  const pauses = detectPauses(distance);
  assert.deepEqual(pauses, [{ from: 2, to: 12, removed: 9 }]);
  const clock = movingClock(pauses);
  assert.equal(clock(2), 2);
  assert.equal(clock(12), 3);
  assert.equal(clock(20), 11);
});

test("i lap si accorciano dei secondi di pausa che contengono", () => {
  const distance = Array.from({ length: 40 }, (_, i) => ({ t: i < 20 ? i : i + 30, d: i * 3 }));
  const { laps } = withoutPauses({ distance, laps: [{ start_s: 0, duration_s: 19 }, { start_s: 19, duration_s: 51 }] });
  assert.deepEqual(laps, [{ start_s: 0, duration_s: 19 }, { start_s: 19, duration_s: 21 }]);
});

test("senza pause gli stream restano identici", () => {
  const gps = track(120);
  const streams = { gps };
  assert.equal(withoutPauses(streams), streams);
});

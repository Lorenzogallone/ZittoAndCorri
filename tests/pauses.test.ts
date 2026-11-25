import assert from "node:assert/strict";
import test from "node:test";
import { detectPauses, movingClock, withoutPauses } from "../lib/metrics/pauses.ts";
import { computeSplits } from "../lib/metrics/splits.ts";
import type { GpsPoint } from "../lib/types.ts";

// Run at 5:10/km (≈3.23 m/s) heading north, one point per second.
const SPEED = 1000 / 310;
const METERS_PER_DEG_LAT = 111_195;

/** GPS track: `pauses` are [run second, duration] in which the watch is stopped. */
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

test("a watch pause does not lengthen the km", () => {
  const plain = computeSplits(track(1300))!;
  const paused = computeSplits(track(1300, [[200, 50], [700, 10]]))!;
  assert.equal(plain[0].time_s, 310);
  assert.deepEqual(paused.map((s) => s.time_s), plain.map((s) => s.time_s));
});

test("pauses are recognised by the gap with no progress; smart recording is not", () => {
  const distance = [
    { t: 0, d: 0 }, { t: 1, d: 3 }, { t: 2, d: 6 },
    { t: 12, d: 7 },   // 10" stopped: pause
    { t: 13, d: 10 }, { t: 18, d: 26 }, // 5" while running (smart recording): not a pause
    { t: 19, d: 29 }, { t: 20, d: 32 },
  ];
  const pauses = detectPauses(distance);
  assert.deepEqual(pauses, [{ from: 2, to: 12, removed: 9 }]);
  const clock = movingClock(pauses);
  assert.equal(clock(2), 2);
  assert.equal(clock(12), 3);
  assert.equal(clock(20), 11);
});

test("laps are shortened by the seconds of pause they contain", () => {
  const distance = Array.from({ length: 40 }, (_, i) => ({ t: i < 20 ? i : i + 30, d: i * 3 }));
  const { laps } = withoutPauses({ distance, laps: [{ start_s: 0, duration_s: 19 }, { start_s: 19, duration_s: 51 }] });
  assert.deepEqual(laps, [{ start_s: 0, duration_s: 19 }, { start_s: 19, duration_s: 21 }]);
});

test("without pauses the streams stay identical", () => {
  const gps = track(120);
  const streams = { gps };
  assert.equal(withoutPauses(streams), streams);
});

test("moving time from pauses, when the file doesn't say", async () => {
  const { movingTimeFromStreams, bestMovingTime } = await import("../lib/metrics/pauses.ts");
  const gps = track(1300, [[200, 50], [700, 10]]);
  const duration = gps[gps.length - 1].t;
  assert.equal(duration, 1360);
  // Exactly the 50" and 10" of pause removed: the 1300" of running remain.
  assert.equal(movingTimeFromStreams(duration, { gps }), 1300);
  assert.equal(movingTimeFromStreams(1300, { gps: track(1300) }), null);
  // The shortest below the total wins; a value equal to the total doesn't count.
  assert.equal(bestMovingTime(1360, 1360, 1300), 1300);
  assert.equal(bestMovingTime(1360, null, null), null);
  assert.equal(bestMovingTime(1360, 1290, 1300), 1290);
});

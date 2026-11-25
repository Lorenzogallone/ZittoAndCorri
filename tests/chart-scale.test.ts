import assert from "node:assert/strict";
import test from "node:test";
import { axisRange, smoothSeries } from "../lib/chart-scale.ts";

test("elevation on flat ground gets at least the minimum vertical range", () => {
  const { min, max } = axisRange([4.8, 16, 27.6], { minSpan: 50, minPad: 5 });
  assert.ok(max - min >= 50 - 1e-9);
  assert.ok(min < 4.8 && max > 27.6);
});

test("a hilly run keeps its own range", () => {
  const { min, max } = axisRange([100, 400], { minSpan: 50, minPad: 5 });
  assert.equal(Math.round(max - min), 372);
});

test("the moving average removes spikes but keeps the trend", () => {
  const points = Array.from({ length: 60 }, (_, t) => ({ t, v: t < 30 ? 10 : 20 }));
  points[10] = { t: 10, v: 40 };
  const out = smoothSeries(points, 20);
  assert.equal(out.length, points.length);
  assert.ok(out[10].v < 13);
  assert.ok(Math.abs(out[59].v - 20) < 1e-9);
});

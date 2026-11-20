import assert from "node:assert/strict";
import test from "node:test";
import { paceSeries } from "../lib/metrics/pace-series.ts";

test("passo nel tempo: media su 30 secondi, niente punti dove si cammina", () => {
  const track: Array<{ t: number; d: number }> = [];
  let d = 0;
  for (let t = 0; t <= 600; t++) {
    // 5 minuti a 5:00/km, 2 minuti camminando piano, 3 minuti a 4:00/km.
    d += t <= 300 ? 3.333 : t <= 420 ? 0.8 : 4.167;
    track.push({ t, d });
  }
  const pace = paceSeries(track);
  const at = (t: number) => pace.find((p) => p.t === t)?.v;
  assert.ok(Math.abs(at(150)! - 300) <= 2, `passo a 150 s: ${at(150)}`);
  assert.ok(Math.abs(at(520)! - 240) <= 2, `passo a 520 s: ${at(520)}`);
  assert.equal(at(360), undefined);
});

test("passo nel tempo: traccia troppo corta, nessun punto", () => {
  assert.deepEqual(paceSeries([{ t: 0, d: 0 }, { t: 1, d: 3 }]), []);
});

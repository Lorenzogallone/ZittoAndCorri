import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { kmSplits } from "../lib/metrics/km-splits.ts";

async function long15k() {
  const raw = JSON.parse(await readFile(new URL("./fixtures/long-15k.json", import.meta.url), "utf8"));
  return {
    distance: raw.t.map((t: number, i: number) => ({ t, d: raw.d[i] })),
    hr: raw.hr.map(([t, bpm]: [number, number]) => ({ t, bpm })),
    cadence: raw.cad.map(([t, rpm]: [number, number]) => ({ t, rpm })),
  };
}

test("km per km: 15 km con passo, cuore e cadenza di ognuno", async () => {
  const result = kmSplits(await long15k())!;
  assert.equal(result.splits.length, 15, "gli ultimi 12 m non fanno un km");
  for (const split of result.splits) {
    assert.equal(split.distance_m, 1000);
    assert.ok(split.pace_s_km > 360 && split.pace_s_km < 450, `passo ${split.pace_s_km}`);
    assert.ok(split.avg_hr! > 140 && split.avg_hr! < 175, `FC ${split.avg_hr}`);
    assert.ok(split.cadence_spm! > 150 && split.cadence_spm! < 180, `cadenza ${split.cadence_spm}`);
    assert.equal(split.elevation_m, null, "senza GPS niente quota");
  }
  // Il tempo dei km è il tempo in movimento: la sosta di 49" non conta.
  const total = result.splits.reduce((sum, split) => sum + split.time_s, 0);
  assert.ok(Math.abs(total - 6221) < 15, `${total}`);
  assert.ok(result.halves && result.halves.pace_delta_s_km > 0, "seconda metà un filo più lenta");
});

test("km per km: l'ultimo pezzo vale se è almeno 200 m", () => {
  const distance = Array.from({ length: 1501 }, (_, t) => ({ t, d: t * 2.5 })); // 3,75 km a 6:40/km
  const result = kmSplits({ distance })!;
  assert.deepEqual(result.splits.map((split) => split.distance_m), [1000, 1000, 1000, 750]);
  assert.equal(result.splits[3].pace_s_km, 400);
  assert.equal(result.halves, null, "servono almeno 4 km interi");
});

test("km per km: sotto il km non c'è tabella", () => {
  const distance = Array.from({ length: 300 }, (_, t) => ({ t, d: t * 3 }));
  assert.equal(kmSplits({ distance }), null);
});

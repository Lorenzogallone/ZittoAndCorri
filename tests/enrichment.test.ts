import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  enrichmentIsSubstantial,
  evaluationAfterIngest,
  type EnrichmentSnapshot,
} from "../lib/ingest/enrichment.ts";

const gpxOnly: EnrichmentSnapshot = {
  hasHr: true,
  hasGps: true,
  hasDistance: false,
  hasLaps: false,
  moving_time_s: 1_800,
  avg_hr: 150,
  max_hr: 172,
  elevation_gain_m: 40,
  rpe: null,
  notes: null,
};

test("lo stesso file reimportato o la sola cadenza non sono un cambiamento", () => {
  assert.equal(enrichmentIsSubstantial(gpxOnly, { ...gpxOnly }), false);
  // Qualche secondo di differenza sul tempo in movimento: stesso passo.
  assert.equal(enrichmentIsSubstantial(gpxOnly, { ...gpxOnly, moving_time_s: 1_790 }), false);
});

test("stream nuovi, FC mancante o passo diverso sono un cambiamento", () => {
  assert.equal(enrichmentIsSubstantial(gpxOnly, { ...gpxOnly, hasLaps: true, hasDistance: true }), true);
  assert.equal(enrichmentIsSubstantial({ ...gpxOnly, hasHr: false, avg_hr: null }, gpxOnly), true);
  assert.equal(enrichmentIsSubstantial(gpxOnly, { ...gpxOnly, moving_time_s: 1_650 }), true);
  assert.equal(enrichmentIsSubstantial({ ...gpxOnly, moving_time_s: null }, gpxOnly), true);
  // Nota o RPE arrivati con il secondo file: l'analisi li deve leggere.
  assert.equal(enrichmentIsSubstantial(gpxOnly, { ...gpxOnly, notes: "Gambe pesanti" }), true);
  assert.equal(enrichmentIsSubstantial(gpxOnly, { ...gpxOnly, rpe: 7 }), true);
  assert.equal(enrichmentIsSubstantial({ ...gpxOnly, notes: "Gambe pesanti" }, { ...gpxOnly, notes: "Gambe pesanti" }), false);
});

test("un arricchimento non rimanda la push se l'analisi c'era già", () => {
  assert.equal(evaluationAfterIngest({ created: true, substantial: true }, false), "notify");
  assert.equal(evaluationAfterIngest({ created: false, substantial: false }, true), "skip");
  assert.equal(evaluationAfterIngest({ created: false, substantial: true }, true), "silent");
  // Mai analizzata prima (es. chiave AI aggiunta dopo): è la prima analisi.
  assert.equal(evaluationAfterIngest({ created: false, substantial: false }, false), "notify");
});

test("gli import accodano l'analisi in base all'esito dell'ingest", () => {
  const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  for (const path of ["lib/intervals/import.ts", "app/api/import/route.ts", "app/api/import/file/route.ts", "app/api/import/gpx/route.ts", "app/activities/actions.ts"]) {
    const source = read(path);
    assert.match(source, /enqueueEvaluationAfterIngest\(/, path);
    assert.doesNotMatch(source, /enqueueActivityEvaluation(Safely)?\(/, path);
  }
  const evaluation = read("lib/ai/evaluate-activity.ts");
  assert.match(evaluation, /evaluationAfterIngest\(outcome, hasEvaluation\)/);
  assert.match(evaluation, /if \(notify\) \{\s*try \{\s*await sendPushToUser/);
  assert.match(read("lib/ingest/ingest.ts"), /substantial: enrichmentIsSubstantial\(before, after\)/);
});

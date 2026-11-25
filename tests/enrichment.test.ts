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

test("the same file reimported or cadence alone is not a change", () => {
  assert.equal(enrichmentIsSubstantial(gpxOnly, { ...gpxOnly }), false);
  // A few seconds' difference in moving time: same pace.
  assert.equal(enrichmentIsSubstantial(gpxOnly, { ...gpxOnly, moving_time_s: 1_790 }), false);
});

test("new streams, missing HR or a different pace are a change", () => {
  assert.equal(enrichmentIsSubstantial(gpxOnly, { ...gpxOnly, hasLaps: true, hasDistance: true }), true);
  assert.equal(enrichmentIsSubstantial({ ...gpxOnly, hasHr: false, avg_hr: null }, gpxOnly), true);
  assert.equal(enrichmentIsSubstantial(gpxOnly, { ...gpxOnly, moving_time_s: 1_650 }), true);
  assert.equal(enrichmentIsSubstantial({ ...gpxOnly, moving_time_s: null }, gpxOnly), true);
  // Note or RPE arrived with the second file: the analysis must read them.
  assert.equal(enrichmentIsSubstantial(gpxOnly, { ...gpxOnly, notes: "Gambe pesanti" }), true);
  assert.equal(enrichmentIsSubstantial(gpxOnly, { ...gpxOnly, rpe: 7 }), true);
  assert.equal(enrichmentIsSubstantial({ ...gpxOnly, notes: "Gambe pesanti" }, { ...gpxOnly, notes: "Gambe pesanti" }), false);
});

test("an enrichment does not resend the push if the analysis already existed", () => {
  assert.equal(evaluationAfterIngest({ created: true, substantial: true }, false), "notify");
  assert.equal(evaluationAfterIngest({ created: false, substantial: false }, true), "skip");
  assert.equal(evaluationAfterIngest({ created: false, substantial: true }, true), "silent");
  // Never analysed before (e.g. AI key added later): it's the first analysis.
  assert.equal(evaluationAfterIngest({ created: false, substantial: false }, false), "notify");
});

test("imports queue the analysis based on the ingest outcome", () => {
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

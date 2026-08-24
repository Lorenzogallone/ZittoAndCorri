import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { extractFitSessionMetadata } from "../lib/ingest/adapters/fit-metadata.ts";
import { AI_CONTEXT_SECTIONS, missingAiContextSections } from "../lib/ai/context-contract.ts";

test("normalizza RPE e titolo dalla sessione FIT", () => {
  assert.deepEqual(extractFitSessionMetadata({ workoutRpe: 40, sportProfileName: " Corsa facile " }), {
    rpe: 4,
    rpe_source: "fit",
    source_title: "Corsa facile",
  });
  assert.deepEqual(extractFitSessionMetadata({ workoutRpe: 0 }), {
    rpe: undefined,
    rpe_source: undefined,
    source_title: undefined,
  });
  assert.deepEqual(extractFitSessionMetadata({ perceivedExertion: 7, workoutName: " Progressivo " }), {
    rpe: 7,
    rpe_source: "fit",
    source_title: "Progressivo",
  });
});

test("il contratto del contesto AI segnala ogni sezione mancante", () => {
  assert.deepEqual(missingAiContextSections({}), [...AI_CONTEXT_SECTIONS]);
  const complete = Object.fromEntries(AI_CONTEXT_SECTIONS.map((key) => [key, null]));
  assert.deepEqual(missingAiContextSections(complete), []);
});

test("il contesto AI esplicita provenienza e dati mancanti", () => {
  const source = readFileSync(new URL("../lib/ai/context-envelope.ts", import.meta.url), "utf8");
  assert.match(source, /data_origin/);
  assert.match(source, /rpe_estimates_used/);
  assert.match(source, /missing_data/);
  assert.match(source, /Contesto AI non disponibile/);
});

test("la proposta non scrive il piano prima della conferma", () => {
  const source = readFileSync(new URL("../app/coach/actions.ts", import.meta.url), "utf8");
  const sendTurn = source.slice(source.indexOf("async function runCoachTurn"), source.indexOf("export async function applyPlanProposal"));
  assert.doesNotMatch(sendTurn, /from\("planned_workouts"\)\.insert/);
  assert.match(source, /rpc\("apply_plan_proposal"/);
});

test("l'import salva l'attività prima di accodare il feedback", () => {
  const source = readFileSync(new URL("../app/api/import/file/route.ts", import.meta.url), "utf8");
  assert.ok(source.indexOf("await ingestActivity") < source.indexOf("await enqueueActivityEvaluationSafely"));
});

test("le nuove tabelle coach sono protette da RLS per user_id", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0008_multiuser_coach.sql", import.meta.url), "utf8");
  for (const table of ["coach_messages", "coach_memories", "coach_state", "plan_proposals"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.ok((sql.match(/auth\.uid\(\) = user_id/g) ?? []).length >= 6);
});

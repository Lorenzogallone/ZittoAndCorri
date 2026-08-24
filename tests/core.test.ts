import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { extractFitSessionMetadata } from "../lib/ingest/adapters/fit-metadata.ts";
import { AI_CONTEXT_SECTIONS, missingAiContextSections } from "../lib/ai/context-contract.ts";
import { isFootDistanceSport } from "../lib/types.ts";

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

test("gli import di corsa usano un tipo neutro, non easy", () => {
  const gpx = readFileSync(new URL("../lib/ingest/adapters/gpx.ts", import.meta.url), "utf8");
  const fit = readFileSync(new URL("../lib/ingest/adapters/fit.ts", import.meta.url), "utf8");
  assert.match(gpx, /type: "unclassified"/);
  assert.match(fit, /sport === "running" \? "unclassified" : "cross"/);
});

test("piano e attività non hanno più un'associazione esplicita", () => {
  const migration = readFileSync(new URL("../supabase/migrations/0010_decouple_plan_and_activities.sql", import.meta.url), "utf8");
  const activityForm = readFileSync(new URL("../app/activities/new/activity-form.tsx", import.meta.url), "utf8");
  const actions = readFileSync(new URL("../app/activities/actions.ts", import.meta.url), "utf8");
  assert.match(migration, /drop column if exists activity_id/);
  assert.doesNotMatch(activityForm, /planned_workout_id/);
  assert.doesNotMatch(actions, /planned_workout_id/);
});

test("il coach deduce piano vs svolto dai dati senza forzare un match", () => {
  const prompt = readFileSync(new URL("../lib/ai/prompt.ts", import.meta.url), "utf8");
  const evaluation = readFileSync(new URL("../lib/ai/evaluate-activity.ts", import.meta.url), "utf8");
  assert.match(prompt, /NON hanno un collegamento esplicito/);
  assert.match(prompt, /Non forzare un abbinamento/);
  assert.match(evaluation, /isoDateShift\(activityDay, -3\)/);
  assert.match(evaluation, /isoDateShift\(activityDay, 3\)/);
});

test("la home mostra la chat senza i feedback automatici delle attività", () => {
  const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(home, /\.in\("kind", \["chat", "plan_proposal"\]\)/);
});

test("le sezioni del dettaglio attività sono aperte e richiudibili", () => {
  const section = readFileSync(new URL("../components/collapsible-section.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/activities/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(section, /<details[\s\S]*open/);
  assert.match(section, /ChevronDown/);
  for (const title of ["Dati attività", "Percorso GPS", "Frequenza cardiaca", "Passo per km", "Profilo altimetrico", "Zone HR"]) {
    assert.match(page, new RegExp(`title="${title}"`));
  }
});

test("le note del coach diventano dettagli strutturati senza chip diagnostici", () => {
  const prompt = readFileSync(new URL("../lib/ai/prompt.ts", import.meta.url), "utf8");
  const evaluation = readFileSync(new URL("../components/activity-evaluation.tsx", import.meta.url), "utf8");
  const activityPage = readFileSync(new URL("../app/activities/[id]/page.tsx", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../supabase/migrations/0011_evaluation_details.sql", import.meta.url), "utf8");
  assert.match(prompt, /Trasforma le note libere.*campo details/);
  assert.match(activityPage, /evaluation\?\.details/);
  assert.doesNotMatch(evaluation, /Dettagli aggiuntivi/);
  assert.doesNotMatch(evaluation, /Sovraccarico|Easy troppo veloce|FLAG_META/);
  assert.match(migration, /add column if not exists details jsonb/);
});

test("durante la rivalutazione spariscono subito review e form", () => {
  const evaluation = readFileSync(new URL("../components/activity-evaluation.tsx", import.meta.url), "utf8");
  assert.match(evaluation, /evaluation\?\.summary && !isAnalyzing/);
  assert.match(evaluation, /!isAnalyzing && \(/);
  assert.match(evaluation, /form\.reset\(\)/);
});

test("l'errore quota interrompe il caricamento e resta leggibile", () => {
  const evaluation = readFileSync(new URL("../components/activity-evaluation.tsx", import.meta.url), "utf8");
  const gemini = readFileSync(new URL("../lib/ai/gemini.ts", import.meta.url), "utf8");
  assert.match(evaluation, /initialAnalyzing && !displayedError/);
  assert.match(evaluation, /initialError/);
  assert.match(gemini, /Quota del modello Gemini esaurita\. Scegli un altro modello nelle impostazioni oppure attendi il ripristino\./);
  assert.match(gemini, /if \(isQuotaExhausted\(err\)\) throw err/);
  assert.doesNotMatch(gemini, /Quota Gemini[^\n]*più/);
});

test("il modello Gemini scelto viene persistito e usato da tutti i flussi AI", () => {
  const models = readFileSync(new URL("../lib/ai/models.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../supabase/migrations/0012_gemini_model_preference.sql", import.meta.url), "utf8");
  const credentials = readFileSync(new URL("../lib/ai/credentials.ts", import.meta.url), "utf8");
  const coach = readFileSync(new URL("../app/coach/actions.ts", import.meta.url), "utf8");
  const evaluation = readFileSync(new URL("../lib/ai/evaluate-activity.ts", import.meta.url), "utf8");
  assert.match(models, /DEFAULT_GEMINI_MODEL[^\n]*"gemini-3\.5-flash-lite"/);
  assert.match(migration, /add column if not exists model text not null default 'gemini-3\.5-flash-lite'/);
  assert.match(credentials, /update\(\{ model, updated_at:/);
  assert.match(coach, /\{ apiKey, model \}/);
  assert.match(evaluation, /model,/);
});

test("il tasto Profilo apre sempre la pagina profilo", () => {
  const tabs = readFileSync(new URL("../components/tab-bar.tsx", import.meta.url), "utf8");
  const settings = readFileSync(new URL("../app/settings/page.tsx", import.meta.url), "utf8");
  const backButton = readFileSync(new URL("../components/back-button.tsx", import.meta.url), "utf8");
  assert.match(tabs, /href: "\/profile", label: "Profilo"/);
  assert.match(settings, /backHref="\/profile"/);
  assert.match(backButton, /<Link href=\{fallbackHref\}/);
  assert.doesNotMatch(backButton, /window\.history\.length/);
});

test("i riepiloghi includono corsa, camminata ed escursione", () => {
  assert.equal(isFootDistanceSport("running"), true);
  assert.equal(isFootDistanceSport("walking"), true);
  assert.equal(isFootDistanceSport("hiking"), true);
  assert.equal(isFootDistanceSport("cycling"), false);
  assert.equal(isFootDistanceSport("beach_volley"), false);

  const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const activities = readFileSync(new URL("../app/activities/page.tsx", import.meta.url), "utf8");
  assert.match(home, /isFootDistanceSport\(item\.sport\)/);
  assert.match(activities, /isFootDistanceSport\(a\.sport\)/);
  assert.match(activities, />Attività<\/p>/);
});

test("Beach volley è disponibile e riconosciuto dai file FIT", () => {
  const types = readFileSync(new URL("../lib/types.ts", import.meta.url), "utf8");
  const metadata = readFileSync(new URL("../lib/activity-meta.ts", import.meta.url), "utf8");
  const fit = readFileSync(new URL("../lib/ingest/adapters/fit.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../supabase/migrations/0013_beach_volley.sql", import.meta.url), "utf8");
  assert.match(types, /"beach_volley"/);
  assert.match(metadata, /beach_volley: "Beach volley"/);
  assert.match(fit, /case "volleyball":\s+return "beach_volley"/);
  assert.match(migration, /'beach_volley'/);
});

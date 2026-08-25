import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { extractFitSessionMetadata } from "../lib/ingest/adapters/fit-metadata.ts";
import { AI_CONTEXT_SECTIONS, missingAiContextSections } from "../lib/ai/context-contract.ts";
import { isFootDistanceSport } from "../lib/types.ts";
import { computeATLCTL, sessionLoad } from "../lib/metrics/load.ts";

test("il carico interno privilegia HR, poi RPE e infine la stima per sport", () => {
  assert.deepEqual(
    sessionLoad({
      duration_s: 3600,
      rpe: 10,
      time_in_zone: { z1: 1800, z3: 1800 },
      sport: "running",
    }),
    { load: 120, source: "heart_rate" },
  );
  assert.deepEqual(
    sessionLoad({ duration_s: 3600, rpe: 5, sport: "running" }),
    { load: 150, source: "rpe" },
  );
  assert.deepEqual(
    sessionLoad({ duration_s: 3600, rpe: null, sport: "walking" }),
    { load: 60, source: "estimated" },
  );
});

test("lo storico breve resta neutro invece di dichiarare fatica estrema", () => {
  const result = computeATLCTL([
    { started_at: "2026-08-24T08:00:00+02:00", duration_s: 3600, rpe: 5, sport: "running" },
  ], "2026-08-24");
  assert.equal(result.load7, 150);
  assert.equal(result.atl, 21.4);
  assert.equal(result.ctl, 21.4);
  assert.equal(result.tsb, 0);
  assert.equal(result.status, "calibrating");
  assert.equal(result.confidence, "low");
});

test("il carico 7gg viene confrontato con una baseline personale", () => {
  const asOf = "2026-08-24";
  const dateAtOffset = (days: number) =>
    new Date(new Date(`${asOf}T12:00:00Z`).getTime() + days * 86_400_000)
      .toISOString()
      .slice(0, 10) + "T08:00:00+02:00";
  const previousWeeks = [-42, -35, -28, -21, -14, -7].map((days) => ({
    started_at: dateAtOffset(days),
    duration_s: 3000,
    rpe: 4,
    sport: "running" as const,
  }));
  const historyStart = {
    started_at: dateAtOffset(-48),
    duration_s: 0,
    rpe: null,
    sport: "walking" as const,
  };
  const balanced = computeATLCTL([
    historyStart,
    ...previousWeeks,
    { started_at: dateAtOffset(0), duration_s: 3000, rpe: 4, sport: "running" },
  ], asOf);
  assert.equal(balanced.load7, 100);
  assert.equal(balanced.baseline7, 100);
  assert.equal(balanced.load_ratio, 1);
  assert.equal(balanced.status, "balanced");

  const fatigued = computeATLCTL([
    historyStart,
    ...previousWeeks,
    { started_at: dateAtOffset(0), duration_s: 6000, rpe: 4, sport: "running" },
  ], asOf);
  assert.equal(fatigued.load7, 200);
  assert.equal(fatigued.load_ratio, 2);
  assert.equal(fatigued.status, "fatigued");
});

test("le attività vicino a mezzanotte usano la data Europe/Rome", () => {
  const result = computeATLCTL([
    { started_at: "2026-08-23T22:30:00Z", duration_s: 1800, rpe: 4, sport: "running" },
  ], "2026-08-24");
  assert.equal(result.series[0]?.date, "2026-08-24");
});

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
  const applyTurn = source.slice(source.indexOf("export async function applyPlanProposal"), source.indexOf("export async function rejectPlanProposal"));
  assert.doesNotMatch(sendTurn, /from\("planned_workouts"\)\.insert/);
  assert.match(source, /rpc\("apply_plan_proposal"/);
  assert.doesNotMatch(applyTurn, /revalidatePath|router\.refresh|location\.reload/);
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

test("le risposte del coach supportano Markdown senza renderizzare HTML arbitrario", () => {
  const chat = readFileSync(new URL("../components/coach-chat.tsx", import.meta.url), "utf8");
  const markdown = readFileSync(new URL("../components/markdown-message.tsx", import.meta.url), "utf8");
  assert.match(chat, /item\.role === "assistant"[\s\S]*<MarkdownMessage>/);
  assert.match(markdown, /react-markdown/);
  assert.match(markdown, /remark-gfm/);
  assert.doesNotMatch(markdown, /dangerouslySetInnerHTML|rehypeRaw/);
});

test("il piano usa la chat e ogni proposta spiega obiettivo e focus", () => {
  const plan = readFileSync(new URL("../app/plan/page.tsx", import.meta.url), "utf8");
  const prompt = readFileSync(new URL("../lib/ai/prompt.ts", import.meta.url), "utf8");
  const chat = readFileSync(new URL("../components/coach-chat.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(plan, /plan_reviews|Review del coach|Chiedi al coach di adattare il piano/);
  assert.match(prompt, /Per ogni workout proposto compila sempre description e focus/);
  assert.match(chat, /Obiettivo della seduta/);
  assert.match(chat, /Su cosa concentrarti/);
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
  assert.match(evaluation, /displayedEvaluation\?\.summary && !isAnalyzing/);
  assert.match(evaluation, /!isAnalyzing && \(/);
  assert.match(evaluation, /form\.reset\(\)/);
});

test("la valutazione AI aggiorna la sezione senza ricaricare la pagina", () => {
  const action = readFileSync(new URL("../app/activities/ai-actions.ts", import.meta.url), "utf8");
  const component = readFileSync(new URL("../components/activity-evaluation.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(action, /revalidatePath|router\.refresh|location\.reload/);
  assert.match(component, /onDone: showEvaluationResult/);
  assert.match(component, /setDisplayedEvaluation\(status\.evaluationResult\)/);
});

test("l'errore quota interrompe il caricamento e resta leggibile", () => {
  const evaluation = readFileSync(new URL("../components/activity-evaluation.tsx", import.meta.url), "utf8");
  const gemini = readFileSync(new URL("../lib/ai/gemini.ts", import.meta.url), "utf8");
  assert.match(evaluation, /initialAnalyzing && !done && !displayedError/);
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

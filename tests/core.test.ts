import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { extractFitSessionMetadata } from "../lib/ingest/adapters/fit-metadata.ts";
import { AI_CONTEXT_SECTIONS, missingAiContextSections } from "../lib/ai/context-contract.ts";
import { isFootDistanceSport } from "../lib/types.ts";
import { computeATLCTL, sessionLoad } from "../lib/metrics/load.ts";
import { generalGoalName, goalKind } from "../lib/goals.ts";
import { COACH_METHODOLOGY } from "../lib/ai/methodology.ts";
import { describeStep, groupWorkoutSteps, workoutHeadline } from "../lib/workout-guide.ts";
import { itLabels } from "../lib/italian-translator.ts";
import { parseDecimal, parseDuration as parseFormDuration } from "../lib/format.ts";

test("internal load favours HR, then RPE and finally the per-sport estimate", () => {
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

test("short history stays neutral instead of declaring extreme fatigue", () => {
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

test("the 7-day load is compared with a personal baseline", () => {
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

test("an anomalous week in the baseline doesn't make a normal load look tiring", () => {
  // Real loads from 23/9 to 10/11/2026: return to running (69) and the sore-throat
  // week (112) in the 6 weeks before. With the mean the baseline dropped to 344
  // and the ratio to 1.40; with the median of the last 4 weeks it is 1.16.
  const asOf = "2026-11-10";
  const runs: Array<[string, number]> = [
    ["2026-09-24", 69], ["2026-09-30", 182], ["2026-10-02", 48], ["2026-10-03", 230],
    ["2026-10-05", 133], ["2026-10-12", 112], ["2026-10-16", 79], ["2026-10-18", 295],
    ["2026-10-20", 83], ["2026-10-22", 140], ["2026-10-25", 275], ["2026-10-28", 129],
    ["2026-11-01", 287], ["2026-11-04", 117], ["2026-11-05", 59], ["2026-11-08", 304],
  ];
  const result = computeATLCTL(
    runs.map(([date, load]) => ({
      started_at: `${date}T08:00:00+01:00`,
      duration_s: load * 30,
      rpe: 4,
      sport: "running" as const,
    })),
    asOf,
  );
  assert.equal(result.load7, 480);
  assert.equal(result.baseline7, 416);
  assert.equal(result.load_ratio, 1.16);
  assert.equal(result.status, "balanced");
});

test("activities near midnight use the Europe/Rome date", () => {
  const result = computeATLCTL([
    { started_at: "2026-08-23T22:30:00Z", duration_s: 1800, rpe: 4, sport: "running" },
  ], "2026-08-24");
  assert.equal(result.series[0]?.date, "2026-08-24");
});

test("normalises RPE and title from the FIT session", () => {
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

test("the AI context contract flags every missing section", () => {
  assert.deepEqual(missingAiContextSections({}), [...AI_CONTEXT_SECTIONS]);
  const complete = Object.fromEntries(AI_CONTEXT_SECTIONS.map((key) => [key, null]));
  assert.deepEqual(missingAiContextSections(complete), []);
});

test("the AI context spells out provenance and missing data", () => {
  const source = readFileSync(new URL("../lib/ai/context-envelope.ts", import.meta.url), "utf8");
  assert.match(source, /data_origin/);
  assert.match(source, /rpe_estimates_used/);
  assert.match(source, /missing_data/);
  assert.match(source, /Contesto AI non disponibile/);
});

test("the proposal does not write the plan before confirmation", () => {
  const source = readFileSync(new URL("../app/coach/actions.ts", import.meta.url), "utf8");
  const sendTurn = source.slice(source.indexOf("async function runCoachTurn"), source.indexOf("export async function applyPlanProposal"));
  const applyTurn = source.slice(source.indexOf("export async function applyPlanProposal"), source.indexOf("export async function rejectPlanProposal"));
  assert.doesNotMatch(sendTurn, /from\("planned_workouts"\)\.(insert|delete|update)/);
  // Only the day-by-day function: the old one wiped the whole window.
  assert.match(applyTurn, /rpc\("apply_plan_proposal_v2"/);
  assert.doesNotMatch(applyTurn, /rpc\("apply_plan_proposal"/);
  assert.doesNotMatch(applyTurn, /router\.refresh|location\.reload/);
});

test("the import saves the activity before queuing the feedback", () => {
  const source = readFileSync(new URL("../app/api/import/file/route.ts", import.meta.url), "utf8");
  assert.ok(source.indexOf("await ingestActivity") < source.indexOf("await enqueueEvaluationAfterIngest"));
});

test("the new coach tables are protected by RLS on user_id", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0008_multiuser_coach.sql", import.meta.url), "utf8");
  for (const table of ["coach_messages", "coach_memories", "coach_state", "plan_proposals"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.ok((sql.match(/auth\.uid\(\) = user_id/g) ?? []).length >= 6);
});

test("run imports use a neutral type, not easy", () => {
  const gpx = readFileSync(new URL("../lib/ingest/adapters/gpx.ts", import.meta.url), "utf8");
  const fit = readFileSync(new URL("../lib/ingest/adapters/fit.ts", import.meta.url), "utf8");
  assert.match(gpx, /type: "unclassified"/);
  assert.match(fit, /sport === "running" \? "unclassified" : "cross"/);
});

test("plan and activities no longer have an explicit association", () => {
  const migration = readFileSync(new URL("../supabase/migrations/0010_decouple_plan_and_activities.sql", import.meta.url), "utf8");
  const activityForm = readFileSync(new URL("../app/activities/new/activity-form.tsx", import.meta.url), "utf8");
  const actions = readFileSync(new URL("../app/activities/actions.ts", import.meta.url), "utf8");
  assert.match(migration, /drop column if exists activity_id/);
  assert.doesNotMatch(activityForm, /planned_workout_id/);
  assert.doesNotMatch(actions, /planned_workout_id/);
});

test("the coach infers plan vs done from the data without forcing a match", () => {
  const prompt = readFileSync(new URL("../lib/ai/prompt.ts", import.meta.url), "utf8");
  const evaluation = readFileSync(new URL("../lib/ai/evaluate-activity.ts", import.meta.url), "utf8");
  assert.match(prompt, /NON hanno un collegamento esplicito/);
  assert.match(prompt, /Non forzare un abbinamento/);
  assert.match(evaluation, /isoDateShift\(activityDay, -3\)/);
  assert.match(evaluation, /isoDateShift\(activityDay, 3\)/);
});

test("the home shows the chat without the automatic activity feedback", () => {
  const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  // "status" carries the "Nuova chat" markers; activity feedback stays out.
  assert.match(home, /\.in\("kind", \["chat", "plan_proposal", "status"\]\)/);
  assert.doesNotMatch(home, /activity_feedback/);
});

test("coach replies support Markdown without rendering arbitrary HTML", () => {
  const chat = readFileSync(new URL("../components/coach-chat.tsx", import.meta.url), "utf8");
  const markdown = readFileSync(new URL("../components/markdown-message.tsx", import.meta.url), "utf8");
  assert.match(chat, /item\.role === "assistant"[\s\S]*<MarkdownMessage>/);
  assert.match(markdown, /react-markdown/);
  assert.match(markdown, /remark-gfm/);
  assert.doesNotMatch(markdown, /dangerouslySetInnerHTML|rehypeRaw/);
});

test("the plan uses the chat and every proposal explains goal and focus", () => {
  const plan = readFileSync(new URL("../app/plan/page.tsx", import.meta.url), "utf8");
  const prompt = readFileSync(new URL("../lib/ai/prompt.ts", import.meta.url), "utf8");
  const chat = readFileSync(new URL("../components/coach-chat.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(plan, /plan_reviews|Review del coach|Chiedi al coach di adattare il piano/);
  assert.match(prompt, /Per ogni workout proposto compila sempre description e focus/);
  // The Italian texts live in the messages, the chat reads them from there.
  const messages = readFileSync(new URL("../messages/it/coach.json", import.meta.url), "utf8");
  assert.match(messages, /Cosa fare e perché/);
  assert.match(messages, /Su cosa concentrarti/);
  assert.match(chat, /whatAndWhy/);
  assert.match(chat, /focusOn/);
  assert.match(chat, /<WorkoutSteps/);
});

test("the activity detail is essential: one Andamento chart, km in a table and a light map by default", () => {
  const view = readFileSync(new URL("../app/activities/[id]/activity-view.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../components/activity/route-preview.tsx", import.meta.url), "utf8");
  // The «Andamento» title lives in the messages (activities.detail.progress).
  const messages = readFileSync(new URL("../messages/it/activities.json", import.meta.url), "utf8");
  assert.match(messages, /"progress": "Andamento"/);
  assert.match(view, /<h2[^>]*>\{t\("detail\.progress"\)\}<\/h2>/);
  // Km no longer have a separate chart: they live in the «Km per km» table.
  assert.doesNotMatch(view, /SplitsChart/);
  assert.match(view, /<KmSplitsCard analysis=\{props\.km\} \/>/);
  // Heart rate, pace, elevation and cadence overlaid on the same chart.
  assert.match(view, /<OverlayChart series=\{overlay\}/);
  assert.match(view, /<ZonesBar/);
  // The WebGL map is there by default but with precautions: on standalone iOS a heavy map
  // reloads the PWA. It loads separately, only near the screen, with
  // reduced memory, and falls back to the static preview if WebGL gives up.
  const map = readFileSync(new URL("../components/activity-map-client.tsx", import.meta.url), "utf8");
  assert.match(route, /dynamic\(\(\) => import\("@\/components\/activity-map-client"\)/);
  assert.match(route, /IntersectionObserver/);
  assert.match(route, /near && !failed && <ActivityMapClient/);
  assert.match(map, /maxTileCacheSize: \d+/);
  assert.match(map, /webglcontextlost/);
  assert.match(map, /cooperativeGestures: embedded/);
});

test("coach notes become structured details without diagnostic chips", () => {
  const prompt = readFileSync(new URL("../lib/ai/prompt.ts", import.meta.url), "utf8");
  const evaluation = readFileSync(new URL("../components/activity-evaluation.tsx", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../supabase/migrations/0011_evaluation_details.sql", import.meta.url), "utf8");
  assert.match(prompt, /Trasforma le note libere.*campo details/);
  assert.match(evaluation, /displayedEvaluation\?\.details/);
  assert.doesNotMatch(evaluation, /Dettagli aggiuntivi/);
  assert.doesNotMatch(evaluation, /Sovraccarico|Easy troppo veloce|FLAG_META/);
  assert.match(migration, /add column if not exists details jsonb/);
});

test("during re-evaluation review and form disappear at once", () => {
  const evaluation = readFileSync(new URL("../components/activity-evaluation.tsx", import.meta.url), "utf8");
  assert.match(evaluation, /displayedEvaluation\?\.summary && !isAnalyzing/);
  assert.match(evaluation, /!isAnalyzing && \(/);
  assert.match(evaluation, /form\.reset\(\)/);
});

test("the AI evaluation updates the section without reloading the page", () => {
  const action = readFileSync(new URL("../app/activities/ai-actions.ts", import.meta.url), "utf8");
  const component = readFileSync(new URL("../components/activity-evaluation.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(action, /revalidatePath|router\.refresh|location\.reload/);
  assert.match(component, /onDone: showEvaluationResult/);
  assert.match(component, /setDisplayedEvaluation\(status\.evaluationResult\)/);
});

test("the quota error stops loading and stays readable", () => {
  const evaluation = readFileSync(new URL("../components/activity-evaluation.tsx", import.meta.url), "utf8");
  const gemini = readFileSync(new URL("../lib/ai/gemini.ts", import.meta.url), "utf8");
  const status = readFileSync(new URL("../messages/it/status.json", import.meta.url), "utf8");
  assert.match(evaluation, /initialAnalyzing && !done && !displayedError/);
  assert.match(evaluation, /initialError/);
  assert.match(gemini, /geminiQuota/);
  assert.match(status, /Quota del modello Gemini esaurita\. Scegli un altro modello nelle impostazioni oppure attendi il ripristino\./);
  assert.match(gemini, /if \(isQuotaExhausted\(err\)\) throw err/);
  assert.doesNotMatch(gemini, /Quota Gemini[^\n]*più/);
});

test("chat and analysis use their own task's provider and model, and every call records the cost", () => {
  const models = readFileSync(new URL("../lib/ai/models.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../supabase/migrations/0024_ai_routing_and_costs.sql", import.meta.url), "utf8");
  const credentials = readFileSync(new URL("../lib/ai/credentials.ts", import.meta.url), "utf8");
  const llm = readFileSync(new URL("../lib/ai/llm.ts", import.meta.url), "utf8");
  const coach = readFileSync(new URL("../app/coach/actions.ts", import.meta.url), "utf8");
  const evaluation = readFileSync(new URL("../lib/ai/evaluate-activity.ts", import.meta.url), "utf8");
  const recap = readFileSync(new URL("../lib/push/weekly-recap.ts", import.meta.url), "utf8");
  assert.match(models, /DEFAULT_GEMINI_MODEL[^\n]*"gemini-3\.5-flash-lite"/);
  assert.match(migration, /add column if not exists ai_routing jsonb/);
  assert.match(migration, /create table if not exists public\.ai_usage_events/);
  assert.match(credentials, /export async function getAiConfig\(userId: string, task: AiTask\)/);
  assert.match(llm, /from\("ai_usage_events"\)\.insert/);
  // Chat and analysis go through the task's provider, not through Gemini directly.
  assert.match(coach, /getAiConfig\(user\.id, "chat"\)/);
  assert.match(evaluation, /getAiConfig\(userId, "analysis"\)/);
  assert.match(recap, /getAiConfig\(userId, "analysis"\)/);
  for (const source of [coach, evaluation]) {
    assert.match(source, /generateAi<\w+>\(/);
    assert.doesNotMatch(source, /from "@\/lib\/ai\/gemini"/);
  }
  assert.match(evaluation, /model: ai\.model/);
  // The cost stays on the chat message, next to the question it answers.
  assert.match(coach, /metadata: \{ ai_usage: usage, reply_to: sourceMessageId \}/);
  assert.match(evaluation, /ai_usage: usage/);
});

test("the Profile button always opens the profile page", () => {
  const tabs = readFileSync(new URL("../components/tab-bar.tsx", import.meta.url), "utf8");
  const settings = readFileSync(new URL("../app/settings/settings-view.tsx", import.meta.url), "utf8");
  const backButton = readFileSync(new URL("../components/back-button.tsx", import.meta.url), "utf8");
  const shell = readFileSync(new URL("../messages/it/shell.json", import.meta.url), "utf8");
  assert.match(tabs, /href: "\/profile", labelKey: "profile"/);
  assert.match(shell, /"profile": "Profilo"/);
  assert.match(settings, /backHref="\/profile"/);
  assert.match(backButton, /<Link href=\{fallbackHref\}/);
  assert.doesNotMatch(backButton, /window\.history\.length/);
});

test("summaries include running, walking and hiking", () => {
  assert.equal(isFootDistanceSport("running"), true);
  assert.equal(isFootDistanceSport("walking"), true);
  assert.equal(isFootDistanceSport("hiking"), true);
  assert.equal(isFootDistanceSport("cycling"), false);
  assert.equal(isFootDistanceSport("beach_volley"), false);

  // Home and totals count running km; walks and hikes stay
  // visible as a separate figure in the activity page summary.
  const activities = readFileSync(new URL("../app/activities/page.tsx", import.meta.url), "utf8");
  const totals = readFileSync(new URL("../lib/metrics/totals.ts", import.meta.url), "utf8");
  assert.match(activities, /<TotalsCard periods=\{totals\}[^>]*\/>/);
  assert.match(totals, /activity\.sport === "walking" \|\| activity\.sport === "hiking"/);
});

test("Beach volley is available and recognised by FIT files", () => {
  const types = readFileSync(new URL("../lib/types.ts", import.meta.url), "utf8");
  const metadata = readFileSync(new URL("../lib/activity-meta.ts", import.meta.url), "utf8");
  const fit = readFileSync(new URL("../lib/ingest/adapters/fit.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../supabase/migrations/0013_beach_volley.sql", import.meta.url), "utf8");
  assert.match(types, /"beach_volley"/);
  assert.match(metadata, /beach_volley: "Beach volley"/);
  assert.match(fit, /case "volleyball":\s+return "beach_volley"/);
  assert.match(migration, /'beach_volley'/);
});

test("a goal without a date is generic and takes a name from the distance", () => {
  assert.equal(goalKind({ race_date: null }), "general");
  assert.equal(goalKind({ race_date: "2026-10-18" }), "race");
  assert.equal(generalGoalName(21097), "Migliorare nella mezza maratona");
  assert.equal(generalGoalName(42195), "Migliorare nella maratona");
  assert.equal(generalGoalName(10000), "Migliorare sui 10 km");
});

test("plan prompts include the methodology and don't require a race", () => {
  const source = readFileSync(new URL("../lib/ai/prompt.ts", import.meta.url), "utf8");
  assert.equal(source.match(/COACH_METHODOLOGY,/g)?.length, 2);
  assert.match(source, /Una gara obiettivo NON è necessaria/);
  assert.match(COACH_METHODOLOGY, /Una gara NON è necessaria/);
  assert.match(COACH_METHODOLOGY, /Easy significa DAVVERO easy/);
  assert.match(COACH_METHODOLOGY, /Niente sessioni di forza o palestra di default/);
});

test("the coach can change the goal from the chat", () => {
  const prompt = readFileSync(new URL("../lib/ai/prompt.ts", import.meta.url), "utf8");
  assert.match(prompt, /goal_update/);
  const actions = readFileSync(new URL("../app/coach/actions.ts", import.meta.url), "utf8");
  assert.match(actions, /applyGoalUpdate\(admin, userId, result\.goal_update/);
});

test("repeats are grouped and described in words", () => {
  const base = { pace_min_s_km: null, pace_max_s_km: null, hr_min_bpm: null, hr_max_bpm: null };
  const warmup = { ...base, kind: "warmup" as const, label: "Corsa lenta", completion_type: "time" as const, completion_value: 600 };
  const work = { ...base, kind: "work" as const, label: "Veloce", completion_type: "distance" as const, completion_value: 400, pace_min_s_km: 260, pace_max_s_km: 270 };
  const recovery = { ...base, kind: "recovery" as const, label: "Recupero camminando", completion_type: "time" as const, completion_value: 90 };
  const cooldown = { ...warmup, kind: "cooldown" as const };
  const steps = [warmup, work, recovery, work, recovery, work, recovery, work, recovery, work, recovery, work, cooldown];
  const blocks = groupWorkoutSteps(steps);
  assert.equal(blocks.length, 3);
  assert.deepEqual(blocks[1], { kind: "repeat", times: 6, steps: [work, recovery] });
  assert.equal(workoutHeadline(steps), "6 × 400 m");
  assert.equal(describeStep(itLabels, work), "400 m a 4:20–4:30/km");
  assert.equal(describeStep(itLabels, recovery), '90"');
});

test("the PWA splash is not reinserted by server actions", () => {
  // In the server layout every server action/refresh sends back a new
  // dangerouslySetInnerHTML object: React 19 rewrites innerHTML and the splash
  // comes back over the app with an endless loading bar.
  const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(layout, /pwa-splash-root/);
  const splash = readFileSync(new URL("../components/pwa-splash.tsx", import.meta.url), "utf8");
  assert.match(splash, /^"use client";/);
  // The HTML depends on the language: the object stays stable with useMemo, so
  // React doesn't rewrite innerHTML on every render.
  assert.match(splash, /const markup = useMemo\(/);
  assert.match(splash, /dangerouslySetInnerHTML=\{markup\}/);
});

test("form numbers accept the comma from the Italian iOS decimal keypad", () => {
  assert.equal(parseDecimal("10,5"), 10.5);
  assert.equal(parseDecimal(" 21.0975 "), 21.0975);
  assert.ok(Number.isNaN(parseDecimal("dieci")));
  assert.equal(parseFormDuration("5:30"), 330);
  assert.equal(parseFormDuration("5,30"), 330);
  assert.equal(parseFormDuration("1.45.00"), 6300);
  assert.equal(parseFormDuration("5:75"), null);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  effectiveAiJob,
  isStaleAiJob,
  STALE_AI_JOB_ERROR,
  STALE_AI_JOB_MS,
  staleAiJobCutoff,
} from "../lib/ai/job-staleness.ts";

const now = Date.parse("2026-11-22T10:00:00Z");
const ago = (ms: number) => new Date(now - ms).toISOString();

test("la soglia supera il tempo massimo della funzione e del polling", () => {
  // maxDuration più lungo: 300 s; MAX_POLL_MS in use-ai-job: 330 s.
  assert.ok(STALE_AI_JOB_MS > 330_000);
  assert.ok(STALE_AI_JOB_MS <= 10 * 60_000);
});

test("un job pendente oltre la soglia è scaduto, uno recente no", () => {
  assert.equal(isStaleAiJob({ status: "pending", created_at: ago(STALE_AI_JOB_MS + 1_000) }, now), true);
  assert.equal(isStaleAiJob({ status: "pending", created_at: ago(60_000) }, now), false);
  assert.equal(isStaleAiJob({ status: "done", created_at: ago(STALE_AI_JOB_MS * 10) }, now), false);
  assert.equal(isStaleAiJob({ status: "pending", created_at: null }, now), false);
  assert.equal(staleAiJobCutoff(now), ago(STALE_AI_JOB_MS));
});

test("un job pendente scaduto si mostra come errore da riprovare", () => {
  const stale = effectiveAiJob({ status: "pending", error: null, created_at: ago(STALE_AI_JOB_MS * 2) }, now);
  assert.equal(stale.status, "error");
  assert.equal(stale.error, STALE_AI_JOB_ERROR);
  const fresh = effectiveAiJob({ status: "pending", error: null, created_at: ago(10_000) }, now);
  assert.equal(fresh.status, "pending");
});

test("rianalisi, polling e pagine ignorano i job pendenti scaduti", () => {
  const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const enqueue = read("lib/ai/evaluate-activity.ts");
  assert.match(enqueue, /isStaleAiJob\(job\)/);
  assert.match(enqueue, /STALE_AI_JOB_ERROR/);
  assert.match(read("app/actions/ai-jobs.ts"), /isStaleAiJob\(data\)/);
  assert.match(read("app/activities/[id]/page.tsx"), /effectiveAiJob\(evaluationJob\)/);
  assert.match(read("app/activities/page.tsx"), /staleAiJobCutoff\(\)/);
  assert.match(read("components/activity-evaluation.tsx"), /STALE_AI_JOB_MS/);
});

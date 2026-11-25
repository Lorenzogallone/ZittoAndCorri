// AI jobs left "pending" forever (function timed out, half-finished deploy).
// Pure functions, used by server actions, pages and client components.

import type { Translator } from "../../i18n/config.ts";

/**
 * Past this time since creation a job still "pending" is stale: the
 * function running it has already been stopped (longest maxDuration: 300 s)
 * and the client stopped polling it (MAX_POLL_MS: 330 s in use-ai-job).
 */
export const STALE_AI_JOB_MS = 6 * 60_000;

/** Text written to the database (ai_jobs.error): stays Italian. For the UI go through localizeAiJobError. */
export const STALE_AI_JOB_ERROR = "Analisi interrotta. Riprova.";

/**
 * Job error to show to the user: the "analysis interrupted" one,
 * written in Italian in the database, is translated; the others stay as they are.
 * `t` is bound to the "status" namespace.
 */
export function localizeAiJobError<T extends string | null | undefined>(error: T, t: Translator): T | string {
  return error === STALE_AI_JOB_ERROR ? t("aiJob.stale") : error;
}

export interface AiJobLike {
  status: string;
  error?: string | null;
  created_at?: string | null;
}

/** A pending job created more than STALE_AI_JOB_MS ago. Without a date it is not stale. */
export function isStaleAiJob(job: AiJobLike | null | undefined, now: number = Date.now()): boolean {
  if (!job || job.status !== "pending" || !job.created_at) return false;
  const created = Date.parse(job.created_at);
  return Number.isFinite(created) && now - created > STALE_AI_JOB_MS;
}

/** Earliest creation date of a pending job that is still valid. */
export function staleAiJobCutoff(now: number = Date.now()): string {
  return new Date(now - STALE_AI_JOB_MS).toISOString();
}

/** State to show: a stale pending job counts as an error to retry. */
export function effectiveAiJob<T extends AiJobLike>(job: T, now: number = Date.now()): T {
  return isStaleAiJob(job, now) ? { ...job, status: "error", error: job.error ?? STALE_AI_JOB_ERROR } : job;
}

// Job AI rimasti "pending" per sempre (funzione scaduta, deploy a metà).
// Funzioni pure, usate da server action, pagine e componenti client.

/**
 * Oltre questo tempo dalla creazione un job ancora "pending" è scaduto: la
 * funzione che lo eseguiva è già stata fermata (maxDuration più lungo: 300 s)
 * e il client ha smesso di interrogarlo (MAX_POLL_MS: 330 s in use-ai-job).
 */
export const STALE_AI_JOB_MS = 6 * 60_000;

export const STALE_AI_JOB_ERROR = "Analisi interrotta. Riprova.";

export interface AiJobLike {
  status: string;
  error?: string | null;
  created_at?: string | null;
}

/** Un job pendente creato più di STALE_AI_JOB_MS fa. Senza data non è scaduto. */
export function isStaleAiJob(job: AiJobLike | null | undefined, now: number = Date.now()): boolean {
  if (!job || job.status !== "pending" || !job.created_at) return false;
  const created = Date.parse(job.created_at);
  return Number.isFinite(created) && now - created > STALE_AI_JOB_MS;
}

/** Data minima di creazione di un job pendente ancora valido. */
export function staleAiJobCutoff(now: number = Date.now()): string {
  return new Date(now - STALE_AI_JOB_MS).toISOString();
}

/** Stato da mostrare: un job pendente scaduto vale come errore da riprovare. */
export function effectiveAiJob<T extends AiJobLike>(job: T, now: number = Date.now()): T {
  return isStaleAiJob(job, now) ? { ...job, status: "error", error: job.error ?? STALE_AI_JOB_ERROR } : job;
}

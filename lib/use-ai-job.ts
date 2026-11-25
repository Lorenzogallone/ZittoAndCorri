"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { pollAiJob, type AiJobStatus } from "@/app/actions/ai-jobs";
import { clientLog } from "@/lib/clientlog";
import { APP_REFRESH_EVENT } from "@/lib/use-app-refresh";

const POLL_INTERVAL_MS = 2_000;
// Beyond this time we stop polling the job. The coach chat can
// last up to 270 s with slow models (other analyses 180 s); we leave
// another minute for saving and mobile network delays before
// considering the job truly stuck.
const MAX_POLL_MS = 330_000;

interface StartResult {
  jobId?: string;
  error?: string;
}

/** Entry for an in-flight job: id + absolute polling deadline. */
interface PersistedJob {
  jobId: string;
  deadline: number;
}

/** localStorage key for a given context (e.g. "plan", "eval:<id>"). */
function storageKeyFor(key: string): string {
  return `ai-job:${key}`;
}

/** Reads a persisted job that is still valid; cleans up expired/corrupt entries. */
function readPersisted(key: string): PersistedJob | null {
  if (typeof window === "undefined") return null;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(storageKeyFor(key));
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedJob>;
    if (
      typeof parsed.jobId === "string" &&
      typeof parsed.deadline === "number" &&
      Date.now() < parsed.deadline
    ) {
      return { jobId: parsed.jobId, deadline: parsed.deadline };
    }
  } catch {
    // corrupt entry: falls through to the clear below
  }
  clearPersisted(key);
  return null;
}

function writePersisted(key: string, job: PersistedJob): void {
  try {
    window.localStorage.setItem(storageKeyFor(key), JSON.stringify(job));
  } catch {
    // localStorage unavailable: resuming after a reload won't work,
    // but the normal flow (without reload) stays intact.
  }
}

function clearPersisted(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKeyFor(key));
  } catch {
    // ignore
  }
}

/**
 * Manages the lifecycle of an async AI request: launches the start server action (which
 * returns a `jobId` right away) and then polls `ai_jobs` until the
 * job is 'done' or 'error'. `pending` stays true for the whole wait, so
 * the coach's "thinking" overlay covers the ~50s average. On 'done' it calls
 * `router.refresh()` to show the server-rendered result, or hands
 * the result to the `onDone` callback with no page refresh.
 *
 * `persistKey` (optional) enables resuming the polling after a reload: the
 * in-flight job is saved in localStorage and, when the component remounts,
 * polling restarts on its own. Needed on iOS standalone PWA, where the system may
 * relaunch the app (back to the splash) during the wait: without resuming, the
 * job would finish server-side but the UI would stay stuck.
 *
 * A full reload is never performed: in a PWA it would bring back the splash
 * and break the continuity of the interface.
 */
export function useAiJob(
  persistKey?: string,
  options?: { onDone?: (status: AiJobStatus) => void | Promise<void> },
) {
  const router = useRouter();
  const t = useTranslations("status");
  const onDone = options?.onDone;
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Invalidates in-flight polls when a new request starts or on unmount.
  const runIdRef = useRef(0);
  useEffect(() => () => {
    runIdRef.current += 1;
  }, []);

  // Job the polling is following right now (null once polling is done).
  const pollingJobRef = useRef<string | null>(null);

  // Polling loop reused both at start and when resuming after a reload.
  const runPoll = useCallback(
    (jobId: string, deadline: number, runId: number) => {
      pollingJobRef.current = jobId;
      const finish = () => {
        if (persistKey) clearPersisted(persistKey);
        if (pollingJobRef.current === jobId) pollingJobRef.current = null;
      };
      const poll = async () => {
        if (runId !== runIdRef.current) return;
        if (Date.now() > deadline) {
          finish();
          setError(t("aiJob.tooSlow"));
          setPending(false);
          return;
        }
        try {
          const status = await pollAiJob(jobId);
          if (runId !== runIdRef.current) return;
          clientLog("aijob:poll", { key: persistKey, status: status.status });
          if (status.status === "done") {
            finish();
            try {
              if (onDone) await onDone(status);
              else router.refresh();
              setDone(true);
              setPending(false);
            } catch {
              setError(t("aiJob.notShown"));
              setPending(false);
            }
            return;
          }
          if (status.status === "error") {
            finish();
            setError(status.error ?? t("aiJob.failed"));
            setPending(false);
            return;
          }
          if (status.status === "missing") {
            finish();
            setError(t("aiJob.missing"));
            setPending(false);
            return;
          }
        } catch {
          // Transient network error: retry on the next round.
        }
        setTimeout(poll, POLL_INTERVAL_MS);
      };

      setTimeout(poll, POLL_INTERVAL_MS);
    },
    [onDone, persistKey, router, t],
  );

  // After pull-to-refresh: if there is a saved job that this hook isn't already
  // following (polling expired or stopped), resume polling it.
  useEffect(() => {
    if (!persistKey) return;
    const resume = () => {
      const saved = readPersisted(persistKey);
      if (!saved || pollingJobRef.current === saved.jobId) return;
      const runId = ++runIdRef.current;
      setError(null);
      setDone(false);
      setPending(true);
      runPoll(saved.jobId, saved.deadline, runId);
    };
    window.addEventListener(APP_REFRESH_EVENT, resume);
    return () => window.removeEventListener(APP_REFRESH_EVENT, resume);
  }, [persistKey, runPoll]);

  // Resume on mount: if there is a persisted job still valid (e.g. after a
  // PWA reload on iOS), reattach the polling and show the overlay again.
  useEffect(() => {
    if (!persistKey) return;
    const saved = readPersisted(persistKey);
    if (!saved) return;
    const timer = window.setTimeout(() => {
      const runId = ++runIdRef.current;
      setError(null);
      setDone(false);
      setPending(true);
      runPoll(saved.jobId, saved.deadline, runId);
    }, 0);
    return () => window.clearTimeout(timer);
    // Runs only once on mount: persistKey/runPoll are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = useCallback(
    async (starter: () => Promise<StartResult>) => {
      const runId = ++runIdRef.current;
      setError(null);
      setDone(false);
      setPending(true);

      let res: StartResult;
      try {
        res = await starter();
      } catch {
        if (runId !== runIdRef.current) return;
        setError(t("aiJob.notStarted"));
        setPending(false);
        return;
      }
      if (runId !== runIdRef.current) return;
      if (res.error || !res.jobId) {
        setError(res.error ?? t("aiJob.notStarted"));
        setPending(false);
        return;
      }

      const jobId = res.jobId;
      const deadline = Date.now() + MAX_POLL_MS;
      if (persistKey) writePersisted(persistKey, { jobId, deadline });
      clientLog("aijob:start", { key: persistKey, jobId });

      runPoll(jobId, deadline, runId);
    },
    [persistKey, runPoll, t],
  );

  return { pending, done, error, start };
}

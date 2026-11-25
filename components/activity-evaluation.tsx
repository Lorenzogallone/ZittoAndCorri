"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { startEvaluation } from "@/app/activities/ai-actions";
import type { AiJobStatus } from "@/app/actions/ai-jobs";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { AiThinkingOverlay } from "@/components/ai-thinking-overlay";
import { useAiJob } from "@/lib/use-ai-job";
import { useRefreshWhile } from "@/lib/use-app-refresh";
import type { Evaluation } from "@/lib/types";
import { AiCost } from "@/components/ai-cost";
import { readUsage } from "@/lib/ai/usage";
import { localizeAiJobError, STALE_AI_JOB_ERROR, STALE_AI_JOB_MS } from "@/lib/ai/job-staleness";

interface Props {
  activityId: string;
  initialNotes: string | null;
  evaluation: Pick<Evaluation, "summary" | "details" | "created_at" | "ai_usage"> | null;
  initialAnalyzing?: boolean;
  /** Pending job creation: past STALE_AI_JOB_MS the analysis has expired. */
  analyzingSince?: string | null;
  initialFailed?: boolean;
  initialError?: string | null;
  keyConfigured?: boolean;
}

export function ActivityEvaluation({
  activityId,
  initialNotes,
  evaluation,
  initialAnalyzing: serverAnalyzing = false,
  analyzingSince = null,
  initialFailed: serverFailed = false,
  initialError: serverError = null,
  keyConfigured = true,
}: Props) {
  const t = useTranslations("activities.evaluation");
  const tStatus = useTranslations("status");
  // The job launched by the server may never finish (function timed out): after
  // the maximum time the spinner gives way to the error and "Retry".
  const [expiredSince, setExpiredSince] = useState<string | null>(null);
  useEffect(() => {
    if (!serverAnalyzing || !analyzingSince) return;
    const created = Date.parse(analyzingSince);
    if (!Number.isFinite(created)) return;
    const timer = window.setTimeout(
      () => setExpiredSince(analyzingSince),
      Math.max(0, created + STALE_AI_JOB_MS - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [serverAnalyzing, analyzingSince]);
  const expired = serverAnalyzing && analyzingSince != null && expiredSince === analyzingSince;
  const initialAnalyzing = serverAnalyzing && !expired;
  const initialFailed = serverFailed || expired;
  const initialError = localizeAiJobError(expired ? STALE_AI_JOB_ERROR : serverError, tStatus);
  const [displayedEvaluation, setDisplayedEvaluation] = useState(evaluation);
  // After a refresh (pull-down, analysis finished on the server) the new data wins.
  const [serverEvaluation, setServerEvaluation] = useState(evaluation);
  if (evaluation !== serverEvaluation) {
    setServerEvaluation(evaluation);
    if (evaluation) setDisplayedEvaluation(evaluation);
  }
  const usage = readUsage(displayedEvaluation?.ai_usage);
  const router = useRouter();
  const showEvaluationResult = useCallback((status: AiJobStatus) => {
    if (!status.evaluationResult) throw new Error(t("missingResult"));
    setDisplayedEvaluation(status.evaluationResult);
    // The evaluation may have re-read the repeats from the note: refresh the page.
    router.refresh();
  }, [router, t]);
  // The per-run key lets polling resume if iOS suspends the
  // PWA, while onDone refreshes this section without reloading the page.
  const { pending, done, error, start } = useAiJob(`eval:${activityId}`, {
    onDone: showEvaluationResult,
  });
  const displayedError = error ?? initialError;
  // A terminal error received from polling must win over the initial server
  // value `initialAnalyzing`, which may stay true until the next refresh.
  const isAnalyzing = pending || (initialAnalyzing && !done && !displayedError);
  // Analysis started by the server (run just imported): no job to
  // poll here, so the page reloads until it arrives.
  useRefreshWhile(initialAnalyzing && !pending && !done, 6_000, 40);
  // With an existing analysis the note stays hidden until needed.
  const [showForm, setShowForm] = useState(false);
  const formVisible = !displayedEvaluation?.summary || showForm;
  const sectionRef = useRef<HTMLElement>(null);

  // "#nota" (e.g. from the Repeats tab): opens the field and scrolls there.
  useEffect(() => {
    const open = () => {
      if (window.location.hash !== "#nota") return;
      setShowForm(true);
      requestAnimationFrame(() => {
        sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        document.getElementById("ai-notes")?.focus({ preventScroll: true });
      });
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);

  return (
    <section id="nota" ref={sectionRef} className="surface scroll-mt-4 p-5">
      <h2 className="mb-3 flex items-center gap-2 text-body font-semibold">
        <Sparkles size={16} className="text-primary" /> {t("title")}
      </h2>

      {displayedEvaluation?.summary && !isAnalyzing && (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{displayedEvaluation.summary}</p>
      )}
      {(displayedEvaluation?.details?.length ?? 0) > 0 && !isAnalyzing && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {displayedEvaluation!.details!.map((detail, index) => (
            <li key={`${detail}-${index}`} className="rounded-full bg-muted px-2.5 py-1 text-xs">{detail}</li>
          ))}
        </ul>
      )}
      {usage && displayedEvaluation?.summary && !isAnalyzing && (
        <AiCost usage={usage} part="total" prefix={t("cost")} className="mt-3" />
      )}

      {!keyConfigured && !isAnalyzing && (
        <Link href="/settings?tab=coach" className="pressable mt-3 block rounded-xl bg-primary/10 px-4 py-3 text-center text-sm font-medium text-primary">
          {t("addKey")}
        </Link>
      )}

      {displayedError && !isAnalyzing && (
        <div className="mt-3 border-l-2 border-destructive pl-3" role="alert">
          <p className="text-sm font-medium text-destructive">{displayedError}</p>
          {/quota/i.test(displayedError) && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t("quotaHint")}
            </p>
          )}
        </div>
      )}

      {!isAnalyzing && keyConfigured && !formVisible && (
        <button type="button" onClick={() => setShowForm(true)} className="mt-4 text-sm font-medium text-primary">
          {t("addNote")}
        </button>
      )}

      {!isAnalyzing && formVisible && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            form.reset();
            setShowForm(false);
            start(() => startEvaluation(fd));
          }}
          className="mt-4 flex flex-col gap-2.5"
        >
          <input type="hidden" name="activity_id" value={activityId} />
          <label id="ai-notes-label" htmlFor="ai-notes" className="text-xs font-medium text-muted-foreground">
            {t("notesLabel")}
          </label>
          <TextField
            id="ai-notes"
            aria-labelledby="ai-notes-label"
            name="notes"
            rows={3}
            defaultValue={displayedEvaluation ? "" : initialNotes ?? ""}
            placeholder={t("notesPlaceholder")}
          />
          <Button type="submit" disabled={!keyConfigured} variant="outline" className="w-full">
            {displayedEvaluation ? t("reevaluate") : initialFailed ? t("retry") : t("ask")}
          </Button>
        </form>
      )}

      <AiThinkingOverlay pending={isAnalyzing} variant="evaluation" />
    </section>
  );
}

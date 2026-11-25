"use server";

import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import type { CoachMessage, Evaluation, PlanProposal } from "@/lib/types";
import { isStaleAiJob, localizeAiJobError, STALE_AI_JOB_ERROR } from "@/lib/ai/job-staleness";

export type AiJobState = "pending" | "done" | "error" | "missing";

export interface AiJobStatus {
  status: AiJobState;
  error?: string | null;
  coachResult?: {
    message: CoachMessage;
    proposal: PlanProposal | null;
  };
  evaluationResult?: Pick<Evaluation, "summary" | "details" | "created_at" | "ai_usage">;
}

/**
 * Current state of a background AI job (see `after()` in the
 * plan/evaluation actions). The client polls it until it becomes
 * 'done' or 'error': this way the long connection to Gemini is never kept open
 * on the client, and we avoid the PWA reload/crash on mobile networks.
 */
export async function pollAiJob(jobId: string): Promise<AiJobStatus> {
  if (!jobId) return { status: "missing" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "missing" };

  const { data } = await supabase
    .from("ai_jobs")
    .select("status, error, kind, ref_id, output_message_id, created_at")
    .eq("id", jobId)
    .eq("user_id", user.id)
    .maybeSingle<{
      status: AiJobState;
      error: string | null;
      kind: string;
      ref_id: string | null;
      output_message_id: string | null;
      created_at: string | null;
    }>();

  if (!data) return { status: "missing" };
  // Pending past the function's maximum time (also for chat): it
  // will never finish, the client shows the error and the retry button.
  const t = await getTranslations("status");
  if (isStaleAiJob(data)) return { status: "error", error: localizeAiJobError(data.error ?? STALE_AI_JOB_ERROR, t) };
  if (data.status === "done" && data.kind === "chat" && data.output_message_id) {
    const { data: message } = await supabase
      .from("coach_messages")
      .select("*")
      .eq("id", data.output_message_id)
      .eq("user_id", user.id)
      .maybeSingle<CoachMessage>();
    if (message) {
      const { data: proposal } = message.plan_proposal_id
        ? await supabase
            .from("plan_proposals")
            .select("*")
            .eq("id", message.plan_proposal_id)
            .eq("user_id", user.id)
            .maybeSingle<PlanProposal>()
        : { data: null };
      return {
        status: data.status,
        error: localizeAiJobError(data.error, t),
        coachResult: { message, proposal: proposal ?? null },
      };
    }
  }
  if (data.status === "done" && data.kind === "evaluation" && data.ref_id) {
    const { data: evaluation } = await supabase
      .from("evaluations")
      .select("*")
      .eq("activity_id", data.ref_id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<Evaluation>();
    if (evaluation) {
      return {
        status: data.status,
        error: localizeAiJobError(data.error, t),
        evaluationResult: {
          summary: evaluation.summary,
          details: evaluation.details,
          created_at: evaluation.created_at,
          ai_usage: evaluation.ai_usage ?? null,
        },
      };
    }
  }
  return { status: data.status, error: localizeAiJobError(data.error, t) };
}

"use server";

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { enqueueActivityEvaluation } from "@/lib/ai/evaluate-activity";

export interface EvaluationActionState { error?: string; jobId?: string }

export async function startEvaluation(formData: FormData): Promise<EvaluationActionState> {
  const t = await getTranslations("coach.evaluation");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const activityId = String(formData.get("activity_id") ?? "").trim();
  if (!activityId) return { error: t("invalidActivity") };
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const { data: activity, error } = await supabase.from("activities").update({ notes }).eq("id", activityId).eq("user_id", user.id).select("id").maybeSingle<{ id: string }>();
  if (error || !activity) return { error: t("activityNotFound") };
  try {
    const jobId = await enqueueActivityEvaluation(user.id, activityId);
    if (!jobId) return { error: t("configureGemini") };
    return { jobId };
  } catch {
    return { error: t("startFailed") };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { enqueueActivityEvaluation } from "@/lib/ai/evaluate-activity";

export interface EvaluationActionState { error?: string; jobId?: string }

export async function startEvaluation(formData: FormData): Promise<EvaluationActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const activityId = String(formData.get("activity_id") ?? "").trim();
  if (!activityId) return { error: "Attività non valida." };
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const { data: activity, error } = await supabase.from("activities").update({ notes }).eq("id", activityId).eq("user_id", user.id).select("id").maybeSingle<{ id: string }>();
  if (error || !activity) return { error: "Attività non trovata." };
  try {
    const jobId = await enqueueActivityEvaluation(user.id, activityId);
    if (!jobId) return { error: "Configura la chiave Gemini nelle impostazioni." };
    revalidatePath(`/activities/${activityId}`);
    return { jobId };
  } catch {
    return { error: "Impossibile avviare la valutazione." };
  }
}

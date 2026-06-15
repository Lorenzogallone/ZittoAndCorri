"use server";

import { createClient } from "@/lib/supabase/server";

export type AiJobState = "pending" | "done" | "error" | "missing";

export interface AiJobStatus {
  status: AiJobState;
  error?: string | null;
}

/**
 * Stato corrente di un job AID in background (vedi `after()` nelle action di
 * piano/valutazione). Il client lo interroga in polling finché non passa a
 * 'done' o 'error': così la connessione lunga verso Gemini non resta mai aperta
 * lato client, ed evitiamo il reload/crash della PWA su rete mobile.
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
    .select("status, error")
    .eq("id", jobId)
    .eq("user_id", user.id)
    .maybeSingle<{ status: AiJobState; error: string | null }>();

  if (!data) return { status: "missing" };
  return { status: data.status, error: data.error };
}

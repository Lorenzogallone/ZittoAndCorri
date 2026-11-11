"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { memoryCategories } from "@/lib/ai/prompt";

// Ricordi del coach gestiti a mano dalle impostazioni: correggerne uno,
// toglierlo o aggiungerne uno nuovo. Il coach li legge al messaggio successivo.

const MemorySchema = z.object({
  category: z.enum(memoryCategories),
  content: z.string().trim().min(3, "Scrivi almeno qualche parola.").max(600, "Massimo 600 caratteri."),
  valid_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

export type MemoryInput = z.input<typeof MemorySchema>;
export interface MemoryActionResult { error?: string }

async function userClient() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user.id };
}

function done(): MemoryActionResult {
  revalidatePath("/settings");
  return {};
}

function parse(input: MemoryInput) {
  const parsed = MemorySchema.safeParse({ ...input, valid_until: input.valid_until || null });
  return parsed.success
    ? { data: parsed.data }
    : { error: parsed.error.issues[0]?.message ?? "Dati non validi." };
}

export async function saveCoachMemory(id: string | null, input: MemoryInput): Promise<MemoryActionResult> {
  const result = parse(input);
  if (!result.data) return { error: result.error };
  const { supabase, userId } = await userClient();
  const row = { ...result.data, updated_at: new Date().toISOString() };
  const { error } = id
    ? await supabase.from("coach_memories").update(row).eq("id", id).eq("user_id", userId)
    // Scritto dall'atleta: certezza piena, valido da oggi.
    : await supabase.from("coach_memories").insert({ ...row, user_id: userId, source: "chat", confidence: 1, valid_from: new Date().toISOString().slice(0, 10) });
  if (error?.code === "23514") return { error: "Questa categoria non è ancora disponibile sul database." };
  if (error) return { error: "Non sono riuscito a salvare il ricordo." };
  return done();
}

export async function deleteCoachMemory(id: string): Promise<MemoryActionResult> {
  const { supabase, userId } = await userClient();
  const { error } = await supabase.from("coach_memories").delete().eq("id", id).eq("user_id", userId);
  if (error) return { error: "Non sono riuscito a eliminare il ricordo." };
  return done();
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { memoryCategories } from "@/lib/ai/prompt";

// Ricordi del coach gestiti a mano dalle impostazioni: correggerne uno,
// toglierlo o aggiungerne uno nuovo. Il coach li legge al messaggio successivo.

type Translate = Awaited<ReturnType<typeof getTranslations>>;

function memorySchema(t: Translate) {
  return z.object({
    category: z.enum(memoryCategories),
    content: z.string().trim().min(3, t("contentTooShort")).max(600, t("contentTooLong")),
    valid_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  });
}

export type MemoryInput = z.input<ReturnType<typeof memorySchema>>;
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

function parse(input: MemoryInput, t: Translate) {
  const parsed = memorySchema(t).safeParse({ ...input, valid_until: input.valid_until || null });
  return parsed.success
    ? { data: parsed.data }
    : { error: parsed.error.issues[0]?.message ?? t("invalid") };
}

export async function saveCoachMemory(id: string | null, input: MemoryInput): Promise<MemoryActionResult> {
  const t = await getTranslations("settingsLinks.memory.errors");
  const result = parse(input, t);
  if (!result.data) return { error: result.error };
  const { supabase, userId } = await userClient();
  const row = { ...result.data, updated_at: new Date().toISOString() };
  const { error } = id
    ? await supabase.from("coach_memories").update(row).eq("id", id).eq("user_id", userId)
    // Scritto dall'atleta: certezza piena, valido da oggi.
    : await supabase.from("coach_memories").insert({ ...row, user_id: userId, source: "chat", confidence: 1, valid_from: new Date().toISOString().slice(0, 10) });
  if (error?.code === "23514") return { error: t("categoryUnavailable") };
  if (error) return { error: t("saveFailed") };
  return done();
}

export async function deleteCoachMemory(id: string): Promise<MemoryActionResult> {
  const t = await getTranslations("settingsLinks.memory.errors");
  const { supabase, userId } = await userClient();
  const { error } = await supabase.from("coach_memories").delete().eq("id", id).eq("user_id", userId);
  if (error) return { error: t("deleteFailed") };
  return done();
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  deleteZeppForUser,
  disableZeppForUser,
  generatePairingCodeForUser,
} from "@/lib/zepp/data";

async function authenticatedUserId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user.id;
}

export async function generateZeppPairingCode(): Promise<{
  code?: string;
  expiresAt?: string;
  error?: string;
}> {
  const userId = await authenticatedUserId();
  try {
    return await generatePairingCodeForUser(userId);
  } catch (error) {
    console.error("generateZeppPairingCode:", error instanceof Error ? error.message : error);
    return { error: "Impossibile generare il codice. Riprova." };
  }
}

export async function disableZeppConnection(): Promise<{ ok?: boolean; error?: string }> {
  const userId = await authenticatedUserId();
  try {
    await disableZeppForUser(userId);
    revalidatePath("/settings");
    revalidatePath("/profile");
    return { ok: true };
  } catch (error) {
    console.error("disableZeppConnection:", error instanceof Error ? error.message : error);
    return { error: "Impossibile disattivare Zepp." };
  }
}

export async function deleteZeppConnectionData(): Promise<{ ok?: boolean; error?: string }> {
  const userId = await authenticatedUserId();
  try {
    await deleteZeppForUser(userId);
    revalidatePath("/settings");
    revalidatePath("/profile");
    return { ok: true };
  } catch (error) {
    console.error("deleteZeppConnectionData:", error instanceof Error ? error.message : error);
    return { error: "Impossibile eliminare i dati Zepp." };
  }
}

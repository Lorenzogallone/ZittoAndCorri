"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ingestActivity } from "@/lib/ingest/ingest";
import { parseGpx } from "@/lib/ingest/adapters/gpx";
import type { Profile } from "@/lib/types";

export interface ImportFormState {
  error?: string;
}

/**
 * Server Action per la UI di import: accetta un file GPX oppure JSON ActivityInput.
 * Distingue il formato dal content-type del file o dall'estensione.
 */
export async function importActivity(
  _prevState: ImportFormState,
  formData: FormData,
): Promise<ImportFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("max_hr, resting_hr")
    .eq("id", user.id)
    .single<Pick<Profile, "max_hr" | "resting_hr">>();

  const ctx = {
    supabase,
    userId: user.id,
    profile: profile ?? { max_hr: null, resting_hr: 50 },
  };

  // Modalità file GPX
  const file = formData.get("gpx_file");
  if (file instanceof File && file.size > 0) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    const text = await file.text();

    try {
      if (ext === "gpx") {
        const input = parseGpx(text);
        const id = await ingestActivity(input, ctx);
        revalidatePath("/activities");
        redirect(`/activities/${id}`);
      } else if (ext === "json") {
        const parsed = JSON.parse(text);
        const inputs = Array.isArray(parsed) ? parsed : [parsed];
        let lastId = "";
        for (const inp of inputs) {
          lastId = await ingestActivity(inp, ctx);
        }
        revalidatePath("/activities");
        redirect(`/activities/${lastId}`);
      } else {
        return { error: "Formato non supportato. Carica un file .gpx o .json." };
      }
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Errore durante l'import." };
    }
  }

  // Modalità incolla JSON
  const jsonText = String(formData.get("json_text") ?? "").trim();
  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText);
      const inputs = Array.isArray(parsed) ? parsed : [parsed];
      let lastId = "";
      for (const inp of inputs) {
        lastId = await ingestActivity(inp, ctx);
      }
      revalidatePath("/activities");
      redirect(`/activities/${lastId}`);
    } catch (e) {
      return { error: e instanceof Error ? e.message : "JSON non valido o import fallito." };
    }
  }

  return { error: "Nessun file o testo fornito." };
}

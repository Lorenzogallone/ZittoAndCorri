import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sanitizePrefs } from "@/lib/theme";
import type { Profile, AiCredentialMetadata, CoachMemory } from "@/lib/types";
import type { ZeppConnectionView } from "@/lib/zepp/types";
import { getEffectiveHrConfig } from "@/lib/zepp/effective-hr";
import { getAiStatus } from "@/lib/ai/ai-status";
import { listOpenRouterModels, suggestedOpenRouterModels } from "@/lib/ai/openrouter";
import { SettingsView } from "./settings-view";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string; tab?: string }>;
}) {
  const { focus, tab: tabParam } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profileRes, themeRes, credentialRes, memoriesRes, aiStatus, openRouterModels] = await Promise.all([
    supabase
      .from("profiles")
      .select("max_hr, resting_hr, birthdate, api_key")
      .eq("id", user.id)
      .maybeSingle<Partial<Profile>>(),
    supabase
      .from("profiles")
      .select("theme_mode, theme_accent, theme_style")
      .eq("id", user.id)
      .maybeSingle<Pick<Profile, "theme_mode" | "theme_accent" | "theme_style">>(),
    supabase
      .from("user_ai_credentials")
      .select("provider, last_four, model, verified_at, updated_at")
      .eq("user_id", user.id)
      .maybeSingle<AiCredentialMetadata>(),
    supabase
      .from("coach_memories")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .returns<CoachMemory[]>(),
    getAiStatus(supabase, user.id),
    listOpenRouterModels(),
  ]);

  const profile = profileRes.data;
  const zeppConnectionRes = await supabase
    .from("zepp_connections")
    .select("enabled, auto_sync, device_name, device_source, os_version, firmware_version, api_level, paired_at, last_sync_at, last_error")
    .eq("user_id", user.id)
    .eq("client_kind", "health")
    .maybeSingle<ZeppConnectionView>();
  // Query separata: senza la migrazione 0018 il resto del profilo resta leggibile.
  const heatRes = await supabase
    .from("profiles")
    .select("heat_adjust")
    .eq("id", user.id)
    .maybeSingle<{ heat_adjust: boolean | null }>();
  const effectiveHr = await getEffectiveHrConfig(supabase, user.id, {
    max_hr: profile?.max_hr ?? null,
    resting_hr: profile?.resting_hr ?? null,
  });
  const initialTheme = sanitizePrefs({
    mode: themeRes.data?.theme_mode ?? null,
    accent: themeRes.data?.theme_accent ?? null,
    style: themeRes.data?.theme_style ?? null,
  });

  const tab = focus === "gemini" ? "coach" : ["athlete", "app", "coach", "links"].includes(tabParam ?? "") ? tabParam! : "athlete";

  return (
    <SettingsView
      tab={tab}
      profile={profile ?? null}
      effectiveHr={effectiveHr}
      heatAdjust={heatRes.data?.heat_adjust !== false}
      theme={initialTheme}
      vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null}
      credential={credentialRes.data ?? null}
      focusGemini={focus === "gemini"}
      memories={memoriesRes.data ?? []}
      zeppConnection={zeppConnectionRes.data ?? null}
      ai={{ active: aiStatus.active, gemini: aiStatus.gemini, openrouter: aiStatus.openrouter }}
      openrouter={aiStatus.openrouter ? (aiStatus.openrouter.lastFour ? { lastFour: aiStatus.openrouter.lastFour, model: aiStatus.openrouter.model } : null) : undefined}
      openRouterModels={openRouterModels}
      suggestedModels={suggestedOpenRouterModels(openRouterModels)}
    />
  );
}

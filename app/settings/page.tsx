import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";
import { AppShell } from "@/components/app-shell";
import { ProfileForm } from "./profile-form";
import { ThemeSettings } from "./theme-settings";
import { CoachMemorySection } from "./coach-memory-section";
import { GeminiKeySection } from "./gemini-key-section";
import { ApiKeySection } from "./api-key-section";
import { ZeppIntegrationSection } from "./zepp-integration-section";
import { Button } from "@/components/ui/button";
import { sanitizePrefs } from "@/lib/theme";
import type { Profile, AiCredentialMetadata, CoachMemory } from "@/lib/types";
import { LogOut } from "lucide-react";
import type { ZeppConnectionView } from "@/lib/zepp/types";
import { getEffectiveHrConfig } from "@/lib/zepp/effective-hr";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string }>;
}) {
  const { focus } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profileRes, themeRes, credentialRes, memoriesRes] = await Promise.all([
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
  ]);

  const profile = profileRes.data;
  const zeppConnectionRes = await supabase
    .from("zepp_connections")
    .select("enabled, auto_sync, device_name, device_source, os_version, firmware_version, api_level, paired_at, last_sync_at, last_error")
    .eq("user_id", user.id)
    .maybeSingle<ZeppConnectionView>();
  const effectiveHr = await getEffectiveHrConfig(supabase, user.id, {
    max_hr: profile?.max_hr ?? null,
    resting_hr: profile?.resting_hr ?? null,
  });
  const initialTheme = sanitizePrefs({
    mode: themeRes.data?.theme_mode ?? null,
    accent: themeRes.data?.theme_accent ?? null,
    style: themeRes.data?.theme_style ?? null,
  });

  return (
    <AppShell
      title="Impostazioni"
      backHref="/profile"
      backLabel="Profilo"
      hideTabBar
    >
      <section className="mb-9">
        <h2 className="mb-2 text-base font-semibold tracking-tight">
          Profilo
        </h2>
        <div className="border-y border-border/70">
          <ProfileForm profile={profile ?? null} effectiveHr={effectiveHr} />
        </div>
      </section>

      <section className="mb-9">
        <h2 className="mb-2 text-base font-semibold tracking-tight">
          Applicazione
        </h2>
        <div className="border-y border-border/70">
          <ThemeSettings initial={initialTheme} />
        </div>
      </section>

      <section className="mb-9">
        <h2 className="mb-2 text-base font-semibold tracking-tight">
          Coach AI
        </h2>
        <div className="divide-y divide-border/70 border-y border-border/70">
          <GeminiKeySection
            credential={credentialRes.data ?? null}
            focusRequested={focus === "gemini"}
          />
          <CoachMemorySection memories={memoriesRes.data ?? []} />
        </div>
      </section>

      <section className="mb-9">
        <h2 className="mb-2 text-base font-semibold tracking-tight">
          Integrazioni
        </h2>
        <div className="divide-y divide-border/70 border-y border-border/70">
          <ZeppIntegrationSection
            initialConnection={zeppConnectionRes.data ?? null}
          />
          <ApiKeySection initialApiKey={profile?.api_key ?? null} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold tracking-tight">
          Account
        </h2>
        <form action={signOut} className="border-y border-border/70 py-2">
          <Button
            type="submit"
            variant="ghost"
            className="w-full justify-start text-destructive hover:text-destructive"
          >
            <LogOut size={16} />
            Esci dall&apos;account
          </Button>
        </form>
      </section>
    </AppShell>
  );
}

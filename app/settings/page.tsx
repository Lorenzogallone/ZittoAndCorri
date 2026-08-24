import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";
import { AppShell } from "@/components/app-shell";
import { ProfileForm } from "./profile-form";
import { IntegrationsSection } from "./integrations-section";
import { ThemeSettings } from "./theme-settings";
import { CoachMemorySection } from "./coach-memory-section";
import { Button } from "@/components/ui/button";
import { sanitizePrefs } from "@/lib/theme";
import type { Profile, AiCredentialMetadata, CoachMemory } from "@/lib/types";
import { LogOut } from "lucide-react";

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
      .select("provider, last_four, verified_at, updated_at")
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
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Impostazioni</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Personalizza l&apos;app e i dati usati dal coach.
        </p>
      </div>

      <section className="mb-7">
        <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Esperienza
        </h2>
        <div className="space-y-3">
          <ThemeSettings initial={initialTheme} />
          <CoachMemorySection memories={memoriesRes.data ?? []} />
        </div>
      </section>

      <section className="mb-7">
        <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Dati e collegamenti
        </h2>
        <div className="space-y-3">
          <ProfileForm profile={profile ?? null} />
          <IntegrationsSection
            key={focus === "gemini" ? "focus-gemini" : "default"}
            apiKey={profile?.api_key ?? null}
            geminiCredential={credentialRes.data ?? null}
            focusGemini={focus === "gemini"}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Account
        </h2>
        <form action={signOut}>
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

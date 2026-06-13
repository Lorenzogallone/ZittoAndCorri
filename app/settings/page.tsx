import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";
import { AppShell } from "@/components/app-shell";
import { ProfileForm } from "./profile-form";
import { IntegrationsSection } from "./integrations-section";
import { ThemeSettings } from "./theme-settings";
import { Button } from "@/components/ui/button";
import { sanitizePrefs } from "@/lib/theme";
import type { Profile, Goal } from "@/lib/types";
import { formatDistance, formatDuration, daysUntil } from "@/lib/format";
import { LogOut } from "lucide-react";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: activeGoal }, themeRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, max_hr, resting_hr, birthdate, api_key")
      .eq("id", user.id)
      .maybeSingle<Partial<Profile>>(),
    supabase
      .from("goals")
      .select("race_name, race_date, distance_m, target_time_s")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle<Pick<Goal, "race_name" | "race_date" | "distance_m" | "target_time_s">>(),
    // Query separata e tollerante: se la migration 0005 non è stata applicata
    // l'errore resta isolato qui e il tema usa i default (la pagina non si rompe).
    supabase
      .from("profiles")
      .select("theme_mode, theme_accent, theme_style")
      .eq("id", user.id)
      .maybeSingle<Pick<Profile, "theme_mode" | "theme_accent" | "theme_style">>(),
  ]);

  const initialTheme = sanitizePrefs({
    mode: themeRes.data?.theme_mode ?? null,
    accent: themeRes.data?.theme_accent ?? null,
    style: themeRes.data?.theme_style ?? null,
  });

  const displayName = profile?.display_name || user.email?.split("@")[0] || "Runner";
  const initials = displayName
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <AppShell title="Profilo">
      {/* Avatar & Name */}
      <div className="flex items-center gap-4 mb-8">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary font-bold text-lg">
          {initials}
        </div>
        <div>
          <p className="font-semibold text-lg">{displayName}</p>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
      </div>

      {/* Parametri Atleta */}
      <div className="rounded-2xl bg-card border border-white/[0.06] p-5 mb-6">
        <h2 className="text-sm font-semibold mb-4">Parametri atleta</h2>
        <ProfileForm profile={profile ?? null} />
      </div>

      {/* Obiettivo */}
      <Link href="/goals" className="block mb-6">
        <div className="rounded-2xl bg-card border border-white/[0.06] p-5 transition-colors active:scale-[0.98] hover:border-white/[0.12]" style={{ transition: 'transform 0.15s, border-color 0.15s' }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Obiettivo attivo</h2>
            <span className="text-muted-foreground/50 text-xl leading-none">›</span>
          </div>
          {activeGoal ? (
            <div>
              <p className="font-medium">{activeGoal.race_name}</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {formatDistance(activeGoal.distance_m)}
                {activeGoal.target_time_s && ` · Target ${formatDuration(activeGoal.target_time_s)}`}
              </p>
              {activeGoal.race_date && (() => {
                const d = daysUntil(activeGoal.race_date);
                return (
                  <p className="text-sm text-primary font-medium mt-1">
                    {d === 0 ? "Oggi!" : d === 1 ? "1 giorno al via" : `${d} giorni al via`}
                    {" · "}{new Date(activeGoal.race_date).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}
                  </p>
                );
              })()}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nessun obiettivo impostato — tocca per aggiungerne uno.
            </p>
          )}
        </div>
      </Link>

      {/* Impostazioni */}
      <div className="mb-3 px-1">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Impostazioni
        </h2>
      </div>

      {/* Aspetto: modalità, colore principale e stile */}
      <ThemeSettings initial={initialTheme} />

      {/* Integrazioni & API (Collassabile) */}
      <IntegrationsSection apiKey={profile?.api_key ?? null} />

      {/* Logout */}
      <div className="separator my-4" />
      <form action={signOut} className="flex justify-center">
        <Button type="submit" variant="ghost" size="sm" className="text-destructive hover:text-destructive">
          <LogOut size={16} />
          Esci
        </Button>
      </form>

      {/* Discrete version info and logo branding */}
      <div className="mt-12 flex flex-col items-center justify-center gap-2 opacity-40 text-[11px] text-muted-foreground pb-6">
        <img
          src="/logo.png"
          alt="Zitto e Corri Logo"
          className="w-6 h-6 rounded object-cover filter grayscale dark:invert dark:hue-rotate-180"
        />
        <span>Zitto e Corri v0.1.0</span>
      </div>
    </AppShell>
  );
}

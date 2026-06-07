import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";
import { AppShell } from "@/components/app-shell";
import { ProfileForm } from "./profile-form";
import { Button } from "@/components/ui/button";
import type { Profile, Goal } from "@/lib/types";
import { formatDistance, formatDuration, daysUntil } from "@/lib/format";
import { LogOut } from "lucide-react";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: activeGoal }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, max_hr, resting_hr, birthdate")
      .eq("id", user.id)
      .maybeSingle<Partial<Profile>>(),
    supabase
      .from("goals")
      .select("race_name, race_date, distance_m, target_time_s")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle<Pick<Goal, "race_name" | "race_date" | "distance_m" | "target_time_s">>(),
  ]);

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

      {/* Profile Form */}
      <div className="rounded-2xl bg-card border border-white/[0.06] p-5 mb-6">
        <h2 className="text-sm font-semibold mb-1">Parametri atleta</h2>
        <p className="text-xs text-muted-foreground mb-5">
          HR max e a riposo servono per il calcolo delle zone.
        </p>
        <ProfileForm profile={profile ?? null} />
      </div>

      {/* Obiettivo */}
      <div className="rounded-2xl bg-card border border-white/[0.06] p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Obiettivo attivo</h2>
          <Link
            href={activeGoal ? "/goals" : "/goals/new"}
            className="text-xs text-primary hover:underline"
          >
            {activeGoal ? "Gestisci obiettivi" : "Imposta obiettivo"}
          </Link>
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
            Nessun obiettivo impostato. Aggiungine uno per pianificare gli allenamenti.
          </p>
        )}
      </div>

      {/* Logout */}
      <div className="separator my-4" />
      <form action={signOut} className="flex justify-center">
        <Button type="submit" variant="ghost" size="sm" className="text-destructive hover:text-destructive">
          <LogOut size={16} />
          Esci
        </Button>
      </form>
    </AppShell>
  );
}

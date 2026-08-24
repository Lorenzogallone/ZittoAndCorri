import Link from "next/link";
import { redirect } from "next/navigation";
import { Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { TechInfoCard } from "@/app/settings/tech-info-card";
import { computeATLCTL } from "@/lib/metrics/load";
import type { Goal, Activity } from "@/lib/types";
import { formatDistance, formatDuration, daysUntil, activeDuration } from "@/lib/format";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: activeGoal }, { data: activities }] = await Promise.all([
    supabase
      .from("goals")
      .select("race_name, race_date, distance_m, target_time_s")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle<Pick<Goal, "race_name" | "race_date" | "distance_m" | "target_time_s">>(),
    supabase
      .from("activities")
      .select("started_at, duration_s, moving_time_s, rpe")
      .eq("user_id", user.id)
      .returns<Pick<Activity, "started_at" | "duration_s" | "moving_time_s" | "rpe">[]>(),
  ]);

  const load = computeATLCTL(
    (activities ?? []).map((activity) => ({
      started_at: activity.started_at,
      duration_s: activeDuration(activity),
      rpe: activity.rpe,
    })),
  );

  const authName = typeof user.user_metadata?.full_name === "string"
    ? user.user_metadata.full_name
    : typeof user.user_metadata?.name === "string"
      ? user.user_metadata.name
      : null;
  const displayName = authName || user.email?.split("@")[0] || "Runner";
  const initials = displayName
    .split(" ")
    .map((word: string) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <AppShell
      title="Profilo"
      headerAction={
        <Button asChild variant="ghost" size="icon-sm">
          <Link href="/settings" aria-label="Apri impostazioni" title="Impostazioni">
            <Settings size={18} />
          </Link>
        </Button>
      }
    >
      <div className="mb-8 flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-lg font-bold text-primary">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{displayName}</p>
          <p className="truncate text-sm text-muted-foreground">{user.email}</p>
        </div>
      </div>

      <TechInfoCard
        atl={load.atl}
        ctl={load.ctl}
        tsb={load.tsb}
        hasData={(activities?.length ?? 0) > 0}
      />

      <Link href="/goals" className="block">
        <div className="rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/25 active:scale-[0.98]">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Obiettivo attivo</h2>
            <span className="text-xl leading-none text-muted-foreground/60">›</span>
          </div>
          {activeGoal ? (
            <div>
              <p className="font-medium">{activeGoal.race_name}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {formatDistance(activeGoal.distance_m)}
                {activeGoal.target_time_s && ` · Target ${formatDuration(activeGoal.target_time_s)}`}
              </p>
              {activeGoal.race_date && (() => {
                const remainingDays = daysUntil(activeGoal.race_date);
                return (
                  <p className="mt-1 text-sm font-medium text-primary">
                    {remainingDays === 0
                      ? "Oggi!"
                      : remainingDays === 1
                        ? "1 giorno al via"
                        : `${remainingDays} giorni al via`}
                    {" · "}
                    {new Date(activeGoal.race_date).toLocaleDateString("it-IT", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
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
    </AppShell>
  );
}

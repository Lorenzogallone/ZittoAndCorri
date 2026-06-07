import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { formatDistance, formatDuration, formatPace } from "@/lib/format";
import type { Activity } from "@/lib/types";
import type { Profile } from "@/lib/types";
import { Plus } from "lucide-react";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch profile for greeting
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle<Pick<Profile, "display_name">>();

  // Fetch last activity
  const { data: lastActivity } = await supabase
    .from("activities")
    .select(
      "id, started_at, type, distance_m, duration_s, avg_pace_s_km, avg_hr",
    )
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle<
      Pick<
        Activity,
        | "id"
        | "started_at"
        | "type"
        | "distance_m"
        | "duration_s"
        | "avg_pace_s_km"
        | "avg_hr"
      >
    >();

  const greeting = profile?.display_name
    ? profile.display_name.split(" ")[0]
    : user.email?.split("@")[0] ?? "Runner";

  const TYPE_LABELS: Record<string, string> = {
    easy: "Easy",
    tempo: "Tempo",
    interval: "Ripetute",
    long: "Lungo",
    race: "Gara",
    recovery: "Recupero",
    cross: "Cross",
  };

  return (
    <AppShell>
      {/* Greeting */}
      <div className="mb-8">
        <p className="text-sm text-muted-foreground mb-1">Bentornato</p>
        <h1 className="text-3xl font-bold tracking-tight">
          Ciao {greeting} 👋
        </h1>
      </div>

      {/* Last Run Card */}
      {lastActivity ? (
        <Link href={`/activities/${lastActivity.id}`} className="block mb-6">
          <div className="relative overflow-hidden rounded-2xl bg-card border border-white/[0.06] p-6 glow-coral-sm transition-transform duration-200 active:scale-[0.98]">
            {/* Subtle gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.08] to-transparent pointer-events-none" />

            <div className="relative">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
                Ultima corsa
              </p>
              <div className="flex items-baseline gap-1.5 mb-2">
                <span className="text-4xl font-bold tabular-nums tracking-tight">
                  {formatDistance(lastActivity.distance_m)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="text-primary font-medium">
                  {TYPE_LABELS[lastActivity.type] ?? lastActivity.type}
                </span>
                <span className="opacity-30">·</span>
                <span className="tabular-nums">{formatDuration(lastActivity.duration_s)}</span>
                <span className="opacity-30">·</span>
                <span className="tabular-nums">{formatPace(lastActivity.avg_pace_s_km)}</span>
                {lastActivity.avg_hr != null && (
                  <>
                    <span className="opacity-30">·</span>
                    <span className="tabular-nums">{lastActivity.avg_hr} bpm</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </Link>
      ) : (
        <div className="rounded-2xl bg-card border border-white/[0.06] p-6 mb-6 text-center">
          <p className="text-muted-foreground text-sm mb-4">
            Nessuna corsa ancora registrata.
          </p>
          <Button asChild>
            <Link href="/activities/new">Registra la prima</Link>
          </Button>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Button asChild size="lg" className="w-full">
          <Link href="/activities/new">
            <Plus size={18} />
            Nuova corsa
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="w-full">
          <Link href="/activities">
            Le mie corse
          </Link>
        </Button>
      </div>
    </AppShell>
  );
}

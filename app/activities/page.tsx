import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { formatDistance, formatDuration, formatPace } from "@/lib/format";
import type { Activity } from "@/lib/types";
import { Plus, Activity as ActivityIcon } from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  easy: "Easy",
  tempo: "Tempo",
  interval: "Ripetute",
  long: "Lungo",
  race: "Gara",
  recovery: "Recupero",
  cross: "Cross",
};

const TYPE_COLORS: Record<string, string> = {
  easy: "bg-emerald-500/15 text-emerald-400",
  tempo: "bg-amber-500/15 text-amber-400",
  interval: "bg-red-500/15 text-red-400",
  long: "bg-blue-500/15 text-blue-400",
  race: "bg-primary/15 text-primary",
  recovery: "bg-teal-500/15 text-teal-400",
  cross: "bg-purple-500/15 text-purple-400",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
  });
}

export default async function ActivitiesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: activities } = await supabase
    .from("activities")
    .select(
      "id, started_at, type, distance_m, duration_s, avg_pace_s_km, avg_hr",
    )
    .order("started_at", { ascending: false })
    .returns<
      Pick<
        Activity,
        | "id"
        | "started_at"
        | "type"
        | "distance_m"
        | "duration_s"
        | "avg_pace_s_km"
        | "avg_hr"
      >[]
    >();

  return (
    <AppShell
      title="Le mie corse"
      headerAction={
        <Button asChild size="sm">
          <Link href="/activities/new">
            <Plus size={16} />
            Nuova
          </Link>
        </Button>
      }
    >
      {!activities || activities.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <ActivityIcon size={28} className="text-muted-foreground" />
          </div>
          <div>
            <p className="text-foreground font-medium mb-1">Nessuna corsa</p>
            <p className="text-muted-foreground text-sm">
              Inizia a tracciare i tuoi allenamenti.
            </p>
          </div>
          <Button asChild>
            <Link href="/activities/new">
              <Plus size={16} />
              Nuova corsa
            </Link>
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {activities.map((a) => (
            <Link
              key={a.id}
              href={`/activities/${a.id}`}
              className="block rounded-2xl bg-card border border-white/[0.06] p-4 transition-all duration-200 active:scale-[0.98] hover:bg-card/80"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium ${
                        TYPE_COLORS[a.type] ?? "bg-muted text-muted-foreground"
                      }`}
                    >
                      {TYPE_LABELS[a.type] ?? a.type}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(a.started_at)}
                    </span>
                  </div>
                  <span className="text-xl font-bold tabular-nums tracking-tight">
                    {formatDistance(a.distance_m)}
                  </span>
                </div>
                <div className="text-right text-sm text-muted-foreground tabular-nums">
                  <div>{formatDuration(a.duration_s)}</div>
                  <div className="text-xs">{formatPace(a.avg_pace_s_km)}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}

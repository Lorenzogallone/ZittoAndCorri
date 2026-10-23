import Link from "next/link";
import { redirect } from "next/navigation";
import { Footprints, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { TotalsCard } from "@/components/totals-card";
import { ActivitiesList, type ListActivity } from "@/components/activities-list";
import { periodTotals } from "@/lib/metrics/totals";
import { romeDay } from "@/lib/local-date";

export default async function ActivitiesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: activities }, { data: pendingEvaluationJobs }] = await Promise.all([
    supabase
      .from("activities")
      .select("id, started_at, type, sport, distance_m, duration_s, moving_time_s, avg_pace_s_km, elevation_gain_m, source_title")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .returns<ListActivity[]>(),
    supabase.from("ai_jobs").select("ref_id").eq("user_id", user.id).eq("kind", "evaluation").eq("status", "pending").returns<Array<{ ref_id: string | null }>>(),
  ]);

  const list = activities ?? [];
  const pendingActivityIds = new Set((pendingEvaluationJobs ?? []).flatMap((job) => job.ref_id ? [job.ref_id] : []));
  const totals = periodTotals(list, romeDay());
  return (
    <AppShell
      title="Corse"
      headerAction={
        <Button asChild size="icon-sm" className="rounded-full" aria-label="Registra un'attività">
          <Link href="/activities/new">
            <Plus size={18} />
          </Link>
        </Button>
      }
    >
      {list.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <span className="flex h-18 w-18 items-center justify-center rounded-3xl bg-hero text-hero-foreground">
            <Footprints size={30} strokeWidth={2.2} className="text-primary" />
          </span>
          <p className="mt-6 font-display text-title font-bold tracking-tight">Ancora nessuna corsa</p>
          <p className="mt-2 max-w-xs text-body text-muted-foreground">Importa un file dall&apos;orologio o registrala a mano.</p>
          <Button asChild className="mt-6">
            <Link href="/activities/new"><Plus size={16} /> Nuova attività</Link>
          </Button>
        </div>
      ) : (
        <div className="stagger">
          <TotalsCard periods={totals} />
          <ActivitiesList activities={list} analyzing={pendingActivityIds} />
        </div>
      )}
    </AppShell>
  );
}

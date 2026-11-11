import Link from "next/link";
import { redirect } from "next/navigation";
import { Footprints, Link2, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { TotalsCard } from "@/components/totals-card";
import { ActivitiesList, type ListActivity } from "@/components/activities-list";
import { periodTotals } from "@/lib/metrics/totals";
import { romeDay } from "@/lib/local-date";
import { scheduleIntervalsImportIfStale } from "@/lib/intervals/sync";

export default async function ActivitiesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  scheduleIntervalsImportIfStale(user.id);

  const [{ data: activities }, { data: pendingEvaluationJobs }] = await Promise.all([
    supabase
      .from("activities")
      .select("id, started_at, type, sport, distance_m, duration_s, moving_time_s, avg_pace_s_km, elevation_gain_m, source_title, excluded_at")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .returns<ListActivity[]>(),
    supabase.from("ai_jobs").select("ref_id").eq("user_id", user.id).eq("kind", "evaluation").eq("status", "pending").returns<Array<{ ref_id: string | null }>>(),
  ]);

  const list = activities ?? [];
  const pendingActivityIds = new Set((pendingEvaluationJobs ?? []).flatMap((job) => job.ref_id ? [job.ref_id] : []));
  // Le corse escluse restano in elenco (con etichetta) ma fuori dai totali.
  const totals = periodTotals(list.filter((activity) => !activity.excluded_at), romeDay());
  return (
    <AppShell
      wide
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
        <EmptyState
          icon={Footprints}
          title="Qui vedrai le tue corse"
          text="Distanza, passo e l'analisi del coach per ogni uscita. Importa un file dall'orologio o registrala a mano."
          action={{ href: "/activities/new", label: "Importa una corsa", icon: Plus }}
          secondary={{ href: "/settings?tab=links", label: "Collega Intervals.icu", icon: Link2 }}
        />
      ) : (
        // Desktop: totali fissi a sinistra (su tutte le righe), mesi a destra.
        // Niente contenitori in più: sul telefono la sequenza animata resta uguale.
        <div className="stagger lg:grid lg:grid-cols-[20rem_minmax(0,1fr)] lg:gap-x-8 3xl:grid-cols-[24rem_minmax(0,1fr)] 3xl:gap-x-10 lg:[&>section:nth-of-type(2)]:mt-0">
          <TotalsCard periods={totals} className="lg:sticky lg:top-0 lg:col-start-1 lg:row-span-[999] lg:row-start-1 lg:self-start" />
          <ActivitiesList activities={list} analyzing={pendingActivityIds} />
        </div>
      )}
    </AppShell>
  );
}

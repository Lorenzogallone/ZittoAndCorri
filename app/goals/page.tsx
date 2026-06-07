import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { deleteGoal, setActiveGoal } from "./actions";
import { formatDistance, formatDuration } from "@/lib/format";
import type { Goal } from "@/lib/types";
import { Plus, Pencil } from "lucide-react";

function weeksLeft(raceDate: string | null): number | null {
  if (!raceDate) return null;
  const diff = new Date(raceDate).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (7 * 24 * 3600 * 1000)));
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

interface GoalCardProps {
  goal: Goal;
  isActive: boolean;
}

function GoalCard({ goal, isActive }: GoalCardProps) {
  const weeks = weeksLeft(goal.race_date);
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-5 ${
        isActive
          ? "bg-card border-primary/30 glow-coral-sm"
          : "bg-card border-white/[0.06]"
      }`}
    >
      {isActive && (
        <span className="absolute top-3 right-3 text-[10px] font-semibold uppercase tracking-wider text-primary bg-primary/10 rounded-full px-2 py-0.5">
          Attivo
        </span>
      )}

      <h2 className="text-lg font-semibold pr-16">{goal.race_name}</h2>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span>{formatDate(goal.race_date)}</span>
        <span>{formatDistance(goal.distance_m)}</span>
        {goal.target_time_s && (
          <span>Target {formatDuration(goal.target_time_s)}</span>
        )}
        {weeks !== null && (
          <span className={weeks <= 4 ? "text-primary font-medium" : ""}>
            {weeks} {weeks === 1 ? "settimana" : "settimane"} rimaste
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={`/goals/${goal.id}/edit`}>
            <Pencil size={14} />
            Modifica
          </Link>
        </Button>

        {!isActive && (
          <form action={setActiveGoal}>
            <input type="hidden" name="id" value={goal.id} />
            <Button variant="outline" size="sm" type="submit">
              Rendi attivo
            </Button>
          </form>
        )}

        <form action={deleteGoal}>
          <input type="hidden" name="id" value={goal.id} />
          <Button
            variant="outline"
            size="sm"
            type="submit"
            className="text-destructive hover:text-destructive"
          >
            Elimina
          </Button>
        </form>
      </div>
    </div>
  );
}

export default async function GoalsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: goals } = await supabase
    .from("goals")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .returns<Goal[]>();

  const activeGoal = goals?.find((g) => g.is_active) ?? null;
  const otherGoals = goals?.filter((g) => !g.is_active) ?? [];

  return (
    <AppShell
      title="Obiettivi"
      headerAction={
        <Button asChild size="sm">
          <Link href="/goals/new">
            <Plus size={16} />
            Nuovo
          </Link>
        </Button>
      }
    >
      {/* Nessun goal */}
      {(!goals || goals.length === 0) && (
        <div className="rounded-2xl bg-card border border-white/[0.06] p-8 text-center">
          <p className="text-muted-foreground text-sm mb-4">
            Nessun obiettivo ancora. Aggiungine uno per pianificare gli allenamenti.
          </p>
          <Button asChild>
            <Link href="/goals/new">
              <Plus size={16} />
              Nuovo obiettivo
            </Link>
          </Button>
        </div>
      )}

      {/* Goal attivo in evidenza */}
      {activeGoal && (
        <div className="mb-6">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
            Obiettivo attivo
          </p>
          <GoalCard goal={activeGoal} isActive />
        </div>
      )}

      {/* Altri goal */}
      {otherGoals.length > 0 && (
        <div className="flex flex-col gap-3">
          {activeGoal && (
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              Altri obiettivi
            </p>
          )}
          {otherGoals.map((g) => (
            <GoalCard key={g.id} goal={g} isActive={false} />
          ))}
        </div>
      )}
    </AppShell>
  );
}

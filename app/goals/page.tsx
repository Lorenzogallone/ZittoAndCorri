import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { intlLocale, type Locale } from "@/i18n/config";
import { useTranslations } from "next-intl";
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

function formatDate(iso: string | null, locale: Locale): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(intlLocale(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

interface GoalCardProps {
  goal: Goal;
  isActive: boolean;
  locale: Locale;
}

function GoalCard({ goal, isActive, locale }: GoalCardProps) {
  const t = useTranslations("goals.card");
  const weeks = weeksLeft(goal.race_date);
  return (
    <div
      className={`surface relative overflow-hidden p-5 ${isActive ? "ring-2 ring-primary/30" : ""}`}
    >
      {isActive && (
        <span className="absolute top-3 right-3 text-micro font-semibold uppercase tracking-wider text-primary bg-primary/10 rounded-full px-2 py-0.5">
          {t("active")}
        </span>
      )}

      <h2 className="text-heading font-semibold pr-16">{goal.race_name}</h2>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span>{goal.race_date ? formatDate(goal.race_date, locale) : t("general")}</span>
        <span>{formatDistance(goal.distance_m, locale)}</span>
        {goal.target_time_s && (
          <span>{t("target", { time: formatDuration(goal.target_time_s) })}</span>
        )}
        {weeks !== null && (
          <span className={weeks <= 4 ? "text-primary font-medium" : ""}>
            {t("weeksLeft", { weeks })}
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={`/goals/${goal.id}/edit`}>
            <Pencil size={14} />
            {t("edit")}
          </Link>
        </Button>

        {!isActive && (
          <form action={setActiveGoal}>
            <input type="hidden" name="id" value={goal.id} />
            <Button variant="outline" size="sm" type="submit">
              {t("makeActive")}
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
            {t("delete")}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default async function GoalsPage() {
  const t = await getTranslations("goals");
  const locale = (await getLocale()) as Locale;
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
      title={t("title")}
      headerAction={
        <Button asChild size="sm">
          <Link href="/goals/new">
            <Plus size={16} />
            {t("list.newButton")}
          </Link>
        </Button>
      }
    >
      {/* No goal */}
      {(!goals || goals.length === 0) && (
        <div className="surface p-8 text-center">
          <p className="mb-4 text-sm text-muted-foreground">
            {t("list.empty")}
          </p>
          <Button asChild>
            <Link href="/goals/new">
              <Plus size={16} />
              {t("list.newGoal")}
            </Link>
          </Button>
        </div>
      )}

      {/* Active goal highlighted */}
      {activeGoal && (
        <div className="mb-6">
          <p className="mb-2 px-1 text-caption font-medium text-muted-foreground">{t("list.active")}</p>
          <GoalCard goal={activeGoal} isActive locale={locale} />
        </div>
      )}

      {/* Other goals */}
      {otherGoals.length > 0 && (
        <div className="flex flex-col gap-3">
          {activeGoal && (
            <p className="px-1 text-caption font-medium text-muted-foreground">{t("list.others")}</p>
          )}
          {otherGoals.map((g) => (
            <GoalCard key={g.id} goal={g} isActive={false} locale={locale} />
          ))}
        </div>
      )}
    </AppShell>
  );
}

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { intlLocale, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import type { PaceCheck } from "@/lib/metrics/pace-check";

export interface PaceSession {
  id: string;
  started_at: string;
  check: PaceCheck;
}

const STATUS_TONE = {
  on_target: "bg-emerald-500",
  fast: "bg-sky-500",
  slow: "bg-amber-500",
} as const;

function deviationText(seconds: number, ok: string): string {
  if (seconds === 0) return ok;
  return `${seconds > 0 ? "+" : "−"}${Math.abs(seconds)}″`;
}

/**
 * The latest sessions with a target pace: if the gap repeats in the same
 * direction, it suggests asking the coach to update the paces.
 */
export function PaceHistory({ sessions }: { sessions: PaceSession[] }) {
  const t = useTranslations("profile.pace");
  const locale = useLocale() as Locale;
  const ordered = [...sessions].reverse();
  const latest = sessions.slice(0, 3).map((session) => session.check.status);
  const trend = latest.length === 3 && latest.every((status) => status === latest[0]) && latest[0] !== "on_target"
    ? latest[0]
    : null;
  return (
    <div>
      <div className="grid grid-cols-5 gap-2">
        {ordered.map((session) => (
          <Link key={session.id} href={`/activities/${session.id}`} className="pressable flex flex-col items-center gap-1.5 rounded-xl py-2 hover:bg-muted/40">
            <span className={cn("h-2.5 w-2.5 rounded-full", STATUS_TONE[session.check.status])} title={t(`status.${session.check.status}`)} />
            <span className="text-sm font-semibold tabular-nums">{deviationText(session.check.avg_deviation_s, t("deviationOk"))}</span>
            <span className="text-micro text-muted-foreground">
              {new Date(session.started_at).toLocaleDateString(intlLocale(locale), { day: "numeric", month: "short" })}
            </span>
          </Link>
        ))}
      </div>
      <p className="mt-2 text-micro text-muted-foreground">
        {t("legend")}
      </p>
      {trend && (
        <div className="mt-4 rounded-2xl bg-muted/50 px-4 py-3">
          <p className="text-sm">
            {t(`trendText.${trend}`)}
          </p>
          <Link href={`/?prompt=${encodeURIComponent(t(`prompt.${trend}`))}`} className="mt-2 inline-block text-sm font-medium text-primary">
            {t("askCoach")}
          </Link>
        </div>
      )}
    </div>
  );
}

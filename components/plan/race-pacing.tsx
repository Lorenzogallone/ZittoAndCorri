import { Flag } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatDuration, formatPace } from "@/lib/format";
import { racePacing } from "@/lib/plan/race";
import { adjustPace } from "@/lib/metrics/heat";

/** Strategia di gara a ritmo costante con i tempi di passaggio. */
export function RacePacingCard({
  distance_m,
  target_s,
  source,
  advice,
  heatPct = 0,
}: {
  distance_m: number;
  target_s: number;
  source: "goal" | "prediction";
  /** Passo di partenza consigliato dalla previsione, quando l'obiettivo è ambizioso o fuori forbice. */
  advice?: string;
  heatPct?: number;
}) {
  const t = useTranslations("plan.race");
  const pacing = racePacing(distance_m, target_s);
  if (!pacing) return null;
  const hotPace = heatPct > 0 ? adjustPace(pacing.pace_s_km, heatPct) : null;
  return (
    <section className="mb-8">
      <h2 className="mb-1 flex items-center gap-2 text-base font-semibold tracking-tight">
        <Flag size={16} className="text-primary" /> {t("title")}
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        {t.rich(source === "goal" ? "goal" : "prediction", {
          time: formatDuration(target_s),
          pace: formatPace(pacing.pace_s_km),
          b: (chunks) => <span className="font-semibold text-foreground tabular-nums">{chunks}</span>,
        })}
        {hotPace && <>{" "}{t("heat", { pace: formatPace(hotPace) })}</>}
      </p>
      {advice && <p className="-mt-2 mb-4 text-sm text-muted-foreground">{t("advice", { advice: advice.charAt(0).toLowerCase() + advice.slice(1) })}</p>}
      <ol className="divide-y divide-border/60 rounded-2xl border border-border">
        {pacing.checkpoints.map((checkpoint) => (
          <li key={checkpoint.meters} className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span className={checkpoint.label === "Arrivo" ? "font-semibold" : "text-muted-foreground"}>{checkpoint.label}</span>
            <span className="font-medium tabular-nums">{formatDuration(checkpoint.elapsed_s)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

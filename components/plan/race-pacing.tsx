import { Flag } from "lucide-react";
import { formatDuration, formatPace } from "@/lib/format";
import { racePacing } from "@/lib/plan/race";
import { adjustPace } from "@/lib/metrics/heat";

/** Strategia di gara a ritmo costante con i tempi di passaggio. */
export function RacePacingCard({
  distance_m,
  target_s,
  source,
  heatPct = 0,
}: {
  distance_m: number;
  target_s: number;
  source: "goal" | "prediction";
  heatPct?: number;
}) {
  const pacing = racePacing(distance_m, target_s);
  if (!pacing) return null;
  const hotPace = heatPct > 0 ? adjustPace(pacing.pace_s_km, heatPct) : null;
  return (
    <section className="mb-8">
      <h2 className="mb-1 flex items-center gap-2 text-base font-semibold tracking-tight">
        <Flag size={16} className="text-primary" /> Strategia di gara
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        {source === "goal" ? "Per il tuo tempo obiettivo" : "Per il tempo che oggi sei in grado di fare"}{" "}
        <span className="font-semibold text-foreground tabular-nums">{formatDuration(target_s)}</span> tieni{" "}
        <span className="font-semibold text-foreground tabular-nums">{formatPace(pacing.pace_s_km)}</span>.
        {" "}Parti qualche secondo più piano nei primi km, poi stabilizzati.
        {hotPace && <> Con il caldo previsto punta piuttosto a {formatPace(hotPace)}.</>}
      </p>
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

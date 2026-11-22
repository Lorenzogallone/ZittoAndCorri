import { ChevronDown } from "lucide-react";
import { formatDuration } from "@/lib/format";
import {
  goalRaceRange,
  predictRaceTimes,
  rangeExplanation,
  rangeLabel,
  type PredictionReference,
} from "@/lib/metrics/race-prediction";
import type { EnduranceBase } from "@/lib/metrics/predict";

/**
 * Tempi che oggi sei in grado di correre: una forbice ottimistica–prudente
 * attorno alla stima centrale, dalla prestazione migliore recente e dalla
 * base di resistenza (volume e lungo).
 */
export function Predictions({
  reference,
  base,
  today,
  goal,
}: {
  reference: PredictionReference;
  base: EnduranceBase;
  today: string;
  goal: { race_name: string; distance_m: number; target_time_s: number | null } | null;
}) {
  const times = predictRaceTimes(reference, base, today);
  const forGoal = goal ? goalRaceRange(reference, base, goal, today) : null;
  // Senza obiettivo la spiegazione si riferisce alla mezza, la distanza tipica.
  const half = times.find((time) => time.meters === 21_097)!;
  const explanation = forGoal?.explanation ?? rangeExplanation(reference, half.range, base, today);
  return (
    <div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
        {times.map((time) => (
          <div key={time.label}>
            <dt className="text-xs text-muted-foreground">{time.label}</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums">{formatDuration(time.range.central_s)}</dd>
            {time.range.prudent_s - time.range.optimistic_s >= 60 && (
              <dd className="text-caption text-muted-foreground tabular-nums">{rangeLabel(time.range)}</dd>
            )}
          </div>
        ))}
      </dl>
      {goal && forGoal && (
        <div className="mt-4 rounded-2xl bg-muted/50 px-4 py-3 text-sm">
          <p>
            <span className="font-medium">{goal.race_name}</span>: tra{" "}
            <span className="font-semibold tabular-nums">{formatDuration(forGoal.range.optimistic_s)}</span> e{" "}
            <span className="font-semibold tabular-nums">{formatDuration(forGoal.range.prudent_s)}</span>, più probabile{" "}
            <span className="font-semibold tabular-nums">{formatDuration(forGoal.range.central_s)}</span>.
          </p>
          <p className="mt-1 text-pretty">{forGoal.advice_text}</p>
        </div>
      )}
      {/* Su quali dati si basa: a richiesta, per non appesantire la scheda. */}
      <details className="group mt-2 text-caption">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 font-medium text-primary [&::-webkit-details-marker]:hidden">
          Come lo prevedo
          <ChevronDown size={14} aria-hidden className="transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" />
        </summary>
        <p className="text-pretty text-muted-foreground">{explanation}</p>
      </details>
    </div>
  );
}

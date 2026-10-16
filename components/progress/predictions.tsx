import { formatDuration } from "@/lib/format";
import { predictTime, predictRaceTimes, type PredictionReference } from "@/lib/metrics/race-prediction";

function gapLabel(predicted: number, target: number): string {
  const diff = predicted - target;
  if (Math.abs(diff) < 30) return "sei in linea con l'obiettivo";
  const minutes = Math.floor(Math.abs(diff) / 60);
  const seconds = Math.abs(diff) % 60;
  const amount = minutes ? `${minutes}′${String(seconds).padStart(2, "0")}″` : `${seconds}″`;
  return diff > 0 ? `ti mancano ${amount} all'obiettivo` : `sei ${amount} sotto l'obiettivo`;
}

/** Tempi che oggi sei in grado di correre, dalla prestazione migliore recente. */
export function Predictions({
  reference,
  goal,
}: {
  reference: PredictionReference;
  goal: { race_name: string; distance_m: number; target_time_s: number | null } | null;
}) {
  const times = predictRaceTimes(reference);
  const goalPredicted = goal ? predictTime(reference, goal.distance_m) : null;
  return (
    <div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
        {times.map((time) => (
          <div key={time.label}>
            <dt className="text-xs text-muted-foreground">{time.label}</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums">{formatDuration(time.time_s)}</dd>
          </div>
        ))}
      </dl>
      {goal?.target_time_s && goalPredicted && (
        <p className="mt-4 rounded-2xl bg-muted/50 px-4 py-3 text-sm">
          <span className="font-medium">{goal.race_name}</span>: previsione {formatDuration(goalPredicted)},{" "}
          {gapLabel(goalPredicted, goal.target_time_s)}.
        </p>
      )}
    </div>
  );
}

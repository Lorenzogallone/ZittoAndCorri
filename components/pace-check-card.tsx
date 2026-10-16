import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatPace } from "@/lib/format";
import { formatStepPace } from "@/lib/workout-guide";
import type { PaceCheck } from "@/lib/metrics/pace-check";

const STATUS = {
  on_target: { label: "In linea con il piano", dot: "bg-emerald-500" },
  fast: { label: "Più veloce del previsto", dot: "bg-sky-500" },
  slow: { label: "Più lento del previsto", dot: "bg-amber-500" },
} as const;

function repTone(deviation: number): string {
  if (deviation < 0) return "border-sky-500/40 text-sky-700 dark:text-sky-300";
  if (deviation > 0) return "border-amber-500/50 text-amber-700 dark:text-amber-300";
  return "border-emerald-500/40 text-emerald-700 dark:text-emerald-300";
}

/** Passo reale dei tratti veloci contro il range previsto dalla seduta. */
export function PaceCheckCard({ check, workoutId }: { check: PaceCheck; workoutId: string }) {
  const status = STATUS[check.status];
  const ranges = [...new Set(check.reps.map((rep) => formatStepPace({
    pace_min_s_km: rep.target_min,
    pace_max_s_km: rep.target_max,
  } as Parameters<typeof formatStepPace>[0])).filter(Boolean))];
  const single = check.reps.length === 1;
  return (
    <section className="mb-4 rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{single ? "Passo del tratto principale" : "Passo delle ripetute"}</h2>
        <Link href={`/plan/${workoutId}`} className="text-xs text-primary">Seduta</Link>
      </div>
      <p className="flex items-center gap-2 text-base font-semibold">
        <span className={cn("h-2.5 w-2.5 rounded-full", status.dot)} />
        {status.label}
        {check.status !== "on_target" && (
          <span className="font-normal text-muted-foreground tabular-nums">
            ({check.avg_deviation_s > 0 ? "+" : "−"}{Math.abs(check.avg_deviation_s)}″/km)
          </span>
        )}
      </p>
      {ranges.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Obiettivo {ranges.join(", ")}</p>}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {check.reps.map((rep, index) => (
          <span
            key={index}
            className={cn("rounded-lg border px-2 py-1 text-xs font-medium tabular-nums", repTone(rep.deviation_s))}
            title={`Tratto ${index + 1}`}
          >
            {formatPace(rep.pace_s_km).replace("/km", "")}
          </span>
        ))}
      </div>
    </section>
  );
}

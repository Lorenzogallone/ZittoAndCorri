import { cn } from "@/lib/utils";
import type { ATLCTLResult } from "@/lib/types";
import type { ZeppDailyMetric, ZeppReadinessResult } from "@/lib/zepp/types";

const INTERNAL = {
  calibrating: { label: "In calibrazione", text: "Ancora qualche corsa e la lettura diventa stabile.", tone: "text-foreground" },
  fresh: { label: "Ben recuperato", text: "Hai margine: buon momento per una seduta impegnativa.", tone: "text-emerald-600 dark:text-emerald-400" },
  balanced: { label: "In equilibrio", text: "Forma e fatica sono bilanciate.", tone: "text-emerald-600 dark:text-emerald-400" },
  strained: { label: "Un po' carico", text: "Il lavoro recente pesa: cura il recupero.", tone: "text-amber-600 dark:text-amber-400" },
  fatigued: { label: "Affaticato", text: "Meglio una giornata leggera o di riposo.", tone: "text-orange-600 dark:text-orange-400" },
} satisfies Record<ATLCTLResult["status"], { label: string; text: string; tone: string }>;

const ZEPP = {
  intense: { label: "Pronto per spingere", text: "Recupero e sonno dicono che puoi fare una seduta intensa.", tone: "text-emerald-600 dark:text-emerald-400" },
  ready: { label: "Pronto", text: "Buone condizioni per allenarti come da piano.", tone: "text-emerald-600 dark:text-emerald-400" },
  moderate: { label: "Carico moderato", text: "Allenati, ma senza forzare.", tone: "text-amber-600 dark:text-amber-400" },
  recovery: { label: "Recupero consigliato", text: "Meglio qualcosa di facile oggi.", tone: "text-orange-600 dark:text-orange-400" },
  rest: { label: "Riposo", text: "Riposo o attività molto leggera.", tone: "text-orange-600 dark:text-orange-400" },
} as const;

function ScoreRing({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="relative h-16 w-16 shrink-0" role="img" aria-label={`Prontezza ${clamped} su 100`}>
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
        <circle cx="32" cy="32" r="27" fill="none" stroke="var(--muted)" strokeWidth="5" />
        <circle
          cx="32"
          cy="32"
          r="27"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="5"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={100}
          strokeDashoffset={100 - clamped}
          className="animate-ring"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-lg font-bold tabular-nums">{clamped}</span>
    </div>
  );
}

function sleepLabel(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}′`;
}

/** Stato di forma in una riga, con i pochi dati dell'orologio che contano. */
export function FormStatus({
  load,
  readiness,
  latest,
  stale,
  hasData,
}: {
  load: ATLCTLResult;
  readiness: ZeppReadinessResult | null;
  latest: ZeppDailyMetric | null;
  stale: boolean;
  hasData: boolean;
}) {
  const assisted = readiness?.available && readiness.status ? ZEPP[readiness.status] : null;
  const state = assisted ?? INTERNAL[load.status];
  const metrics = latest
    ? [
        latest.sleep_total_min != null ? { label: "Sonno", value: sleepLabel(latest.sleep_total_min) } : null,
        latest.resting_hr != null ? { label: "FC a riposo", value: `${latest.resting_hr}` } : null,
        latest.vo2_max != null ? { label: "VO₂max", value: `${latest.vo2_max}` } : null,
      ].filter((metric): metric is { label: string; value: string } => metric != null)
    : [];

  if (!hasData) {
    return (
      <section className="surface p-5">
        <p className="text-xs text-muted-foreground">Stato di forma</p>
        <p className="mt-1 text-sm text-muted-foreground">Registra le prime corse per vedere come stai.</p>
      </section>
    );
  }

  return (
    <section className="surface p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Stato di forma</p>
          <p className={cn("mt-1 text-2xl font-bold tracking-tight", state.tone)}>{state.label}</p>
          <p className="mt-1 text-sm leading-snug text-muted-foreground">{state.text}</p>
        </div>
        {readiness?.available && readiness.score != null && <ScoreRing value={readiness.score} />}
      </div>
      {metrics.length > 0 && (
        <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-border/60 pt-4">
          {metrics.map((metric) => (
            <div key={metric.label}>
              <dt className="text-[11px] text-muted-foreground">{metric.label}</dt>
              <dd className="mt-0.5 text-base font-semibold tabular-nums">{metric.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {stale && (
        <p className="mt-4 text-xs text-muted-foreground">
          L&apos;orologio non si sincronizza da qualche giorno: per ora conto solo le tue attività.
        </p>
      )}
    </section>
  );
}

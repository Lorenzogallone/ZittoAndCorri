import { HeartPulse, Moon, Wind } from "lucide-react";
import { cn } from "@/lib/utils";
import { Stat } from "@/components/stat";
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

/** Anello di prontezza: l'arco prende il colore dello stato (verde, ambra,
 *  arancio) come l'etichetta accanto, non l'accento. */
function ScoreRing({ value, tone }: { value: number; tone: string }) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="relative h-28 w-28 shrink-0" role="img" aria-label={`Prontezza ${clamped} su 100`}>
      <svg viewBox="0 0 112 112" className={cn("h-28 w-28 -rotate-90", tone)}>
        <circle cx="56" cy="56" r="51" fill="none" strokeWidth="10" className="stroke-muted" />
        <circle
          cx="56"
          cy="56"
          r="51"
          fill="none"
          stroke="currentColor"
          strokeWidth="10"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={100}
          strokeDashoffset={100 - clamped}
          className="animate-ring"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-display text-display font-bold tabular-nums tracking-tight">{clamped}</span>
    </div>
  );
}

function sleepLabel(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}′`;
}

/** Hero del profilo: stato di forma, prontezza dell'orologio e i pochi dati che contano. */
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
        latest.sleep_total_min != null ? { label: "Sonno", value: sleepLabel(latest.sleep_total_min), icon: Moon } : null,
        latest.resting_hr != null ? { label: "FC riposo", value: `${latest.resting_hr}`, unit: "bpm", icon: HeartPulse } : null,
        latest.vo2_max != null ? { label: "VO₂max", value: `${latest.vo2_max}`, icon: Wind } : null,
      ].filter((metric) => metric != null)
    : [];

  if (!hasData) {
    return (
      <section className="surface p-5">
        <p className="eyebrow">Stato di forma</p>
        <p className="mt-2 text-body text-muted-foreground">Registra le prime corse per vedere come stai.</p>
      </section>
    );
  }

  const ring = readiness?.available && readiness.score != null ? readiness.score : null;
  return (
    <section className="surface p-5">
      <p className="eyebrow">Stato di forma</p>
      {ring != null ? (
        <div className="mt-4 flex items-center gap-5">
          <ScoreRing value={ring} tone={state.tone} />
          <div className="min-w-0">
            <p className={cn("font-display text-title font-bold tracking-tight text-balance", state.tone)}>{state.label}</p>
            <p className="mt-1.5 text-caption text-muted-foreground">{state.text}</p>
          </div>
        </div>
      ) : (
        // Senza orologio l'etichetta dello stato è l'elemento dominante.
        <div className="mt-2">
          <p className={cn("font-display text-display font-bold tracking-tight text-balance", state.tone)}>{state.label}</p>
          <p className="mt-2 text-body text-muted-foreground">{state.text}</p>
        </div>
      )}
      {metrics.length > 0 && (
        <div className="mt-5 grid grid-cols-3 gap-3 border-t border-border/60 pt-4">
          {metrics.map((metric) => (
            <Stat key={metric.label} size="sm" {...metric} />
          ))}
        </div>
      )}
      {stale && (
        <p className="mt-4 text-caption text-muted-foreground">
          L&apos;orologio non si sincronizza da qualche giorno: per ora conto solo le tue attività.
        </p>
      )}
    </section>
  );
}

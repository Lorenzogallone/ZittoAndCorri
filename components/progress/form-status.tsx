import Link from "next/link";
import { Activity, ChevronRight, HeartPulse, Moon, Wind, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Stat } from "@/components/stat";
import { TrendBadge } from "@/components/progress/trend-badge";
import type { MetricTrend } from "@/lib/metrics/body-trends";
import type { ATLCTLResult } from "@/lib/types";
import type { WellnessDay, ZeppDailyMetric, ZeppReadinessResult } from "@/lib/zepp/types";

export const LOAD_STATES = {
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

/** "oggi alle 07:42", "ieri alle 22:10", "3 nov alle 08:00" (ora di Roma). */
function syncLabel(iso: string, now = new Date()): string {
  const day = (date: Date) => date.toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
  const date = new Date(iso);
  const time = date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
  const yesterday = new Date(now.getTime() - 86_400_000);
  if (day(date) === day(now)) return `oggi alle ${time}`;
  if (day(date) === day(yesterday)) return `ieri alle ${time}`;
  const dayLabel = date.toLocaleDateString("it-IT", { day: "numeric", month: "short", timeZone: "Europe/Rome" });
  return `${dayLabel} alle ${time}`;
}

function sleepLabel(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}′`;
}

/** Metrica in evidenza sotto lo stato: valore, e sotto il verso del trend o una nota. */
export interface FormHighlight {
  label: string;
  value: string;
  unit?: string;
  icon: LucideIcon;
  trend?: Pick<MetricTrend, "direction" | "recent" | "previous">;
  note?: string;
}

/** Hero del profilo: stato di forma, prontezza dell'orologio e i pochi dati che contano.
 *  Con `href` tutta la card apre la vista di analisi. */
export function FormStatus({
  load,
  readiness,
  latest,
  wellness = null,
  stale,
  lastSync = null,
  hasData,
  highlights,
  href,
}: {
  load: ATLCTLResult;
  readiness: ZeppReadinessResult | null;
  latest: ZeppDailyMetric | null;
  /** Giorno più recente da Intervals.icu: riempie i dati che Zepp non ha. */
  wellness?: WellnessDay | null;
  stale: boolean;
  /** Ultimo dato arrivato dall'orologio (Zepp o Intervals.icu). */
  lastSync?: string | null;
  hasData: boolean;
  /** Metriche in evidenza (VO₂max, carico, sonno); senza, quelle del giorno. */
  highlights?: FormHighlight[];
  href?: string;
}) {
  const assisted = readiness?.available && readiness.status ? ZEPP[readiness.status] : null;
  const state = assisted ?? LOAD_STATES[load.status];
  // Zepp quando c'è, altrimenti i dati notturni da Intervals.icu.
  const sleepMin = latest?.sleep_total_min ?? (wellness?.sleep_secs != null ? Math.round(wellness.sleep_secs / 60) : null);
  const restingHr = latest?.resting_hr ?? wellness?.resting_hr ?? null;
  const metrics = [
    sleepMin != null ? { label: "Sonno", value: sleepLabel(sleepMin), icon: Moon } : null,
    restingHr != null ? { label: "FC riposo", value: `${restingHr}`, unit: "bpm", icon: HeartPulse } : null,
    // Intervals.icu salva 0 quando la notte non ha HRV: non è una misura.
    wellness?.hrv != null && wellness.hrv > 0 ? { label: "HRV", value: `${Math.round(wellness.hrv)}`, unit: "ms", icon: Activity } : null,
    latest?.vo2_max != null ? { label: "VO₂max", value: `${latest.vo2_max}`, icon: Wind } : null,
  ].filter((metric) => metric != null).slice(0, 3);
  const shown: FormHighlight[] = highlights?.length ? highlights.slice(0, 3) : metrics;

  if (!hasData) {
    return (
      <section className="surface p-5">
        <p className="eyebrow">Stato di forma</p>
        <p className="mt-2 text-body text-muted-foreground">Registra le prime corse per vedere come stai.</p>
        <Link
          href="/activities/new"
          className="mt-4 inline-flex items-center gap-1 rounded-full bg-primary py-2 pl-4 pr-3 text-caption font-semibold text-primary-foreground transition-transform active:scale-95"
        >
          Importa una corsa <ChevronRight size={16} />
        </Link>
      </section>
    );
  }

  const ring = readiness?.available && readiness.score != null ? readiness.score : null;
  const Wrapper = href ? Link : "section";
  return (
    <Wrapper href={href!} className={cn("surface block p-5", href && "pressable outline-none focus-visible:ring-3 focus-visible:ring-ring/30")}>
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">Stato di forma</p>
        {href && (
          <span className="-my-1 inline-flex items-center gap-0.5 text-caption font-medium text-primary">
            Andamento <ChevronRight size={16} className="-mr-1" aria-hidden="true" />
          </span>
        )}
      </div>
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
      {shown.length > 0 && (
        <div className="mt-5 grid grid-cols-3 gap-3 border-t border-border/60 pt-4">
          {shown.map(({ trend, note, ...metric }) => (
            <div key={metric.label} className="min-w-0">
              <Stat size="sm" {...metric} />
              {trend?.direction ? (
                <TrendBadge trend={trend} className="mt-0.5" />
              ) : note ? (
                <p className="mt-0.5 truncate text-micro text-muted-foreground">{note}</p>
              ) : null}
            </div>
          ))}
        </div>
      )}
      {stale && (
        <p className="mt-4 text-caption text-muted-foreground">
          L&apos;orologio non si sincronizza da qualche giorno: per ora conto solo le tue attività.
        </p>
      )}
      {lastSync && (
        <p className={cn("text-micro text-muted-foreground", stale ? "mt-1" : "mt-3")}>
          Ultima sincronizzazione con l&apos;orologio: {syncLabel(lastSync)}
        </p>
      )}
    </Wrapper>
  );
}

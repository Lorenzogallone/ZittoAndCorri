import { Activity } from "lucide-react";
import type { ATLCTLResult } from "@/lib/types";
import type { ZeppConnectionView, ZeppDailyMetric, ZeppReadinessResult } from "@/lib/zepp/types";

type TechInfoCardProps = {
  load: ATLCTLResult;
  hasData: boolean;
  zepp?: {
    connection: ZeppConnectionView | null;
    latest: ZeppDailyMetric | null;
    readiness: ZeppReadinessResult;
  };
};

const ZEPP_STATUS = {
  intense: { label: "Pronto per una sessione intensa", color: "text-emerald-600 dark:text-emerald-400", background: "bg-emerald-500/10" },
  ready: { label: "Pronto per allenarti", color: "text-emerald-600 dark:text-emerald-400", background: "bg-emerald-500/10" },
  moderate: { label: "Carico moderato", color: "text-amber-600 dark:text-amber-400", background: "bg-amber-500/10" },
  recovery: { label: "Recupero consigliato", color: "text-orange-600 dark:text-orange-400", background: "bg-orange-500/10" },
  rest: { label: "Riposo o attività molto leggera", color: "text-orange-600 dark:text-orange-400", background: "bg-orange-500/10" },
} as const;

const STATUS = {
  calibrating: {
    label: "Dati in consolidamento",
    description: "Servono ancora alcune attività per offrire una lettura stabile.",
    color: "text-muted-foreground",
    background: "bg-muted/35",
  },
  fresh: {
    label: "Ben recuperato",
    description: "Hai un buon margine di recupero rispetto al lavoro recente.",
    color: "text-emerald-600 dark:text-emerald-400",
    background: "bg-emerald-500/10",
  },
  balanced: {
    label: "In equilibrio",
    description: "Forma e fatica sono ben bilanciate.",
    color: "text-emerald-600 dark:text-emerald-400",
    background: "bg-emerald-500/10",
  },
  strained: {
    label: "Recupero consigliato",
    description: "Il lavoro recente richiede più attenzione al recupero.",
    color: "text-amber-600 dark:text-amber-400",
    background: "bg-amber-500/10",
  },
  fatigued: {
    label: "Fatica elevata",
    description: "Le energie possono essere ridotte: valuta una giornata più leggera.",
    color: "text-orange-600 dark:text-orange-400",
    background: "bg-orange-500/10",
  },
} satisfies Record<
  ATLCTLResult["status"],
  { label: string; description: string; color: string; background: string }
>;

const METRICS = [
  {
    key: "load7" as const,
    label: "Carico recente",
    description: "Quanto è stato impegnativo il lavoro svolto di recente.",
  },
  {
    key: "atl" as const,
    label: "Fatica",
    description: "Quanto gli ultimi allenamenti possono pesare sulle energie di oggi.",
  },
  {
    key: "ctl" as const,
    label: "Forma",
    description: "La solidità costruita con la continuità degli allenamenti.",
  },
  {
    key: "tsb" as const,
    label: "Equilibrio",
    description: "Il rapporto attuale tra forma e fatica.",
  },
] as const;

export function TechInfoCard({ load, hasData, zepp }: TechInfoCardProps) {
  const state = STATUS[load.status];
  const assisted = zepp?.readiness.available && zepp.readiness.status
    ? ZEPP_STATUS[zepp.readiness.status]
    : null;
  const latest = zepp?.latest ?? null;

  return (
    <section className="mb-6 rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Activity size={18} />
        </span>
        <div>
          <h2 className="text-sm font-semibold">Stato di forma</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Una sintesi del tuo momento atletico.</p>
        </div>
      </div>

      {hasData ? (
        <div className="space-y-4">
          <div className={`rounded-xl px-4 py-3 ${(assisted ?? state).background}`}>
            <div className="flex items-center justify-between gap-3">
              <p className={`text-sm font-semibold ${(assisted ?? state).color}`}>
                {assisted?.label ?? state.label}
              </p>
              {zepp?.readiness.score != null && (
                <span className="text-xl font-bold tabular-nums">{zepp.readiness.score}</span>
              )}
            </div>
          </div>

          {latest && (
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-border/70 p-3 text-xs sm:grid-cols-3">
              <div><p className="text-muted-foreground">Carico Zepp</p><p className="mt-1 text-lg font-semibold tabular-nums">{latest.training_load ?? "—"}</p></div>
              <div><p className="text-muted-foreground">VO₂max</p><p className="mt-1 text-lg font-semibold tabular-nums">{latest.vo2_max ?? "—"}</p></div>
              <div><p className="text-muted-foreground">Recupero Zepp</p><p className="mt-1 font-semibold tabular-nums">{latest.recovery_raw == null ? "—" : assisted ? `${latest.recovery_raw} h` : `${latest.recovery_raw} (grezzo)`}</p></div>
              <div><p className="text-muted-foreground">Sonno</p><p className="mt-1 font-semibold tabular-nums">{latest.sleep_score == null ? "—" : `${latest.sleep_score}/100`}{latest.sleep_total_min == null ? "" : ` · ${Math.floor(latest.sleep_total_min / 60)}h ${latest.sleep_total_min % 60}m`}</p></div>
              <div><p className="text-muted-foreground">HR riposo</p><p className="mt-1 font-semibold tabular-nums">{latest.resting_hr == null ? "—" : `${latest.resting_hr} bpm`}</p></div>
              <div><p className="text-muted-foreground">FC max configurata</p><p className="mt-1 font-semibold tabular-nums">{latest.hr_zone_ranges?.at(-1) == null ? "—" : `${latest.hr_zone_ranges.at(-1)} bpm`}</p></div>
              <div><p className="text-muted-foreground">Stress medio</p><p className="mt-1 font-semibold tabular-nums">{latest.stress_avg ?? "—"}</p></div>
              <div><p className="text-muted-foreground">SpO₂ media</p><p className="mt-1 font-semibold tabular-nums">{latest.spo2_avg == null ? "—" : `${latest.spo2_avg}%`}</p></div>
              <div><p className="text-muted-foreground">PAI oggi</p><p className="mt-1 font-semibold tabular-nums">{latest.pai_today ?? "—"}</p></div>
              <div><p className="text-muted-foreground">Passi</p><p className="mt-1 font-semibold tabular-nums">{latest.steps?.toLocaleString("it-IT") ?? "—"}</p></div>
              <div><p className="text-muted-foreground">Calorie</p><p className="mt-1 font-semibold tabular-nums">{latest.calories == null ? "—" : `${latest.calories} kcal`}</p></div>
              <div><p className="text-muted-foreground">Ore in piedi</p><p className="mt-1 font-semibold tabular-nums">{latest.stand_hours ?? "—"}</p></div>
              {latest.hr_zone_ranges && (
                <p className="col-span-2 text-[11px] text-muted-foreground sm:col-span-3">
                  Zone Zepp: {latest.hr_zone_ranges.slice(0, 5).map((value, index) => `Z${index + 1} ${value}`).join(" · ")} bpm
                </p>
              )}
              <p className="col-span-2 border-t border-border/60 pt-2 text-[11px] text-muted-foreground sm:col-span-3">
                Aggiornato {new Date(latest.captured_at).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}
              </p>
            </div>
          )}

          {zepp?.readiness.available && (
            <details className="rounded-xl border border-border/60 px-3 py-2.5">
              <summary className="cursor-pointer text-xs font-medium text-primary">Come è calcolata la valutazione</summary>
              <div className="mt-3 space-y-2">
                {zepp.readiness.components.map((part) => (
                  <div key={part.key} className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-muted-foreground">{part.label} · {part.detail}</span>
                    <span className="font-medium tabular-nums">{part.score}/100</span>
                  </div>
                ))}
              </div>
            </details>
          )}

          <details className="border-t border-border pt-4" open={!assisted}>
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Calcolo interno da attività manuali</summary>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5">
            {METRICS.map((metric) => (
              <div key={metric.key}>
                <dt className="text-xs font-medium text-muted-foreground">{metric.label}</dt>
                <dd className="mt-1 text-xl font-semibold tabular-nums text-foreground">
                  {load[metric.key]}
                </dd>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  {metric.description}
                </p>
              </div>
            ))}
            </dl>
          </details>
        </div>
      ) : (
        <p className="rounded-xl bg-muted/30 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
          Registra le prime attività per vedere qui carico, fatica, forma ed equilibrio.
        </p>
      )}
    </section>
  );
}

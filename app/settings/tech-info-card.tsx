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
  intense: { label: "Pronto per una sessione intensa", color: "text-emerald-600 dark:text-emerald-400" },
  ready: { label: "Pronto per allenarti", color: "text-emerald-600 dark:text-emerald-400" },
  moderate: { label: "Carico moderato", color: "text-amber-600 dark:text-amber-400" },
  recovery: { label: "Recupero consigliato", color: "text-orange-600 dark:text-orange-400" },
  rest: { label: "Riposo o attività molto leggera", color: "text-orange-600 dark:text-orange-400" },
} as const;

const STATUS = {
  calibrating: {
    label: "Dati in consolidamento",
    description: "Servono ancora alcune attività per offrire una lettura stabile.",
    color: "text-muted-foreground",
  },
  fresh: {
    label: "Ben recuperato",
    description: "Hai un buon margine di recupero rispetto al lavoro recente.",
    color: "text-emerald-600 dark:text-emerald-400",
  },
  balanced: {
    label: "In equilibrio",
    description: "Forma e fatica sono ben bilanciate.",
    color: "text-emerald-600 dark:text-emerald-400",
  },
  strained: {
    label: "Recupero consigliato",
    description: "Il lavoro recente richiede più attenzione al recupero.",
    color: "text-amber-600 dark:text-amber-400",
  },
  fatigued: {
    label: "Fatica elevata",
    description: "Le energie possono essere ridotte: valuta una giornata più leggera.",
    color: "text-orange-600 dark:text-orange-400",
  },
} satisfies Record<
  ATLCTLResult["status"],
  { label: string; description: string; color: string }
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
    <section className="mb-8">
      <div className="mb-4">
        <h2 className="text-base font-semibold tracking-tight">Stato di forma</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Una sintesi del tuo momento atletico.</p>
      </div>

      {hasData ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 border-y border-border/70 py-4">
            <div>
              <p className={`text-base font-semibold ${(assisted ?? state).color}`}>
                {assisted?.label ?? state.label}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {assisted ? "Valutazione aggiornata con i dati Zepp più recenti." : state.description}
              </p>
            </div>
            {zepp?.readiness.score != null && (
              <span className="text-3xl font-bold tabular-nums">{zepp.readiness.score}</span>
            )}
          </div>

          {latest && (
            <div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-5 py-1 sm:grid-cols-3">
                <div><dt className="text-xs text-muted-foreground">Carico Zepp</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{latest.training_load ?? "—"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">VO₂max</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{latest.vo2_max ?? "—"}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Recupero</dt><dd className="mt-1 text-sm font-semibold tabular-nums">{latest.recovery_raw == null ? "—" : assisted ? `${latest.recovery_raw} h` : `${latest.recovery_raw} (grezzo)`}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Sonno</dt><dd className="mt-1 text-sm font-semibold tabular-nums">{latest.sleep_score == null ? "—" : `${latest.sleep_score}/100`}{latest.sleep_total_min == null ? "" : ` · ${Math.floor(latest.sleep_total_min / 60)}h ${latest.sleep_total_min % 60}m`}</dd></div>
                <div><dt className="text-xs text-muted-foreground">FC a riposo</dt><dd className="mt-1 text-sm font-semibold tabular-nums">{latest.resting_hr == null ? "—" : `${latest.resting_hr} bpm`}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Stress medio</dt><dd className="mt-1 text-sm font-semibold tabular-nums">{latest.stress_avg ?? "—"}</dd></div>
              </dl>

              <details className="mt-4 border-t border-border/60 pt-3">
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Altri dati Zepp</summary>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 text-xs sm:grid-cols-3">
                  <div><dt className="text-muted-foreground">SpO₂ media</dt><dd className="mt-1 font-semibold tabular-nums">{latest.spo2_avg == null ? "—" : `${latest.spo2_avg}%`}</dd></div>
                  <div><dt className="text-muted-foreground">PAI oggi</dt><dd className="mt-1 font-semibold tabular-nums">{latest.pai_today ?? "—"}</dd></div>
                  <div><dt className="text-muted-foreground">Passi</dt><dd className="mt-1 font-semibold tabular-nums">{latest.steps?.toLocaleString("it-IT") ?? "—"}</dd></div>
                  <div><dt className="text-muted-foreground">Calorie</dt><dd className="mt-1 font-semibold tabular-nums">{latest.calories == null ? "—" : `${latest.calories} kcal`}</dd></div>
                  <div><dt className="text-muted-foreground">Ore in piedi</dt><dd className="mt-1 font-semibold tabular-nums">{latest.stand_hours ?? "—"}</dd></div>
                  <div><dt className="text-muted-foreground">FC max configurata</dt><dd className="mt-1 font-semibold tabular-nums">{latest.hr_zone_ranges?.at(-1) == null ? "—" : `${latest.hr_zone_ranges.at(-1)} bpm`}</dd></div>
                </dl>
                {latest.hr_zone_ranges && (
                  <p className="mt-4 text-[11px] text-muted-foreground">
                    Zone: {latest.hr_zone_ranges.slice(0, 5).map((value, index) => `Z${index + 1} ${value}`).join(" · ")} bpm
                  </p>
                )}
              </details>

              <p className="mt-3 text-[11px] text-muted-foreground">
                Aggiornato {new Date(latest.captured_at).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}
              </p>
            </div>
          )}

          <details className="border-t border-border pt-4" open={!assisted}>
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Dati tecnici del calcolo interno</summary>
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
        <p className="border-y border-border/70 py-4 text-sm leading-relaxed text-muted-foreground">
          Registra le prime attività per vedere qui carico, fatica, forma ed equilibrio.
        </p>
      )}
    </section>
  );
}

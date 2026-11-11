import { AppShell } from "@/components/app-shell";
import { Section } from "@/components/section";
import { Stat } from "@/components/stat";
import { FormChart, type FormPoint } from "@/components/charts/form-chart";
import { TrendChart } from "@/components/charts/trend-chart";
import { TrendBadge } from "@/components/progress/trend-badge";
import { LOAD_STATES } from "@/components/progress/form-status";
import { daysBetween } from "@/lib/local-date";
import { cn } from "@/lib/utils";
import { formatMetric, type BodyMetricKey, type MetricTrend } from "@/lib/metrics/body-trends";
import type { ATLCTLResult } from "@/lib/types";

const GROUPS: Array<{ title: string; keys: BodyMetricKey[] }> = [
  { title: "Motore aerobico", keys: ["vo2max", "efficiency"] },
  { title: "Recupero", keys: ["restingHr", "hrv", "stress", "spo2"] },
  { title: "Sonno", keys: ["sleep", "sleepDeep", "sleepScore"] },
  { title: "Carico dall'orologio e giornata", keys: ["watchLoad", "pai", "steps", "weight"] },
];

/** Le metriche che contano per la frase in cima, in ordine di peso. */
const SUMMARY: Partial<Record<BodyMetricKey, string>> = {
  vo2max: "VO₂max",
  efficiency: "passo a parità di cuore",
  fitness: "forma",
  restingHr: "FC a riposo",
  hrv: "HRV",
  sleep: "ore di sonno",
  sleepDeep: "sonno profondo",
  stress: "stress",
};

function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("it-IT", { day: "numeric", month: "short", timeZone: "UTC" });
}

function list(labels: string[]): string {
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} e ${labels.at(-1)}`;
}

function MetricCard({ trend, today }: { trend: MetricTrend; today: string }) {
  const latest = trend.latest!;
  const age = daysBetween(latest.date, today);
  return (
    <div className="surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow truncate">{trend.label}</p>
          <p className="mt-1 flex items-baseline gap-1 font-display text-2xl font-semibold leading-none tabular-nums tracking-tight">
            {formatMetric(trend.key, latest.value)}
            {trend.unit && <span className="font-sans text-caption font-medium tracking-normal text-muted-foreground">{trend.unit}</span>}
          </p>
          {age > 1 && <p className="mt-1 text-micro text-muted-foreground">Ultimo dato del {shortDate(latest.date)}</p>}
        </div>
        <TrendBadge trend={trend} className="mt-0.5 shrink-0" />
      </div>
      <div className="mt-3">
        <TrendChart metric={trend.key} series={trend.series} today={today} label={trend.label} />
      </div>
      <p className="mt-2 text-caption text-muted-foreground">{trend.sentence}</p>
    </div>
  );
}

export function FormaView({
  today,
  load,
  formPoints,
  trends,
}: {
  today: string;
  load: ATLCTLResult;
  formPoints: FormPoint[];
  trends: Record<BodyMetricKey, MetricTrend>;
}) {
  const state = LOAD_STATES[load.status];
  const summary = Object.entries(SUMMARY) as Array<[BodyMetricKey, string]>;
  const better = summary.filter(([key]) => trends[key].direction === "better").map(([, label]) => label);
  const worse = summary.filter(([key]) => trends[key].direction === "worse").map(([, label]) => label);
  const groups = GROUPS
    .map((group) => ({ ...group, trends: group.keys.map((key) => trends[key]).filter((trend) => trend.latest != null) }))
    .filter((group) => group.trends.length > 0);
  const hasWatch = (["vo2max", "restingHr", "sleep", "hrv", "stress"] as const).some((key) => trends[key].latest != null);
  const fitness = trends.fitness;
  const ratio = load.load_ratio;

  return (
    <AppShell wide title="Stato di forma" backHref="/profile" backLabel="Profilo">
      <div className="stagger">
        <section className="surface mb-8 p-5">
          <p className="eyebrow">Come sta cambiando il corpo</p>
          {better.length || worse.length ? (
            <div className="mt-2 space-y-1.5 text-body">
              {better.length > 0 && (
                <p><span className="font-semibold text-emerald-600 dark:text-emerald-400">Migliora</span> {list(better)}.</p>
              )}
              {worse.length > 0 && (
                <p><span className="font-semibold text-orange-600 dark:text-orange-400">Peggiora</span> {list(worse)}.</p>
              )}
            </div>
          ) : (
            <p className="mt-2 text-body text-muted-foreground">Nessun cambiamento netto nelle ultime 4 settimane, oppure servono ancora dati per vederlo.</p>
          )}
          <p className="mt-3 text-caption text-muted-foreground">Confronto tra le ultime 2 settimane e le 2 settimane di un mese fa (le fasce grigie nei grafici).</p>
        </section>

        <div className="lg:grid lg:grid-cols-2 lg:gap-x-6 3xl:grid-cols-3">
          <Section title="Carico" className="lg:col-span-2 3xl:col-span-3">
            <div className="surface p-4 lg:grid lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-6">
              <div>
                <p className={cn("font-display text-title font-bold tracking-tight", state.tone)}>{state.label}</p>
                <p className="mt-1 text-caption text-muted-foreground">{state.text}</p>
                <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4 border-t border-border/60 pt-4">
                  <Stat size="sm" label="Forma (CTL)" value={`${Math.round(load.ctl)}`} />
                  <Stat size="sm" label="Fatica (ATL)" value={`${Math.round(load.atl)}`} />
                  <Stat size="sm" label="Freschezza (TSB)" value={`${load.tsb > 0 ? "+" : ""}${Math.round(load.tsb)}`} />
                  <Stat size="sm" label="Carico 7 giorni" value={`${load.load7}`} />
                </div>
                <p className="mt-3 text-caption text-muted-foreground">
                  {ratio == null
                    ? "Carico 7 giorni: servono ancora 3 settimane di storico per confrontarlo con la tua media."
                    : ratio > 1.15
                      ? `Carico 7 giorni sopra la tua media (${Math.round(ratio * 100)}%).`
                      : ratio < 0.85
                        ? `Carico 7 giorni sotto la tua media (${Math.round(ratio * 100)}%).`
                        : "Carico 7 giorni nella tua media."}
                  {fitness.direction && fitness.direction !== "stable" ? ` Forma: ${fitness.sentence.charAt(0).toLowerCase()}${fitness.sentence.slice(1)}` : ""}
                </p>
              </div>
              {formPoints.length >= 3 && (
                <div className="mt-5 lg:mt-0">
                  <FormChart points={formPoints} />
                  <p className="mt-2 text-caption text-muted-foreground">Forma: allenamento delle ultime 6 settimane. Fatica: quello degli ultimi 7 giorni. Freschezza = forma − fatica.</p>
                </div>
              )}
            </div>
          </Section>

          {groups.map((group) => (
            <Section key={group.title} title={group.title} className={cn(group.trends.length > 1 && "lg:col-span-2 3xl:col-span-3")}>
              <div className="grid gap-3 lg:grid-cols-2 3xl:grid-cols-3">
                {group.trends.map((trend) => <MetricCard key={trend.key} trend={trend} today={today} />)}
              </div>
            </Section>
          ))}
        </div>

        {!hasWatch && (
          <p className="mb-6 px-1 text-caption text-muted-foreground">
            Collega l&apos;orologio (app Zepp o Intervals.icu) nelle impostazioni per vedere VO₂max, sonno, FC a riposo, HRV e stress.
          </p>
        )}

        <Section title="Da sapere">
          <ul className="surface list-disc space-y-1.5 py-4 pl-9 pr-4 text-caption text-muted-foreground">
            <li>I dati dell&apos;app Zepp arrivano quando sincronizzi dall&apos;orologio: i giorni senza sincronizzazione restano vuoti, non vengono stimati.</li>
            <li>L&apos;HRV arriva solo da Intervals.icu: l&apos;app sull&apos;orologio non la può leggere.</li>
            <li>Tempo di recupero Zepp, fasi REM e leggero del sonno e temperatura della pelle non sono qui: il primo ha un&apos;unità non ancora verificata, gli altri l&apos;app sull&apos;orologio non li invia.</li>
            <li>Metri per battito: solo corse facili e lunghi da almeno 20 minuti; caldo e salite lo abbassano.</li>
          </ul>
        </Section>
      </div>
    </AppShell>
  );
}

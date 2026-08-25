import { Activity } from "lucide-react";
import type { ATLCTLResult } from "@/lib/types";

type TechInfoCardProps = { load: ATLCTLResult; hasData: boolean };

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

export function TechInfoCard({ load, hasData }: TechInfoCardProps) {
  const state = STATUS[load.status];

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
          <div className={`rounded-xl px-4 py-3 ${state.background}`}>
            <p className={`text-sm font-semibold ${state.color}`}>{state.label}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {state.description}
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-5 border-t border-border pt-4">
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
        </div>
      ) : (
        <p className="rounded-xl bg-muted/30 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
          Registra le prime attività per vedere qui carico, fatica, forma ed equilibrio.
        </p>
      )}
    </section>
  );
}

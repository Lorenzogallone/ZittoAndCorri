"use client";

import { useState } from "react";
import { Info, X } from "lucide-react";

type TechInfoCardProps = {
  atl: number;
  ctl: number;
  tsb: number;
  hasData: boolean;
};

type Verdict = { label: string; color: string };

function tsbVerdict(tsb: number): Verdict {
  if (tsb > 15) return { label: "Molto fresco — ottimo per una gara o un test.", color: "text-emerald-500" };
  if (tsb > 5)  return { label: "Fresco — pronto per un allenamento duro.", color: "text-emerald-400" };
  if (tsb > -5) return { label: "In equilibrio — carico e recupero bilanciati.", color: "text-amber-400" };
  if (tsb > -15) return { label: "Leggermente affaticato — attenzione al recupero.", color: "text-amber-500" };
  if (tsb > -25) return { label: "Affaticato — prevedi un giorno di riposo.", color: "text-orange-500" };
  return { label: "Molto affaticato — il corpo chiede recupero.", color: "text-red-500" };
}

function atlVerdict(atl: number): Verdict {
  if (atl < 20)  return { label: "Carico recente basso — puoi spingere di più.", color: "text-emerald-400" };
  if (atl < 50)  return { label: "Carico recente moderato — zona sostenibile.", color: "text-amber-400" };
  if (atl < 80)  return { label: "Carico recente elevato — recupero prioritario.", color: "text-orange-500" };
  return { label: "Carico recente molto alto — rischio di overtraining.", color: "text-red-500" };
}

function ctlVerdict(ctl: number): Verdict {
  if (ctl < 20)  return { label: "Forma di base bassa — sei all'inizio del percorso.", color: "text-muted-foreground" };
  if (ctl < 50)  return { label: "Forma discreta — buona base di allenamento.", color: "text-amber-400" };
  if (ctl < 80)  return { label: "Forma solida — condizione da atleta regolare.", color: "text-emerald-400" };
  return { label: "Forma eccellente — livello da runner avanzato.", color: "text-emerald-500" };
}

const METRICS = [
  {
    key: "tsb" as const,
    label: "TSB",
    name: "Freschezza",
    desc: "Training Stress Balance = CTL − ATL. Misura quanto sei riposato rispetto al tuo livello di forma.",
    verdict: tsbVerdict,
  },
  {
    key: "atl" as const,
    label: "ATL",
    name: "Fatica",
    desc: "Acute Training Load: media degli ultimi 7 giorni. Rappresenta la stanchezza accumulata di recente.",
    verdict: atlVerdict,
  },
  {
    key: "ctl" as const,
    label: "CTL",
    name: "Forma",
    desc: "Chronic Training Load: media degli ultimi 42 giorni. Rappresenta la condizione fisica costruita nel tempo.",
    verdict: ctlVerdict,
  },
] as const;

export function TechInfoCard({ atl, ctl, tsb, hasData }: TechInfoCardProps) {
  const [showInfo, setShowInfo] = useState(false);

  const freshness =
    tsb > 5 ? "Fresco" : tsb < -10 ? "Affaticato" : "In equilibrio";
  const freshnessColor =
    tsb > 5 ? "text-emerald-500" : tsb < -10 ? "text-red-500" : "text-amber-500";

  const values = { atl, ctl, tsb };

  return (
    <div className="rounded-2xl bg-card border border-white/[0.06] p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Stato di forma</h2>
          {hasData && (
            <span className={`text-xs font-medium ${freshnessColor}`}>
              · {freshness}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowInfo((v) => !v)}
          aria-label="Informazioni sulle metriche"
          aria-expanded={showInfo}
          className={`flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${
            showInfo
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-white/[0.08] text-muted-foreground hover:text-foreground hover:bg-white/[0.05]"
          }`}
        >
          {showInfo ? <X size={14} /> : <Info size={14} />}
        </button>
      </div>

      {hasData ? (
        <div className="grid grid-cols-3 gap-4">
          {METRICS.map((m) => (
            <div key={m.key} className="space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">
                {m.label}
              </span>
              <span className="font-semibold text-lg tabular-nums text-foreground block">
                {values[m.key]}
              </span>
              <span className="text-[10px] text-muted-foreground/70 block">
                {m.name}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Registra qualche attività per calcolare carico e freschezza.
        </p>
      )}

      {/* Pannello info: spiegazione + giudizio contestualizzato sul valore reale. */}
      {showInfo && hasData && (
        <div className="mt-4 flex flex-col gap-4 border-t border-white/[0.06] pt-4 animate-in fade-in slide-in-from-top-1 duration-150">
          {METRICS.map((m) => {
            const v = m.verdict(values[m.key]);
            return (
              <div key={m.key}>
                <div className="flex items-baseline gap-2 mb-0.5">
                  <p className="text-xs font-semibold text-foreground">
                    {m.label} — {m.name}
                  </p>
                  <span className="text-xs font-bold tabular-nums text-foreground/60">
                    {values[m.key]}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed mb-1">
                  {m.desc}
                </p>
                <p className={`text-xs font-medium ${v.color}`}>
                  → {v.label}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

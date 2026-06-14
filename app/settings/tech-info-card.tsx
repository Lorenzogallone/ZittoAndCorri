"use client";

import { useState } from "react";
import { Info, X } from "lucide-react";

type TechInfoCardProps = {
  atl: number;
  ctl: number;
  tsb: number;
  hasData: boolean;
};

// Spiegazioni mostrate solo su richiesta (tasto "i"): l'utente medio non deve
// essere sommerso dal gergo tecnico, ma chi vuole approfondire può farlo.
const METRICS = [
  {
    key: "tsb",
    label: "TSB",
    name: "Freschezza",
    desc: "Training Stress Balance = CTL − ATL. Indica quanto sei riposato: valori positivi = fresco e pronto, negativi = affaticato.",
  },
  {
    key: "atl",
    label: "ATL",
    name: "Fatica",
    desc: "Acute Training Load: il carico acuto, una media ponderata degli ultimi 7 giorni. Rappresenta la stanchezza recente.",
  },
  {
    key: "ctl",
    label: "CTL",
    name: "Forma",
    desc: "Chronic Training Load: il carico cronico, una media ponderata degli ultimi 42 giorni. Rappresenta la condizione costruita nel tempo.",
  },
] as const;

export function TechInfoCard({ atl, ctl, tsb, hasData }: TechInfoCardProps) {
  const [showInfo, setShowInfo] = useState(false);

  const freshness =
    tsb > 5 ? "Fresco" : tsb < -10 ? "Affaticato" : "In equilibrio";
  const freshnessColor =
    tsb > 5
      ? "text-emerald-500"
      : tsb < -10
        ? "text-red-500"
        : "text-amber-500";

  const values: Record<string, number> = { atl, ctl, tsb };

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

      {/* Spiegazioni: visibili solo dopo aver toccato il tasto info. */}
      {showInfo && (
        <div className="mt-4 flex flex-col gap-3 border-t border-white/[0.06] pt-4 animate-in fade-in slide-in-from-top-1 duration-150">
          {METRICS.map((m) => (
            <div key={m.key}>
              <p className="text-xs font-semibold text-foreground">
                {m.label} — {m.name}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {m.desc}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

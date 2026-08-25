"use client";

import { useState } from "react";
import { Info, X } from "lucide-react";
import type { ATLCTLResult } from "@/lib/types";

type TechInfoCardProps = { load: ATLCTLResult; hasData: boolean };

const STATUS = {
  calibrating: { label: "In calibrazione", color: "text-muted-foreground" },
  fresh: { label: "Fresco", color: "text-emerald-500" },
  balanced: { label: "In equilibrio", color: "text-emerald-400" },
  strained: { label: "Carico sostenuto", color: "text-amber-500" },
  fatigued: { label: "Affaticato", color: "text-orange-500" },
} satisfies Record<ATLCTLResult["status"], { label: string; color: string }>;

const METRICS = [
  { key: "tsb" as const, label: "TSB", name: "Bilancio", desc: "Differenza tra carico abituale e recente. Prima di 42 giorni resta neutro per non inventare una forma di base troppo bassa." },
  { key: "atl" as const, label: "ATL", name: "Fatica", desc: "Media giornaliera del carico interno nelle ultime 7 giornate." },
  { key: "ctl" as const, label: "CTL", name: "Forma", desc: "Media giornaliera del carico interno nelle ultime 42 giornate." },
] as const;

export function TechInfoCard({ load, hasData }: TechInfoCardProps) {
  const [showInfo, setShowInfo] = useState(false);
  const state = STATUS[load.status];
  const values = { atl: load.atl, ctl: load.ctl, tsb: load.tsb };

  return (
    <div className="mb-6 rounded-2xl border border-white/[0.06] bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Stato di forma</h2>
          {hasData && <span className={`text-xs font-medium ${state.color}`}>· {state.label}</span>}
        </div>
        <button type="button" onClick={() => setShowInfo((value) => !value)} aria-label="Informazioni sulle metriche" aria-expanded={showInfo} className={`flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${showInfo ? "border-primary/40 bg-primary/10 text-primary" : "border-white/[0.08] text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"}`}>
          {showInfo ? <X size={14} /> : <Info size={14} />}
        </button>
      </div>

      {hasData ? (
        <div className="space-y-4">
          <div>
            <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">Carico interno · 7 giorni</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums text-foreground">{load.load7}</span>
              {load.baseline7 != null && <span className="text-xs text-muted-foreground">abituale {load.baseline7}</span>}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 border-t border-white/[0.06] pt-4">
            {METRICS.map((metric) => (
              <div key={metric.key} className="space-y-1">
                <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">{metric.label}</span>
                <span className="block text-lg font-semibold tabular-nums text-foreground">{values[metric.key]}</span>
                <span className="block text-[10px] text-muted-foreground/70">{metric.name}</span>
              </div>
            ))}
          </div>
        </div>
      ) : <p className="text-sm text-muted-foreground">Registra qualche attività per calcolare carico e freschezza.</p>}

      {showInfo && hasData && (
        <div className="mt-4 flex flex-col gap-4 border-t border-white/[0.06] pt-4 animate-in fade-in slide-in-from-top-1 duration-150">
          {METRICS.map((metric) => (
            <div key={metric.key}>
              <div className="mb-0.5 flex items-baseline gap-2">
                <p className="text-xs font-semibold text-foreground">{metric.label} — {metric.name}</p>
                <span className="text-xs font-bold tabular-nums text-foreground/60">{values[metric.key]}</span>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{metric.desc}</p>
            </div>
          ))}
          <div>
            <p className="mb-0.5 text-xs font-semibold text-foreground">Confronto personale</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {load.baseline7 == null
                ? `Servono almeno 21 giorni precedenti per calibrare il carico abituale. Storico attuale: ${load.history_days} giorni.`
                : `Il carico recente è ${Math.round((load.load_ratio ?? 0) * 100)}% del tuo abituale. Confidenza ${load.confidence === "high" ? "alta" : load.confidence === "medium" ? "media" : "bassa"}.`}
            </p>
          </div>
          <p className="text-[10px] leading-relaxed text-muted-foreground/70">Il carico usa prima le zone cardiache, poi l&apos;RPE e infine una stima dalla durata. Non è ancora sulla stessa scala EPOC di Zepp.</p>
        </div>
      )}
    </div>
  );
}

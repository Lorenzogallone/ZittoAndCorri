"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { generalGoalName, type GoalKind } from "@/lib/goals";

const DISTANCE_PRESETS = [
  { label: "5 km", km: 5 },
  { label: "10 km", km: 10 },
  { label: "Mezza (21,1 km)", km: 21.0975 },
  { label: "Maratona (42,2 km)", km: 42.195 },
];

const KIND_OPTIONS: { value: GoalKind; label: string; hint: string }[] = [
  { value: "race", label: "Gara", hint: "Una gara con una data precisa" },
  { value: "general", label: "Generico", hint: "Migliorare su una distanza, senza scadenza" },
];

interface Props {
  defaultKind?: GoalKind;
  defaultName?: string;
  defaultDate?: string;
  defaultDistanceKm?: string;
  defaultTargetTime?: string;
}

/** Campi condivisi dei form obiettivo: gara con data o obiettivo generico. */
export function GoalFields({
  defaultKind = "race",
  defaultName = "",
  defaultDate = "",
  defaultDistanceKm = "",
  defaultTargetTime = "",
}: Props) {
  const [kind, setKind] = useState<GoalKind>(defaultKind);
  const [distanceKm, setDistanceKm] = useState(defaultDistanceKm);
  const general = kind === "general";
  const distance = Number(distanceKm);
  const namePlaceholder = general
    ? Number.isFinite(distance) && distance > 0
      ? generalGoalName(Math.round(distance * 1000))
      : "Migliorare nella mezza maratona"
    : "Milano Marathon 2026";

  return (
    <>
      <input type="hidden" name="goal_kind" value={kind} />
      <div className="grid gap-2.5">
        <Label>Tipo di obiettivo</Label>
        <div className="grid grid-cols-2 gap-2">
          {KIND_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={kind === option.value}
              onClick={() => setKind(option.value)}
              className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                kind === option.value
                  ? "border-primary/60 bg-primary/10 text-foreground"
                  : "border-white/[0.08] bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="block text-sm font-semibold">{option.label}</span>
              <span className="mt-0.5 block text-[11px] leading-snug">{option.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-2.5">
        <Label htmlFor="distance_km">{general ? "Distanza su cui migliorare" : "Distanza"}</Label>
        <div className="grid grid-cols-2 gap-2 mb-1">
          {DISTANCE_PRESETS.map((p) => (
            <button
              key={p.km}
              type="button"
              className="rounded-xl border border-white/[0.08] bg-card px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
              onClick={() => setDistanceKm(String(p.km))}
            >
              {p.label}
            </button>
          ))}
        </div>
        <Input
          id="distance_km"
          name="distance_km"
          type="number"
          step="0.001"
          min="0"
          inputMode="decimal"
          placeholder="21.0975"
          value={distanceKm}
          onChange={(e) => setDistanceKm(e.target.value)}
          required
        />
      </div>

      <div className="grid gap-2.5">
        <Label htmlFor="race_name">{general ? "Nome obiettivo" : "Nome gara"}</Label>
        <Input
          id="race_name"
          name="race_name"
          type="text"
          placeholder={namePlaceholder}
          defaultValue={defaultName}
          required={!general}
        />
        {general && (
          <p className="text-xs text-muted-foreground">Opzionale — se vuoto usiamo “{namePlaceholder}”</p>
        )}
      </div>

      {!general && (
        <div className="grid gap-2.5">
          <Label htmlFor="race_date">Data gara</Label>
          <Input id="race_date" name="race_date" type="date" defaultValue={defaultDate} required />
        </div>
      )}

      <div className="grid gap-2.5">
        <Label htmlFor="target_time">{general ? "Tempo a cui puntare" : "Tempo obiettivo"}</Label>
        <Input
          id="target_time"
          name="target_time"
          type="text"
          inputMode="text"
          placeholder="1:45:00"
          defaultValue={defaultTargetTime}
        />
        <p className="text-xs text-muted-foreground">Opzionale — formato h:mm:ss o mm:ss</p>
      </div>
    </>
  );
}

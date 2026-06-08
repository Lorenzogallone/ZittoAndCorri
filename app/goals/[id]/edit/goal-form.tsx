"use client";

import { useActionState } from "react";
import { updateGoal, type GoalFormState } from "../../actions";
import type { Goal } from "@/lib/types";
import { formatDuration } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DISTANCE_PRESETS = [
  { label: "5 km", km: 5 },
  { label: "10 km", km: 10 },
  { label: "Mezza (21,1 km)", km: 21.0975 },
  { label: "Maratona (42,2 km)", km: 42.195 },
];

interface Props {
  goal: Goal;
}

const initialState: GoalFormState = {};

export function EditGoalForm({ goal }: Props) {
  const updateWithId = updateGoal.bind(null, goal.id);
  const [state, formAction, pending] = useActionState(updateWithId, initialState);

  const defaultDistanceKm = (goal.distance_m / 1000).toFixed(3).replace(/\.?0+$/, "");
  const defaultTargetTime = goal.target_time_s ? formatDuration(goal.target_time_s) : "";

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="grid gap-2.5">
        <Label htmlFor="race_name">Nome gara</Label>
        <Input
          id="race_name"
          name="race_name"
          type="text"
          defaultValue={goal.race_name}
          required
        />
      </div>

      <div className="grid gap-2.5">
        <Label htmlFor="race_date">Data gara</Label>
        <Input
          id="race_date"
          name="race_date"
          type="date"
          defaultValue={goal.race_date ?? ""}
        />
      </div>

      <div className="grid gap-2.5">
        <Label htmlFor="distance_km">Distanza</Label>
        <div className="grid grid-cols-2 gap-2 mb-1">
          {DISTANCE_PRESETS.map((p) => (
            <button
              key={p.km}
              type="button"
              className="rounded-xl border border-white/[0.08] bg-card px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
              onClick={(e) => {
                const input = (e.currentTarget.closest("form") as HTMLFormElement)
                  ?.elements.namedItem("distance_km") as HTMLInputElement | null;
                if (input) input.value = String(p.km);
              }}
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
          defaultValue={defaultDistanceKm}
          required
        />
      </div>

      <div className="grid gap-2.5">
        <Label htmlFor="target_time">Tempo obiettivo</Label>
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

      <div className="flex items-center gap-3">
        <input
          id="is_active"
          name="is_active"
          type="checkbox"
          defaultChecked={goal.is_active}
          className="h-4 w-4 rounded border-white/20 accent-primary"
        />
        <Label htmlFor="is_active" className="cursor-pointer">
          Obiettivo attivo
        </Label>
      </div>

      {state.error && (
        <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3">
          <p className="text-destructive text-sm" role="alert">
            {state.error}
          </p>
        </div>
      )}

      <Button type="submit" disabled={pending} size="lg" className="w-full mt-2">
        {pending ? "Salvo…" : "Aggiorna obiettivo"}
      </Button>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { createPlannedWorkout, type WorkoutFormState } from "../actions";
import { WORKOUT_TYPES } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TYPE_LABELS } from "@/lib/activity-meta";

interface GoalOption {
  id: string;
  race_name: string;
  is_active: boolean;
}

interface Props {
  goals: GoalOption[];
  defaultDate?: string;
}

const initialState: WorkoutFormState = {};

export function WorkoutForm({ goals, defaultDate }: Props) {
  const [state, formAction, pending] = useActionState(
    createPlannedWorkout,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="grid gap-2.5">
        <Label htmlFor="date">Data</Label>
        <Input
          id="date"
          name="date"
          type="date"
          defaultValue={defaultDate}
          required
        />
      </div>

      <div className="grid gap-2.5">
        <Label htmlFor="type">Tipo</Label>
        <Select name="type" defaultValue="easy">
          <SelectTrigger id="type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WORKOUT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {TYPE_LABELS[t] ?? t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {goals.length > 0 && (
        <div className="grid gap-2.5">
          <Label htmlFor="goal_id">Obiettivo (opzionale)</Label>
          <Select name="goal_id" defaultValue="none">
            <SelectTrigger id="goal_id">
              <SelectValue placeholder="Nessun obiettivo collegato" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nessun obiettivo</SelectItem>
              {goals.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.race_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="separator my-1" />
      <p className="text-xs text-muted-foreground uppercase tracking-wider">
        Target (opzionali)
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2.5">
          <Label htmlFor="target_distance_km">Distanza (km)</Label>
          <Input
            id="target_distance_km"
            name="target_distance_km"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            placeholder="10.00"
          />
        </div>
        <div className="grid gap-2.5">
          <Label htmlFor="target_pace">Passo (mm:ss)</Label>
          <Input
            id="target_pace"
            name="target_pace"
            type="text"
            inputMode="text"
            placeholder="5:30"
          />
        </div>
      </div>

      <div className="grid gap-2.5">
        <Label htmlFor="target_duration">Durata (h:mm:ss)</Label>
        <Input
          id="target_duration"
          name="target_duration"
          type="text"
          inputMode="text"
          placeholder="55:00"
        />
      </div>

      <div className="grid gap-2.5">
        <Label htmlFor="description">Note</Label>
        <Textarea
          id="description"
          name="description"
          rows={3}
          placeholder="10km a ritmo facile, HR < 145."
        />
      </div>

      {state.error && (
        <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3">
          <p className="text-destructive text-sm" role="alert">
            {state.error}
          </p>
        </div>
      )}

      <Button type="submit" disabled={pending} size="lg" className="w-full mt-2">
        {pending ? "Salvo…" : "Aggiungi al piano"}
      </Button>
    </form>
  );
}

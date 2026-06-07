"use client";

import { useActionState } from "react";
import { createActivity, type ActivityFormState } from "../actions";
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

const TYPE_LABELS: Record<string, string> = {
  easy: "Easy",
  tempo: "Tempo",
  interval: "Ripetute",
  long: "Lungo",
  race: "Gara",
  recovery: "Recupero",
  cross: "Cross",
};

const initialState: ActivityFormState = {};

export function ActivityForm() {
  const [state, formAction, pending] = useActionState(
    createActivity,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {/* Essenziali */}
      <div className="grid gap-2.5">
        <Label htmlFor="started_at">Data e ora</Label>
        <Input id="started_at" name="started_at" type="datetime-local" required />
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

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2.5">
          <Label htmlFor="distance_km">Distanza (km)</Label>
          <Input
            id="distance_km"
            name="distance_km"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            placeholder="10.00"
            required
          />
        </div>
        <div className="grid gap-2.5">
          <Label htmlFor="duration">Durata (h:mm:ss)</Label>
          <Input
            id="duration"
            name="duration"
            type="text"
            inputMode="numeric"
            placeholder="50:00"
            required
          />
        </div>
      </div>

      {/* Separator */}
      <div className="separator my-1" />

      {/* Opzionali */}
      <p className="text-xs text-muted-foreground uppercase tracking-wider">
        Opzionali
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2.5">
          <Label htmlFor="avg_hr">HR media</Label>
          <Input id="avg_hr" name="avg_hr" type="number" min="0" placeholder="150" />
        </div>
        <div className="grid gap-2.5">
          <Label htmlFor="max_hr">HR max</Label>
          <Input id="max_hr" name="max_hr" type="number" min="0" placeholder="175" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2.5">
          <Label htmlFor="elevation_gain_m">Dislivello + (m)</Label>
          <Input
            id="elevation_gain_m"
            name="elevation_gain_m"
            type="number"
            min="0"
            placeholder="120"
          />
        </div>
        <div className="grid gap-2.5">
          <Label htmlFor="rpe">RPE 1–10</Label>
          <Input id="rpe" name="rpe" type="number" min="1" max="10" placeholder="4" />
        </div>
      </div>

      <div className="grid gap-2.5">
        <Label htmlFor="notes">Note</Label>
        <Textarea id="notes" name="notes" rows={3} placeholder="Gambe ok, fresco." />
      </div>

      {/* Error message */}
      {state.error && (
        <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3">
          <p className="text-destructive text-sm" role="alert">
            {state.error}
          </p>
        </div>
      )}

      <Button type="submit" disabled={pending} size="lg" className="w-full mt-2">
        {pending ? "Salvo…" : "Salva corsa"}
      </Button>
    </form>
  );
}

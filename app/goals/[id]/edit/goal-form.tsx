"use client";

import { useActionState } from "react";
import { updateGoal, type GoalFormState } from "../../actions";
import type { Goal } from "@/lib/types";
import { formatDuration } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { goalKind } from "@/lib/goals";
import { GoalFields } from "../../goal-fields";

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
      <GoalFields
        defaultKind={goalKind(goal)}
        defaultName={goal.race_name}
        defaultDate={goal.race_date ?? ""}
        defaultDistanceKm={defaultDistanceKm}
        defaultTargetTime={defaultTargetTime}
      />

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

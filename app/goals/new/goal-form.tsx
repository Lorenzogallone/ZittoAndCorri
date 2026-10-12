"use client";

import { useActionState } from "react";
import { createGoal, type GoalFormState } from "../actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { GoalFields } from "../goal-fields";

const initialState: GoalFormState = {};

export function GoalForm() {
  const [state, formAction, pending] = useActionState(createGoal, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <GoalFields />

      <div className="flex items-center gap-3">
        <input
          id="is_active"
          name="is_active"
          type="checkbox"
          defaultChecked
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
        {pending ? "Salvo…" : "Salva obiettivo"}
      </Button>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { createPlannedWorkout, type WorkoutFormState } from "../actions";
import { WORKOUT_TYPES } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TextField } from "@/components/ui/text-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { typeLabel } from "@/lib/activity-meta";
import { DECIMAL_PATTERN, DURATION_PATTERN } from "@/lib/format";
import { handleEnterKeyHint } from "@/lib/form-keys";

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
  const t = useTranslations("plan.new.form");
  const tl = useTranslations("labels");
  const [state, formAction, pending] = useActionState(
    createPlannedWorkout,
    initialState,
  );

  return (
    <form action={formAction} onKeyDown={handleEnterKeyHint} className="flex flex-col gap-5">
      <div className="grid gap-2.5">
        <Label htmlFor="date">{t("date")}</Label>
        <Input
          id="date"
          name="date"
          type="date"
          defaultValue={defaultDate}
          required
        />
      </div>

      <div className="grid gap-2.5">
        <Label htmlFor="type">{t("type")}</Label>
        <Select name="type" defaultValue="easy">
          <SelectTrigger id="type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WORKOUT_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {typeLabel(tl, type)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {goals.length > 0 && (
        <div className="grid gap-2.5">
          <Label htmlFor="goal_id">{t("goal")}</Label>
          <Select name="goal_id" defaultValue="none">
            <SelectTrigger id="goal_id">
              <SelectValue placeholder={t("goalPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("noGoal")}</SelectItem>
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
        {t("targets")}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2.5">
          <Label htmlFor="target_distance_km">{t("distance")}</Label>
          <Input
            id="target_distance_km"
            name="target_distance_km"
            type="text"
            inputMode="decimal"
            pattern={DECIMAL_PATTERN}
            enterKeyHint="next"
            autoComplete="off"
            placeholder="10.00"
          />
        </div>
        <div className="grid gap-2.5">
          <Label htmlFor="target_pace">{t("pace")}</Label>
          <Input
            id="target_pace"
            name="target_pace"
            type="text"
            inputMode="decimal"
            pattern={DURATION_PATTERN}
            enterKeyHint="next"
            autoComplete="off"
            placeholder="5:30"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2.5">
          <Label htmlFor="target_duration">{t("duration")}</Label>
          <Input
            id="target_duration"
            name="target_duration"
            type="text"
            inputMode="decimal"
            pattern={DURATION_PATTERN}
            enterKeyHint="next"
            autoComplete="off"
            placeholder="55:00"
          />
        </div>
        <div className="grid gap-2.5">
          <Label htmlFor="target_hr_bpm">{t("maxHr")}</Label>
          <Input
            id="target_hr_bpm"
            name="target_hr_bpm"
            type="number"
            min="80"
            max="220"
            inputMode="numeric"
            enterKeyHint="next"
            autoComplete="off"
            placeholder="150"
          />
        </div>
      </div>

      <div className="grid gap-2.5">
        <Label id="description-label" htmlFor="description">{t("notes")}</Label>
        <TextField
          id="description"
          aria-labelledby="description-label"
          name="description"
          rows={3}
          placeholder={t("notesPlaceholder")}
        />
      </div>

      <div className="grid gap-2.5">
        <Label id="focus-label" htmlFor="focus">{t("focus")}</Label>
        <TextField
          id="focus"
          aria-labelledby="focus-label"
          name="focus"
          rows={2}
          placeholder={t("focusPlaceholder")}
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
        {pending ? t("saving") : t("submit")}
      </Button>
    </form>
  );
}

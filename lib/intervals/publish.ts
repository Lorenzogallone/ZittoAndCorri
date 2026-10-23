import "server-only";

// Pubblicazione del piano su Intervals.icu: tutte le sedute future (fino a un
// anno) come eventi WORKOUT con external_id "zc:<id>". Sul calendario Intervals
// si vede l'intero piano; Zepp ne carica sull'orologio i prossimi 7 giorni.
// Le sedute cambiate vengono aggiornate, quelle sparite dal piano rimosse;
// gli eventi creati a mano dall'atleta su Intervals non vengono toccati.

import { createAdminClient } from "@/lib/supabase/admin";
import { hrZones } from "@/lib/metrics/zones";
import { adjustStepsForHeat } from "@/lib/metrics/heat";
import { heatForDates } from "@/lib/weather";
import { workoutStepsOrLegacy } from "@/lib/workout-steps";
import { getEffectiveHrConfig } from "@/lib/zepp/effective-hr";
import { isoDateShift } from "@/lib/dates";
import type { PlannedWorkout, Profile } from "@/lib/types";
import {
  createEvents,
  deleteEvents,
  listEvents,
  updateEvent,
  type IntervalsClient,
  type IntervalsEventInput,
} from "@/lib/intervals/client";
import {
  intervalsExternalId,
  isZittoExternalId,
  workoutToIntervalsDraft,
  type IntervalsTargetPreference,
} from "@/lib/intervals/workout-text";

export interface IntervalsPublishSummary {
  window: { from: string; to: string };
  created: number;
  updated: number;
  deleted: number;
  unchanged: number;
  errors: string[];
}

/** Orizzonte pubblicato: tutto il piano futuro, entro un anno da oggi. */
export const PUBLISH_DAYS = 366;

const TYPE_TITLES: Record<string, string> = {
  easy: "Corsa facile",
  tempo: "Tempo run",
  interval: "Ripetute",
  long: "Lungo",
  race: "Gara",
  recovery: "Recupero",
  cross: "Cross training",
};

type WorkoutRow = Omit<PlannedWorkout, "workout_steps"> & { workout_steps: unknown };

function romeToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function sameEvent(existing: { name?: string | null; description?: string | null; start_date_local: string }, draft: IntervalsEventInput): boolean {
  return (existing.name ?? "") === draft.name
    && (existing.description ?? "").trim() === draft.description.trim()
    && existing.start_date_local.slice(0, 10) === draft.start_date_local.slice(0, 10);
}

export async function publishPlanToIntervals(
  client: IntervalsClient,
  userId: string,
  preference: IntervalsTargetPreference,
): Promise<IntervalsPublishSummary> {
  const from = romeToday();
  const to = isoDateShift(from, PUBLISH_DAYS - 1);
  const summary: IntervalsPublishSummary = { window: { from, to }, created: 0, updated: 0, deleted: 0, unchanged: 0, errors: [] };
  const admin = createAdminClient();

  const [{ data: rows, error }, { data: profile }] = await Promise.all([
    admin
      .from("planned_workouts")
      .select("id, user_id, goal_id, date, type, target_distance_m, target_pace_s_km, target_duration_s, target_hr_bpm, workout_steps, description, focus, status, created_at, updated_at, origin")
      .eq("user_id", userId)
      .eq("status", "planned")
      .neq("type", "cross")
      .gte("date", from)
      .lte("date", to)
      .order("date")
      .returns<WorkoutRow[]>(),
    admin.from("profiles").select("max_hr, resting_hr").eq("id", userId).maybeSingle<Pick<Profile, "max_hr" | "resting_hr">>(),
  ]);
  if (error) throw error;

  const effectiveHr = await getEffectiveHrConfig(admin, userId, profile ?? null);
  const zones = hrZones(effectiveHr);
  const ctx = { max_hr: zones?.max_hr ?? effectiveHr.max_hr, preference };
  const heat = await heatForDates(admin, userId, (rows ?? []).map((row) => row.date));

  const drafts = new Map<string, IntervalsEventInput>();
  for (const row of rows ?? []) {
    const heatInfo = heat.get(row.date);
    const steps = workoutStepsOrLegacy(row.workout_steps, row);
    const draft = workoutToIntervalsDraft({
      id: row.id,
      date: row.date,
      title: TYPE_TITLES[row.type] ?? "Allenamento",
      target_distance_m: row.target_distance_m,
      target_duration_s: row.target_duration_s,
      steps: heatInfo && heatInfo.pct > 0 ? adjustStepsForHeat(steps, heatInfo.pct) : steps,
    }, ctx);
    if (draft.description) drafts.set(intervalsExternalId(row.id), draft);
  }

  const existing = (await listEvents(client, from, to)).filter((event) => isZittoExternalId(event.external_id));
  const byExternal = new Map(existing.map((event) => [event.external_id as string, event]));

  const toCreate: IntervalsEventInput[] = [];
  for (const [externalId, draft] of drafts) {
    const current = byExternal.get(externalId);
    if (!current) {
      toCreate.push(draft);
      continue;
    }
    if (sameEvent(current, draft)) {
      summary.unchanged += 1;
      continue;
    }
    try {
      await updateEvent(client, current.id, draft);
      summary.updated += 1;
    } catch (updateError) {
      summary.errors.push(`Aggiornamento ${draft.name}: ${updateError instanceof Error ? updateError.message : String(updateError)}`);
    }
  }

  if (toCreate.length) {
    try {
      const created = await createEvents(client, toCreate);
      summary.created += created.length || toCreate.length;
    } catch (createError) {
      summary.errors.push(`Creazione: ${createError instanceof Error ? createError.message : String(createError)}`);
    }
  }

  const stale = existing.filter((event) => !drafts.has(event.external_id as string)).map((event) => event.id);
  if (stale.length) {
    try {
      await deleteEvents(client, stale);
      summary.deleted = stale.length;
    } catch (deleteError) {
      summary.errors.push(`Rimozione: ${deleteError instanceof Error ? deleteError.message : String(deleteError)}`);
    }
  }
  return summary;
}

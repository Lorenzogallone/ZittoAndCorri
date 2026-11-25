// Easy runs, long runs and recoveries are a single continuous easy-pace phase: no
// separate warm-up or cool-down. If the model adds them anyway,
// they become part of the run (same pace and HR as the main phase)
// and consecutive stretches of the same type are merged, without changing the total.

import type { WorkoutStep, WorkoutType } from "../types.ts";

const CONTINUOUS_TYPES: ReadonlySet<string> = new Set<WorkoutType>(["easy", "long", "recovery"]);

function isEdge(step: WorkoutStep): boolean {
  return step.kind === "warmup" || step.kind === "cooldown";
}

function sameTarget(a: WorkoutStep, b: WorkoutStep): boolean {
  return a.kind === b.kind
    && a.completion_type === b.completion_type
    && a.completion_type !== "manual"
    && (a.variant ?? null) === (b.variant ?? null)
    && a.pace_min_s_km === b.pace_min_s_km
    && a.pace_max_s_km === b.pace_max_s_km
    && a.hr_min_bpm === b.hr_min_bpm
    && a.hr_max_bpm === b.hr_max_bpm;
}

export function withoutEasyWarmups(type: string, steps: WorkoutStep[]): WorkoutStep[] {
  if (!CONTINUOUS_TYPES.has(type) || !steps.some(isEdge)) return steps;
  const main = steps.filter((step) => !isEdge(step));
  if (!main.length) return steps;
  const first = main.find((step) => step.kind === "steady") ?? main[0];
  const last = [...main].reverse().find((step) => step.kind === "steady") ?? main[main.length - 1];

    // Warm-up and cool-down take the pace, HR and label of the nearest
    // continuous phase: the whole run is at easy pace.
  const converted = steps.map((step): WorkoutStep => {
    if (!isEdge(step)) return step;
    const target = step.kind === "warmup" ? first : last;
    return {
      ...step,
      kind: target.kind,
      label: target.label,
      variant: target.variant ?? null,
      pace_min_s_km: target.pace_min_s_km,
      pace_max_s_km: target.pace_max_s_km,
      hr_min_bpm: target.hr_min_bpm,
      hr_max_bpm: target.hr_max_bpm,
    };
  });

  const merged: WorkoutStep[] = [];
  for (const step of converted) {
    const previous = merged[merged.length - 1];
    if (previous && sameTarget(previous, step)) {
      merged[merged.length - 1] = {
        ...previous,
        completion_value: (previous.completion_value ?? 0) + (step.completion_value ?? 0),
      };
    } else {
      merged.push(step);
    }
  }
  return merged.map((step, order) => ({ ...step, id: `step-${order + 1}`, order }));
}

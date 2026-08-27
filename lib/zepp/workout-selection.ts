export type WorkoutSelectionSource = "override" | "today" | "ambiguous" | "none";

export function selectWorkoutForDate<T extends { id: string; date: string }>(
  workouts: T[],
  localDate: string,
  overrideWorkoutId: string | null,
): {
  selected: T | null;
  source: WorkoutSelectionSource;
  overrideValid: boolean;
} {
  const override = overrideWorkoutId
    ? workouts.find((workout) => workout.id === overrideWorkoutId) ?? null
    : null;
  const today = workouts.filter((workout) => workout.date === localDate);
  if (override) return { selected: override, source: "override", overrideValid: true };
  return {
    selected: today.length === 1 ? today[0] : null,
    source: today.length === 1 ? "today" : today.length > 1 ? "ambiguous" : "none",
    overrideValid: overrideWorkoutId == null,
  };
}

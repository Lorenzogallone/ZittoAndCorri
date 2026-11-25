// Goals: a dated race or a generic goal (no date),
// e.g. "improve in the half marathon". The type is inferred from race_date, so
// no dedicated column is needed in the schema.

export type GoalKind = "race" | "general";

export function goalKind(goal: { race_date: string | null }): GoalKind {
  return goal.race_date ? "race" : "general";
}

/** Default name of a generic goal based on distance. */
export function generalGoalName(distance_m: number): string {
  const km = distance_m / 1000;
  if (Math.abs(km - 21.0975) < 0.3) return "Migliorare nella mezza maratona";
  if (Math.abs(km - 42.195) < 0.5) return "Migliorare nella maratona";
  const label = Number.isInteger(km) ? String(km) : km.toFixed(1).replace(".", ",");
  return `Migliorare sui ${label} km`;
}

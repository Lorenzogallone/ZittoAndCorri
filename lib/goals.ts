// Obiettivi: una gara con data oppure un obiettivo generico (nessuna data),
// es. "migliorare nella mezza maratona". Il tipo si deduce da race_date, così
// non serve una colonna dedicata nello schema.

export type GoalKind = "race" | "general";

export function goalKind(goal: { race_date: string | null }): GoalKind {
  return goal.race_date ? "race" : "general";
}

/** Nome predefinito di un obiettivo generico in base alla distanza. */
export function generalGoalName(distance_m: number): string {
  const km = distance_m / 1000;
  if (Math.abs(km - 21.0975) < 0.3) return "Migliorare nella mezza maratona";
  if (Math.abs(km - 42.195) < 0.5) return "Migliorare nella maratona";
  const label = Number.isInteger(km) ? String(km) : km.toFixed(1).replace(".", ",");
  return `Migliorare sui ${label} km`;
}

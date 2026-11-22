// Riga in chat con le parti della proposta del coach scartate dalla
// validazione: l'atleta deve sapere che non tutto è arrivato nel piano e
// perché. Modulo puro (tests/coach-reliability.test.ts).

export type DiscardReason = "invalid" | "past" | "out_of_window" | "bad_type" | "no_steps" | "bad_date";

export const DISCARD_TEXT: Record<DiscardReason, [string, string]> = {
  // [singolare, plurale]
  invalid: ["con una struttura non valida", "con una struttura non valida"],
  past: ["in un giorno già passato", "in giorni già passati"],
  out_of_window: ["oltre le prossime 4 settimane", "oltre le prossime 4 settimane"],
  bad_type: ["di un tipo che l'app non conosce", "di un tipo che l'app non conosce"],
  no_steps: ["senza fasi da seguire", "senza fasi da seguire"],
  bad_date: ["con una data non valida", "con una data non valida"],
};

/** Perché una seduta proposta non passa la validazione, null se è valida. */
export function workoutDiscardReason(
  workout: { date: string; type: string },
  start: string,
  end: string,
  knownTypes: readonly string[],
  stepsCount: number,
): DiscardReason | null {
  const date = workout.date.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T12:00:00Z`))) return "bad_date";
  if (date < start) return "past";
  if (date > end) return "out_of_window";
  if (!knownTypes.includes(workout.type)) return "bad_type";
  if (stepsCount === 0) return "no_steps";
  return null;
}

/**
 * Una riga in corsivo (Markdown) che riassume le sedute e i giorni da
 * togliere scartati, o stringa vuota se non è stato scartato nulla.
 */
export function discardedPlanNote(input: { workouts: DiscardReason[]; removeDates: number }): string {
  const counts = new Map<DiscardReason, number>();
  for (const reason of input.workouts) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  const parts = [...counts].map(([reason, n]) =>
    `${n === 1 ? "una seduta" : `${n} sedute`} ${DISCARD_TEXT[reason][n === 1 ? 0 : 1]}`);
  if (input.removeDates > 0) {
    parts.push(input.removeDates === 1 ? "un giorno da togliere con una data non valida" : `${input.removeDates} giorni da togliere con una data non valida`);
  }
  if (!parts.length) return "";
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
  return `_Non tutta la proposta è arrivata nel piano: l'app ha scartato ${list}. Se ti serve, chiedi al coach di rifarla._`;
}

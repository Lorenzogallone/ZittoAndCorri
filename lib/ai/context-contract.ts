export const AI_CONTEXT_SECTIONS = [
  "meta",
  "athlete",
  "goal",
  "training_state",
  "history",
  "pace_hr_calibration",
  "current_plan",
  "memories",
  "conversation",
  "evaluations",
  "focus_activity",
  "missing_data",
] as const;

export function missingAiContextSections(value: unknown): string[] {
  if (!value || typeof value !== "object") return [...AI_CONTEXT_SECTIONS];
  const record = value as Record<string, unknown>;
  return AI_CONTEXT_SECTIONS.filter((section) => !(section in record));
}

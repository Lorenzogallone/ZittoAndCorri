export interface FitSessionMetadataInput {
  workoutRpe?: number;
  perceivedExertion?: number;
  sportProfileName?: string;
  workoutName?: string;
}

/** Normalizza i metadati soggettivi FIT senza dipendere dal decoder. */
export function extractFitSessionMetadata(session: FitSessionMetadataInput): {
  rpe?: number;
  rpe_source?: "fit";
  source_title?: string;
} {
  const rawRpe = typeof session.workoutRpe === "number"
    ? session.workoutRpe / 10
    : typeof session.perceivedExertion === "number"
      ? session.perceivedExertion > 10
        ? session.perceivedExertion / 10
        : session.perceivedExertion
      : undefined;
  const normalizedRpe = rawRpe == null ? undefined : Math.round(rawRpe);
  const rpe = normalizedRpe != null && normalizedRpe >= 1 && normalizedRpe <= 10
    ? normalizedRpe
    : undefined;
  const sourceTitle = typeof session.workoutName === "string" && session.workoutName.trim()
    ? session.workoutName.trim()
    : typeof session.sportProfileName === "string"
      ? session.sportProfileName.trim()
      : "";
  return {
    rpe,
    rpe_source: rpe != null ? "fit" : undefined,
    source_title: sourceTitle || undefined,
  };
}

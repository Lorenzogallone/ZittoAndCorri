// Imported runs deleted by the athlete (deleted_imports table, migration
// 0032): the automatic import from Intervals.icu doesn't recreate them. Pure functions.

export interface DeletedImport {
  external_id: string | null;
  sport: string;
  started_at: string;
}

/** Same window as the dedupe in ingest.ts: it's the same session. */
const SAME_SESSION_WINDOW_MS = 10 * 60_000;

/** Sources the Intervals.icu import can recreate (watch data). */
const DEVICE_SOURCES = new Set(["file", "intervals", "json_import"]);

/**
 * Record to save when the athlete deletes a run, or null if not needed:
 * manually entered runs have no duplicate to block.
 */
export function deletedImportFor(activity: {
  source: string | null;
  external_id?: string | null;
  sport: string | null;
  started_at: string;
}): DeletedImport | null {
  if (!activity.external_id && !DEVICE_SOURCES.has(activity.source ?? "")) return null;
  return {
    external_id: activity.external_id ?? null,
    sport: activity.sport ?? "running",
    started_at: activity.started_at,
  };
}

/** Deleted external ids: the import skips them before downloading the FIT. */
export function deletedExternalIds(rows: DeletedImport[]): Set<string> {
  return new Set(rows.flatMap((row) => row.external_id ? [row.external_id] : []));
}

/**
 * Run read from the FIT that matches a deleted one (same sport, start
 * within 10 minutes): e.g. a GPX imported and deleted before Intervals.icu
 * brought its id.
 */
export function matchesDeletedImport(
  candidate: { sport: string; started_at: string },
  rows: DeletedImport[],
): DeletedImport | null {
  const start = Date.parse(candidate.started_at);
  if (!Number.isFinite(start)) return null;
  return rows.find((row) => row.sport === candidate.sport && Math.abs(Date.parse(row.started_at) - start) <= SAME_SESSION_WINDOW_MS) ?? null;
}

/** deleted_imports table missing (migration 0032 not applied). */
export const isMissingTable = (error: { code?: string } | null | undefined) =>
  error?.code === "42P01" || error?.code === "PGRST205";

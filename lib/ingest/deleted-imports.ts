// Corse importate cancellate dall'atleta (tabella deleted_imports, migrazione
// 0032): l'import automatico da Intervals.icu non le ricrea. Funzioni pure.

export interface DeletedImport {
  external_id: string | null;
  sport: string;
  started_at: string;
}

/** Stessa finestra del dedupe in ingest.ts: è la stessa sessione. */
const SAME_SESSION_WINDOW_MS = 10 * 60_000;

/** Sorgenti che l'import da Intervals.icu può ricreare (dati dell'orologio). */
const DEVICE_SOURCES = new Set(["file", "intervals", "json_import"]);

/**
 * Traccia da salvare quando l'atleta cancella una corsa, o null se non serve:
 * le corse inserite a mano non hanno un doppione da bloccare.
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

/** Id esterni cancellati: l'import li salta prima di scaricare il FIT. */
export function deletedExternalIds(rows: DeletedImport[]): Set<string> {
  return new Set(rows.flatMap((row) => row.external_id ? [row.external_id] : []));
}

/**
 * Corsa letta dal FIT che coincide con una cancellata (stesso sport, inizio
 * entro 10 minuti): es. un GPX importato e cancellato prima che Intervals.icu
 * ne portasse l'id.
 */
export function matchesDeletedImport(
  candidate: { sport: string; started_at: string },
  rows: DeletedImport[],
): DeletedImport | null {
  const start = Date.parse(candidate.started_at);
  if (!Number.isFinite(start)) return null;
  return rows.find((row) => row.sport === candidate.sport && Math.abs(Date.parse(row.started_at) - start) <= SAME_SESSION_WINDOW_MS) ?? null;
}

/** Tabella deleted_imports assente (migrazione 0032 non applicata). */
export const isMissingTable = (error: { code?: string } | null | undefined) =>
  error?.code === "42P01" || error?.code === "PGRST205";

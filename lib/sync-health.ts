// Stato delle integrazioni: dice se c'è qualcosa di fermo da segnalare
// all'atleta (banner in home, notifica push). Modulo puro: niente import
// runtime, testabile. Solo le integrazioni collegate contano: chi non ha
// orologio né Intervals.icu non vede mai nulla.

/** Oltre questo tempo dati salute e sincronizzazione dell'orologio sono "fermi". */
export const STALE_HOURS = 48;
const HOUR_MS = 3_600_000;

export type SyncIssueKind = "intervals-error" | "watch-stale" | "health-stale";

export interface SyncIssue {
  kind: SyncIssueKind;
  /** Una riga: cosa è fermo e da quando. */
  text: string;
  /** Ultimo dato o ultima sincronizzazione riuscita (ISO), se noti. */
  since: string | null;
  /** Dettaglio per la notifica (es. il messaggio d'errore). */
  detail: string | null;
  href: string;
}

export interface SyncHealthInput {
  /** Riga di user_intervals_credentials; null se Intervals.icu non è collegato. */
  intervals: {
    lastError: string | null;
    importWellness: boolean;
    /** Quando la chiave è stata salvata: prima di 48 ore niente avvisi sui dati. */
    connectedAt: string | null;
  } | null;
  /** Client salute Zepp (zepp_connections, client_kind "health"); null se mai collegato. */
  zepp: {
    enabled: boolean;
    lastSyncAt: string | null;
    pairedAt: string | null;
  } | null;
  /** Giorno (YYYY-MM-DD) più recente con dati salute, per sorgente. */
  latestHealthDate: {
    zepp: string | null;
    intervals: string | null;
  };
}

export const SYNC_SETTINGS_HREF = {
  intervals: "/settings?tab=links#intervals-integration",
  zepp: "/settings?tab=links#zepp-os-integration",
} as const;

function time(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Un giorno di dati vale fino alla sua fine (00:00 del giorno dopo, UTC: l'ora di scarto non conta). */
function dayEnd(date: string | null | undefined): number | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return Date.parse(`${date}T00:00:00Z`) + 24 * HOUR_MS;
}

function olderThan(value: number | null, now: number, hours = STALE_HOURS): boolean {
  return value === null || now - value > hours * HOUR_MS;
}

/** "18 novembre" (giorno a Roma). */
export function formatSince(value: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return date.toLocaleDateString("it-IT", { day: "numeric", month: "long", timeZone: "Europe/Rome" });
}

function latest(values: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  for (const value of values) {
    if (!value) continue;
    if (best === null || (dayEnd(value) ?? time(value) ?? 0) > (dayEnd(best) ?? time(best) ?? 0)) best = value;
  }
  return best;
}

/**
 * Problemi da segnalare, dal più importante. Vuoto se è tutto a posto.
 * - Intervals.icu in errore (last_error non vuoto).
 * - Orologio Zepp collegato che non sincronizza da più di 48 ore.
 * - Dati salute (Zepp o wellness Intervals.icu) fermi da più di 48 ore.
 * L'ultimo non si ripete se la causa è già segnalata (orologio fermo o
 * Intervals.icu in errore).
 */
export function syncHealthIssues(input: SyncHealthInput, nowValue: Date | string = new Date()): SyncIssue[] {
  const now = typeof nowValue === "string" ? Date.parse(nowValue) : nowValue.getTime();
  const issues: SyncIssue[] = [];
  const intervals = input.intervals;
  const zepp = input.zepp?.enabled ? input.zepp : null;

  if (intervals?.lastError) {
    const since = input.latestHealthDate.intervals;
    issues.push({
      kind: "intervals-error",
      text: since
        ? `Intervals.icu non si sincronizza · ultimi dati del ${formatSince(since)}`
        : "Intervals.icu non si sincronizza",
      since,
      detail: intervals.lastError,
      href: SYNC_SETTINGS_HREF.intervals,
    });
  }

  let watchStale = false;
  if (zepp) {
    const lastSync = time(zepp.lastSyncAt);
    const reference = lastSync ?? time(zepp.pairedAt);
    if (reference !== null && olderThan(reference, now)) {
      watchStale = true;
      issues.push({
        kind: "watch-stale",
        text: zepp.lastSyncAt
          ? `L'orologio non si sincronizza dal ${formatSince(zepp.lastSyncAt)}`
          : "L'orologio non si è mai sincronizzato",
        since: zepp.lastSyncAt,
        detail: null,
        href: SYNC_SETTINGS_HREF.zepp,
      });
    }
  }

  const healthSources: Array<{ latest: string | null; connectedAt: string | null; href: string }> = [];
  if (zepp) healthSources.push({ latest: input.latestHealthDate.zepp, connectedAt: zepp.pairedAt, href: SYNC_SETTINGS_HREF.zepp });
  // Intervals.icu in errore è già segnalato: i suoi dati fermi non si ripetono.
  if (intervals?.importWellness && !intervals.lastError) {
    healthSources.push({ latest: input.latestHealthDate.intervals, connectedAt: intervals.connectedAt, href: SYNC_SETTINGS_HREF.intervals });
  }
  // Appena collegato: si aspettano 48 ore prima di dire che mancano i dati.
  const settled = healthSources.filter((source) => source.latest || olderThan(time(source.connectedAt), now));
  if (settled.length && !watchStale) {
    const freshest = latest(settled.map((source) => source.latest));
    if (olderThan(dayEnd(freshest), now)) {
      // Il link porta alla sorgente principale: l'orologio se c'è, se no Intervals.icu.
      issues.push({
        kind: "health-stale",
        text: freshest ? `Dati salute fermi al ${formatSince(freshest)}` : "Nessun dato salute ricevuto",
        since: freshest,
        detail: null,
        href: settled[0].href,
      });
    }
  }

  return issues;
}

/** Testo della notifica push per un problema. */
export function syncIssuePush(issue: SyncIssue): { title: string; body: string } {
  switch (issue.kind) {
    case "intervals-error":
      return {
        title: "Intervals.icu non si sincronizza",
        body: issue.detail ? `${issue.detail.split(" · ")[0].slice(0, 140)}` : "Apri le impostazioni per ricollegarlo.",
      };
    case "watch-stale":
      return {
        title: "Orologio fermo",
        body: issue.since
          ? `Nessuna sincronizzazione dal ${formatSince(issue.since)}. Apri l'app Zepp sul telefono.`
          : "Nessuna sincronizzazione ancora. Apri l'app Zepp sul telefono.",
      };
    case "health-stale":
      return {
        title: "Dati salute fermi",
        body: issue.since
          ? `Ultimi dati del ${formatSince(issue.since)}: il coach lavora senza sonno e recupero.`
          : "Non è ancora arrivato nessun dato salute.",
      };
  }
}

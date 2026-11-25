// Integrations status: says whether something is stuck and should be reported
// to the athlete (home banner, push notification). Pure module: no runtime
// imports (apart from the language), testable. Only connected integrations
// count: someone with no watch or Intervals.icu never sees anything. Texts
// aren't here: they come from syncIssueText / syncIssuePush.

import { intlLocale, type Locale, type Translator } from "../i18n/config.ts";

/** Beyond this time, health data and watch sync are "stuck". */
export const STALE_HOURS = 48;
const HOUR_MS = 3_600_000;

export type SyncIssueKind = "intervals-error" | "watch-stale" | "health-stale";

export interface SyncIssue {
  kind: SyncIssueKind;
  /** Last data or last successful sync (ISO), if known. */
  since: string | null;
  /** Detail for the notification (e.g. the error message). */
  detail: string | null;
  href: string;
}

export interface SyncHealthInput {
  /** Row of user_intervals_credentials; null if Intervals.icu is not connected. */
  intervals: {
    lastError: string | null;
    importWellness: boolean;
    /** When the key was saved: no data warnings within the first 48 hours. */
    connectedAt: string | null;
  } | null;
  /** Zepp health client (zepp_connections, client_kind "health"); null if never connected. */
  zepp: {
    enabled: boolean;
    lastSyncAt: string | null;
    pairedAt: string | null;
  } | null;
  /** Most recent day (YYYY-MM-DD) with health data, per source. */
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

/** A day of data is valid until its end (00:00 the next day, UTC: the hour of offset doesn't matter). */
function dayEnd(date: string | null | undefined): number | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return Date.parse(`${date}T00:00:00Z`) + 24 * HOUR_MS;
}

function olderThan(value: number | null, now: number, hours = STALE_HOURS): boolean {
  return value === null || now - value > hours * HOUR_MS;
}

/** "18 novembre" / "18 November" (day in Rome). */
export function formatSince(value: string, locale: Locale): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return date.toLocaleDateString(intlLocale(locale), { day: "numeric", month: "long", timeZone: "Europe/Rome" });
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
 * Issues to report, most important first. Empty if all is well.
 * - Intervals.icu in error (last_error not empty).
 * - Connected Zepp watch not syncing for over 48 hours, if its
 *   data doesn't arrive from Intervals.icu either.
 * - Health data (Zepp or Intervals.icu wellness) stuck for over 48 hours.
 * The last one isn't repeated if the cause is already reported (watch stuck or
 * Intervals.icu in error).
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
      since,
      detail: intervals.lastError,
      href: SYNC_SETTINGS_HREF.intervals,
    });
  }

  // Watch data also arrives from Intervals.icu (wellness): if it's
  // fresh there the watch works, even if the Zepp app isn't syncing.
  const wellnessFresh = Boolean(intervals?.importWellness && !intervals.lastError) &&
    !olderThan(dayEnd(input.latestHealthDate.intervals), now);

  let watchStale = false;
  if (zepp && !wellnessFresh) {
    const lastSync = time(zepp.lastSyncAt);
    const reference = lastSync ?? time(zepp.pairedAt);
    if (reference !== null && olderThan(reference, now)) {
      watchStale = true;
      issues.push({
        kind: "watch-stale",
        since: zepp.lastSyncAt,
        detail: null,
        href: SYNC_SETTINGS_HREF.zepp,
      });
    }
  }

  const healthSources: Array<{ latest: string | null; connectedAt: string | null; href: string }> = [];
  if (zepp) healthSources.push({ latest: input.latestHealthDate.zepp, connectedAt: zepp.pairedAt, href: SYNC_SETTINGS_HREF.zepp });
  // Intervals.icu in error is already reported: its stuck data isn't repeated.
  if (intervals?.importWellness && !intervals.lastError) {
    healthSources.push({ latest: input.latestHealthDate.intervals, connectedAt: intervals.connectedAt, href: SYNC_SETTINGS_HREF.intervals });
  }
  // Just connected: wait 48 hours before saying data is missing.
  const settled = healthSources.filter((source) => source.latest || olderThan(time(source.connectedAt), now));
  if (settled.length && !watchStale) {
    const freshest = latest(settled.map((source) => source.latest));
    if (olderThan(dayEnd(freshest), now)) {
      // The link goes to the main source: the watch if present, otherwise Intervals.icu.
      issues.push({
        kind: "health-stale",
        since: freshest,
        detail: null,
        href: settled[0].href,
      });
    }
  }

  return issues;
}

/** One line: what is stuck and since when. `t` is bound to the "status" namespace. */
export function syncIssueText(issue: SyncIssue, t: Translator, locale: Locale): string {
  const date = issue.since ? formatSince(issue.since, locale) : "";
  switch (issue.kind) {
    case "intervals-error":
      return issue.since ? t("sync.issue.intervalsErrorSince", { date }) : t("sync.issue.intervalsError");
    case "watch-stale":
      return issue.since ? t("sync.issue.watchStaleSince", { date }) : t("sync.issue.watchNeverSynced");
    case "health-stale":
      return issue.since ? t("sync.issue.healthStaleSince", { date }) : t("sync.issue.healthNone");
  }
}

/** Push notification text for an issue. `t` is bound to the "status" namespace. */
export function syncIssuePush(issue: SyncIssue, t: Translator, locale: Locale): { title: string; body: string } {
  const date = issue.since ? formatSince(issue.since, locale) : "";
  switch (issue.kind) {
    case "intervals-error":
      return {
        title: t("sync.push.intervalsError.title"),
        // The detail is the last error saved in the database: stays as is.
        body: issue.detail ? `${issue.detail.split(" · ")[0].slice(0, 140)}` : t("sync.push.intervalsError.bodyFallback"),
      };
    case "watch-stale":
      return {
        title: t("sync.push.watchStale.title"),
        body: issue.since ? t("sync.push.watchStale.bodySince", { date }) : t("sync.push.watchStale.bodyNever"),
      };
    case "health-stale":
      return {
        title: t("sync.push.healthStale.title"),
        body: issue.since ? t("sync.push.healthStale.bodySince", { date }) : t("sync.push.healthStale.bodyNone"),
      };
  }
}

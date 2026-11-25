import assert from "node:assert/strict";
import test from "node:test";
import { syncHealthIssues, syncIssuePush, syncIssueText, type SyncHealthInput } from "../lib/sync-health.ts";
import { itStatus } from "../lib/italian-translator.ts";
import { nextIntervalsError } from "../lib/intervals/sync-errors.ts";

const NOW = "2026-11-22T10:00:00Z";

const base: SyncHealthInput = {
  intervals: null,
  zepp: null,
  latestHealthDate: { zepp: null, intervals: null },
};

test("with no integrations connected there is nothing to report", () => {
  assert.deepEqual(syncHealthIssues(base, NOW), []);
  // Zepp disabled: as if it weren't there.
  assert.deepEqual(syncHealthIssues({ ...base, zepp: { enabled: false, lastSyncAt: "2026-10-01T08:00:00Z", pairedAt: "2026-09-01T08:00:00Z" } }, NOW), []);
});

test("all fine: no warning", () => {
  const issues = syncHealthIssues({
    intervals: { lastError: null, importWellness: true, connectedAt: "2026-10-01T08:00:00Z" },
    zepp: { enabled: true, lastSyncAt: "2026-11-22T07:00:00Z", pairedAt: "2026-10-01T08:00:00Z" },
    latestHealthDate: { zepp: "2026-11-22", intervals: "2026-11-21" },
  }, NOW);
  assert.deepEqual(issues, []);
});

test("Intervals.icu in error: warning with the last day of data and link to settings", () => {
  const [issue, ...rest] = syncHealthIssues({
    ...base,
    intervals: { lastError: "Wellness: chiave Intervals.icu non valida o revocata", importWellness: true, connectedAt: "2026-10-01T08:00:00Z" },
    latestHealthDate: { zepp: null, intervals: "2026-11-18" },
  }, NOW);
  assert.equal(issue.kind, "intervals-error");
  assert.equal(syncIssueText(issue, itStatus, "it"), "Intervals.icu non si sincronizza · ultimi dati del 18 novembre");
  assert.equal(issue.href, "/settings?tab=links#intervals-integration");
  // Stale Intervals.icu data isn't repeated as a second warning.
  assert.deepEqual(rest, []);
  assert.equal(syncIssuePush(issue, itStatus, "it").body, "Wellness: chiave Intervals.icu non valida o revocata");
});

test("Zepp watch stalled for more than 48 hours", () => {
  const issues = syncHealthIssues({
    ...base,
    zepp: { enabled: true, lastSyncAt: "2026-11-19T21:00:00Z", pairedAt: "2026-10-01T08:00:00Z" },
    latestHealthDate: { zepp: "2026-11-19", intervals: null },
  }, NOW);
  assert.deepEqual(issues.map((issue) => issue.kind), ["watch-stale"]);
  assert.equal(syncIssueText(issues[0], itStatus, "it"), "L'orologio non si sincronizza dal 19 novembre");
  assert.equal(issues[0].href, "/settings?tab=links#zepp-os-integration");
});

test("Zepp app stalled but fresh watch data from Intervals.icu: no warning", () => {
  // The real case of 22/11: Zepp app stalled at the 19th, Intervals.icu wellness from today.
  const input: SyncHealthInput = {
    intervals: { lastError: null, importWellness: true, connectedAt: "2026-10-01T08:00:00Z" },
    zepp: { enabled: true, lastSyncAt: "2026-11-19T21:47:52Z", pairedAt: "2026-10-23T11:57:54Z" },
    latestHealthDate: { zepp: "2026-11-19", intervals: "2026-11-22" },
  };
  assert.deepEqual(syncHealthIssues(input, NOW), []);
  // If Intervals.icu is also stalled, the watch is flagged again.
  const stale = syncHealthIssues({ ...input, latestHealthDate: { zepp: "2026-11-19", intervals: "2026-11-19" } }, NOW);
  assert.deepEqual(stale.map((issue) => issue.kind), ["watch-stale"]);
  // With wellness import off, Intervals.icu brings no watch data.
  const off = syncHealthIssues({ ...input, intervals: { ...input.intervals!, importWellness: false } }, NOW);
  assert.deepEqual(off.map((issue) => issue.kind), ["watch-stale"]);
});

test("47 hours ago is still fine", () => {
  const issues = syncHealthIssues({
    ...base,
    zepp: { enabled: true, lastSyncAt: "2026-11-20T11:00:00Z", pairedAt: "2026-10-01T08:00:00Z" },
    latestHealthDate: { zepp: "2026-11-20", intervals: null },
  }, NOW);
  assert.deepEqual(issues, []);
});

test("the watch syncs but health data doesn't arrive", () => {
  const issues = syncHealthIssues({
    ...base,
    zepp: { enabled: true, lastSyncAt: "2026-11-22T07:00:00Z", pairedAt: "2026-10-01T08:00:00Z" },
    latestHealthDate: { zepp: "2026-11-17", intervals: null },
  }, NOW);
  assert.deepEqual(issues.map((issue) => issue.kind), ["health-stale"]);
  assert.equal(syncIssueText(issues[0], itStatus, "it"), "Dati salute fermi al 17 novembre");
});

test("Intervals.icu wellness stalled with no errors: health data warning", () => {
  const issues = syncHealthIssues({
    ...base,
    intervals: { lastError: null, importWellness: true, connectedAt: "2026-10-01T08:00:00Z" },
    latestHealthDate: { zepp: null, intervals: "2026-11-19" },
  }, NOW);
  assert.deepEqual(issues.map((issue) => issue.kind), ["health-stale"]);
  assert.equal(issues[0].href, "/settings?tab=links#intervals-integration");
  // One up-to-date source is enough.
  assert.deepEqual(syncHealthIssues({
    ...base,
    intervals: { lastError: null, importWellness: true, connectedAt: "2026-10-01T08:00:00Z" },
    zepp: { enabled: true, lastSyncAt: "2026-11-22T07:00:00Z", pairedAt: "2026-10-01T08:00:00Z" },
    latestHealthDate: { zepp: "2026-11-22", intervals: "2026-11-10" },
  }, NOW), []);
});

test("wellness import off: Intervals.icu data doesn't count", () => {
  assert.deepEqual(syncHealthIssues({
    ...base,
    intervals: { lastError: null, importWellness: false, connectedAt: "2026-10-01T08:00:00Z" },
  }, NOW), []);
});

test("just connected: 48 hours of grace before saying data is missing", () => {
  const fresh = syncHealthIssues({
    ...base,
    intervals: { lastError: null, importWellness: true, connectedAt: "2026-11-21T18:00:00Z" },
  }, NOW);
  assert.deepEqual(fresh, []);
  const old = syncHealthIssues({
    ...base,
    intervals: { lastError: null, importWellness: true, connectedAt: "2026-11-10T18:00:00Z" },
  }, NOW);
  assert.equal(syncIssueText(old[0], itStatus, "it"), "Nessun dato salute ricevuto");
});

test("the Intervals.icu error stays until the same part succeeds", () => {
  const importOnly = { importRan: true, publishRan: false };
  const full = { importRan: true, publishRan: true };
  // Hourly import succeeded: the failed plan push from the morning stays.
  assert.equal(nextIntervalsError("Piano: 500 Intervals.icu", { ...importOnly, errors: [] }), "Piano: 500 Intervals.icu");
  // Hourly import succeeded: its earlier error is cleared.
  assert.equal(nextIntervalsError("Wellness: timeout", { ...importOnly, errors: [] }), null);
  assert.equal(
    nextIntervalsError("Wellness: timeout · Creazione: 422", { ...importOnly, errors: [] }),
    "Creazione: 422",
  );
  // New import error with an earlier plan error: both stay.
  assert.equal(
    nextIntervalsError("Piano: 500", { ...importOnly, errors: ["Attività 12: FIT non valido"] }),
    "Attività 12: FIT non valido · Piano: 500",
  );
  // Republish without a successful import: the import error stays.
  assert.equal(nextIntervalsError("Wellness: timeout · Piano: 500", { importRan: false, publishRan: true, errors: [] }), "Wellness: timeout");
  // Full round succeeded: all clean.
  assert.equal(nextIntervalsError("Wellness: timeout · Piano: 500", { ...full, errors: [] }), null);
  assert.equal(nextIntervalsError(null, { ...full, errors: [] }), null);
});

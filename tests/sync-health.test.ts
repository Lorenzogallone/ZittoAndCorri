import assert from "node:assert/strict";
import test from "node:test";
import { syncHealthIssues, syncIssuePush, type SyncHealthInput } from "../lib/sync-health.ts";
import { nextIntervalsError } from "../lib/intervals/sync-errors.ts";

const NOW = "2026-11-22T10:00:00Z";

const base: SyncHealthInput = {
  intervals: null,
  zepp: null,
  latestHealthDate: { zepp: null, intervals: null },
};

test("senza integrazioni collegate non c'è nulla da segnalare", () => {
  assert.deepEqual(syncHealthIssues(base, NOW), []);
  // Zepp disattivato: come se non ci fosse.
  assert.deepEqual(syncHealthIssues({ ...base, zepp: { enabled: false, lastSyncAt: "2026-10-01T08:00:00Z", pairedAt: "2026-09-01T08:00:00Z" } }, NOW), []);
});

test("tutto a posto: nessun avviso", () => {
  const issues = syncHealthIssues({
    intervals: { lastError: null, importWellness: true, connectedAt: "2026-10-01T08:00:00Z" },
    zepp: { enabled: true, lastSyncAt: "2026-11-22T07:00:00Z", pairedAt: "2026-10-01T08:00:00Z" },
    latestHealthDate: { zepp: "2026-11-22", intervals: "2026-11-21" },
  }, NOW);
  assert.deepEqual(issues, []);
});

test("Intervals.icu in errore: avviso con l'ultimo giorno di dati e link alle impostazioni", () => {
  const [issue, ...rest] = syncHealthIssues({
    ...base,
    intervals: { lastError: "Wellness: chiave Intervals.icu non valida o revocata", importWellness: true, connectedAt: "2026-10-01T08:00:00Z" },
    latestHealthDate: { zepp: null, intervals: "2026-11-18" },
  }, NOW);
  assert.equal(issue.kind, "intervals-error");
  assert.equal(issue.text, "Intervals.icu non si sincronizza · ultimi dati del 18 novembre");
  assert.equal(issue.href, "/settings?tab=links#intervals-integration");
  // I dati fermi di Intervals.icu non si ripetono come secondo avviso.
  assert.deepEqual(rest, []);
  assert.equal(syncIssuePush(issue).body, "Wellness: chiave Intervals.icu non valida o revocata");
});

test("orologio Zepp fermo da più di 48 ore", () => {
  const issues = syncHealthIssues({
    ...base,
    zepp: { enabled: true, lastSyncAt: "2026-11-19T21:00:00Z", pairedAt: "2026-10-01T08:00:00Z" },
    latestHealthDate: { zepp: "2026-11-19", intervals: null },
  }, NOW);
  assert.deepEqual(issues.map((issue) => issue.kind), ["watch-stale"]);
  assert.equal(issues[0].text, "L'orologio non si sincronizza dal 19 novembre");
  assert.equal(issues[0].href, "/settings?tab=links#zepp-os-integration");
});

test("47 ore fa è ancora in regola", () => {
  const issues = syncHealthIssues({
    ...base,
    zepp: { enabled: true, lastSyncAt: "2026-11-20T11:00:00Z", pairedAt: "2026-10-01T08:00:00Z" },
    latestHealthDate: { zepp: "2026-11-20", intervals: null },
  }, NOW);
  assert.deepEqual(issues, []);
});

test("l'orologio sincronizza ma i dati salute non arrivano", () => {
  const issues = syncHealthIssues({
    ...base,
    zepp: { enabled: true, lastSyncAt: "2026-11-22T07:00:00Z", pairedAt: "2026-10-01T08:00:00Z" },
    latestHealthDate: { zepp: "2026-11-17", intervals: null },
  }, NOW);
  assert.deepEqual(issues.map((issue) => issue.kind), ["health-stale"]);
  assert.equal(issues[0].text, "Dati salute fermi al 17 novembre");
});

test("wellness Intervals.icu fermo senza errori: avviso dati salute", () => {
  const issues = syncHealthIssues({
    ...base,
    intervals: { lastError: null, importWellness: true, connectedAt: "2026-10-01T08:00:00Z" },
    latestHealthDate: { zepp: null, intervals: "2026-11-19" },
  }, NOW);
  assert.deepEqual(issues.map((issue) => issue.kind), ["health-stale"]);
  assert.equal(issues[0].href, "/settings?tab=links#intervals-integration");
  // Basta una sorgente aggiornata.
  assert.deepEqual(syncHealthIssues({
    ...base,
    intervals: { lastError: null, importWellness: true, connectedAt: "2026-10-01T08:00:00Z" },
    zepp: { enabled: true, lastSyncAt: "2026-11-22T07:00:00Z", pairedAt: "2026-10-01T08:00:00Z" },
    latestHealthDate: { zepp: "2026-11-22", intervals: "2026-11-10" },
  }, NOW), []);
});

test("import wellness spento: i dati Intervals.icu non contano", () => {
  assert.deepEqual(syncHealthIssues({
    ...base,
    intervals: { lastError: null, importWellness: false, connectedAt: "2026-10-01T08:00:00Z" },
  }, NOW), []);
});

test("appena collegato: 48 ore di tolleranza prima di dire che mancano i dati", () => {
  const fresh = syncHealthIssues({
    ...base,
    intervals: { lastError: null, importWellness: true, connectedAt: "2026-11-21T18:00:00Z" },
  }, NOW);
  assert.deepEqual(fresh, []);
  const old = syncHealthIssues({
    ...base,
    intervals: { lastError: null, importWellness: true, connectedAt: "2026-11-10T18:00:00Z" },
  }, NOW);
  assert.equal(old[0].text, "Nessun dato salute ricevuto");
});

test("l'errore Intervals.icu resta finché la stessa parte non riesce", () => {
  const importOnly = { importRan: true, publishRan: false };
  const full = { importRan: true, publishRan: true };
  // Import orario riuscito: l'invio del piano fallito al mattino resta.
  assert.equal(nextIntervalsError("Piano: 500 Intervals.icu", { ...importOnly, errors: [] }), "Piano: 500 Intervals.icu");
  // Import orario riuscito: il suo errore precedente si cancella.
  assert.equal(nextIntervalsError("Wellness: timeout", { ...importOnly, errors: [] }), null);
  assert.equal(
    nextIntervalsError("Wellness: timeout · Creazione: 422", { ...importOnly, errors: [] }),
    "Creazione: 422",
  );
  // Nuovo errore di import con un errore di piano precedente: restano entrambi.
  assert.equal(
    nextIntervalsError("Piano: 500", { ...importOnly, errors: ["Attività 12: FIT non valido"] }),
    "Attività 12: FIT non valido · Piano: 500",
  );
  // Ripubblicazione senza import riuscita: l'errore di import resta.
  assert.equal(nextIntervalsError("Wellness: timeout · Piano: 500", { importRan: false, publishRan: true, errors: [] }), "Wellness: timeout");
  // Giro completo riuscito: tutto pulito.
  assert.equal(nextIntervalsError("Wellness: timeout · Piano: 500", { ...full, errors: [] }), null);
  assert.equal(nextIntervalsError(null, { ...full, errors: [] }), null);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  deletedExternalIds,
  deletedImportFor,
  isMissingTable,
  matchesDeletedImport,
} from "../lib/ingest/deleted-imports.ts";

test("cancellare una corsa importata lascia una traccia, una manuale no", () => {
  assert.deepEqual(
    deletedImportFor({ source: "intervals", external_id: "intervals:i42", sport: "running", started_at: "2026-11-20T06:30:00Z" }),
    { external_id: "intervals:i42", sport: "running", started_at: "2026-11-20T06:30:00Z" },
  );
  // GPX cancellato prima che Intervals.icu ne portasse l'id.
  assert.deepEqual(
    deletedImportFor({ source: "file", external_id: null, sport: "running", started_at: "2026-11-20T06:30:00Z" }),
    { external_id: null, sport: "running", started_at: "2026-11-20T06:30:00Z" },
  );
  assert.equal(deletedImportFor({ source: "manual", sport: "running", started_at: "2026-11-20T06:30:00Z" }), null);
});

test("l'import riconosce la corsa cancellata per id o per sessione", () => {
  const rows = [
    { external_id: "intervals:i42", sport: "running", started_at: "2026-11-20T06:30:00Z" },
    { external_id: null, sport: "running", started_at: "2026-11-21T17:00:00Z" },
  ];
  assert.ok(deletedExternalIds(rows).has("intervals:i42"));
  assert.equal(deletedExternalIds(rows).size, 1);
  assert.ok(matchesDeletedImport({ sport: "running", started_at: "2026-11-21T17:04:00Z" }, rows));
  assert.equal(matchesDeletedImport({ sport: "running", started_at: "2026-11-21T17:30:00Z" }, rows), null);
  assert.equal(matchesDeletedImport({ sport: "cycling", started_at: "2026-11-21T17:00:00Z" }, rows), null);
});

test("senza la tabella (migrazione 0032) cancellazione e import vanno avanti", () => {
  assert.equal(isMissingTable({ code: "42P01" }), true);
  assert.equal(isMissingTable({ code: "PGRST205" }), true);
  assert.equal(isMissingTable({ code: "42501" }), false);
});

test("cancellazione e import da Intervals.icu usano la traccia", () => {
  const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const actions = read("app/activities/actions.ts");
  const deleteBody = actions.slice(actions.indexOf("export async function deleteActivity"));
  assert.ok(deleteBody.indexOf('from("deleted_imports").insert') < deleteBody.indexOf('from("activities").delete()'));
  const importer = read("lib/intervals/import.ts");
  assert.match(importer, /!deletedIds\.has\(intervalsActivityExternalId\(activity\)\)/);
  // I tombstone si scartano prima del limite per giro, così non occupano posti.
  assert.ok(importer.indexOf("deletedIds.has") < importer.indexOf(".slice(0, MAX_ACTIVITIES_PER_RUN)"));
  assert.match(importer, /matchesDeletedImport\(/);
  const sql = read("supabase/migrations/0032_deleted_imports.sql");
  assert.match(sql, /enable row level security/);
  assert.match(sql, /for insert with check \(auth\.uid\(\) = user_id\)/);
});

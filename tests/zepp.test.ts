import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { ATLCTLResult } from "../lib/types.ts";
import { normalizeZeppPayload } from "../lib/zepp/normalize.ts";
import { computeZeppReadiness } from "../lib/zepp/readiness.ts";
import { ZeppSyncPayloadSchema } from "../lib/zepp/schema.ts";
import type { ZeppDailyMetric } from "../lib/zepp/types.ts";

const internal: ATLCTLResult = {
  load7: 200,
  atl: 40,
  ctl: 30,
  tsb: -10,
  baseline7: 180,
  load_ratio: 1.11,
  status: "fatigued",
  confidence: "high",
  history_days: 60,
  sources: { heart_rate: 2, rpe: 1, estimated: 0 },
  series: [],
};

function metric(overrides: Partial<ZeppDailyMetric> = {}): ZeppDailyMetric {
  return {
    date: "2026-08-25",
    captured_at: "2026-08-25T08:00:00.000Z",
    training_load: null,
    vo2_max: null,
    recovery_raw: null,
    sleep_score: null,
    sleep_total_min: null,
    sleep_deep_min: null,
    resting_hr: null,
    max_hr: null,
    stress_avg: null,
    spo2_avg: null,
    spo2_min: null,
    skin_temp_avg_c: null,
    pai_total: null,
    pai_today: null,
    steps: null,
    calories: null,
    stand_hours: null,
    ...overrides,
  };
}

test("Zepp resta opt-in e ricade integralmente sul calcolo interno", () => {
  const result = computeZeppReadiness(
    [metric({ recovery_raw: 0, sleep_score: 100 })],
    internal,
    new Date("2026-08-25T09:00:00.000Z"),
    false,
  );
  assert.equal(result.available, false);
  assert.equal(result.source, "internal");
  assert.equal(result.internal, internal);
});

test("richiede un segnale di carico e uno di recupero", () => {
  const result = computeZeppReadiness(
    [metric({ training_load: 466 })],
    internal,
    new Date("2026-08-25T09:00:00.000Z"),
  );
  assert.equal(result.available, false);
  assert.equal(result.source, "internal");
});

test("ridistribuisce i pesi Zepp mancanti e limita il carico interno al 5%", () => {
  const result = computeZeppReadiness(
    [metric({ recovery_raw: 0, sleep_score: 100 })],
    internal,
    new Date("2026-08-25T09:00:00.000Z"),
  );
  assert.equal(result.available, true);
  assert.equal(result.score, 96);
  assert.equal(result.status, "intense");
  assert.deepEqual(result.components.map((part) => part.weight), [45, 20, 5]);
});

test("dati Zepp oltre 36 ore non modificano lo stato", () => {
  const result = computeZeppReadiness(
    [metric({ recovery_raw: 0, sleep_score: 100 })],
    internal,
    new Date("2026-08-27T00:00:01.000Z"),
  );
  assert.equal(result.available, false);
  assert.equal(result.source, "internal");
  assert.ok((result.freshness_hours ?? 0) > 36);
});

test("il payload V1 filtra sentinelle senza iniziare misurazioni", () => {
  const parsed = ZeppSyncPayloadSchema.parse({
    schemaVersion: 1,
    clientSyncId: "zc:1724572800000:1",
    trigger: "manual",
    capturedAt: "2026-08-25T08:00:00.000Z",
    localDate: "2026-08-25",
    timezoneOffsetMinutes: 120,
    device: { deviceName: "Active 3 Premium", apiLevel: "4.2" },
    data: {
      workout: { trainingLoad: 466, vo2Max: 48, fullRecoveryTime: 0 },
      heartRate: { resting: 0, today: [0, 48, 55, 255] },
      sleep: { score: 88, totalTime: 460, deepTime: 90 },
      stress: { todayByHour: [0, 20, 40, 101] },
      spo2: { lastDay: [0, 94, 98, 101] },
      bodyTemperature: { current: { value: -1000 }, today: [-1000, 34.8, 35.1] },
      pai: null,
      activity: { steps: 9000, calories: 600, standHours: 10 },
      userProfile: null,
    },
  });
  const normalized = normalizeZeppPayload(parsed, "user-1", "connection-1");
  assert.equal(normalized.training_load, 466);
  assert.equal(normalized.vo2_max, 48);
  assert.equal(normalized.resting_hr, undefined);
  assert.deepEqual(normalized.hr_series, [48, 55]);
  assert.equal(normalized.stress_avg, 30);
  assert.equal(normalized.spo2_avg, 96);
  assert.equal(normalized.skin_temp_avg_c, 34.95);
});

test("un singolo valore sensore malformato non blocca tutto il payload", () => {
  const parsed = ZeppSyncPayloadSchema.parse({
    schemaVersion: 1,
    clientSyncId: "zc:1724572800000:2",
    trigger: "retry",
    capturedAt: "2026-08-25T08:00:00.000Z",
    localDate: "2026-08-25",
    timezoneOffsetMinutes: 120,
    device: { deviceName: "Active 3 Premium", batteryPercent: -1 },
    data: {
      workout: {
        trainingLoad: 466,
        vo2Max: 48,
        hrZones: { type: -1, rest: 0, range: [null, 120, "bad", 140, 150, 160, 170] },
        history: [null, { startTime: 1_724_572_800, duration: 3_600 }],
      },
      heartRate: { resting: 52, today: [null, 0, 52, "bad", 60] },
      sleep: { score: 85, stages: [null, { model: 1, start: 10, stop: 20 }] },
      stress: { lastWeekByHour: [11, 17, 0, 48] },
      spo2: null,
      bodyTemperature: { current: { time: 55 }, today: [34.2, -1000] },
      pai: null,
      activity: null,
      userProfile: { heightCm: 1.75 },
    },
  });
  const normalized = normalizeZeppPayload(parsed, "user-1", "connection-1");
  assert.equal(normalized.training_load, 466);
  assert.deepEqual(normalized.hr_series, [52, 60]);
  assert.equal(normalized.hr_zone_type, undefined);
  assert.deepEqual(normalized.sleep_stages, [{ model: 1, start: 10, stop: 20 }]);
  assert.equal(normalized.skin_temp_avg_c, 34.2);
  assert.deepEqual(normalized.device_profile, { height_cm: 175 });
});

test("la migrazione Zepp applica isolamento utente, idempotenza e cascade", () => {
  const sql = readFileSync("supabase/migrations/0014_zepp_os.sql", "utf8");
  for (const table of [
    "zepp_pairing_codes",
    "zepp_connections",
    "zepp_sync_events",
    "zepp_daily_metrics",
  ]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql, /unique \(connection_id, client_sync_id\)/);
  assert.match(sql, /references public\.zepp_connections on delete cascade/);
  assert.match(sql, /connection_id\s+uuid not null references public\.zepp_connections on delete cascade/);
  assert.match(sql, /using \(auth\.uid\(\) = user_id\)/);
});

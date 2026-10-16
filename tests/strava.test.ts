import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  mapStravaActivity,
  mapStravaSport,
  mapStravaStreams,
  type StravaActivity,
} from "../lib/strava/map.ts";

function activity(overrides: Partial<StravaActivity> = {}): StravaActivity {
  return {
    id: 12345678901,
    name: "Corsa mattutina",
    sport_type: "Run",
    start_date: "2026-10-10T06:30:00Z",
    distance: 10012.4,
    moving_time: 3000,
    elapsed_time: 3120,
    total_elevation_gain: 45.6,
    average_heartrate: 148.6,
    max_heartrate: 171.2,
    calories: 702.5,
    workout_type: 0,
    ...overrides,
  };
}

test("sport_type Strava mappato sulla taxonomy dell'app", () => {
  const cases: Array<[string, string]> = [
    ["Run", "running"],
    ["TrailRun", "running"],
    ["VirtualRun", "running"],
    ["Walk", "walking"],
    ["Hike", "hiking"],
    ["Ride", "cycling"],
    ["GravelRide", "cycling"],
    ["EMountainBikeRide", "cycling"],
    ["VirtualRide", "cycling"],
    ["Swim", "swimming"],
    ["WeightTraining", "strength"],
    ["Workout", "strength"],
    ["Crossfit", "strength"],
    ["HighIntensityIntervalTraining", "strength"],
    ["Soccer", "soccer"],
    ["Tennis", "tennis"],
    ["Padel", "padel"],
    ["Yoga", "yoga"],
    ["Pilates", "pilates"],
    ["AlpineSki", "ski"],
    ["NordicSki", "ski"],
    ["Snowboard", "ski"],
    ["Kayaking", "other"],
    ["Golf", "other"],
  ];
  for (const [input, expected] of cases) assert.equal(mapStravaSport(input), expected, input);
  assert.equal(mapStravaSport(undefined), "other");
  assert.equal(mapStravaSport(null), "other");
});

test("attività Strava senza stream → ActivityInput con campi arrotondati", () => {
  const input = mapStravaActivity(activity({ perceived_exertion: 6.6 }));
  assert.deepEqual(input, {
    source: "strava",
    external_id: "12345678901",
    type: "unclassified",
    sport: "running",
    started_at: "2026-10-10T06:30:00.000Z",
    distance_m: 10012,
    duration_s: 3120,
    moving_time_s: 3000,
    avg_hr: 149,
    max_hr: 171,
    elevation_gain_m: 46,
    calories: 703,
    rpe: 7,
    rpe_source: "api",
    source_title: "Corsa mattutina",
  });
});

test("gara solo per le corse con workout_type 1", () => {
  assert.equal(mapStravaActivity(activity({ workout_type: 1 })).type, "race");
  assert.equal(mapStravaActivity(activity({ workout_type: 2 })).type, "unclassified");
  assert.equal(mapStravaActivity(activity({ workout_type: null })).type, "unclassified");
  // Bici: workout_type 11 = gara, ma per gli sport non running il tipo è cross.
  assert.equal(mapStravaActivity(activity({ sport_type: "Ride", workout_type: 11 })).type, "cross");
  assert.equal(mapStravaActivity(activity({ sport_type: "Ride", workout_type: 1 })).type, "cross");
});

test("campi mancanti o non validi restano assenti", () => {
  const input = mapStravaActivity(
    activity({
      sport_type: "WeightTraining",
      distance: 0,
      moving_time: null,
      total_elevation_gain: 0,
      average_heartrate: null,
      max_heartrate: undefined,
      calories: 0,
      name: "  ",
    }),
  );
  assert.equal(input.sport, "strength");
  assert.equal(input.type, "cross");
  assert.equal(input.distance_m, 0);
  assert.equal(input.moving_time_s, undefined);
  assert.equal(input.avg_hr, undefined);
  assert.equal(input.max_hr, undefined);
  assert.equal(input.elevation_gain_m, undefined);
  assert.equal(input.calories, undefined);
  assert.equal(input.rpe, undefined);
  assert.equal(input.rpe_source, undefined);
  assert.equal(input.source_title, undefined);
  assert.equal(input.gps_series, undefined);
  assert.equal(input.hr_series, undefined);
  assert.equal(input.cadence_series, undefined);
});

test("RPE limitato a 1-10 e corsa senza distanza importata come altro", () => {
  assert.equal(mapStravaActivity(activity({ perceived_exertion: 14 })).rpe, 10);
  assert.equal(mapStravaActivity(activity({ perceived_exertion: 0.2 })).rpe, 1);
  const treadmill = mapStravaActivity(activity({ distance: 0 }));
  assert.equal(treadmill.sport, "other");
  assert.equal(treadmill.type, "cross");
});

test("durata: fallback su moving_time, errore se manca del tutto", () => {
  assert.equal(mapStravaActivity(activity({ elapsed_time: 0 })).duration_s, 3000);
  assert.throws(() => mapStravaActivity(activity({ elapsed_time: 0, moving_time: 0 })), /durata/);
  assert.throws(() => mapStravaActivity(activity({ start_date: "non-una-data" })), /data/);
});

test("stream → serie GPS/HR/cadenza, punti non validi scartati", () => {
  const series = mapStravaStreams({
    time: { data: [0, 1, 2, 3, 4] },
    latlng: {
      data: [
        [45.4642031, 9.1899822],
        [45.4642531, 9.1900322],
        [0, 0],
        [95, 9.19],
        [45.4643531, 9.1901322],
      ],
    },
    altitude: { data: [120.04, 120.56, 121, 121, 121.26] },
    heartrate: { data: [0, 120, 121.6, 400, 125] },
    cadence: { data: [0, 84, 85.4, 86, 0] },
  });
  assert.deepEqual(series.gps_series, [
    { t: 0, lat: 45.464203, lon: 9.189982, ele: 120 },
    { t: 1, lat: 45.464253, lon: 9.190032, ele: 120.6 },
    { t: 4, lat: 45.464353, lon: 9.190132, ele: 121.3 },
  ]);
  assert.deepEqual(series.hr_series, [
    { t: 1, bpm: 120 },
    { t: 2, bpm: 122 },
    { t: 4, bpm: 125 },
  ]);
  // Cadenza in giri/min per gamba come nei FIT: avgCadenceSpm la raddoppia
  // per la corsa (85 rpm → 170 passi/min), qui non va convertita.
  assert.deepEqual(series.cadence_series, [
    { t: 1, rpm: 84 },
    { t: 2, rpm: 85 },
    { t: 3, rpm: 86 },
  ]);
});

test("stream nel formato array e stream mancanti", () => {
  const series = mapStravaStreams([
    { type: "time", data: [0, 5, 10] },
    { type: "heartrate", data: [130, 135, 140] },
  ]);
  assert.deepEqual(series.hr_series, [
    { t: 0, bpm: 130 },
    { t: 5, bpm: 135 },
    { t: 10, bpm: 140 },
  ]);
  assert.equal(series.gps_series, undefined);
  assert.equal(series.cadence_series, undefined);

  // Senza stream time non si può allineare nulla.
  assert.deepEqual(mapStravaStreams({ heartrate: { data: [120, 130] } }), {});
  assert.deepEqual(mapStravaStreams(null), {});
  // Un solo punto GPS non è una traccia.
  assert.equal(
    mapStravaStreams({ time: { data: [0] }, latlng: { data: [[45.1, 9.1]] } }).gps_series,
    undefined,
  );
});

test("HR media/max ricavate dallo stream se mancano nel riepilogo", () => {
  const input = mapStravaActivity(
    activity({ average_heartrate: null, max_heartrate: null }),
    { time: { data: [0, 10, 20] }, heartrate: { data: [140, 150, 163] } },
  );
  assert.equal(input.avg_hr, 151);
  assert.equal(input.max_hr, 163);
  assert.equal(input.hr_series?.length, 3);
});

test("la migrazione Strava tiene i token in Vault e le RPC solo al service role", () => {
  const sql = readFileSync("supabase/migrations/0020_strava.sql", "utf8");
  assert.match(sql, /create table if not exists public\.strava_connections/);
  assert.match(sql, /alter table public\.strava_connections enable row level security/);
  assert.match(sql, /for select using \(auth\.uid\(\) = user_id\)/);
  for (const fn of ["admin_set_strava_tokens", "admin_get_strava_tokens", "admin_delete_strava_connection"]) {
    assert.match(sql, new RegExp(`create or replace function public\\.${fn}`));
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to service_role`));
  }
  assert.equal(sql.match(/auth\.role\(\) <> 'service_role'/g)?.length, 3);
  assert.match(sql, /add column if not exists external_id text/);
  assert.match(sql, /\(user_id, source, external_id\)\s+where external_id is not null/);
});

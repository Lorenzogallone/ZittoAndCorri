#!/usr/bin/env node
// Demo data for the README screenshots.
//
// SAFETY: this script talks ONLY to a local Supabase stack (127.0.0.1 or
// localhost). It never reads .env files and refuses to run against any other
// host. Everything it writes is invented: the runner "Alex Runner"
// (demo@example.com), the races, the GPS tracks, the coach chat.
//
//   npx supabase start            (applies supabase/migrations)
//   node scripts/demo/seed.mjs
//
// See scripts/demo/README.md for the full recipe.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");

// ── Safety guard ────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.DEMO_SUPABASE_URL ?? "http://127.0.0.1:54321";
const APP_URL = process.env.DEMO_APP_URL ?? "http://localhost:3100";

function die(message) {
  console.error(`seed: ${message}`);
  process.exit(1);
}

let parsedUrl;
try {
  parsedUrl = new URL(SUPABASE_URL);
} catch {
  die(`invalid DEMO_SUPABASE_URL: ${SUPABASE_URL}`);
}
if (parsedUrl.hostname !== "127.0.0.1" && parsedUrl.hostname !== "localhost") {
  die(`refusing to run against ${parsedUrl.hostname}: only a local Supabase (127.0.0.1 or localhost) is allowed.`);
}
if (parsedUrl.protocol !== "http:") die("the local Supabase API must be plain http.");

/** Keys of the LOCAL stack: from the environment, or from `supabase status`. */
function localKeys() {
  const fromEnv = {
    secret: process.env.DEMO_SUPABASE_SECRET_KEY,
    publishable: process.env.DEMO_SUPABASE_PUBLISHABLE_KEY,
  };
  if (fromEnv.secret && fromEnv.publishable) return fromEnv;
  let output;
  try {
    output = execFileSync("npx", ["--yes", "supabase@latest", "status", "-o", "env"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    die("could not read the local stack keys. Is `npx supabase start` running?");
  }
  const env = Object.fromEntries(
    output.split("\n")
      .map((line) => line.match(/^([A-Z_]+)="?([^"]*)"?$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2]]),
  );
  const apiUrl = env.API_URL ? new URL(env.API_URL) : null;
  if (!apiUrl || apiUrl.hostname !== parsedUrl.hostname || apiUrl.port !== parsedUrl.port) {
    die(`the running local stack is at ${env.API_URL ?? "?"}, not at ${SUPABASE_URL}.`);
  }
  const secret = env.SECRET_KEY ?? env.SERVICE_ROLE_KEY;
  const publishable = env.PUBLISHABLE_KEY ?? env.ANON_KEY;
  if (!secret || !publishable) die("`supabase status` did not return the API keys.");
  return { secret, publishable };
}

const keys = localKeys();
const admin = createClient(SUPABASE_URL, keys.secret, { auth: { persistSession: false, autoRefreshToken: false } });

// ── Small helpers ───────────────────────────────────────────────────────────

const DEMO_EMAIL = "demo@example.com";
const ONBOARDING_EMAIL = "newrunner@example.com";
const DEMO_PASSWORD = "demo-local-only-password";

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (random) => {
  const u = Math.max(random(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
};

const ROME = "Europe/Rome";
const romeParts = (date) => Object.fromEntries(
  new Intl.DateTimeFormat("en-GB", {
    timeZone: ROME, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]),
);
const romeDay = (date = new Date()) => {
  const p = romeParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
};
const addDays = (iso, days) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const mondayOf = (iso) => addDays(iso, -((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7));
/** Wall-clock time in Rome → UTC Date. */
function romeToUtc(iso, hh, mm) {
  const [y, m, d] = iso.split("-").map(Number);
  const wanted = Date.UTC(y, m - 1, d, hh, mm);
  let guess = wanted;
  for (let i = 0; i < 3; i++) {
    const p = romeParts(new Date(guess));
    guess += wanted - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  }
  return new Date(guess);
}
const pace = (s) => {
  const [m, sec] = s.split(":").map(Number);
  return m * 60 + sec;
};

function check(result, label) {
  if (result.error) die(`${label}: ${result.error.message}`);
  return result.data;
}

// ── The invented park loop ──────────────────────────────────────────────────
// A closed ~6 km loop. The basemap under it is a real public park; the track is
// hand-drawn waypoints and has nothing to do with anyone's real runs.

const WAYPOINTS = [
  [51.5030, -0.1535], [51.5072, -0.1548], [51.5108, -0.1570], [51.5116, -0.1640],
  [51.5112, -0.1730], [51.5104, -0.1815], [51.5096, -0.1878], [51.5062, -0.1888],
  [51.5034, -0.1866], [51.5030, -0.1790], [51.5040, -0.1700], [51.5042, -0.1610],
];

function buildLoop() {
  const n = WAYPOINTS.length;
  const dense = [];
  for (let i = 0; i < n; i++) {
    const p0 = WAYPOINTS[(i - 1 + n) % n], p1 = WAYPOINTS[i], p2 = WAYPOINTS[(i + 1) % n], p3 = WAYPOINTS[(i + 2) % n];
    for (let s = 0; s < 40; s++) {
      const t = s / 40, t2 = t * t, t3 = t2 * t;
      const at = (k) => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      dense.push([at(0), at(1)]);
    }
  }
  const mLat = 111_320, mLon = 111_320 * Math.cos((51.507 * Math.PI) / 180);
  const cumulative = [0];
  for (let i = 1; i <= dense.length; i++) {
    const a = dense[i - 1], b = dense[i % dense.length];
    cumulative.push(cumulative[i - 1] + Math.hypot((b[0] - a[0]) * mLat, (b[1] - a[1]) * mLon));
  }
  return { dense, cumulative, length: cumulative[dense.length], mLat, mLon };
}
const LOOP = buildLoop();

function positionAt(distance, random) {
  const d = ((distance % LOOP.length) + LOOP.length) % LOOP.length;
  let lo = 0, hi = LOOP.cumulative.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (LOOP.cumulative[mid] <= d) lo = mid; else hi = mid;
  }
  const a = LOOP.dense[lo % LOOP.dense.length], b = LOOP.dense[(lo + 1) % LOOP.dense.length];
  const span = LOOP.cumulative[lo + 1] - LOOP.cumulative[lo] || 1;
  const f = (d - LOOP.cumulative[lo]) / span;
  const jitter = () => gauss(random) * 1.1;
  return {
    lat: a[0] + (b[0] - a[0]) * f + jitter() / LOOP.mLat,
    lon: a[1] + (b[1] - a[1]) * f + jitter() / LOOP.mLon,
  };
}

// ── Athlete model ───────────────────────────────────────────────────────────

const MAX_HR = 188;
const REST_HR = 50;
const ZONE_LOWER = [0.59, 0.74, 0.84, 0.88, 0.95].map((pct) => Math.floor(REST_HR + pct * (MAX_HR - REST_HR)));

/** Heart rate the athlete settles at for a pace (s/km). */
const hrForPace = (secPerKm) => Math.max(108, Math.min(184, 145 + (345 - secPerKm) * 0.52));

/** Pace profile (s/km) as a function of distance covered, per kind of session. */
function paceProfile(kind, totalKm, p) {
  if (kind === "tempo") {
    const tempoKm = Math.max(2, totalKm - 4);
    return (km) => (km < 2 ? p.easy - 6 : km < 2 + tempoKm ? p.tempo : p.easy + 2);
  }
  if (kind === "interval") {
    const reps = Math.max(2, Math.round((totalKm - 3.5) / 1.4));
    const coolStart = 2 + reps * 1.4;
    return (km) => {
      if (km < 2) return p.easy - 6;
      if (km >= coolStart) return p.easy + 4;
      return ((km - 2) % 1.4) < 1 ? p.rep : 405;
    };
  }
  if (kind === "long") {
    return (km) => p.long + 4 - (km / Math.max(totalKm, 1)) * 9;
  }
  const base = kind === "recovery" ? p.recovery : p.easy;
  return () => base;
}

function simulateRun({ kind, km, startsAt, paces, seed, laneOffset }) {
  const random = rng(seed);
  const profile = paceProfile(kind, km, paces);
  const targetM = Math.round(km * 1000 + (random() - 0.5) * 120);
  const gps = [], hrSeries = [], distanceSeries = [], cadence = [];
  let t = 0, d = 0, hr = 96, drift = 0, noise = 0;
  const dt = 5;
  let ele = 24;
  let previousEle = ele;
  let gain = 0;
  while (d < targetM) {
    noise = noise * 0.9 + gauss(random) * 0.014;
    const target = profile(d / 1000);
    const current = target * (1 + noise) * (d < 350 ? 1.06 - d / 350 * 0.06 : 1);
    const speed = 1000 / current;
    const step = Math.min(speed * dt, targetM - d);
    const stepTime = step / speed;
    t += stepTime;
    d += step;
    const stamp = Math.round(t);
    const here = positionAt(laneOffset + d, random);
    ele = 24 + 4 * Math.sin((2 * Math.PI * (laneOffset + d)) / (LOOP.length / 2)) + gauss(random) * 0.15;
    if (ele - previousEle > 0.2) gain += ele - previousEle;
    previousEle = ele;
    gps.push({ t: stamp, lat: +here.lat.toFixed(6), lon: +here.lon.toFixed(6), ele: +ele.toFixed(1) });
    distanceSeries.push({ t: stamp, d: +d.toFixed(1) });
    drift += 0.0012 * stepTime;
    hr += (hrForPace(current) + drift - hr) * (1 - Math.exp(-stepTime / 32));
    const bpm = Math.round(Math.min(MAX_HR - 3, hr + gauss(random) * 1.1));
    hrSeries.push({ t: stamp, bpm });
    cadence.push({ t: stamp, rpm: Math.round(85 + (350 - current) * 0.03 + gauss(random) * 0.8) });
  }
  const duration = gps.at(-1).t;
  const avg = (rows, key) => rows.reduce((sum, row) => sum + row[key], 0) / rows.length;
  // Zone seconds and per-km splits, the way the app stores them.
  const zones = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
  hrSeries.forEach((point, i) => {
    const seconds = i === 0 ? point.t : point.t - hrSeries[i - 1].t;
    const zone = ZONE_LOWER.reduce((found, lower, index) => (point.bpm >= lower ? index : found), 0);
    zones[`z${zone + 1}`] += seconds;
  });
  const splits = [];
  let nextKm = 1, lastT = 0, hrSum = 0, hrCount = 0;
  distanceSeries.forEach((point, i) => {
    hrSum += hrSeries[i].bpm; hrCount++;
    if (point.d >= nextKm * 1000) {
      const prev = distanceSeries[i - 1] ?? { t: 0, d: 0 };
      const frac = (nextKm * 1000 - prev.d) / (point.d - prev.d || 1);
      const boundary = prev.t + frac * (point.t - prev.t);
      splits.push({ km: nextKm, time_s: Math.round(boundary - lastT), avg_hr: Math.round(hrSum / hrCount) });
      lastT = boundary; hrSum = 0; hrCount = 0; nextKm++;
    }
  });
  const firstHalf = hrSeries.slice(0, hrSeries.length >> 1), secondHalf = hrSeries.slice(hrSeries.length >> 1);
  const drift_pct = +(((avg(secondHalf, "bpm") / avg(firstHalf, "bpm")) - 1) * 100 * 0.8).toFixed(1);
  return {
    startsAt,
    distance_m: Math.round(d),
    duration_s: duration,
    avg_pace_s_km: Math.round((duration / d) * 1000),
    avg_hr: Math.round(avg(hrSeries, "bpm")),
    max_hr: Math.max(...hrSeries.map((point) => point.bpm)),
    elevation_gain_m: Math.round(gain),
    avg_cadence_spm: Math.round(avg(cadence, "rpm") * 2),
    hr_drift_pct: drift_pct,
    time_in_zone: zones,
    splits,
    streams: { gps_series: gps, hr_series: hrSeries, distance_series: distanceSeries, cadence },
  };
}

// ── Training history (8 weeks) and plan ─────────────────────────────────────

const today = romeDay();
const thisMonday = mondayOf(today);
const raceDate = (() => {
  // The Sunday about 10 weeks from now.
  const target = addDays(today, 72);
  return addDays(mondayOf(target), 6);
})();

/** [Tue easy, Wed quality, Sat easy, Sun long] in km, oldest week first. */
const WEEKS = [
  [7, 8, 6, 13], [8, 8.5, 6, 14], [8, 9, 7, 15], [8, 8, 6, 12],
  [9, 9.5, 7, 16], [9, 10, 7, 17], [9, 10, 8, 18], [9, 10, 8, 16],
];
const QUALITY = ["interval", "tempo", "interval", "tempo", "interval", "tempo", "interval", "tempo"];
const MISSED_WEEK = 5; // the Saturday of this week (index in WEEKS) was skipped

/** Fitness improves a little each week: lower is faster. */
function pacesFor(weekIndex) {
  const progress = weekIndex / (WEEKS.length - 1);
  return {
    easy: Math.round(pace("5:58") - progress * 12),
    recovery: Math.round(pace("6:10") - progress * 10),
    long: Math.round(pace("5:52") - progress * 12),
    tempo: Math.round(pace("5:08") - progress * 12),
    rep: Math.round(pace("4:46") - progress * 10),
  };
}

const TITLES = { easy: "Easy run", tempo: "Tempo run", interval: "Intervals", long: "Long run", recovery: "Recovery run" };
const START_HOUR = { 1: [6, 50], 2: [7, 5], 5: [8, 15], 6: [8, 30] };

function historySpecs() {
  const specs = [];
  WEEKS.forEach((week, w) => {
    const monday = addDays(thisMonday, (w - WEEKS.length) * 7);
    const paces = pacesFor(w);
    const plan = [
      { offset: 1, kind: "easy", km: week[0] },
      { offset: 2, kind: QUALITY[w], km: week[1] },
      { offset: 5, kind: w === 3 ? "recovery" : "easy", km: week[2] },
      { offset: 6, kind: "long", km: week[3] },
    ];
    plan.forEach(({ offset, kind, km }, i) => {
      specs.push({
        date: addDays(monday, offset), kind, km, paces, week: w, missed: w === MISSED_WEEK && offset === 5,
        seed: 1000 + w * 10 + i,
      });
    });
  });
  // This week's Tuesday easy run is already done.
  specs.push({ date: addDays(thisMonday, 1), kind: "easy", km: 8, paces: pacesFor(WEEKS.length - 1), week: WEEKS.length, missed: false, seed: 2000 });
  return specs.filter((spec) => spec.date < today);
}

const RPE = { easy: 3, recovery: 2, long: 5, tempo: 7, interval: 8 };
const SHOWCASE_DATE = addDays(thisMonday, -1); // last Sunday's long run

const NOTES = {
  [SHOWCASE_DATE]: "Felt strong the whole way. Legs fresh until km 13, light wind, perfect temperature. Last 4 km faster without trying.",
  [addDays(thisMonday, 1)]: "Easy shake-out after the long run. Slightly tired calves, nothing worrying.",
};

// ── Workout plan: 14 days from this Monday ──────────────────────────────────

let stepCounter = 0;
const step = (kind, label, completion_type, completion_value, paceMin, paceMax, hrMin, hrMax, variant) => ({
  id: `step-${++stepCounter}`, order: 0, kind, label, completion_type, completion_value,
  pace_min_s_km: paceMin, pace_max_s_km: paceMax, hr_min_bpm: hrMin, hr_max_bpm: hrMax,
  ...(variant ? { variant } : {}),
});
const numbered = (steps) => steps.map((s, order) => ({ ...s, order, id: `step-${order + 1}` }));
const stepSeconds = (s) => {
  if (s.completion_type === "time") return s.completion_value;
  if (s.completion_type === "distance") return Math.round((s.completion_value / 1000) * ((s.pace_min_s_km + s.pace_max_s_km) / 2));
  return 0;
};
const stepMeters = (s) => {
  if (s.completion_type === "distance") return s.completion_value;
  if (s.completion_type === "time") return Math.round((s.completion_value / ((s.pace_min_s_km + s.pace_max_s_km) / 2)) * 1000);
  return 0;
};

function workout(date, type, steps, description, focus, extra = {}) {
  const list = numbered(steps);
  const main = list.find((s) => s.kind === "work") ?? list.find((s) => s.kind === "steady") ?? list[0];
  return {
    date, type, workout_steps: list,
    target_distance_m: Math.round(list.reduce((sum, s) => sum + stepMeters(s), 0) / 100) * 100,
    target_duration_s: list.reduce((sum, s) => sum + stepSeconds(s), 0),
    target_pace_s_km: Math.round((main.pace_min_s_km + main.pace_max_s_km) / 2),
    target_hr_bpm: Math.max(...list.map((s) => s.hr_max_bpm ?? 0)) || null,
    description, focus, origin: "ai", status: "planned", ...extra,
  };
}
const easyRun = (date, km, description, focus, type = "easy") => workout(date, type, [
  step("steady", type === "recovery" ? "Recovery run" : "Easy run", "distance", km * 1000, pace("5:40"), pace("6:05"), 128, 148),
], description, focus);
const longRun = (date, km, description, focus) => workout(date, "long", [
  step("steady", "Long run", "distance", km * 1000, pace("5:35"), pace("5:55"), 135, 156),
], description, focus);
const intervalsWorkout = (date) => workout(date, "interval", [
  step("warmup", "Warm-up", "distance", 2000, pace("5:50"), pace("6:15"), 125, 145),
  ...[1, 2, 3, 4, 5].flatMap((rep) => [
    step("work", `Rep ${rep} of 5`, "distance", 1000, pace("4:34"), pace("4:42"), 165, 180, "sprint"),
    ...(rep < 5 ? [step("recovery", "Jog", "distance", 400, pace("6:20"), pace("7:00"), 120, 150, "jog")] : []),
  ]),
  step("cooldown", "Cool-down", "distance", 1500, pace("6:00"), pace("6:30"), 120, 142),
], "Five 1 km repeats at 10K effort with 400 m jog recoveries. Smooth and even: the last rep should match the first.", "Hold 4:34–4:42 on every rep. If rep 2 already feels hard, stop at 4 and keep the cool-down.");
const tempoWorkout = (date) => workout(date, "tempo", [
  step("warmup", "Warm-up", "distance", 2000, pace("5:50"), pace("6:15"), 125, 145),
  step("work", "Tempo block 1", "time", 900, pace("4:52"), pace("5:00"), 160, 172),
  step("recovery", "Jog", "time", 180, pace("6:20"), pace("7:00"), 120, 150, "jog"),
  step("work", "Tempo block 2", "time", 900, pace("4:52"), pace("5:00"), 160, 172),
  step("cooldown", "Cool-down", "distance", 2000, pace("6:00"), pace("6:30"), 120, 142),
], "Two 15-minute blocks at threshold pace, 3 minutes of jogging between them. Comfortably hard: you could say a few words, not a sentence.", "Even effort across both blocks; heart rate will drift up during the second one.");
const strength = (date, description) => ({
  date, type: "cross", workout_steps: numbered([step("steady", "Strength & mobility", "time", 2400, 0, 0, null, null)].map((s) => ({ ...s, pace_min_s_km: null, pace_max_s_km: null }))),
  target_distance_m: null, target_duration_s: 2400, target_pace_s_km: null, target_hr_bpm: null,
  description, focus: "Glutes, calves and core: the support work that keeps the weekly mileage injury-free.", origin: "ai", status: "planned",
});

function planRows() {
  const d = (offset) => addDays(thisMonday, offset);
  return [
    easyRun(d(1), 8, "Easy aerobic run after the long Sunday. Conversational pace, relaxed shoulders.", "Keep it truly easy; the legs are still absorbing yesterday's long run.", "easy"),
    intervalsWorkout(d(2)),
    strength(d(3), "Single-leg strength, calf raises and hip stability, then 10 minutes of mobility."),
    easyRun(d(4), 5, "Short shake-out to loosen the legs before the weekend.", "Finish with four relaxed 20-second strides.", "recovery"),
    easyRun(d(5), 8, "Steady easy run on soft surfaces if you can.", "Run by feel; heart rate under 148 the whole way."),
    longRun(d(6), 18, "Longest run of the block so far. Start slow, settle into rhythm, let the pace come to you.", "Practice fuelling: one gel at 8 km and one at 14 km."),
    easyRun(d(8), 9, "Easy run to start the week. Nothing to prove today.", "Relaxed cadence around 168–172."),
    tempoWorkout(d(9)),
    strength(d(10), "Same circuit as last week, one extra set on the single-leg work."),
    easyRun(d(11), 5, "Recovery shake-out before the weekend.", "Keep it under 6:10 per kilometre.", "recovery"),
    easyRun(d(12), 8, "Easy run, flat route.", "Hold the pace back; save energy for Sunday."),
    longRun(d(13), 19, "Peak long run for this phase. Last 3 km at half marathon pace if you feel good.", "Negative split: second half 5–10 s per kilometre faster."),
  ].map((row) => (row.date < today ? { ...row, status: "completed" } : row));
}

// ── Wellness (30 days) ──────────────────────────────────────────────────────

function wellnessRows(userId) {
  const random = rng(777);
  return Array.from({ length: 30 }, (_, i) => {
    const ago = 29 - i;
    const date = addDays(today, -ago);
    const trend = (29 - ago) / 29;
    const todayBad = ago === 0;
    const sleepHours = todayBad ? 6.1 : 7.15 + gauss(random) * 0.45;
    return {
      user_id: userId,
      date,
      source: "intervals",
      sleep_secs: Math.round(sleepHours * 3600),
      sleep_score: todayBad ? 61 : Math.round(Math.min(94, Math.max(66, 79 + gauss(random) * 6))),
      resting_hr: todayBad ? 53 : Math.round(52 - trend * 2.4 + gauss(random) * 0.8),
      hrv: todayBad ? 59 : +(63 + trend * 6 + gauss(random) * 3).toFixed(0),
      spo2: +(96.8 + gauss(random) * 0.5).toFixed(1),
      steps: Math.round(9500 + gauss(random) * 2600),
      stress: Math.round(27 + gauss(random) * 6),
      readiness: todayBad ? 58 : Math.round(Math.min(94, Math.max(55, 78 + gauss(random) * 9))),
            weight_kg: +(71.6 - trend * 0.5 + gauss(random) * 0.15).toFixed(1),
      captured_at: new Date().toISOString(),
    };
  });
}

// ── Coach conversation and memory ───────────────────────────────────────────

const mmss = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

/** Numbers quoted by the coach come from the simulated runs, so text and data agree. */
function describeRuns(longRunSpec, tempoSpec) {
  const long = longRunSpec.run, tempo = tempoSpec.run;
  const half = Math.floor(long.splits.length / 2);
  const first = long.splits.slice(0, half), second = long.splits.slice(half);
  const tempoKm = tempo.splits.filter((split) => split.time_s < 320);
  return {
    longKm: (long.distance_m / 1000).toFixed(1),
    longPace: mmss(long.avg_pace_s_km),
    halfGap: Math.round(mean(first.map((s) => s.time_s)) - mean(second.map((s) => s.time_s))),
    hrFirst: Math.round(mean(first.map((s) => s.avg_hr))),
    hrSecond: Math.round(mean(second.map((s) => s.avg_hr))),
    longDrift: long.hr_drift_pct,
    tempoKm: (tempo.distance_m / 1000).toFixed(1),
    tempoBlockKm: tempoKm.length,
    tempoPace: mmss(mean(tempoKm.map((s) => s.time_s))),
    tempoHr: Math.round(mean(tempoKm.map((s) => s.avg_hr))),
  };
}

const chatFor = (r) => [
  { role: "user", minutesAgo: 7 * 1440 + 170, content: `Finished the ${r.tempoKm} km tempo. The first half felt great, but the second half was harder than expected and my heart rate was a bit higher than usual.` },
  { role: "assistant", minutesAgo: 7 * 1440 + 168, content: [
    "Nice work, that was a **solid session**. A few things stand out:",
    "",
    `- **Pace:** ${r.tempoBlockKm} km of tempo at ${r.tempoPace}/km, right on target, with no fade in the final kilometres.`,
    `- **Heart rate:** ${r.tempoHr} bpm on average during the block, a touch above your last tempo at the same pace. That is common after a 45 km week and a short night; it is not a fitness problem.`,
    "- **Recovery:** keep Thursday as strength and mobility, and Friday easy.",
    "",
    "Your threshold work is clearly moving in the right direction.",
  ].join("\n") },
  { role: "user", minutesAgo: 3 * 1440 + 150, content: `Long run done: ${r.longKm} km, felt really good!` },
  { role: "assistant", minutesAgo: 3 * 1440 + 148, content: [
    `Great long run. **${r.longKm} km at ${r.longPace}/km** with a clear negative split: the second half was ${r.halfGap} s/km faster, with heart rate going from ${r.hrFirst} to ${r.hrSecond} bpm.`,
    "",
    "That is exactly the aerobic progress we want eight weeks into the block. Next Sunday goes to **18 km**; I will keep the pace target easy and add two gels for fuelling practice.",
  ].join("\n") },
  { role: "user", minutesAgo: 540, content: "Slept badly last night, only about 6 hours. Is it still ok to do the 5 × 1 km today?" },
  { role: "assistant", minutesAgo: 538, content: [
    "Good that you asked. Sleep was **6h 06** (score 61) and HRV is 59 against your usual 66: a mild dip, not a red flag.",
    "",
    "**Keep the session, with a safety valve:** run rep 1 at the slow end of the range (4:42). If the first two reps feel harder than 7/10, stop at four and take the cool-down.",
  ].join("\n") },
];

const MEMORIES = [
  { category: "guideline", content: "Weekly volume builds from 40 km to a 50 km peak over the next 8 weeks, with an easier week every fourth week.", until: raceDate },
  { category: "guideline", content: "Long run grows by 1 km per week up to 20 km; the last long run is three weeks before the race.", until: raceDate },
  { category: "guideline", content: "One quality session per week, on Wednesday: alternate threshold blocks and 1 km repeats.", until: raceDate },
  { category: "availability", content: "Mondays are always a rest day. Runs early in the morning before work, around 7:00." },
  { category: "preference", content: "Prefers pace targets on easy days and likes a few relaxed strides after easy runs." },
  { category: "limitation", content: "Mild calf tightness after speed work: keep strides short and add calf raises twice a week.", until: addDays(today, 21) },
];

const evaluationFor = (r) => ({
  summary: `A controlled long run with a clear negative split: ${r.longKm} km at ${r.longPace}/km, with the second half ${r.halfGap} s/km faster than the first.`,
  details: [
    "Even pacing through the first 10 km, then a natural progression without forcing it.",
    `Heart rate rose from ${r.hrFirst} to ${r.hrSecond} bpm between the two halves while the pace dropped, a healthy aerobic response.`,
    "Felt strong until km 13: a good sign for the 18 km planned next Sunday.",
  ],
  flags: { good_progress: true },
});

// ── Writing it all ──────────────────────────────────────────────────────────

async function removeUser(email) {
  for (let page = 1; page < 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) die(`list users: ${error.message}`);
    const found = data.users.find((user) => user.email === email);
    if (found) {
      const { error: deleteError } = await admin.auth.admin.deleteUser(found.id);
      if (deleteError) die(`delete user: ${deleteError.message}`);
      return;
    }
    if (data.users.length < 200) return;
  }
}

async function createUser(email, name) {
  await removeUser(email);
  const { data, error } = await admin.auth.admin.createUser({
    email, password: DEMO_PASSWORD, email_confirm: true,
    user_metadata: name ? { full_name: name, name } : {},
  });
  if (error) die(`create user ${email}: ${error.message}`);
  return data.user.id;
}

const alexId = await createUser(DEMO_EMAIL, "Alex Runner");
const newcomerId = await createUser(ONBOARDING_EMAIL, null);

check(await admin.from("profiles").update({
  display_name: "Alex Runner", max_hr: MAX_HR, resting_hr: REST_HR, birthdate: "1992-06-15",
  theme_mode: "light", theme_accent: "coral", theme_style: "warm", heat_adjust: true,
  onboarding_completed_at: new Date().toISOString(),
}).eq("id", alexId).select("id"), "profile");

// Goal: a half marathon in ~10 weeks, started 8 weeks ago.
const goal = check(await admin.from("goals").insert({
  user_id: alexId, race_name: "Harbour City Half Marathon", race_date: raceDate, distance_m: 21_097,
  target_time_s: 6840, is_active: true, created_at: romeToUtc(addDays(today, -56), 9, 0).toISOString(),
}).select("id").single(), "goal");

// Activities and streams.
const specs = historySpecs();
const activityRows = [];
const streamRows = [];
const evaluationRows = [];
let externalId = 0;
for (const spec of specs) {
  if (spec.missed) continue;
  const [hh, mm] = START_HOUR[(new Date(`${spec.date}T12:00:00Z`).getUTCDay() + 6) % 7] ?? [7, 0];
  const startsAt = romeToUtc(spec.date, hh, mm);
  const run = simulateRun({ ...spec, startsAt, laneOffset: (spec.seed % 4) * 400 });
  const id = crypto.randomUUID();
  activityRows.push({
    id, user_id: alexId, source: "intervals", type: spec.kind, sport: "running",
    started_at: startsAt.toISOString(), distance_m: run.distance_m, duration_s: run.duration_s, moving_time_s: run.duration_s,
    avg_pace_s_km: run.avg_pace_s_km, avg_hr: run.avg_hr, max_hr: run.max_hr, elevation_gain_m: run.elevation_gain_m,
    rpe: RPE[spec.kind], rpe_source: "user", source_title: TITLES[spec.kind], calories: Math.round((run.distance_m / 1000) * 68),
    avg_cadence_spm: run.avg_cadence_spm, hr_drift_pct: run.hr_drift_pct, time_in_zone: run.time_in_zone, splits: run.splits,
    notes: NOTES[spec.date] ?? null, external_id: `demo-${++externalId}`,
  });
  streamRows.push({ activity_id: id, ...run.streams });
  spec.activityId = id;
  spec.run = run;
}
const showcase = specs.find((spec) => spec.date === SHOWCASE_DATE);
const tempoSpec = specs.filter((spec) => spec.kind === "tempo").at(-1);
const described = describeRuns(showcase, tempoSpec);
evaluationRows.push({ user_id: alexId, activity_id: showcase.activityId, model: "gemini-3.5-flash", ...evaluationFor(described) });
check(await admin.from("activities").insert(activityRows), "activities");
for (let i = 0; i < streamRows.length; i += 5) {
  check(await admin.from("activity_streams").insert(streamRows.slice(i, i + 5)), "activity streams");
}
if (evaluationRows.length) check(await admin.from("evaluations").insert(evaluationRows), "evaluations");

// Planned workouts: past ones mirror what was run, then the 14-day plan.
const pastPlan = specs.map((spec) => {
  const km = spec.run ? Math.round(spec.run.distance_m / 100) / 10 : spec.km;
  const main = spec.kind === "tempo" ? tempoWorkout(spec.date) : spec.kind === "interval" ? intervalsWorkout(spec.date)
    : spec.kind === "long" ? longRun(spec.date, Math.round(km), "Long run at an easy aerobic effort.", "Even effort, relaxed breathing.")
      : easyRun(spec.date, Math.round(km), "Easy aerobic run.", "Keep it conversational.", spec.kind);
  return { ...main, status: spec.missed ? "missed" : "completed" };
});
const plan = [...pastPlan.filter((row) => row.date < thisMonday), ...planRows()];
check(await admin.from("planned_workouts").insert(plan.map((row) => ({ user_id: alexId, goal_id: goal.id, ...row }))), "planned workouts");

check(await admin.from("wellness_daily").insert(wellnessRows(alexId)), "wellness");

// Coach conversation (rows are written directly: no AI key needed) and memory.
const now = Date.now();
check(await admin.from("coach_messages").insert(chatFor(described).map((message) => ({
  user_id: alexId, role: message.role, kind: "chat", content: message.content,
  created_at: new Date(now - message.minutesAgo * 60_000).toISOString(),
}))), "coach messages");
check(await admin.from("coach_memories").insert(MEMORIES.map((memory) => ({
  user_id: alexId, category: memory.category, content: memory.content, valid_until: memory.until ?? null, source: "chat",
}))), "coach memories");

// Connections. The keys are obvious fakes stored in the LOCAL vault; the page
// only ever shows their last four characters.
check(await admin.rpc("admin_set_gemini_credential", { p_user_id: alexId, p_secret: "demo-not-a-real-key-0000", p_last_four: "0000" }), "gemini credential");
check(await admin.rpc("admin_set_intervals_credential", {
  p_user_id: alexId, p_secret: "demo-fake-0000", p_last_four: "0000", p_athlete_id: "i000000", p_athlete_name: "Alex Runner",
}), "intervals credential");
check(await admin.from("user_intervals_credentials").update({
  last_import_at: new Date().toISOString(), last_publish_at: new Date().toISOString(),
}).eq("user_id", alexId).select("user_id"), "intervals sync times");
check(await admin.from("zepp_connections").insert({
  user_id: alexId, client_kind: "health", enabled: true, auto_sync: true, device_name: "Demo smartwatch",
  paired_at: new Date(now - 40 * 86_400_000).toISOString(), last_sync_at: new Date(now - 25 * 60_000).toISOString(),
}), "zepp connection");

// Sessions → cookies the browser can use, exactly as @supabase/ssr writes them.
async function sessionCookies(email) {
  const jar = new Map();
  const client = createServerClient(SUPABASE_URL, keys.publishable, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: DEMO_PASSWORD });
  if (error) die(`sign in ${email}: ${error.message}`);
  await new Promise((resolve) => setTimeout(resolve, 300));
  return [...jar].map(([name, value]) => ({ name, value }));
}

const outDir = join(here, ".out");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "session.json"), JSON.stringify({
  supabaseUrl: SUPABASE_URL, appUrl: APP_URL, activityDate: SHOWCASE_DATE,
  alex: { id: alexId, cookies: await sessionCookies(DEMO_EMAIL) },
  newcomer: { id: newcomerId, cookies: await sessionCookies(ONBOARDING_EMAIL) },
  showcaseActivityId: specs.find((spec) => spec.date === SHOWCASE_DATE)?.activityId ?? null,
}, null, 2));

console.log(`Seeded ${activityRows.length} runs, ${plan.length} planned workouts, 30 wellness days for ${DEMO_EMAIL}.`);
console.log(`Goal: Harbour City Half Marathon on ${raceDate}. Sessions written to scripts/demo/.out/session.json.`);

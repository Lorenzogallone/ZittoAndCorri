/**
 * Import one-shot di un file GPX Strava → tabella activities.
 * Usa la secret key Supabase: non richiede sessione browser.
 *
 * Uso:
 *   export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
 *   node scripts/import-gpx.mjs <percorso-gpx> <user-id>
 *
 * <user-id>: lo trovi su Supabase → Authentication → Users → ID utente.
 */

import { readFileSync } from "node:fs";

// --- Legge .env.local -------------------------------------------------------
function loadEnv(path = ".env.local") {
  const lines = readFileSync(path, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local");
  process.exit(1);
}

const [, , gpxPath, userId] = process.argv;
if (!gpxPath || !userId) {
  console.error("Usage: node scripts/import-gpx.mjs <file.gpx> <user-id>");
  process.exit(1);
}

// --- Haversine (distanza tra due punti GPS) ----------------------------------
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000; // m
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// --- Parser GPX (regex-based, formato Strava) --------------------------------
function parseGpx(xml) {
  const trackName = (xml.match(/<name>([^<]+)<\/name>/) || [])[1] || "Corsa";

  const trkptRe =
    /<trkpt lat="([^"]+)" lon="([^"]+)">([\s\S]*?)<\/trkpt>/g;
  const points = [];
  let match;
  while ((match = trkptRe.exec(xml)) !== null) {
    const lat = parseFloat(match[1]);
    const lon = parseFloat(match[2]);
    const inner = match[3];
    const ele = parseFloat((inner.match(/<ele>([^<]+)<\/ele>/) || [])[1] ?? "0");
    const time = (inner.match(/<time>([^<]+)<\/time>/) || [])[1] ?? null;
    const hr = parseInt((inner.match(/<gpxtpx:hr>([^<]+)<\/gpxtpx:hr>/) || [])[1] ?? "0", 10);
    if (time) points.push({ lat, lon, ele, time, hr: hr || null });
  }

  if (points.length < 2) throw new Error("GPX: meno di 2 trackpoint");

  const startTime = new Date(points[0].time);
  const endTime = new Date(points[points.length - 1].time);
  const duration_s = Math.round((endTime - startTime) / 1000);

  let distance_m = 0;
  let totalEleGain = 0;
  let hrSum = 0;
  let hrCount = 0;
  let hrMax = 0;

  const gpsSeries = [];
  const hrSeries = [];

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const t = Math.round((new Date(p.time) - startTime) / 1000);

    if (i > 0) {
      const prev = points[i - 1];
      distance_m += haversine(prev.lat, prev.lon, p.lat, p.lon);
      const eleDiff = p.ele - prev.ele;
      if (eleDiff > 0) totalEleGain += eleDiff;
    }

    gpsSeries.push({ t, lat: p.lat, lon: p.lon, ele: p.ele });

    if (p.hr) {
      hrSeries.push({ t, bpm: p.hr });
      hrSum += p.hr;
      hrCount++;
      if (p.hr > hrMax) hrMax = p.hr;
    }
  }

  distance_m = Math.round(distance_m);
  const avg_hr = hrCount > 0 ? Math.round(hrSum / hrCount) : null;
  const max_hr = hrMax || null;
  const elevation_gain_m = Math.round(totalEleGain);

  return {
    trackName,
    started_at: points[0].time,
    distance_m,
    duration_s,
    avg_hr,
    max_hr,
    elevation_gain_m,
    gpsSeries,
    hrSeries,
  };
}

// --- Supabase REST insert (senza SDK, solo fetch) ----------------------------
async function supabaseInsert(table, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${table} insert failed: ${JSON.stringify(json)}`);
  return json;
}

// --- Calcola avg_pace e zone-da-media (inline, stesso algoritmo di lib/metrics) --
function avgPace(distance_m, duration_s) {
  return Math.round(duration_s / (distance_m / 1000));
}

function timeInZoneFromAverage(avg_hr, duration_s) {
  // Usato solo se il profilo non è disponibile (zone calcolate senza HRR).
  // Il profilo reale sarà quello in DB. Qui non abbiamo max_hr/resting_hr.
  // Lasciamo null: l'import da form avrebbe il profilo; lo script no.
  return null;
}

// --- Main -------------------------------------------------------------------
async function main() {
  const xml = readFileSync(gpxPath, "utf8");
  console.log(`Parsing ${gpxPath}…`);

  const parsed = parseGpx(xml);
  console.log(`Track: "${parsed.trackName}"`);
  console.log(`Partenza: ${parsed.started_at}`);
  console.log(`Distanza: ${(parsed.distance_m / 1000).toFixed(2)} km`);
  console.log(`Durata:   ${Math.floor(parsed.duration_s / 60)}m ${parsed.duration_s % 60}s`);
  if (parsed.avg_hr) console.log(`HR media: ${parsed.avg_hr} bpm  |  HR max: ${parsed.max_hr} bpm`);
  console.log(`Dislivello+: ${parsed.elevation_gain_m} m`);
  console.log(`GPS trackpoints: ${parsed.gpsSeries.length}  |  HR points: ${parsed.hrSeries.length}`);

  const avg_pace_s_km = avgPace(parsed.distance_m, parsed.duration_s);

  // 1. Insert activity
  console.log("\nInserisco activity…");
  const [actRow] = await supabaseInsert("activities", {
    user_id: userId,
    source: "file",
    type: "easy",
    started_at: parsed.started_at,
    distance_m: parsed.distance_m,
    duration_s: parsed.duration_s,
    avg_pace_s_km,
    avg_hr: parsed.avg_hr,
    max_hr: parsed.max_hr,
    elevation_gain_m: parsed.elevation_gain_m,
    time_in_zone: null, // ricalcolabile con max_hr/resting_hr dell'utente
    notes: parsed.trackName !== "Corsa serale" ? parsed.trackName : null,
    raw_payload: { source_file: gpxPath, parsed_at: new Date().toISOString() },
  });

  const activityId = actRow.id;
  console.log(`Activity creata: ${activityId}`);

  // 2. Insert streams (GPS + HR)
  console.log("Inserisco activity_streams…");
  await supabaseInsert("activity_streams", {
    activity_id: activityId,
    hr_series: parsed.hrSeries.length ? parsed.hrSeries : null,
    gps_series: parsed.gpsSeries,
    cadence: null,
  });

  console.log(`\n✓ Corsa importata con successo!`);
  console.log(`  Passo medio: ${Math.floor(avg_pace_s_km / 60)}:${String(avg_pace_s_km % 60).padStart(2, "0")}/km`);
  console.log(`  Apri: http://localhost:3000/activities/${activityId}`);
}

main().catch((e) => {
  console.error("Errore:", e.message);
  process.exit(1);
});

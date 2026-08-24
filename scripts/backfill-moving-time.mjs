/**
 * Backfill del tempo in movimento (moving_time_s) per le corse già importate.
 *
 * Ricalcola il tempo "in movimento" (pause escluse) dai punti GPS salvati in
 * activity_streams.gps_series, con lo stesso algoritmo di lib/ingest/adapters/
 * gpx.ts (esclude i buchi di registrazione e i tratti da fermo). Aggiorna
 * activities.moving_time_s e ricalcola avg_pace_s_km sul tempo in movimento,
 * così le corse vecchie mostrano il tempo di allenamento come quelle nuove.
 *
 * Usa la secret key Supabase (bypassa RLS): non richiede sessione browser.
 *
 * Uso:
 *   export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"
 *   node scripts/backfill-moving-time.mjs            # dry-run: stampa cosa farebbe
 *   node scripts/backfill-moving-time.mjs --apply    # applica le modifiche
 *   node scripts/backfill-moving-time.mjs --apply <user-id>   # solo un utente
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

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const userId = args.find((a) => !a.startsWith("--")) ?? null;

// --- Stesso algoritmo di lib/ingest/adapters/gpx.ts -------------------------
const PAUSE_GAP_S = 10; // gap oltre i ~10s = pausa/auto-pause (Strava smette di registrare)
const MIN_SPEED_MS = 0.5; // sotto ~0.5 m/s sei di fatto fermo

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

/** Tempo in movimento (s) da una gps_series con t in secondi-da-inizio. */
function estimateMovingTimeS(points) {
  let moving = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const dt = cur.t - prev.t;
    if (dt <= 0) continue;
    const dist = haversine(prev.lat, prev.lon, cur.lat, cur.lon);
    const speed = dist / dt;
    if (dt <= PAUSE_GAP_S && speed >= MIN_SPEED_MS) moving += dt;
  }
  return Math.round(moving);
}

function avgPace(distance_m, time_s) {
  return Math.round(time_s / (distance_m / 1000));
}

function fmt(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}m ${String(sec).padStart(2, "0")}s`;
}

// --- REST helpers ------------------------------------------------------------
async function restGet(pathAndQuery) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`GET ${pathAndQuery} failed: ${JSON.stringify(json)}`);
  return json;
}

async function restPatch(table, query, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(`PATCH ${table} failed: ${JSON.stringify(json)}`);
  }
}

// --- Main -------------------------------------------------------------------
async function main() {
  console.log(APPLY ? "MODALITÀ: APPLICA modifiche" : "MODALITÀ: DRY-RUN (nessuna scrittura). Usa --apply per scrivere.");
  if (userId) console.log(`Filtro utente: ${userId}`);

  // Corse con i loro stream GPS. Embedding PostgREST attraverso la FK.
  const userFilter = userId ? `&user_id=eq.${userId}` : "";
  const activities = await restGet(
    `activities?select=id,distance_m,duration_s,moving_time_s,started_at,activity_streams(gps_series)&limit=100000${userFilter}`,
  );

  let scanned = 0;
  let updated = 0;
  let skippedNoGps = 0;
  let skippedNoPause = 0;

  for (const a of activities) {
    scanned++;
    const stream = Array.isArray(a.activity_streams) ? a.activity_streams[0] : a.activity_streams;
    const gps = stream?.gps_series;
    if (!Array.isArray(gps) || gps.length < 2) {
      skippedNoGps++;
      continue;
    }

    const moving = estimateMovingTimeS(gps);
    // Solo se c'è stata davvero una pausa (moving < totale).
    if (!(moving > 0 && moving < a.duration_s)) {
      skippedNoPause++;
      continue;
    }

    const newPace = a.distance_m > 0 ? avgPace(a.distance_m, moving) : null;
    const day = (a.started_at ?? "").slice(0, 10);
    console.log(
      `  ${day}  ${(a.distance_m / 1000).toFixed(2)}km  totale ${fmt(a.duration_s)} → movimento ${fmt(moving)}` +
        (newPace ? `  (passo ${Math.floor(newPace / 60)}:${String(newPace % 60).padStart(2, "0")}/km)` : ""),
    );

    if (APPLY) {
      const body = { moving_time_s: moving };
      if (newPace != null) body.avg_pace_s_km = newPace;
      await restPatch("activities", `id=eq.${a.id}`, body);
    }
    updated++;
  }

  console.log("\n— Riepilogo —");
  console.log(`Scansionate:        ${scanned}`);
  console.log(`Senza GPS (saltate): ${skippedNoGps}`);
  console.log(`Senza pause (ok):    ${skippedNoPause}`);
  console.log(`${APPLY ? "Aggiornate" : "Da aggiornare"}:       ${updated}`);
  if (!APPLY && updated > 0) {
    console.log("\nRiesegui con --apply per scrivere le modifiche.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

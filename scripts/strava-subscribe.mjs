/**
 * Gestisce la sottoscrizione webhook Strava (una sola per app API).
 *
 * Legge STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET e STRAVA_VERIFY_TOKEN
 * dall'ambiente o da .env.local. L'app deve essere già online: Strava valida
 * subito l'URL con una GET che risponde con lo stesso verify token.
 *
 * Uso:
 *   node scripts/strava-subscribe.mjs https://<dominio>/api/strava/webhook
 *   node scripts/strava-subscribe.mjs --list
 *   node scripts/strava-subscribe.mjs --delete <id>
 */

import { existsSync, readFileSync } from "node:fs";

const API = "https://www.strava.com/api/v3/push_subscriptions";

// --- Legge .env.local (se presente) ------------------------------------------
function loadEnv(path = ".env.local") {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
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

const clientId = process.env.STRAVA_CLIENT_ID;
const clientSecret = process.env.STRAVA_CLIENT_SECRET;
const verifyToken = process.env.STRAVA_VERIFY_TOKEN;
if (!clientId || !clientSecret) {
  console.error("Mancano STRAVA_CLIENT_ID o STRAVA_CLIENT_SECRET.");
  process.exit(1);
}

async function call(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    console.error(`Errore ${res.status}:`, JSON.stringify(body, null, 2));
    process.exit(1);
  }
  return body;
}

const auth = new URLSearchParams({ client_id: clientId, client_secret: clientSecret });
const [first, second] = process.argv.slice(2);

if (first === "--list") {
  const subs = await call(`${API}?${auth}`);
  console.log(subs?.length ? JSON.stringify(subs, null, 2) : "Nessuna sottoscrizione attiva.");
} else if (first === "--delete") {
  if (!second) {
    console.error("Uso: node scripts/strava-subscribe.mjs --delete <id>");
    process.exit(1);
  }
  await call(`${API}/${encodeURIComponent(second)}?${auth}`, { method: "DELETE" });
  console.log(`Sottoscrizione ${second} eliminata.`);
} else if (first && /^https:\/\//.test(first)) {
  if (!verifyToken) {
    console.error("Manca STRAVA_VERIFY_TOKEN (deve coincidere con quello del deploy).");
    process.exit(1);
  }
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    callback_url: first,
    verify_token: verifyToken,
  });
  const sub = await call(API, { method: "POST", body });
  console.log(`Sottoscrizione creata (id ${sub?.id}).`);
} else {
  console.error(
    "Uso:\n" +
      "  node scripts/strava-subscribe.mjs https://<dominio>/api/strava/webhook\n" +
      "  node scripts/strava-subscribe.mjs --list\n" +
      "  node scripts/strava-subscribe.mjs --delete <id>",
  );
  process.exit(1);
}

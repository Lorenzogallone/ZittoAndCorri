import { BaseSideService } from "@zeppos/zml/base-side"

const STORAGE = () => settings.settingsStorage

// Marcatori di avvio e protezioni. Zeus avvolge il bundle in un try/catch che
// scrive solo su console: un errore all'avvio sarebbe invisibile. zml usa i
// globali Logger e sideService senza controllarli; se il runtime dell'app Zepp
// non li espone, il servizio muore prima del nostro onInit. Qui lasciamo una
// traccia del caricamento e forniamo dei sostituti minimi.
function mark(key, value) {
  try { settings.settingsStorage.setItem(key, String(value ?? "")) } catch {}
}
mark("service_loaded_at", new Date().toISOString())
try {
  const root = typeof globalThis !== "undefined" ? globalThis : null
  if (root && typeof Logger === "undefined") {
    const noop = () => {}
    root.Logger = { getLogger: () => ({ log: noop, error: noop, debug: noop, warn: noop, info: noop }) }
    mark("service_polyfill", "Logger")
  }
  if (root && typeof sideService === "undefined") {
    root.sideService = { appInfo: { app: { appName: "Zitto e Corri Coach" } }, launchReasons: {}, launchArgs: null }
    mark("service_polyfill", `${settings.settingsStorage.getItem("service_polyfill") || ""} sideService`.trim())
  }
} catch (error) {
  mark("service_init_error", `polyfill: ${error.message || String(error)}`)
}

function parseBody(response) {
  if (typeof response.body === "string") {
    try { return JSON.parse(response.body) } catch { return { error: response.body } }
  }
  return response.body || {}
}

function origin() {
  const key = STORAGE().getItem("access_token") ? "paired_origin" : "api_origin"
  const value = String(STORAGE().getItem(key) || "").trim().replace(/\/+$/, "")
  if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/.*)?$/i.test(value)) throw new Error("Inserisci un URL HTTPS pubblico valido")
  return value
}

function noteServiceStart() {
  try {
    STORAGE().setItem("service_started_at", new Date().toISOString())
    const reasons = typeof sideService !== "undefined" && sideService.launchReasons
      ? Object.keys(sideService.launchReasons).filter((key) => sideService.launchReasons[key])
      : []
    STORAGE().setItem("service_launch_reason", reasons.join(", ") || "sconosciuto")
  } catch {}
}

function clientId() {
  let value = STORAGE().getItem("client_id")
  if (!value) {
    value = `zepp-workout-${Date.now()}-${Math.floor(Math.random() * 1e9)}`
    STORAGE().setItem("client_id", value)
  }
  return value
}

async function request(path, body, token = null) {
  const response = await fetch({
    url: `${origin()}${path}`,
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body || {}),
  })
  const parsed = parseBody(response)
  if (response.status < 200 || response.status >= 300) {
    const error = new Error(parsed.error || `HTTP ${response.status}`)
    error.status = response.status
    throw error
  }
  return parsed
}

async function pair() {
  const code = String(STORAGE().getItem("pairing_code") || "").trim()
  if (!/^\d{6}$/.test(code)) throw new Error("Il codice deve avere 6 cifre")
  const result = await request("/api/zepp/pair", {
    code,
    clientId: clientId(),
    clientKind: "workout",
    device: { appVersion: "1.0.5" },
  })
  STORAGE().setItem("paired_origin", origin())
  STORAGE().setItem("access_token", result.accessToken)
  STORAGE().setItem("paired", "true")
  STORAGE().removeItem("pairing_code")
  STORAGE().setItem("connection_status", "Collegato. Il piano si aggiorna quando apri la pagina Coach.")
  return result
}

async function pull(params = {}) {
  const token = STORAGE().getItem("access_token")
  if (!token) throw new Error("Workout Extension non collegata")
  const overrideWorkoutId = STORAGE().getItem("override_workout_id") || null
  const result = await request("/api/zepp/workouts/pull", {
    localDate: params.localDate,
    timezoneOffsetMinutes: params.timezoneOffsetMinutes,
    knownRevision: params.knownRevision || null,
    overrideWorkoutId,
  }, token)
  if (!result.overrideValid) STORAGE().removeItem("override_workout_id")
  if (Array.isArray(result.workouts) && result.workouts.length) {
    STORAGE().setItem("workout_list", JSON.stringify(result.workouts))
  }
  STORAGE().setItem("last_sync", result.serverTime || new Date().toISOString())
  STORAGE().setItem("last_revision", result.revision || "")
  STORAGE().setItem("connection_status", "Piano aggiornato")
  return {
    ok: true,
    ...result,
    settings: {
      vibrations: STORAGE().getItem("vibrations") !== "false",
      sounds: STORAGE().getItem("sounds") !== "false",
    },
  }
}

function localPullParams(force = false) {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, "0")
  return {
    localDate: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    timezoneOffsetMinutes: -now.getTimezoneOffset(),
    knownRevision: force ? null : STORAGE().getItem("last_revision") || null,
  }
}

async function pullFromSettings(force = true) {
  const result = await pull(localPullParams(force))
  try { await this.call({ method: "PLAN_CHANGED", params: {} }) } catch {}
  return result
}

async function disconnect() {
  const token = STORAGE().getItem("access_token")
  try { if (token) await request("/api/zepp/disconnect", {}, token) } finally {
    for (const key of ["access_token", "paired_origin", "override_workout_id", "workout_list", "last_revision"]) STORAGE().removeItem(key)
    STORAGE().setItem("paired", "false")
    STORAGE().setItem("connection_status", "Disconnesso")
  }
}


// Il pulsante "Collega" scrive pair_action. Se in quel momento il servizio sul
// telefono non era attivo, il sistema lo avvia per quella modifica e zml la
// consegna a onSettingsChange (sideService.launchArgs); se era già attivo
// arriva come evento "change". In più la pagina Coach, chiedendo lo stato,
// completa un pairing rimasto in sospeso. pair_handled evita doppi invii dello
// stesso codice (è monouso).
function pairingPending() {
  const requested = STORAGE().getItem("pair_action")
  if (!requested || requested === STORAGE().getItem("pair_handled")) return false
  if (STORAGE().getItem("paired") === "true" && STORAGE().getItem("access_token")) return false
  return /^\d{6}$/.test(String(STORAGE().getItem("pairing_code") || "").trim())
}

function markPairingHandled() {
  STORAGE().setItem("pair_handled", STORAGE().getItem("pair_action") || "")
}

async function completePairing() {
  if (!pairingPending()) return false
  markPairingHandled()
  const at = new Date().toISOString()
  try {
    await pair()
    STORAGE().setItem("pair_result", JSON.stringify({ ok: true, at }))
    return true
  } catch (error) {
    const message = error.message || String(error)
    STORAGE().setItem("connection_status", message)
    STORAGE().setItem("pair_result", JSON.stringify({ ok: false, at, error: message }))
    if (!error.status) STORAGE().removeItem("pair_handled")
    return false
  }
}

const service = BaseSideService({
  onInit() {
    noteServiceStart()
    mark("service_init_error", "")
    completePairing()
  },

  async onSettingsChange(change) {
    const key = change?.key
    try {
      if (key === "pair_action") await completePairing()
      if (key === "sync_action" || key === "override_workout_id") await pullFromSettings.call(this)
      if (key === "disconnect_action") await disconnect()
    } catch (error) {
      STORAGE().setItem("connection_status", error.message || String(error))
    }
  },

  async onRequest(req, res) {
    if (req.method === "GET_CONNECTION_STATE") {
      await completePairing()
      res(null, { enabled: STORAGE().getItem("paired") === "true" })
      return
    }
    if (req.method !== "PULL_WORKOUTS") {
      res(new Error("Richiesta non supportata"), null)
      return
    }
    try {
      res(null, await pull(req.params || {}))
    } catch (error) {
      if (error.status === 401) {
        STORAGE().removeItem("access_token")
        STORAGE().setItem("paired", "false")
      }
      res(null, { ok: false, error: error.message || String(error), revoked: error.status === 401 })
    }
  },
})

const zmlInit = service.onInit
service.onInit = function (...args) {
  try {
    zmlInit.apply(this, args)
  } catch (error) {
    mark("service_init_error", error.message || String(error))
    noteServiceStart()
    completePairing()
  }
}

AppSideService(service)

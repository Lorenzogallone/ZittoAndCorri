import { BaseSideService } from "@zeppos/zml/base-side"

const STORAGE = () => settings.settingsStorage

// Startup markers and guards. Zeus wraps the bundle in a try/catch that only
// writes to the console: a startup error would be invisible. zml uses the
// Logger and sideService globals without checking them; if the Zepp app
// runtime does not expose them, the service dies before our onInit. Here we
// leave a trace of the load and provide minimal stand-ins.
function mark(key, value) {
  try { settings.settingsStorage.setItem(key, String(value ?? "")) } catch {}
}
mark("service_loaded_at", new Date().toISOString())
console.log("[ZC health] side service: module loaded", new Date().toISOString())
try {
  const root = typeof globalThis !== "undefined" ? globalThis : null
  if (root && typeof Logger === "undefined") {
    const noop = () => {}
    root.Logger = { getLogger: () => ({ log: noop, error: noop, debug: noop, warn: noop, info: noop }) }
    mark("service_polyfill", "Logger")
  }
  if (root && typeof sideService === "undefined") {
    root.sideService = { appInfo: { app: { appName: "Zitto e Corri" } }, launchReasons: {}, launchArgs: null }
    mark("service_polyfill", `${settings.settingsStorage.getItem("service_polyfill") || ""} sideService`.trim())
  }
} catch (error) {
  mark("service_init_error", `polyfill: ${error.message || String(error)}`)
}
const DIAGNOSTIC_LIMIT = 60000

function diagnosticJson(value) {
  try {
    const text = JSON.stringify(value, null, 2)
    if (text.length <= DIAGNOSTIC_LIMIT) return text
    return `${text.slice(0, DIAGNOSTIC_LIMIT)}\n… [truncated: ${text.length} characters total]`
  } catch (error) {
    return `Unable to serialize: ${error.message || String(error)}`
  }
}

function setDiagnostic(key, value) {
  STORAGE().setItem(`diagnostic_${key}`, String(value ?? ""))
}

function redacted(body, keys) {
  if (!keys?.length || !body || typeof body !== "object") return body
  const copy = { ...body }
  for (const key of keys) if (key in copy) copy[key] = "[hidden]"
  return copy
}

// Trace of the phone service start, shown in the settings: it tells whether
// Zepp really starts it and why.
function noteServiceStart() {
  try {
    STORAGE().setItem("service_started_at", new Date().toISOString())
    const reasons = typeof sideService !== "undefined" && sideService.launchReasons
      ? Object.keys(sideService.launchReasons).filter((key) => sideService.launchReasons[key])
      : []
    STORAGE().setItem("service_launch_reason", reasons.join(", ") || "unknown")
    console.log("[ZC health] side service: onInit, reason =", reasons.join(", ") || "unknown")
  } catch (error) {
    console.log("[ZC health] side service: onInit without storage", String(error))
  }
}

function parseBody(response) {
  if (typeof response.body === "string") {
    try { return JSON.parse(response.body) } catch { return { error: response.body } }
  }
  return response.body || {}
}

function normalizedOrigin() {
  const key = STORAGE().getItem("access_token") ? "paired_origin" : "api_origin"
  const origin = String(STORAGE().getItem(key) || "").trim().replace(/\/+$/, "")
  if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/.*)?$/i.test(origin)) {
    throw new Error("Enter a valid public HTTPS URL")
  }
  return origin
}

function clientId() {
  let value = STORAGE().getItem("client_id")
  if (!value) {
    value = `zepp-phone-${Date.now()}-${Math.floor(Math.random() * 1000000000)}`
    STORAGE().setItem("client_id", value)
  }
  return value
}

async function request(path, options = {}) {
  const origin = normalizedOrigin()
  if (!origin) throw new Error("Enter the ZittoAndCorri URL")
  if (options.diagnostic) {
    setDiagnostic("attempt_at", new Date().toISOString())
    setDiagnostic("endpoint", `${origin}${path}`)
    setDiagnostic("http_status", "Waiting…")
    setDiagnostic("response", "Request in progress…")
  }
  const response = await fetch({
    url: `${origin}${path}`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: JSON.stringify(options.body || {}),
  })
  const body = parseBody(response)
  if (options.diagnostic) {
    setDiagnostic("http_status", response.status)
    setDiagnostic("response", diagnosticJson(redacted(body, options.redact)))
  }
  if (response.status < 200 || response.status >= 300) {
    const detail = Array.isArray(body.details) && body.details.length
      ? body.details.map((item) => `${(item.path || []).join(".")}: ${item.message || item.code}`).join("; ")
      : ""
    const error = new Error(`${body.error || `HTTP ${response.status}`}${detail ? ` ${detail}` : ""}`)
    error.status = response.status
    throw error
  }
  return body
}

function scheduleHour(value) {
  const match = /^(\d{1,2})(?::\d{2})?$/.exec(String(value ?? "").trim())
  if (!match) return null
  const hour = Number(match[1])
  return hour >= 0 && hour <= 23 ? hour : null
}

function storedSchedule() {
  const morning = scheduleHour(STORAGE().getItem("schedule_morning"))
  const evening = scheduleHour(STORAGE().getItem("schedule_evening"))
  return morning == null && evening == null ? null : { morning, evening }
}

async function pair() {
  const code = String(STORAGE().getItem("pairing_code") || "").trim()
  if (!/^\d{6}$/.test(code)) throw new Error("The code must be 6 digits")
  STORAGE().setItem("connection_status", "Connecting…")
  const result = await request("/api/zepp/pair", {
    body: { code, clientId: clientId(), clientKind: "health", device: {} },
    diagnostic: true,
    redact: ["accessToken"],
  })
  console.log("[ZC health] pairing succeeded")
  STORAGE().setItem("paired_origin", normalizedOrigin())
  STORAGE().setItem("access_token", result.accessToken)
  STORAGE().setItem("paired", "true")
  if (result.schedule?.morning) STORAGE().setItem("schedule_morning", String(result.schedule.morning))
  if (result.schedule?.evening) STORAGE().setItem("schedule_evening", String(result.schedule.evening))
  STORAGE().removeItem("pairing_code")
  STORAGE().setItem("connection_status", "Connected. Open the app on the watch for the first sync.")
  return result
}

async function postPayload(payload) {
  const token = STORAGE().getItem("access_token")
  if (!token) throw new Error("Zepp OS not connected")
  const serializedPayload = diagnosticJson(payload)
  setDiagnostic("payload", serializedPayload)
  setDiagnostic("payload_size", JSON.stringify(payload).length)
  try {
    const result = await request("/api/zepp/sync", { token, body: payload, diagnostic: true })
    STORAGE().setItem("last_sync", result.serverTime || new Date().toISOString())
    STORAGE().setItem("connection_status", "Sync complete")
    return result
  } catch (error) {
    if (!STORAGE().getItem("diagnostic_response") || STORAGE().getItem("diagnostic_response") === "Request in progress…") {
      setDiagnostic("http_status", error.status || "Network error")
      setDiagnostic("response", error.message || String(error))
    }
    STORAGE().setItem("connection_status", error.message || String(error))
    if (error.status === 401) {
      STORAGE().removeItem("access_token")
      STORAGE().removeItem("paired_origin")
      STORAGE().setItem("paired", "false")
    }
    throw error
  }
}

// Plan of the day for the "Today" widget. The server accepts the health token
// on this route. No diagnostics here: the diagnostics section stays dedicated
// to the last send of health data. A 401 does not revoke the health connection.
async function pullWorkouts(params = {}) {
  const token = STORAGE().getItem("access_token")
  if (!token) throw new Error("Zepp OS not connected")
  return request("/api/zepp/workouts/pull", {
    token,
    body: {
      localDate: params.localDate,
      timezoneOffsetMinutes: params.timezoneOffsetMinutes,
      knownRevision: params.knownRevision || null,
      overrideWorkoutId: null,
    },
  })
}

async function disconnect() {
  const token = STORAGE().getItem("access_token")
  try {
    if (token) await request("/api/zepp/disconnect", { token })
  } finally {
    STORAGE().removeItem("access_token")
    STORAGE().removeItem("paired_origin")
    STORAGE().setItem("paired", "false")
    STORAGE().setItem("connection_status", "Disabled")
  }
}


// The "Connect" button writes pair_action. If the phone service was not
// running at that moment, the system starts it for that change and zml hands
// it to onSettingsChange (sideService.launchArgs); if it was already running
// it arrives as a "change" event. In addition, the watch, asking for the
// state on every open, completes a pairing left pending. pair_handled
// prevents double submissions of the same code (it is single-use).
function pairingPending() {
  const requested = STORAGE().getItem("pair_action")
  if (!requested || requested === STORAGE().getItem("pair_handled")) return false
  if (STORAGE().getItem("paired") === "true" && STORAGE().getItem("access_token")) return false
  return /^\d{6}$/.test(String(STORAGE().getItem("pairing_code") || "").trim())
}

function markPairingHandled() {
  STORAGE().setItem("pair_handled", STORAGE().getItem("pair_action") || "")
}

// Outcome of the last connection attempt, for settings and watch.
function pairResult() {
  const raw = STORAGE().getItem("pair_result")
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

async function completePairing(service) {
  console.log("[ZC health] pairing pending?", pairingPending())
  if (!pairingPending()) return null
  markPairingHandled()
  const at = new Date().toISOString()
  try {
    await pair()
  } catch (error) {
    const message = error.message || String(error)
    console.log("[ZC health] pairing failed", message)
    STORAGE().setItem("connection_status", message)
    STORAGE().setItem("pair_result", JSON.stringify({ ok: false, at, error: message }))
    if (!error.status) {
      setDiagnostic("http_status", "Network error")
      setDiagnostic("response", message)
      // No HTTP response: retry at the next start or the next time the app
      // is opened on the watch.
      STORAGE().removeItem("pair_handled")
    }
    return { ok: false, error: message }
  }
  STORAGE().setItem("pair_result", JSON.stringify({ ok: true, at }))
  try {
    service.call({ method: "CONNECTION_STATE", params: { enabled: true, schedule: storedSchedule() } })
  } catch {}
  return { ok: true }
}

const service = BaseSideService({
  onInit() {
    noteServiceStart()
    mark("service_init_error", "")
    completePairing(this)
  },

  async onSettingsChange(change) {
    const key = change?.key
    console.log("[ZC health] onSettingsChange", key)
    try {
      if (key === "pair_action") await completePairing(this)
      if (key === "sync_action") this.call({ method: "SYNC_NOW", params: {} })
      if (key === "disconnect_action") {
        await disconnect()
        this.call({ method: "CONNECTION_STATE", params: { enabled: false } })
      }
    } catch (error) {
      STORAGE().setItem("connection_status", error.message || String(error))
    }
  },

  async onRequest(req, res) {
    console.log("[ZC health] onRequest", req?.method)
    if (req.method === "GET_CONNECTION_STATE") {
      const pairing = await completePairing(this)
      const enabled = STORAGE().getItem("paired") === "true"
      res(null, {
        enabled,
        schedule: enabled ? storedSchedule() : null,
        pairing: pairing || (enabled ? null : pairResult()),
        pairingRequested: Boolean(STORAGE().getItem("pair_action")),
      })
      return
    }
    if (req.method === "PULL_WORKOUTS") {
      try {
        const result = await pullWorkouts(req.params || {})
        res(null, { ok: true, ...result })
      } catch (error) {
        res(null, {
          ok: false,
          error: error.message || String(error),
          revoked: error.status === 401,
        })
      }
      return
    }
    if (req.method !== "SYNC_PAYLOAD" || !req.params?.payload) {
      res(new Error("Unsupported request"), null)
      return
    }
    try {
      const result = await postPayload(req.params.payload)
      res(null, { ok: true, readiness: result.readiness || null })
    } catch (error) {
      res(null, {
        ok: false,
        error: error.message || String(error),
        revoked: error.status === 401,
      })
    }
  },
})

// If zml initialisation fails, we record the error and still complete a
// pending pairing (without messaging the watch).
const zmlInit = service.onInit
service.onInit = function (...args) {
  try {
    zmlInit.apply(this, args)
  } catch (error) {
    mark("service_init_error", error.message || String(error))
    console.log("[ZC health] error in zml onInit", String(error))
    noteServiceStart()
    completePairing(this)
  }
}

AppSideService(service)

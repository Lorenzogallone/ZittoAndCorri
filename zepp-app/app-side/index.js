import { BaseSideService } from "@zeppos/zml/base-side"

const STORAGE = () => settings.settingsStorage
const DIAGNOSTIC_LIMIT = 60000

function diagnosticJson(value) {
  try {
    const text = JSON.stringify(value, null, 2)
    if (text.length <= DIAGNOSTIC_LIMIT) return text
    return `${text.slice(0, DIAGNOSTIC_LIMIT)}\n… [tagliato: ${text.length} caratteri totali]`
  } catch (error) {
    return `Impossibile serializzare: ${error.message || String(error)}`
  }
}

function setDiagnostic(key, value) {
  STORAGE().setItem(`diagnostic_${key}`, String(value ?? ""))
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
    throw new Error("Inserisci un URL HTTPS pubblico valido")
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
  if (!origin) throw new Error("Inserisci l'URL di ZittoAndCorri")
  if (options.diagnostic) {
    setDiagnostic("attempt_at", new Date().toISOString())
    setDiagnostic("endpoint", `${origin}${path}`)
    setDiagnostic("http_status", "In attesa…")
    setDiagnostic("response", "Richiesta in corso…")
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
    setDiagnostic("response", diagnosticJson(body))
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

async function pair() {
  const code = String(STORAGE().getItem("pairing_code") || "").trim()
  if (!/^\d{6}$/.test(code)) throw new Error("Il codice deve avere 6 cifre")
  STORAGE().setItem("connection_status", "Collegamento in corso…")
  const result = await request("/api/zepp/pair", {
    body: { code, clientId: clientId(), clientKind: "health", device: {} },
  })
  STORAGE().setItem("paired_origin", normalizedOrigin())
  STORAGE().setItem("access_token", result.accessToken)
  STORAGE().setItem("paired", "true")
  STORAGE().removeItem("pairing_code")
  STORAGE().setItem("connection_status", "Collegato. Apri l'app sull'orologio per la prima sync.")
  return result
}

async function postPayload(payload) {
  const token = STORAGE().getItem("access_token")
  if (!token) throw new Error("Zepp OS non collegato")
  const serializedPayload = diagnosticJson(payload)
  setDiagnostic("payload", serializedPayload)
  setDiagnostic("payload_size", JSON.stringify(payload).length)
  try {
    const result = await request("/api/zepp/sync", { token, body: payload, diagnostic: true })
    STORAGE().setItem("last_sync", result.serverTime || new Date().toISOString())
    STORAGE().setItem("connection_status", "Sincronizzazione completata")
    return result
  } catch (error) {
    if (!STORAGE().getItem("diagnostic_response") || STORAGE().getItem("diagnostic_response") === "Richiesta in corso…") {
      setDiagnostic("http_status", error.status || "Errore di rete")
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

async function disconnect() {
  const token = STORAGE().getItem("access_token")
  try {
    if (token) await request("/api/zepp/disconnect", { token })
  } finally {
    STORAGE().removeItem("access_token")
    STORAGE().removeItem("paired_origin")
    STORAGE().setItem("paired", "false")
    STORAGE().setItem("connection_status", "Disattivato")
  }
}

AppSideService(
  BaseSideService({
    onInit() {
      STORAGE().addListener("change", async ({ key }) => {
        try {
          if (key === "pair_action") await pair()
          if (key === "pair_action") this.call({ method: "CONNECTION_STATE", params: { enabled: true } })
          if (key === "sync_action") this.call({ method: "SYNC_NOW", params: {} })
          if (key === "disconnect_action") {
            await disconnect()
            this.call({ method: "CONNECTION_STATE", params: { enabled: false } })
          }
        } catch (error) {
          STORAGE().setItem("connection_status", error.message || String(error))
        }
      })
    },

    async onRequest(req, res) {
      if (req.method === "GET_CONNECTION_STATE") {
        res(null, { enabled: STORAGE().getItem("paired") === "true" })
        return
      }
      if (req.method !== "SYNC_PAYLOAD" || !req.params?.payload) {
        res(new Error("Richiesta non supportata"), null)
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
  }),
)

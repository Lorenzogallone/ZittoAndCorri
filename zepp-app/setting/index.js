function action(storage, key) {
  storage.setItem(key, String(Date.now()))
}

const COLORS = {
  blue: "#2563EB",
  blueSoft: "#EAF1FF",
  green: "#15803D",
  greenSoft: "#EAF8EF",
  red: "#B42318",
  redSoft: "#FFF0EE",
  ink: "#172033",
  muted: "#667085",
  border: "#E4E7EC",
  surface: "#FFFFFF",
  canvas: "#F5F7FB",
}

function card(children, style = {}) {
  return View({
    style: {
      background: COLORS.surface,
      border: `1px solid ${COLORS.border}`,
      borderRadius: "18px",
      padding: "18px",
      marginBottom: "14px",
      boxShadow: "0 3px 12px rgba(16, 24, 40, 0.06)",
      ...style,
    },
  }, children)
}

function heading(text) {
  return Text({
    bold: true,
    paragraph: true,
    style: { color: COLORS.ink, fontSize: "17px", margin: "0 0 6px" },
  }, text)
}

function copyField(label, value, rows) {
  return TextInput({
    label,
    multiline: true,
    rows,
    value: value || "No data available",
    onChange: () => {},
    labelStyle: { color: COLORS.ink, fontWeight: "600" },
    subStyle: { fontFamily: "monospace", fontSize: "11px", color: COLORS.muted },
  })
}

function body(text, style = {}) {
  return Text({
    paragraph: true,
    style: { color: COLORS.muted, fontSize: "13px", lineHeight: "1.5", margin: "0 0 10px", ...style },
  }, text)
}

function step(number, title, text) {
  return [
    Text({ bold: true, paragraph: true, style: { color: COLORS.ink, fontSize: "14px", margin: "10px 0 2px" } }, `${number}. ${title}`),
    body(text, { margin: "0 0 4px" }),
  ]
}

function readableDate(value) {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return value || "Never"
  try { return date.toLocaleString() } catch { return date.toISOString() }
}

function readableHour(value, fallback) {
  const match = /^(\d{1,2})(?::(\d{2}))?$/.exec(String(value ?? "").trim())
  if (!match) return fallback
  return `${match[1].padStart(2, "0")}:${match[2] || "00"}`
}

AppSettingsPage({
  build(props) {
    const storage = props.settingsStorage
    const paired = storage.getItem("paired") === "true"
    const status = storage.getItem("connection_status") || ""
    const lastSync = storage.getItem("last_sync") || ""
    const hasError = /error|invalid|fail|reject|http|payload|errore|non valido|fallit|rifiutat/i.test(status)
    const showDiagnostics = storage.getItem("show_diagnostics") === "true"
    const payload = storage.getItem("diagnostic_payload") || ""
    const response = storage.getItem("diagnostic_response") || ""
    const attemptAt = storage.getItem("diagnostic_attempt_at") || "Never"
    const httpStatus = storage.getItem("diagnostic_http_status") || "—"
    const payloadSize = storage.getItem("diagnostic_payload_size") || "0"
    const endpoint = storage.getItem("diagnostic_endpoint") || "—"
    const morning = readableHour(storage.getItem("schedule_morning"), "08:00")
    const evening = readableHour(storage.getItem("schedule_evening"), "23:00")

    // 1. Status: one glance tells whether everything works.
    const statusTitle = hasError ? "Needs attention" : paired ? "Connected" : "Not connected yet"
    const statusHint = hasError
      ? (paired
        ? "Open Zitto e Corri on the watch and tap Sync now. If it keeps failing, check Troubleshooting at the bottom of this page."
        : "Check the address and the code, then tap Connect again. Codes work once; generate a new one if needed. See Troubleshooting at the bottom of this page.")
      : paired
        ? "Your watch is linked. Summaries are collected on the watch and sent when you open Zitto e Corri on it."
        : "Follow the three steps below to link your watch to your ZittoAndCorri app."
    const statusCard = card([
      Text({
        bold: true,
        paragraph: true,
        style: { color: hasError ? COLORS.red : paired ? COLORS.green : COLORS.muted, fontSize: "17px", margin: "0 0 6px" },
      }, `● ${statusTitle}`),
      Text({ paragraph: true, style: { color: COLORS.ink, fontSize: "13px", margin: "0 0 8px", lineHeight: "1.5" } }, statusHint),
      ...(status
        ? [Text({ paragraph: true, style: { color: COLORS.muted, fontSize: "12px", margin: "0 0 6px", lineHeight: "1.45" } }, `Last message: ${status}`)]
        : []),
      Text({ style: { color: COLORS.muted, fontSize: "12px" } }, `Last successful sync: ${lastSync ? readableDate(lastSync) : "never"}`),
    ], { background: hasError ? COLORS.redSoft : paired ? COLORS.greenSoft : COLORS.surface })

    // 2. Connect (not paired) or manage (paired).
    const connectionCard = paired
      ? card([
          heading("Sync now"),
          body("Asks the watch to send its queued health summaries to ZittoAndCorri right away. Zitto e Corri must be open on the watch, because the data travels watch → phone → your app."),
          Button({
            label: "Sync now",
            color: "primary",
            style: { width: "100%", borderRadius: "12px", background: COLORS.blue, marginBottom: "18px" },
            onClick: () => action(storage, "sync_action"),
          }),
          heading("Disconnect"),
          body("Revokes this watch's access, stops the daily captures and clears the queue on the watch. Data already sent stays in ZittoAndCorri. You can connect again at any time with a new code."),
          Button({
            label: "Disconnect",
            color: "secondary",
            style: { width: "100%", borderRadius: "12px" },
            onClick: () => action(storage, "disconnect_action"),
          }),
        ])
      : card([
          heading("Connect your watch"),
          ...step(1, "Get a code in ZittoAndCorri", "Open ZittoAndCorri, go to Settings → Connections → Zepp OS, enable it and generate a 6-digit code. The code works once and expires after 5 minutes."),
          ...step(2, "Enter it here", "Type the public HTTPS address of your ZittoAndCorri app and the code."),
          TextInput({
            label: "ZittoAndCorri address (HTTPS)",
            placeholder: "https://your-domain.example",
            value: storage.getItem("api_origin") || "",
            onChange: (value) => storage.setItem("api_origin", value.trim()),
            labelStyle: { color: COLORS.ink, fontWeight: "600" },
          }),
          TextInput({
            label: "6-digit code",
            placeholder: "123456",
            bold: true,
            value: storage.getItem("pairing_code") || "",
            onChange: (value) => storage.setItem("pairing_code", value.replace(/\D/g, "").slice(0, 6)),
            labelStyle: { color: COLORS.ink, fontWeight: "600" },
          }),
          ...step(3, "Connect", "Tap Connect, then open Zitto e Corri on the watch. If the status below does not change within a few seconds, opening the app on the watch completes the connection."),
          Button({
            label: "Connect",
            color: "primary",
            style: { width: "100%", borderRadius: "12px", background: COLORS.blue, marginTop: "8px" },
            onClick: () => {
              // Immediate feedback: the phone service may only start when the app on
              // the watch is open, and it completes the request afterwards.
              storage.setItem("connection_status", "Request sent. If nothing changes within a few seconds, open Zitto e Corri on the watch: the connection completes by itself.")
              action(storage, "pair_action")
            },
          }),
        ])

    // 3. What this does, in plain words.
    const howCard = card([
      heading("What this does"),
      body("Zitto e Corri sends daily health summaries from your Amazfit to your own ZittoAndCorri app. The coach uses them to judge readiness (sleep, recovery, stress) and training load. It is optional and fully under your control."),
      Text({ bold: true, paragraph: true, style: { color: COLORS.ink, fontSize: "14px", margin: "8px 0 2px" } }, "When"),
      body(`The watch captures a summary twice a day, at about ${morning} and ${evening}, and again when you first wake up. Capturing uses no Bluetooth and no network.`),
      Text({ bold: true, paragraph: true, style: { color: COLORS.ink, fontSize: "14px", margin: "8px 0 2px" } }, "What is sent"),
      body("Sleep and naps; resting, latest and maximum heart rate; stress; blood oxygen; PAI; steps, calories and standing time; training load, VO₂ max and recovery time; basic profile (age, height, weight, gender) and watch model."),
      Text({ bold: true, paragraph: true, style: { color: COLORS.ink, fontSize: "14px", margin: "8px 0 2px" } }, "What is not sent"),
      body("No GPS or workout tracks. FIT and GPX activities are imported separately, never from here.", { margin: "0" }),
    ])

    // 4. Troubleshooting, collapsed by default.
    const serviceLoadedAt = storage.getItem("service_loaded_at") || "never"
    const serviceInitError = storage.getItem("service_init_error") || ""
    const servicePolyfill = storage.getItem("service_polyfill") || ""
    const serviceStartedAt = storage.getItem("service_started_at") || "never (no start recorded)"
    const serviceReason = storage.getItem("service_launch_reason") || "—"
    const pairRequestedAt = storage.getItem("pair_action")
    const pairHandled = pairRequestedAt && storage.getItem("pair_handled") === pairRequestedAt
    let pairResultText = "no attempt"
    try {
      const parsed = JSON.parse(storage.getItem("pair_result") || "null")
      if (parsed) pairResultText = parsed.ok ? `succeeded at ${parsed.at}` : `failed at ${parsed.at}: ${parsed.error}`
    } catch {}

    const diagnosticChildren = [
      heading("Troubleshooting"),
      body("Something not working? Turn this on to see what the phone received from the watch and what the server answered. The access token is never shown."),
      Toggle({
        label: "Show technical details",
        value: showDiagnostics,
        onChange: (value) => storage.setItem("show_diagnostics", value ? "true" : "false"),
      }),
    ]

    if (showDiagnostics) {
      diagnosticChildren.push(
        Text({ paragraph: true, style: { color: COLORS.ink, fontSize: "12px", lineHeight: "1.55", margin: "12px 0" } },
          `Service code loaded: ${serviceLoadedAt}${servicePolyfill ? ` (replaced: ${servicePolyfill})` : ""}\n` +
          (serviceInitError ? `Service startup error: ${serviceInitError}\n` : "") +
          `Phone service: started ${serviceStartedAt} (reason: ${serviceReason})\n` +
          `Connect button pressed: ${pairRequestedAt ? new Date(Number(pairRequestedAt)).toISOString() : "never"}\n` +
          `Request picked up by the service: ${pairRequestedAt ? (pairHandled ? "yes" : "no") : "—"}\n` +
          `Connection result: ${pairResultText}`),
        Text({ paragraph: true, style: { color: COLORS.muted, fontSize: "12px", margin: "0 0 12px" } },
          `Last attempt: ${attemptAt}\nHTTP: ${httpStatus} · Payload: ${payloadSize} bytes\nEndpoint: ${endpoint}`),
        copyField("Server response", response, 7),
        copyField("Payload sent (JSON)", payload, 14),
        Text({ paragraph: true, style: { color: COLORS.muted, fontSize: "11px", margin: "8px 0" } },
          "You can select the contents of the fields to copy and share them. They contain health data, but not the access token."),
        Button({
          label: "Clear diagnostics",
          color: "secondary",
          style: { width: "100%", borderRadius: "12px" },
          onClick: () => {
            for (const key of ["payload", "payload_size", "response", "attempt_at", "http_status", "endpoint"]) {
              storage.removeItem(`diagnostic_${key}`)
            }
          },
        }),
      )
    }

    return View({ style: { background: COLORS.canvas, padding: "18px", color: COLORS.ink } }, [
      View({ style: { background: COLORS.blue, borderRadius: "20px", padding: "22px 18px", marginBottom: "14px" } }, [
        Text({ bold: true, paragraph: true, style: { color: "#FFFFFF", fontSize: "23px", margin: "0 0 6px" } }, "Zitto e Corri"),
        Text({ paragraph: true, style: { color: "#DCE8FF", fontSize: "13px", margin: "0", lineHeight: "1.45" } },
          "Health summaries from your Amazfit, sent to your ZittoAndCorri running coach. Optional."),
      ]),
      statusCard,
      connectionCard,
      howCard,
      card(diagnosticChildren),
      Text({ align: "center", paragraph: true, style: { color: COLORS.muted, fontSize: "11px", margin: "4px 8px 18px", lineHeight: "1.45" } },
        "The access token stays in the Mini Program's private space. ZittoAndCorri does not import activities automatically."),
    ])
  },
})

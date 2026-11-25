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

AppSettingsPage({
  build(props) {
    const storage = props.settingsStorage
    const paired = storage.getItem("paired") === "true"
    const status = storage.getItem("connection_status") || "Not connected"
    const lastSync = storage.getItem("last_sync") || "Never"
    const hasError = /error|invalid|fail|reject|http|payload|errore|non valido|fallit|rifiutat/i.test(status)
    const showDiagnostics = storage.getItem("show_diagnostics") === "true"
    const payload = storage.getItem("diagnostic_payload") || ""
    const response = storage.getItem("diagnostic_response") || ""
    const attemptAt = storage.getItem("diagnostic_attempt_at") || "Never"
    const httpStatus = storage.getItem("diagnostic_http_status") || "—"
    const payloadSize = storage.getItem("diagnostic_payload_size") || "0"
    const endpoint = storage.getItem("diagnostic_endpoint") || "—"

    const statusCard = card([
      Text({
        bold: true,
        paragraph: true,
        style: { color: hasError ? COLORS.red : paired ? COLORS.green : COLORS.muted, fontSize: "15px", margin: "0 0 5px" },
      }, hasError ? "Sync needs attention" : paired ? "Device connected" : "Not connected yet"),
      Text({ paragraph: true, style: { color: COLORS.ink, fontSize: "13px", margin: "0 0 8px", lineHeight: "1.45" } }, status),
      Text({ style: { color: COLORS.muted, fontSize: "12px" } }, `Last sync: ${lastSync}`),
    ], { background: hasError ? COLORS.redSoft : paired ? COLORS.greenSoft : COLORS.surface })

    const connectionCard = paired
      ? card([
          heading("Sync"),
          Text({ paragraph: true, style: { color: COLORS.muted, fontSize: "13px", margin: "0 0 14px" } },
            "Send the data available from the watch now. FIT and GPX activities stay separate."),
          Button({
            label: "Sync now",
            color: "primary",
            style: { width: "100%", borderRadius: "12px", background: COLORS.blue, marginBottom: "10px" },
            onClick: () => action(storage, "sync_action"),
          }),
          Button({
            label: "Disconnect",
            color: "secondary",
            style: { width: "100%", borderRadius: "12px" },
            onClick: () => action(storage, "disconnect_action"),
          }),
        ])
      : card([
          heading("Connect the watch"),
          Text({ paragraph: true, style: { color: COLORS.muted, fontSize: "13px", margin: "0 0 12px", lineHeight: "1.45" } },
            "Enter the public address of the app and the 6-digit code generated in ZittoAndCorri."),
          TextInput({
            label: "Public HTTPS URL",
            placeholder: "https://your-domain.example",
            value: storage.getItem("api_origin") || "",
            onChange: (value) => storage.setItem("api_origin", value.trim()),
            labelStyle: { color: COLORS.ink, fontWeight: "600" },
          }),
          TextInput({
            label: "Pairing code",
            placeholder: "6 digits",
            bold: true,
            value: storage.getItem("pairing_code") || "",
            onChange: (value) => storage.setItem("pairing_code", value.replace(/\D/g, "").slice(0, 6)),
            labelStyle: { color: COLORS.ink, fontWeight: "600" },
          }),
          Button({
            label: "Connect to ZittoAndCorri",
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
      heading("Sync diagnostics"),
      Text({ paragraph: true, style: { color: COLORS.ink, fontSize: "12px", lineHeight: "1.55", margin: "0 0 10px" } },
        `Service code loaded: ${serviceLoadedAt}${servicePolyfill ? ` (replaced: ${servicePolyfill})` : ""}\n` +
        (serviceInitError ? `Service startup error: ${serviceInitError}\n` : "") +
        `Phone service: started ${serviceStartedAt} (reason: ${serviceReason})\n` +
        `Connect button pressed: ${pairRequestedAt ? new Date(Number(pairRequestedAt)).toISOString() : "never"}\n` +
        `Request picked up by the service: ${pairRequestedAt ? (pairHandled ? "yes" : "no") : "—"}\n` +
        `Connection result: ${pairResultText}`),
      Text({ paragraph: true, style: { color: COLORS.muted, fontSize: "12px", lineHeight: "1.45", margin: "0 0 10px" } },
        "Shows what the phone received from the watch and the server response. The token is not included."),
      Toggle({
        label: "Show technical details",
        value: showDiagnostics,
        onChange: (value) => storage.setItem("show_diagnostics", value ? "true" : "false"),
      }),
    ]

    if (showDiagnostics) {
      diagnosticChildren.push(
        Text({ paragraph: true, style: { color: COLORS.muted, fontSize: "12px", margin: "12px 0" } },
          `Attempt: ${attemptAt}\nHTTP: ${httpStatus} · Payload: ${payloadSize} bytes\nEndpoint: ${endpoint}`),
        copyField("Server response", response, 7),
        copyField("Payload sent (JSON)", payload, 14),
        Text({ paragraph: true, style: { color: COLORS.muted, fontSize: "11px", margin: "8px 0" } },
          "You can select the contents of the fields to copy and share them. It contains health data, but not the access token."),
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
          "Zepp OS health data, optional and under your control."),
      ]),
      statusCard,
      connectionCard,
      card(diagnosticChildren),
      Text({ align: "center", paragraph: true, style: { color: COLORS.muted, fontSize: "11px", margin: "4px 8px 18px", lineHeight: "1.45" } },
        "The token stays in the Mini Program's private space. ZittoAndCorri does not import activities automatically."),
    ])
  },
})

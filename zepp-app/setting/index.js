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
    value: value || "Nessun dato disponibile",
    onChange: () => {},
    labelStyle: { color: COLORS.ink, fontWeight: "600" },
    subStyle: { fontFamily: "monospace", fontSize: "11px", color: COLORS.muted },
  })
}

AppSettingsPage({
  build(props) {
    const storage = props.settingsStorage
    const paired = storage.getItem("paired") === "true"
    const status = storage.getItem("connection_status") || "Non collegato"
    const lastSync = storage.getItem("last_sync") || "Mai"
    const hasError = /errore|non valido|fallit|rifiutat|http|payload/i.test(status)
    const showDiagnostics = storage.getItem("show_diagnostics") === "true"
    const payload = storage.getItem("diagnostic_payload") || ""
    const response = storage.getItem("diagnostic_response") || ""
    const attemptAt = storage.getItem("diagnostic_attempt_at") || "Mai"
    const httpStatus = storage.getItem("diagnostic_http_status") || "—"
    const payloadSize = storage.getItem("diagnostic_payload_size") || "0"
    const endpoint = storage.getItem("diagnostic_endpoint") || "—"

    const statusCard = card([
      Text({
        bold: true,
        paragraph: true,
        style: { color: hasError ? COLORS.red : paired ? COLORS.green : COLORS.muted, fontSize: "15px", margin: "0 0 5px" },
      }, hasError ? "Sincronizzazione da controllare" : paired ? "Dispositivo collegato" : "Non ancora collegato"),
      Text({ paragraph: true, style: { color: COLORS.ink, fontSize: "13px", margin: "0 0 8px", lineHeight: "1.45" } }, status),
      Text({ style: { color: COLORS.muted, fontSize: "12px" } }, `Ultima sincronizzazione: ${lastSync}`),
    ], { background: hasError ? COLORS.redSoft : paired ? COLORS.greenSoft : COLORS.surface })

    const connectionCard = paired
      ? card([
          heading("Sincronizzazione"),
          Text({ paragraph: true, style: { color: COLORS.muted, fontSize: "13px", margin: "0 0 14px" } },
            "Invia ora i dati disponibili dall'orologio. Le attività FIT e GPX restano separate."),
          Button({
            label: "Sincronizza ora",
            color: "primary",
            style: { width: "100%", borderRadius: "12px", background: COLORS.blue, marginBottom: "10px" },
            onClick: () => action(storage, "sync_action"),
          }),
          Button({
            label: "Disattiva collegamento",
            color: "secondary",
            style: { width: "100%", borderRadius: "12px" },
            onClick: () => action(storage, "disconnect_action"),
          }),
        ])
      : card([
          heading("Collega l'orologio"),
          Text({ paragraph: true, style: { color: COLORS.muted, fontSize: "13px", margin: "0 0 12px", lineHeight: "1.45" } },
            "Inserisci l'indirizzo pubblico dell'app e il codice di 6 cifre generato in ZittoAndCorri."),
          TextInput({
            label: "URL pubblico HTTPS",
            placeholder: "https://tuo-dominio.example",
            value: storage.getItem("api_origin") || "",
            onChange: (value) => storage.setItem("api_origin", value.trim()),
            labelStyle: { color: COLORS.ink, fontWeight: "600" },
          }),
          TextInput({
            label: "Codice di collegamento",
            placeholder: "6 cifre",
            bold: true,
            value: storage.getItem("pairing_code") || "",
            onChange: (value) => storage.setItem("pairing_code", value.replace(/\D/g, "").slice(0, 6)),
            labelStyle: { color: COLORS.ink, fontWeight: "600" },
          }),
          Button({
            label: "Collega a ZittoAndCorri",
            color: "primary",
            style: { width: "100%", borderRadius: "12px", background: COLORS.blue, marginTop: "8px" },
            onClick: () => action(storage, "pair_action"),
          }),
        ])

    const diagnosticChildren = [
      heading("Diagnostica sincronizzazione"),
      Text({ paragraph: true, style: { color: COLORS.muted, fontSize: "12px", lineHeight: "1.45", margin: "0 0 10px" } },
        "Mostra ciò che il telefono ha ricevuto dall'orologio e la risposta del server. Il token non viene incluso."),
      Toggle({
        label: "Mostra dettagli tecnici",
        value: showDiagnostics,
        onChange: (value) => storage.setItem("show_diagnostics", value ? "true" : "false"),
      }),
    ]

    if (showDiagnostics) {
      diagnosticChildren.push(
        Text({ paragraph: true, style: { color: COLORS.muted, fontSize: "12px", margin: "12px 0" } },
          `Tentativo: ${attemptAt}\nHTTP: ${httpStatus} · Payload: ${payloadSize} byte\nEndpoint: ${endpoint}`),
        copyField("Risposta del server", response, 7),
        copyField("Payload inviato (JSON)", payload, 14),
        Text({ paragraph: true, style: { color: COLORS.muted, fontSize: "11px", margin: "8px 0" } },
          "Puoi selezionare il contenuto dei campi per copiarlo e condividerlo. Contiene dati salute, ma non il token di accesso."),
        Button({
          label: "Pulisci diagnostica",
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
          "Dati salute Zepp OS, in modo opzionale e sotto il tuo controllo."),
      ]),
      statusCard,
      connectionCard,
      card(diagnosticChildren),
      Text({ align: "center", paragraph: true, style: { color: COLORS.muted, fontSize: "11px", margin: "4px 8px 18px", lineHeight: "1.45" } },
        "Il token resta nello spazio privato del Mini Program. ZittoAndCorri non importa automaticamente le attività."),
    ])
  },
})

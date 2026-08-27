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
      ...style,
    },
  }, children)
}

function heading(value) {
  return Text({ bold: true, paragraph: true, style: { color: COLORS.ink, fontSize: "17px", margin: "0 0 8px" } }, value)
}

function workoutOptions(storage) {
  let workouts = []
  try { workouts = JSON.parse(storage.getItem("workout_list") || "[]") } catch {}
  return [
    { name: "Automatico: allenamento di oggi", value: "" },
    ...workouts.map((workout) => ({
      name: `${workout.date} · ${workout.title || workout.type}`,
      value: workout.id,
    })),
  ]
}

AppSettingsPage({
  build(props) {
    const storage = props.settingsStorage
    const paired = storage.getItem("paired") === "true"
    const status = storage.getItem("connection_status") || "Non collegato"
    const hasError = /errore|non valido|fallit|rifiutat|http/i.test(status)
    const showDiagnostics = storage.getItem("show_diagnostics") === "true"

    const connection = paired
      ? card([
          heading("Guida della corsa"),
          Text({ paragraph: true, style: { color: COLORS.muted, fontSize: "13px", margin: "0 0 12px", lineHeight: "1.45" } },
            "Il piano si aggiorna alle 06:00, alle 18:00 e quando apri la pagina Coach dentro Exercise."),
          Select({
            label: "Allenamento",
            title: "Scegli cosa correre",
            options: workoutOptions(storage),
            value: storage.getItem("override_workout_id") || "",
            onChange: (value) => storage.setItem("override_workout_id", value || ""),
          }),
          Text({ bold: true, paragraph: true, style: { color: COLORS.ink, fontSize: "14px", margin: "16px 0 4px" } }, "Avvisi durante la corsa"),
          Toggle({
            label: "Vibrazioni guida",
            value: storage.getItem("vibrations") !== "false",
            onChange: (value) => storage.setItem("vibrations", value ? "true" : "false"),
          }),
          Toggle({
            label: "Suoni cambio fase",
            value: storage.getItem("sounds") !== "false",
            onChange: (value) => storage.setItem("sounds", value ? "true" : "false"),
          }),
          Button({
            label: "Aggiorna piano ora",
            color: "primary",
            style: { width: "100%", borderRadius: "12px", background: COLORS.blue, margin: "12px 0 8px" },
            onClick: () => action(storage, "sync_action"),
          }),
          Button({
            label: "Disconnetti estensione",
            color: "secondary",
            style: { width: "100%", borderRadius: "12px" },
            onClick: () => action(storage, "disconnect_action"),
          }),
        ])
      : card([
          heading("Collega il Coach"),
          Text({ paragraph: true, style: { color: COLORS.muted, fontSize: "13px", lineHeight: "1.45" } },
            "Genera un codice in ZittoAndCorri, poi inseriscilo qui. Il collegamento del Coach è separato dalla Mini App salute."),
          TextInput({
            label: "URL pubblico HTTPS",
            placeholder: "https://tuo-dominio.example",
            value: storage.getItem("api_origin") || "",
            onChange: (value) => storage.setItem("api_origin", value.trim()),
          }),
          TextInput({
            label: "Codice di 6 cifre",
            placeholder: "000000",
            value: storage.getItem("pairing_code") || "",
            onChange: (value) => storage.setItem("pairing_code", value.replace(/\D/g, "").slice(0, 6)),
          }),
          Button({
            label: "Collega il Coach",
            color: "primary",
            style: { width: "100%", borderRadius: "12px", background: COLORS.blue, marginTop: "10px" },
            onClick: () => action(storage, "pair_action"),
          }),
        ])

    const help = paired
      ? card([
          heading("Come iniziare"),
          Text({ paragraph: true, style: { color: COLORS.ink, fontSize: "13px", lineHeight: "1.65", margin: 0 } },
            "1. Apri Exercise sull'orologio.\n2. Scegli Corsa all'aperto o Tapis roulant.\n3. Aggiungi Zitto e Corri Coach alle pagine dati.\n4. Avvia la corsa e apri la pagina Coach."),
        ], { background: COLORS.blueSoft })
      : card([
          heading("Ti servono due cose"),
          Text({ paragraph: true, style: { color: COLORS.ink, fontSize: "13px", lineHeight: "1.65", margin: 0 } },
            "1. L'indirizzo HTTPS pubblico di ZittoAndCorri.\n2. Un codice di 6 cifre generato nelle impostazioni Zepp della web app."),
        ], { background: COLORS.blueSoft })

    const diagnostics = [
      heading("Diagnostica"),
      Toggle({
        label: "Mostra dettagli tecnici",
        value: showDiagnostics,
        onChange: (value) => storage.setItem("show_diagnostics", value ? "true" : "false"),
      }),
    ]
    if (showDiagnostics) {
      diagnostics.push(Text({ paragraph: true, style: { color: COLORS.muted, fontSize: "12px", lineHeight: "1.55", margin: "12px 0 0" } },
        `Client: workout\nRevisione: ${storage.getItem("last_revision") || "—"}\nCache offline: ${storage.getItem("workout_list") ? "disponibile" : "vuota"}\nSelezione: ${storage.getItem("override_workout_id") || "automatica"}`))
    }

    return View({ style: { background: COLORS.canvas, padding: "18px", color: COLORS.ink } }, [
      View({ style: { background: COLORS.blue, borderRadius: "20px", padding: "22px 18px", marginBottom: "14px" } }, [
        Text({ bold: true, paragraph: true, style: { color: "#FFFFFF", fontSize: "22px", margin: "0 0 5px" } }, "Zitto e Corri Coach"),
        Text({ paragraph: true, style: { color: "#DCE8FF", fontSize: "13px", margin: 0 } }, "Guida strutturata dentro Exercise"),
      ]),
      card([
        Text({ bold: true, paragraph: true, style: { color: hasError ? COLORS.red : paired ? COLORS.green : COLORS.muted, fontSize: "15px", margin: "0 0 6px" } }, paired ? "Estensione collegata" : "Estensione non collegata"),
        Text({ paragraph: true, style: { color: COLORS.ink, fontSize: "13px", margin: "0 0 6px" } }, status),
        Text({ style: { color: COLORS.muted, fontSize: "12px" } }, `Ultimo aggiornamento: ${storage.getItem("last_sync") || "Mai"}`),
      ], { background: hasError ? COLORS.redSoft : paired ? COLORS.greenSoft : COLORS.surface }),
      help,
      connection,
      card(diagnostics),
    ])
  },
})

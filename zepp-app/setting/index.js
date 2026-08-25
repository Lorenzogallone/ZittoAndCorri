function action(storage, key) {
  storage.setItem(key, String(Date.now()))
}

AppSettingsPage({
  build(props) {
    const storage = props.settingsStorage
    const paired = storage.getItem("paired") === "true"
    const status = storage.getItem("connection_status") || "Non collegato"
    const lastSync = storage.getItem("last_sync") || "Mai"

    return Section({}, [
      Text({ bold: true, paragraph: true }, "Zitto e Corri · Zepp OS"),
      Text({ paragraph: true }, "L'integrazione è opzionale. Le attività FIT/GPX continuano a essere gestite manualmente."),
      TextInput({
        label: "URL ZittoAndCorri",
        placeholder: "https://tuo-dominio.example",
        disabled: paired,
        value: storage.getItem("api_origin") || "",
        onChange: (value) => storage.setItem("api_origin", value.trim()),
      }),
      paired
        ? Section({}, [
            Text({ paragraph: true }, `Stato: ${status}`),
            Text({ paragraph: true }, `Ultima sync: ${lastSync}`),
            Button({
              label: "Sincronizza ora",
              color: "primary",
              onClick: () => action(storage, "sync_action"),
            }),
            Button({
              label: "Disattiva",
              color: "secondary",
              onClick: () => action(storage, "disconnect_action"),
            }),
          ])
        : Section({}, [
            TextInput({
              label: "Codice ZittoAndCorri",
              placeholder: "6 cifre",
              value: storage.getItem("pairing_code") || "",
              onChange: (value) => storage.setItem("pairing_code", value.replace(/\D/g, "").slice(0, 6)),
            }),
            Button({
              label: "Collega",
              color: "primary",
              onClick: () => action(storage, "pair_action"),
            }),
            Text({ paragraph: true }, `Stato: ${status}`),
          ]),
      Text({ paragraph: true }, "Il token viene creato e conservato automaticamente nello spazio privato del Mini Program; non devi copiarlo né incollarlo."),
    ])
  },
})

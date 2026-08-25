# Mini Program Zepp OS

Questa cartella è un progetto Zeus separato dall'app Next.js. Non va copiata
dentro `app/`: viene compilata e installata sull'orologio tramite Zepp Developer.

## Prima installazione

1. Nel portale Zepp Developer crea un Mini Program per **Active 3 Premium** e
   sostituisci l'`appId` provvisorio in `app.json`.
2. Da questa cartella esegui `npm install`, poi
   `NODE_PATH=./node_modules/@zeppos/zeus-cli/private-modules npx zeus login`.
   Il `NODE_PATH` aggira un problema di risoluzione presente in Zeus CLI 1.9.3
   ed è già incluso negli script npm.
3. Per installare direttamente sull'orologio esegui `npm run preview`, scegli
   **Amazfit Active 3 Premium** e scansiona il QR da Zepp → modalità
   sviluppatore. `npm run dev` serve invece esclusivamente per il simulatore
   desktop: prima di usarlo devi installare e avviare Zepp OS Simulator, scaricare
   al suo interno il Device Simulator Active 3 Premium e lasciarlo in ascolto
   sulla porta locale 7650.
4. Apri una volta il Mini Program sull'orologio: questo registra le sync locali
   delle 08:00 e 23:00.
5. In ZittoAndCorri apri **Impostazioni → Zepp OS** e porta lo switch su ON: il
   codice di collegamento viene generato nell'app.
6. Nell'app Zepp sul telefono apri **Active 3 Premium → App → Zitto e Corri →
   Impostazioni**. Inserisci l'URL HTTPS pubblico di ZittoAndCorri e il codice a
   sei cifre, quindi premi **Collega**.
7. Apri il Mini Program sull'orologio e premi **Sincronizza ora**.

Il token non deve essere inserito: il Side Service lo riceve dopo il pairing e
lo conserva nel `SettingsStorage` privato del Mini Program. La coda locale sul
watch conserva al massimo 14 invii non confermati.

La Settings App include un pannello **Diagnostica sincronizzazione**. Attivando
“Mostra dettagli tecnici” si vedono payload JSON, dimensione, endpoint, stato
HTTP e risposta del server dell'ultimo tentativo. Il token non viene mai incluso
nel log; il payload può invece contenere dati salute e va condiviso con cautela.

## Note di collaudo reale

- `fullRecoveryTime` resta salvato anche come valore grezzo: prima dell'uso
  quotidiano va confrontata sul dispositivo l'unità restituita con il valore
  mostrato da Zepp.
- L'App Service programmato usa il canale ZML verso il Side Service. Va provato
  sul firmware reale: il simulatore non riproduce in modo affidabile le
  sospensioni Bluetooth e i limiti dei servizi in background.
- GPS, accelerometro, AFib e registrazione workout non sono richiesti né usati.
- Lo storico workout inviato è solo diagnostico e non genera attività.

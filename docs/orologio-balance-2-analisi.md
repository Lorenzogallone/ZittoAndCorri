# Integrazione orologio ↔ Zitto e Corri: analisi per Amazfit Balance 2

Data: 22 ottobre 2026. Oggetto: come sincronizzare in automatico i dati
dell'orologio due volte al giorno, come portare il piano di allenamento sul
Balance 2 e come semplificare tutti i passaggi orologio → telefono → app.

Fonti: codice del repository, documentazione ufficiale Zepp OS (sorgenti di
docs.zepp.com al commit del 15 ottobre 2026), sample ufficiali Zepp, libreria
`@zeppos/zml` 0.0.43, forum Intervals.icu, annunci Zepp/Amazfit. Ogni
affermazione è marcata: **[DOC]** documentata, **[CODICE]** letta nel repo,
**[3P]** fonte terza o forum, **[DA VERIFICARE]** non confermata. L'elenco dei
link è in fondo.

---

## 1. Sintesi

1. **La sync programmata non ha mai funzionato per un limite di piattaforma,
   non per un bug di rete.** Un App Service avviato da un alarm è "single
   execution": il sistema lo uccide dopo **600 ms** e non gli concede timer
   [DOC]. Il nostro servizio prova a fare un giro BLE → telefono → HTTPS, che
   dura secondi e usa i timer di zml. Non può riuscire, su nessun orologio.
   In più gli alarm non sono persistenti (`store` è false) e spariscono a ogni
   riavvio [DOC]. Il Balance 2 ha lo stesso API level 4.2 dell'Active 3: da
   solo non cambia nulla.
2. **Sul Balance 2 esiste un canale ufficiale che risolve molto di più della
   sync salute: Zepp ↔ Intervals.icu.** Amazfit lo supporta ufficialmente su
   Balance 2 [DOC]. In uscita manda a Intervals.icu le attività complete (FIT
   con GPS e FC) e il wellness (sonno, FC a riposo, HRV, passi, SpO2) [3P]; in
   entrata porta sull'orologio gli allenamenti strutturati del calendario
   Intervals come sedute native dell'app Allenamento [DOC]. Intervals.icu ha
   un'API pubblica gratuita con chiave personale [DOC]. Il server può quindi
   fare da solo, con un cron, sia l'import delle attività (addio esportazione
   manuale del FIT) sia l'import del wellness, e può pubblicare il piano dei
   prossimi 7 giorni. È la strada consigliata per entrambe le fasi.
3. **Nessuna strada garantisce "zero tocchi" al 100% su iPhone**, perché
   tutti i dati escono dall'orologio solo quando l'app Zepp sul telefono fa la
   sync BLE, e iOS può sospenderla [3P]. Intervals.icu riduce il problema al
   minimo: basta che l'app Zepp sincronizzi una volta e tutto il resto è
   server‑to‑server.
4. **La Mini App salute resta utile solo per i numeri proprietari Zepp**
   (carico allenante, tempo di recupero, VO₂max, zone FC) che Intervals non
   riceve. Va sistemata in modo economico: alarm persistenti e ripetuti,
   servizio che *raccoglie e accoda* in meno di 600 ms, invio al primo
   momento utile (apertura della pagina, oppure pagina svegliata dall'alarm).
5. **Watchface: fattibile ma non è la scelta migliore.** Lo storage delle
   Mini App è isolato [DOC]; da luglio 2026 esiste `ShareLocalStorage` per
   condividere dati tra app [DOC], ma non è verificato che una watchface possa
   leggerlo. Il **Secondary Widget** (una strisciata a sinistra del
   quadrante) è supportato sul Balance 2 [DOC], fa parte della Mini App, legge
   il suo storage e mostra "seduta di oggi + readiness" con un giorno di
   lavoro. Consigliato al posto della watchface.
6. **La Workout Extension va declassata a complemento.** I tasti fisici non
   sono mai supportati nelle estensioni [DOC] (il doppio click non funzionerà
   mai), si ferma quando non è in primo piano [DOC], e il supporto sul
   Balance 2 non è documentato [DA VERIFICARE]. Con gli allenamenti nativi via
   Intervals.icu la guida a fasi, gli avvisi e i lap li fa l'orologio stesso.

---

## 2. Cosa c'è oggi (inventario) [CODICE]

| Componente | Dove | Cosa fa | Stato |
| --- | --- | --- | --- |
| Mini App salute | `zepp-app/` | Raccoglie carico, VO₂max, recupero, zone FC, FC a riposo/max, sonno, stress, SpO2, PAI, passi; invia a `POST /api/zepp/sync` via app-side; pairing a 6 cifre; coda di 14 invii | Funziona solo con "Sincronizza ora" |
| Sync programmata | `zepp-app/shared/schedule.js`, `app-service/sync.js` | Alarm one‑shot alle 08:00 e 23:00 → App Service → `collectAndSync` (BLE + HTTP) | **Non può funzionare** (§3) |
| Workout Extension | `zepp-workout-extension/` | Pagina dati dentro Exercise: fase, residuo, target, FC con zone, proiezione km, vibrazioni, suoni; piano scaricato da `POST /api/zepp/workouts/pull` | Mai collaudata su hardware reale (README) |
| Backend Zepp | `app/api/zepp/*`, `lib/zepp/*` | Pairing (codice usabile una volta per client `health` e `workout`), token revocabili, `zepp_sync_events` (audit) + `zepp_daily_metrics` (merge per giorno), readiness Zepp‑assistita, zone FC effettive, piano 14 giorni con caldo applicato | Solido, ben testato |
| Uso dei dati Zepp | profilo, coach AI, zone, import attività | Readiness (recupero 45 %, carico 15 %, sonno 20 %, FC riposo 8 %, stress 7 %, carico interno 5 %), zone FC dall'orologio per analisi e piani, contesto completo al coach | OK; freschezza 36 h per readiness, 3 giorni per metriche, 30 giorni per zone |
| Import attività | `POST /api/import/file`, form attività | FIT/GPX esportati a mano da Zepp (foglio di condivisione iOS → Comando Rapido) | **Manuale** a ogni corsa |
| Notifiche e cron | `vercel.json`, `app/api/cron/*` | Push PWA: promemoria seduta (16:30 UTC), riepilogo lunedì | OK |

Osservazioni di dettaglio:

- `zepp_connections.auto_sync` esiste ma nessuno la legge né la scrive
  oltre al default; `last_error` viene solo azzerato, mai valorizzato quando
  una sync fallisce.
- Il server risponde al pairing con un `schedule` (08:00/23:00 o 06:00/18:00)
  che l'orologio ignora: gli orari sono fissi nel codice del watch.
- La pagina dell'orologio chiede lo stato di connessione al telefono a ogni
  apertura; se il telefono non risponde mostra "Telefono non raggiungibile" ma
  lascia comunque sincronizzare, bene.
- I due progetti Zepp hanno `appId`, token, pairing, app-side e storage
  separati: due collegamenti da fare, due coppie di orari, nessuna
  condivisione di dati tra "salute" e "piano" sull'orologio.
- `client_id` è prefissato `active3-` e `deviceName` ha default "Active 3
  Premium": cosmetico ma fuorviante sul Balance 2.
- `tmp.json` nella root (217 KB, passaggi satellitari) non c'entra con il
  progetto: da rimuovere.

---

## 3. Fase 1: sincronizzazione automatica due volte al giorno

### 3.1 Perché non ha mai funzionato

Catena attuale: alarm → `app-service/sync` → `collectHealthPayload()` →
`enqueueSync()` → `this.request({method:"SYNC_PAYLOAD"})` (zml, BLE) →
app-side sul telefono → `fetch` verso la PWA → risposta → `acknowledgeSync`.

Limiti documentati che la rompono:

1. **600 ms.** "The system limits the execution time for a single execution
   of the App Service to 600ms" [DOC, guida App Service]. L'alarm avvia un
   servizio "single execution". L'handshake BLE di zml ha un timeout di 5 s e
   la richiesta di 60 s: il servizio viene terminato molto prima.
2. **Niente timer.** La tabella delle API disponibili nell'App Service segna
   `setTimeout` e affini come NON disponibili [DOC]. zml usa `@zos/timer` per
   ogni `request()`: nel servizio può fallire già in fase di import.
3. **Alarm volatili.** `set()` ha `store: false` per default: "can still be
   executed successfully after device reboot" solo con `store: true` [DOC].
   Gli alarm sono one‑shot e vengono riarmati solo dal servizio stesso o
   all'apertura dell'app: dopo un riavvio spariscono fino alla prossima
   apertura manuale.
4. **Telefono.** Il side service gira dentro l'app Zepp; Zepp non documenta
   quando viene avviato o sospeso [DOC: assente]. Sugli iPhone gli utenti
   riportano che va tenuta aperta in background [3P]. Alle 23:00 e alle 08:00
   è il caso peggiore.

Cosa succede probabilmente oggi: il servizio parte, raccoglie e accoda il
payload (operazioni sincrone, veloci), poi muore sulla richiesta BLE. Alla
prima "Sincronizza ora" `flushPending` spedisce anche i payload accodati.
Verifica immediata, senza codice: in Supabase
`select trigger, captured_at from zepp_sync_events order by captured_at desc`.
Se compaiono righe con `trigger = 'morning'/'evening'` e `captured_at` alle
08:00/23:00, gli alarm scattano e il problema è solo la consegna.

### 3.2 Cosa cambia con il Balance 2

- Device list ufficiale: API level **4.2**, Zepp OS 5.0, `deviceSource`
  `9568512` (Cina), `9568513`, `9568515`, schermo rotondo **480×480**, 2
  tasti, **Secondary Widget: sì** [DOC]. Nessuna nuova API in 4.x/5.0 su
  background, rete o nuovi sensori (HRV, readiness) [DOC].
- Da agosto 2026 il Balance 2 ha **Zepp OS 6** (firmware 6.2.208.7) con
  Training Calendar sull'orologio e HRV verso Apple Health [3P]; non esiste
  documentazione sviluppatori per OS 6 [DA VERIFICARE se l'API level sale].
- Dall'ottobre 2025 il Balance 2 è tra i primi due dispositivi con il
  collegamento ufficiale **TrainingPeaks e Intervals.icu** [DOC].
- Le nostre app non si installano sul Balance 2 finché `platforms` in
  `app.json` elenca solo i quattro `deviceSource` dell'Active 3 [CODICE].
  `designWidth` 466 può restare: `px()` scala a 480.

### 3.3 Le strade possibili

| | Strada | Automatismo | Dati salute | Attività (FIT) | Rischi |
| --- | --- | --- | --- | --- | --- |
| **C** | **Intervals.icu** (ufficiale) + cron server | Alto: webhook attività, polling wellness | Sonno, FC riposo, **HRV**, passi, SpO2, stress [3P]; non carico/recupero/VO₂ Zepp | **Sì, automatico**, con GPS e FC | Wellness a volte visibile solo dopo una visita web a Intervals [3P]; dipende dalla sync dell'app Zepp |
| A | Mini App "raccogli e accoda" | Medio: dati catturati all'ora giusta, consegnati all'apertura successiva | Tutti quelli attuali + proprietari Zepp | No | Resta un tocco sull'orologio (ma non serve più "l'ora giusta") |
| B | Alarm che sveglia una **pagina** anziché un servizio | Alto se l'app Zepp risponde | Come A | No | Accende lo schermo alle ore programmate; funziona solo se l'app Zepp è viva in background [3P]; verificare l'uscita automatica della pagina [DA VERIFICARE] |
| D | Apple Health + Comandi rapidi iOS | Medio | Passi, FC, sonno, SpO2, HRV (OS 6) | No | Il telefono dev'essere sbloccato quando gira l'automazione [DOC Apple]; dipende dall'app Zepp |
| E | API cloud Zepp non ufficiale dal server | Alto | Tutto, readiness compresa | Sì | Non supportata, token catturato con proxy, violazione ToS possibile, può rompersi in qualsiasi momento [3P] |

Servizio continuo (`@zos/app-service start`): esiste, sopravvive ai riavvii,
ha `@zos/ble` disponibile [DOC], ma anche lì i timer non sono disponibili e
gli sviluppatori riportano richieste zml che funzionano nel simulatore e non
sul dispositivo [3P]. Non lo consiglio come base.

### 3.4 Raccomandazione per la Fase 1

**Strada C come canale principale + strada A come igiene della Mini App.**

1. **Collegare Zepp a Intervals.icu** (nessun codice): nell'app Zepp,
   Profilo → Collegamento account di terze parti → Intervals.icu; in
   Intervals.icu, Impostazioni → riquadro Amazfit: abilitare "download
   wellness" e HRV. Creare la chiave API in Impostazioni → Developer.
2. **Server: nuovo modulo `lib/intervals/`** con cron `GET /api/cron/intervals`
   (protetto da `CRON_SECRET`, chiamato due volte al giorno) che:
   - legge `GET /athlete/0/activities?oldest=…` e per ogni attività nuova
     scarica `/activity/{id}/fit-file` (FIT generato da Intervals, sempre
     valido) e la passa all'ingest esistente (`ingestActivity`) con
     `external_id` per la deduplica; parte l'analisi AI come oggi;
   - legge `GET /athlete/0/wellness?oldest=…` e scrive sonno, FC a riposo,
     HRV, passi, SpO2 in una tabella `wellness_daily` (o in
     `zepp_daily_metrics` con colonna `source`), senza toccare l'audit Zepp.
   - La chiave API va in Supabase Vault come la chiave Gemini.
3. **Readiness v2**: oggi i pesi Zepp (recupero 45 %, carico 15 %) dominano.
   Con Intervals.icu mancano, ma arriva l'HRV, che è il segnale standard di
   readiness: rMSSD contro la mediana degli ultimi 7–14 giorni, più sonno, FC
   a riposo e carico interno (ATL/CTL che il server calcola già). Quando i
   numeri Zepp proprietari arrivano dalla Mini App si sommano come oggi.
4. **Mini App, correzioni minime** (`zepp-app/`):
   - `set({ url: "app-service/sync", time, repeat_type: REPEAT_DAY, store: true })`,
     armato una sola volta e verificato con `getAllAlarms`;
   - il servizio fa solo `enqueueSync(collectHealthPayload(trigger))` ed esce:
     sta sotto i 600 ms e non usa BLE;
   - invio dalla pagina e dal widget (che apre la pagina) con la coda già
     esistente; valutare la strada B (alarm su `page/sync`) come esperimento
     separato;
   - trigger mattutino con l'evento di sistema `event:os.health.sleep_status`
     (il sonno è finalizzato al risveglio, meglio di un orario fisso) [DOC].
5. **Scheduler**: `vercel.json` ha solo cron giornalieri. Verificare il piano
   Vercel: sul piano Hobby i cron girano al massimo una volta al giorno; per
   due esecuzioni al giorno usare un cron Pro oppure un trigger esterno
   (GitHub Actions schedule, cron-job.org) che chiama l'endpoint con il
   bearer `CRON_SECRET`, come già previsto dal README.

Cosa resta manuale: aprire ogni tanto l'app Zepp sull'iPhone perché l'orologio
scarichi i dati (lo fa da sola in background nella maggior parte dei casi).
Tutto il resto diventa automatico, compreso l'import delle corse.

---

## 4. Fase 2: il piano di allenamento sull'orologio

### 4.1 Opzione nativa: Intervals.icu → "Il mio piano" → app Allenamento (consigliata)

Come funziona: il server crea gli eventi `WORKOUT` sul calendario
Intervals.icu (`POST /athlete/0/events/bulk?upsert=true`, testo in
`description`); Intervals carica su Zepp i prossimi 7 giorni, circa tre volte
al giorno e a ogni modifica [3P]; sull'orologio la seduta compare in
Allenamento → Il mio piano (Zepp OS 6: Training Calendar) e parte come
allenamento strutturato nativo, con fasi, target, avvisi, schermo spento,
lap registrati nel FIT. Il FIT torna a Intervals.icu e da lì al nostro server:
l'analisi delle ripetute (`lib/metrics/intervals.ts`) trova i lap.

Mappatura delle nostre fasi (`WorkoutStep`) sulla sintassi Intervals [3P]:

| Nostro campo | Sintassi Intervals | Nota |
| --- | --- | --- |
| `completion_type: time`, `completion_value` s | `- 10m`, `- 90s` | `m` = minuti |
| `completion_type: distance`, metri | `- 1km`, `- 400mtr` | |
| `pace_min_s_km` / `pace_max_s_km` | `4:20-4:10/km Pace` | passo assoluto, supportato dal 17 nov 2025 |
| `hr_min_bpm` / `hr_max_bpm` | `80-88% HR` o `Z2 HR` | i bpm assoluti non sono documentati: convertire in % della FC max effettiva (`getEffectiveHrConfig`) |
| `kind: warmup/cooldown` | sezioni `Warmup` / `Cooldown` | |
| ripetute | riga `6x` prima del blocco | niente ripetute annidate; le nostre fasi sono piatte, quindi va bene |
| `completion_type: manual` | fase a tempo lungo o "lap button" | da decidere |

Vincoli e bug noti da collaudare sul Balance 2 prima di fidarsi:

- un solo target per fase: passo **oppure** FC [3P];
- su T‑Rex 3 un utente riporta i target di passo persi dopo la sync Zepp
  (aprile 2026) [3P]; verificare con una seduta di prova "4×1 km a passo";
- le fasi arrivano etichettate "Training" invece di Warmup/Cooldown [3P];
- su Balance 2 XT la seduta pianificata non viene segnata come fatta [3P];
- piano sincronizzato non abbinabile alla navigazione percorso [3P];
- solo eventi creati in Intervals.icu (anche via API) vengono spinti [3P].

Caldo: il server oggi rallenta i passi del giorno al momento del pull. Con
Intervals il piano va ripubblicato la sera prima con la previsione del giorno
dopo (la funzione `adjustStepsForHeat` esiste già).

Sforzo: 1–2 giorni di codice (mapping puro e testabile + publisher + pulsante
"Invia a Intervals" nelle impostazioni) più un collaudo sul campo.

TrainingPeaks: API riservata ai partner commerciali [DOC], non percorribile.

### 4.2 Workout Extension: tenerla come complemento, non come base

Limiti documentati che pesano sul progetto attuale [DOC]:

- "Does not support button response": il doppio click su `KEY_UP/KEY_DOWN`
  non funzionerà su nessun firmware; restano i tocchi (già previsti);
- "the registered timer will pause" fuori dal primo piano: avanzamento fasi e
  avvisi vivono solo mentre la pagina è visibile;
- dispositivi elencati: T‑Rex 3, Cheetah, T‑Rex Ultra, Falcon (lista
  vecchia); Active 3 Premium funziona secondo un tester terzo [3P]; Balance 2
  **[DA VERIFICARE]**;
- può usare l'app-side via BLE (sample ufficiale "Running Pace Master with
  Side Service") [DOC].

Cosa farne: aggiungere i `deviceSource` del Balance 2, installare una volta e
provare. Se compare in Exercise, tenerla come pagina dati "del coach"
(istruzioni testuali, proiezione km, zona FC colorata) da affiancare alla
seduta nativa; togliere il codice dei tasti; evitare doppi avvisi (vibrazioni
solo se la seduta nativa non ha target). Se non compare, archiviarla.

### 4.3 Watchface e alternative sul quadrante

Fatti [DOC]:

- ogni Mini App ha un `/data` isolato; test di terzi confermano che una
  watchface non legge i file né il SessionStorage di un'altra app [3P];
- da luglio 2026 la documentazione aggiunge `ShareLocalStorage` (scrittura) in
  `@zos/storage` e `LocalStorage(appId, path)` (lettura) in
  `@zos/share-storage`, dichiarati da API level 3.0; l'esempio ufficiale usa
  lo scope `watchface-data`, segno che è pensato anche per i quadranti;
  che il runtime watchface del Balance 2 lo importi è **[DA VERIFICARE]**;
- una watchface non ha rete né app-side documentati: può solo mostrare ciò
  che la Mini App ha pubblicato all'ultima sync;
- il **Secondary Widget** (strisciata a sinistra, schermo intero) e la
  **Shortcut Card** (strisciata a destra) fanno parte della Mini App, leggono
  il suo LocalStorage, si aggiornano in `onResume`, rispondono al tocco
  aprendo la pagina dell'app; Balance 2 li supporta; non possono fare BLE
  direttamente.

Raccomandazione, in ordine:

1. **Secondary Widget "Oggi"** nella Mini App: titolo della seduta, fasi in
   sintesi, passo target, readiness e ora dell'ultima sync; tocco → pagina con
   "Sincronizza ora". Un giorno di lavoro, nessun compromesso sul quadrante
   che l'utente preferisce.
2. **Shortcut Card** con le stesse due righe, per chi usa la strisciata a
   destra.
3. **Watchface** solo in un secondo momento: una watchface JS leggera che
   legge `ShareLocalStorage` della Mini App (seduta di oggi + readiness) e che
   al tocco apre la Mini App con `launchApp`. Prototipo di mezza giornata per
   verificare che `@zos/share-storage` funzioni nel runtime watchface; il
   quadrante completo (ora, data, complicazioni, AOD, editor) è un progetto
   grafico a sé.
4. Con Intervals.icu attivo, il Training Calendar nativo di Zepp OS 6 mostra
   già la seduta pianificata sull'orologio: copre una parte del bisogno senza
   codice.

Notifiche sull'orologio: `@zos/notification` è disponibile nell'App Service
[DOC]; un servizio single‑run svegliato dall'alarm alle 07:00 può mostrare
"Oggi: ripetute 6×1000" leggendo il piano in cache, con un pulsante che apre
la pagina. Piccolo e utile.

---

## 5. Migliorie trasversali ai processi e alle interfacce

1. **Un solo progetto Zepp** (pagina + app-side + setting + app-service +
   secondary-widget, più il `data-widget` se la Workout Extension sopravvive):
   un pairing, un token, uno storage condiviso tra dati salute, piano e
   widget. Il sample ufficiale mostra `data-widget` + `app-side` nello stesso
   progetto; la combinazione con `page` è **[DA VERIFICARE]**. Se non è
   ammessa, far scaricare il piano anche alla Mini App salute (stesso
   endpoint, client `health`) per alimentare il widget.
2. **`app.json` per il Balance 2**: aggiungere `9568513`, `9568515`
   (`9568512` per la versione cinese) oppure una voce generica `{"st":"r"}`;
   aggiornare `deviceName` di default, prefisso `client_id`, README e nomi nel
   portale Zepp Developer. `apiVersion` resta 4.2.
3. **Alarm e trigger**: `store: true`, `REPEAT_DAY`, deduplica con
   `getAllAlarms`, evento `sleep_status` per la raccolta del mattino,
   rispetto dello `schedule` che il server già restituisce al pairing.
4. **Osservabilità**: salvare `last_error` quando una sync fallisce, contare
   gli invii per `trigger` e mostrarli in Impostazioni → Zepp ("ultimo invio
   automatico: ieri 08:02"); sull'orologio mostrare "prossimo alarm" e
   dimensione coda. Oggi non c'è modo di capire dalla PWA se l'automazione
   gira.
5. **Pairing**: mostrare nella PWA URL pubblico e codice insieme, copiabili in
   un tocco; i codici valgono 10 minuti e vanno digitati nell'app Zepp su
   iPhone, dove non si può incollare un QR. Con Intervals.icu il pairing Zepp
   diventa facoltativo.
6. **Import attività**: con Intervals.icu l'import diventa automatico e
   deduplicato per `external_id`; mantenere il Comando Rapido come fallback.
   Per l'utente senza chiave API: nessun cambiamento.
7. **Schema dati**: separare "metriche proprietarie Zepp" (carico, recupero,
   VO₂, PAI, zone) da "wellness generico" (sonno, FC riposo, HRV, passi,
   SpO2) con colonna `source` (`zepp_app`, `intervals`, `manual`), così la
   readiness sa cosa pesa e la freschezza si calcola per sorgente.
8. **Pulizia**: `auto_sync` (usare o togliere), `tmp.json`, prefissi
   "active3", README dei due progetti Zepp da riallineare.
9. **Test**: le funzioni pure (mapping fasi → testo Intervals, readiness v2,
   deduplica attività) seguono lo stile di `tests/*.test.ts` già presente.

---

## 6. Piano di lavoro proposto

| # | Attività | Sforzo | Chi | Dipende da |
| --- | --- | --- | --- | --- |
| 0 | Collegare Zepp ↔ Intervals.icu, creare la chiave API, controllare `zepp_sync_events.trigger` in Supabase, abilitare Developer Mode sul Balance 2 | 30 min, nessun codice | Lorenzo | — |
| 1 | `app.json` Balance 2 + alarm persistenti + servizio "raccogli e accoda" + prefissi/README | ½ giorno | Opus (meccanico, specifica chiara) | 0 |
| 2 | Modulo Intervals.icu lato server: chiave in Vault, cron, import attività via FIT, import wellness, tabella `source` | 2–3 giorni | Fable (design dati e dedup) | 0 |
| 3 | Readiness v2 con HRV e pesi per sorgente; indicatori in Impostazioni | 1 giorno | Fable | 2 |
| 4 | Publisher piano → Intervals.icu (mapping fasi, upsert 7 giorni, ripubblicazione serale con caldo) + collaudo di una seduta sul Balance 2 | 1–2 giorni + test sul campo | Fable per il mapping, test manuale | 0 |
| 5 | Secondary Widget "Oggi" + Shortcut Card nella Mini App | 1 giorno | Opus (UI da specifica) | 1 |
| 6 | Workout Extension: prova sul Balance 2, rimozione tasti, decisione tieni/archivia | ½ giorno | Opus | 1 |
| 7 | Prototipo watchface con `ShareLocalStorage` | ½ giorno di verifica, poi progetto grafico | facoltativo | 5 |
| 8 | Esperimento strada B (alarm che sveglia la pagina) | ½ giorno | facoltativo | 1 |

Ordine consigliato: 0 → 2 → 4 → 1 → 5 → 3, con 6, 7 e 8 solo se c'è tempo.
Le attività 1, 5 e 6 sono adatte a un agente Opus con la specifica di questo
documento; 2, 3 e 4 richiedono scelte di design e vanno fatte con Fable.

Prima decisione da prendere: aprire un account Intervals.icu e collegarlo a
Zepp. Senza questo passo le fasi 2 e 4 non partono; con questo passo si
elimina da subito l'esportazione manuale dei FIT.

---

## 7. Fonti

Documentazione Zepp OS (sorgenti di docs.zepp.com, commit 2b7b79e del 15 ottobre 2026):

- App Service, limite 600 ms, API disponibili: https://docs.zepp.com/docs/guides/framework/device/app-service/
- Alarm `set` (`store`, `repeat_type`): https://docs.zepp.com/docs/reference/device-app-api/newAPI/alarm/set/
- App Service `start` (`reload`, codici errore): https://docs.zepp.com/docs/reference/device-app-api/newAPI/app-service/start/
- Eventi di sistema (`event:os.health.sleep_status`): https://docs.zepp.com/docs/guides/framework/device/system-event/
- Device list (Balance 2: 4.2, 480×480, 9568512/13/15, Secondary Widget sì): https://docs.zepp.com/docs/reference/related-resources/device-list/
- Secondary Widget e Shortcut Card: https://docs.zepp.com/docs/guides/framework/device/secondary-widget/
- Storage isolato per app: https://docs.zepp.com/docs/guides/framework/device/fs/
- `ShareLocalStorage` e `@zos/share-storage`: https://docs.zepp.com/docs/reference/device-app-api/newAPI/storage/ShareLocalStorage/ e https://docs.zepp.com/docs/reference/device-app-api/newAPI/share-storage/LocalStorage/
- Workout Extension (dispositivi, limiti): https://docs.zepp.com/docs/guides/workout-extension/intro/ e https://docs.zepp.com/docs/guides/workout-extension/quick-start/
- Sensore Workout (solo lettura): https://docs.zepp.com/docs/reference/device-app-api/newAPI/sensor/Workout/
- Notifiche sull'orologio: https://docs.zepp.com/docs/reference/device-app-api/newAPI/notification/notify/
- Architettura (tutta la rete passa dal side service): https://docs.zepp.com/docs/guides/architecture/arc/
- Sample ufficiali: https://github.com/zepp-health/zeppos-samples (3.0-feature, workout-extensions/3.5)
- zml 0.0.43 (timer e timeout in `request`): https://github.com/zepp-health/zml
- Segnalazioni su zml negli App Service: https://github.com/orgs/zepp-health/discussions/351 e https://github.com/orgs/zepp-health/discussions/125

Zepp / Amazfit:

- TrainingPeaks e Intervals.icu su T‑Rex 3 Pro e Balance 2: https://os.zepp.com/news/train-smarter-with-trainingpeaks-and-intervalsicu
- Zepp OS 6 sul Balance 2 (Training Calendar, HRV → Apple Health): https://us.amazfit.com/blogs/product-update/amazfit-balance-2-series-august-2026-update-a-smarter-training-experience-with-zepp-os-6 e https://os.zepp.com/zepp-os-6-overview
- Training Template sul Balance 2: https://support.amazfit.com/en/amazfit_balance_2/docs/VmQgdsYH8oW0GRxsnMwcT6NNned
- Sync solo con app Zepp aperta/Bluetooth attivo: https://support.amazfit.com/en/faq/1161

Intervals.icu:

- Annuncio supporto Amazfit/Zepp e thread con segnalazioni: https://forum.intervals.icu/t/amazfit-zepp-support-available/107652
- Wellness Zepp visibile dopo visita web: https://forum.intervals.icu/t/wellness-data-sleep-only-syncs-from-zepp-after-manual-web-login/122754
- Seduta non segnata come fatta (Balance 2 XT): https://forum.intervals.icu/t/zepp-planned-workout-not-marked-as-done/126413
- API pubblica (chiave personale, endpoint eventi/attività/wellness): https://intervals.icu/api/v1/docs e https://forum.intervals.icu/t/api-access-to-intervals-icu/609
- Cookbook integrazione (webhook solo OAuth): https://forum.intervals.icu/t/intervals-icu-api-integration-cookbook/80090
- Sintassi allenamenti: https://forum.intervals.icu/t/workout-builder-syntax-quick-guide/123701

Altro:

- TrainingPeaks API solo per partner: https://www.trainingpeaks.com/blog/an-update-on-trainingpeaks-partner-api/
- Terra (plumbing TrainingPeaks ↔ Zepp, finestra 7 giorni): https://tryterra.co/community/zepp-and-structured-workouts
- Apple HealthKit e telefono bloccato: https://developer.apple.com/documentation/healthkit/hkerror
- API cloud Zepp non ufficiale (ricerca 2025): https://github.com/weddle/zepp-cloud-sdk

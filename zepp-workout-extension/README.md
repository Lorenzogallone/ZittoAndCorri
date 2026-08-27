# Zitto e Corri Coach — Workout Extension Zepp OS

Questa cartella contiene una seconda applicazione Zepp indipendente dalla Mini App `zepp-app`.

- **Mini App salute (`zepp-app`)**: legge e invia a ZittoAndCorri i riepiloghi salute disponibili sul dispositivo.
- **Workout Extension (`zepp-workout-extension`)**: si apre dentro l'app di sistema **Exercise/Allenamento** mentre una corsa è in corso. Exercise continua a gestire GPS, pausa, ripresa, salvataggio e file attività; l'estensione aggiunge la guida delle fasi, i target e gli avvisi.

Le due applicazioni hanno token, pairing e `appId` separati. Si possono installare e collegare entrambe oppure soltanto una.

## Prerequisiti

- Backend ZittoAndCorri raggiungibile con un URL HTTPS pubblico.
- Migrazione Supabase `0016_zepp_workout_extension.sql` applicata.
- Node.js e dipendenze installate con `npm ci` nella root e in questa cartella.
- Zeus CLI incluso nelle dipendenze del progetto.
- Account Zepp Developer e un dispositivo/firmware che esponga Workout Extension.
- API level 4.2 sul dispositivo.

Il manifest contiene l'`appId` segnaposto `1000000`. Nel portale Zepp Developer creare una **nuova applicazione Workout Extension**, distinta dalla Mini App salute, copiare il nuovo ID e sostituire `app.appId` in `app.json`. Non riutilizzare `1124767` o l'ID di un'altra applicazione.

> Nota Active 3 Premium: il progetto include i quattro `deviceSource` già usati dal repository. La documentazione pubblica Zepp non elenca ancora ogni variante Active 3 tra i modelli Workout Extension. Prima della pubblicazione verificare nel portale e sul firmware installato che la voce Workout Extension sia effettivamente disponibile.

## Configurazione e pairing

1. Pubblicare ZittoAndCorri su un dominio HTTPS. `localhost` e gli URL HTTP non sono accettati dall'App Side Service.
2. Applicare la migrazione Supabase e distribuire il backend che contiene `POST /api/zepp/workouts/pull`.
3. In ZittoAndCorri aprire **Impostazioni > Zepp** e generare un codice di collegamento di 6 cifre.
4. Nell'app Zepp sul telefono aprire le impostazioni di **Zitto e Corri Coach**.
5. Inserire l'origine pubblica, per esempio `https://corri.example.it`, senza aggiungere il percorso API.
6. Inserire il codice e toccare **Collega Zitto e Corri Coach**.

Il codice viene consumato dal client `workout`; un eventuale collegamento `health` rimane indipendente. Per cambiare account usare **Disconnetti estensione** e ripetere il pairing.

## Build, simulatore e installazione fisica

Dalla cartella `zepp-workout-extension`:

```bash
npm ci
npm run build
```

Il pacchetto `.zab` viene scritto in `dist/`.

Per lo sviluppo nel simulatore:

```bash
npm run dev
```

Per creare e inviare una preview tramite Zeus:

```bash
npm run preview
```

Nel simulatore l'estensione può comparire nell'elenco applicazioni per agevolare lo sviluppo. Sul dispositivo fisico non viene aperta come una normale app: installare la preview seguendo il QR/flusso mostrato da Zeus e poi abilitarla da Exercise.

## Attivazione dentro Exercise

La posizione delle voci può cambiare leggermente tra firmware:

1. Aprire **Exercise/Allenamento** sull'orologio.
2. Selezionare **Corsa all'aperto** oppure **Tapis roulant**.
3. Prima di iniziare, aprire le impostazioni della disciplina.
4. Entrare in **Workout Extension**, **Estensioni allenamento** o **Altre pagine dati**.
5. Aggiungere/abilitare **Zitto e Corri Coach**.
6. Avviare la corsa e scorrere tra le pagine dati di Exercise fino alla pagina del Coach.

L'estensione supporta soltanto i sottotipi Zepp `1` (Corsa all'aperto) e `2` (Tapis roulant). È configurata a schermo intero (`isPinned: 1`).

## Sincronizzazione del piano

Il backend restituisce gli allenamenti pianificati dei successivi 14 giorni e una revisione deterministica.

- Alle **06:00** e alle **18:00** locali un App Service esegue un controllo incrementale.
- Ogni volta che la pagina dell'estensione prende il primo piano viene eseguito un altro controllo.
- **Aggiorna piano ora** nelle impostazioni forza il download.
- Se è impostato un override ancora presente nella finestra di 14 giorni, viene scelto quello.
- Senza override viene scelto automaticamente l'allenamento di oggi soltanto quando è unico. Con zero o più allenamenti odierni la selezione rimane vuota/ambigua.

L'elenco scaricato e la revisione vengono conservati sia dal servizio telefonico sia sul watch. Se telefono o rete non sono raggiungibili, l'ultima versione valida resta utilizzabile. Un piano non viene sostituito dopo che la sessione è iniziata; un aggiornamento ricevuto durante la corsa sarà disponibile alla sessione successiva.

Per cambiare manualmente seduta aprire le impostazioni di **Zitto e Corri Coach**, scegliere **Allenamento da guidare** e sincronizzare. La voce automatica rimuove l'override.

## Schermata durante la corsa

La pagina mostra:

- nome della fase corrente;
- tempo o distanza residua, oppure `Manuale`;
- range target di passo e frequenza cardiaca;
- passo e HR nativi di Exercise tramite widget `SPORT_DATA`;
- previsione di chiusura del chilometro corrente;
- nome della fase successiva;
- stato degli avvisi e dell'eventuale sensore HR.

Ogni secondo vengono letti durata netta, distanza e velocità di Exercise. Le pause quindi non consumano una fase temporale e non aggiungono distanza. Al ritorno sulla pagina lo stato viene riallineato alle metriche native.

### Previsione del prossimo chilometro

La velocità viene mediata sugli ultimi 15 secondi e trasformata in passo. Al passaggio di ogni confine chilometrico, il tempo esatto viene interpolato tra i due campioni che circondano il confine. La previsione è:

`tempo trascorso nel km + distanza restante × passo medio mobile`

Per esempio `Km 4 previsto 5:12` indica il tempo stimato del quarto chilometro, non il tempo totale dell'allenamento. Se l'estensione è stata aperta dopo l'inizio e non ha ancora osservato un confine, mostra `—` fino al passaggio successivo.

## Avvisi, suoni e comandi

Vibrazioni:

- cambio fase o conclusione: quattro impulsi;
- passo troppo veloce: due impulsi brevi;
- passo troppo lento: un impulso lungo;
- HR sopra il limite: sequenza urgente.

Il passo deve restare fuori range per 20 secondi consecutivi prima dell'avviso; la HR deve restare sopra il limite per 30 secondi consecutivi. Ogni tipo di avviso ha 60 secondi di cooldown. Se il sensore `HeartRate` non è disponibile, `SPORT_DATA` continua a mostrare il valore nativo ma gli avvisi HR vengono disabilitati.

I suoni vengono usati soltanto al cambio fase e alla conclusione. Vengono riprodotti solo se abilitati nelle impostazioni del Coach e se i suoni di sistema dell'orologio sono attivi.

Comandi:

- doppio clic `KEY_DOWN`: fase successiva;
- doppio clic `KEY_UP`: fase precedente;
- Home, Back e clic singoli vengono restituiti a Exercise;
- aree touch **PRECEDENTE** e **SUCCESSIVA**: fallback sempre visibile.

Zepp documenta `CLICK` come interazione garantita, mentre avverte che la risposta ai tasti può non essere esposta alle Workout Extension. Se il doppio clic non funziona sul firmware in uso, utilizzare le due aree touch; non è un errore del piano o del pairing.

## Limite del primo piano

Quando la pagina perde il focus, Zepp mette la Workout Extension in pausa: timer, callback e avvisi real-time non continuano su un'altra pagina di Exercise. GPS, registrazione e pausa nativi proseguono normalmente. Tornando alla pagina Coach, il motore riallinea fase e confini usando durata e distanza nette, ma non può recuperare una vibrazione che avrebbe dovuto avvenire mentre era fuori primo piano.

Per una guida continua lasciare normalmente **Zitto e Corri Coach** come pagina visibile.

## Diagnostica e problemi comuni

Nelle impostazioni sono visibili tipo client, revisione, disponibilità cache, override, ultimo aggiornamento e ultimo stato.

- **URL pubblico non valido**: usare l'origine HTTPS completa, senza spazi, `/api/...` o slash ripetuti.
- **Codice rifiutato/scaduto**: generare un nuovo codice nella PWA; ogni codice è monouso.
- **Piano vuoto**: verificare che esista esattamente un allenamento `planned` per oggi oppure scegliere un override.
- **Override sparito**: è stato eliminato, completato o è fuori dalla finestra dei prossimi 14 giorni; il server lo rimuove automaticamente.
- **Offline senza piano**: almeno una sincronizzazione riuscita deve avvenire prima di uscire senza telefono/rete.
- **Nessun avviso HR**: controllare permesso HR, disponibilità del sensore e presenza di `hr_max_bpm` nella fase.
- **Nessun suono**: controllare sia il toggle del Coach sia suoni/silenzioso dell'orologio.
- **Doppi clic ignorati**: usare i controlli touch; alcuni firmware non inoltrano `onKey` alle estensioni.
- **L'estensione non appare in Exercise**: controllare nuovo `appId`, API level, compatibilità del modello/firmware, sottotipo 1/2 e installazione della preview.
- **Build con ID errato**: sostituire il placeholder in `app.json`; Zeus può compilare il placeholder, ma non consente una distribuzione corretta.

## Checklist della prima corsa

- [ ] Migrazione `0016_zepp_workout_extension.sql` applicata.
- [ ] Backend pubblico aggiornato e raggiungibile via HTTPS.
- [ ] Nuovo `appId` Workout Extension creato e inserito in `app.json`.
- [ ] `npm ci` e `npm run build` completati senza errori.
- [ ] `.zab`/preview installata sull'Active 3 Premium.
- [ ] Estensione collegata con client `workout` e stato **Piano aggiornato**.
- [ ] Allenamento di prova con riscaldamento, ripetuta, recupero e defaticamento presente nel piano.
- [ ] Estensione abilitata sia per Corsa all'aperto sia per Tapis roulant.
- [ ] Fase, residuo, target, passo, HR e fase successiva visibili.
- [ ] Pausa di Exercise verificata: il residuo temporale non diminuisce.
- [ ] Avanzamento automatico verificato su una fase a tempo.
- [ ] Avanzamento automatico verificato su una fase a distanza.
- [ ] PRECEDENTE/SUCCESSIVA touch verificati.
- [ ] Doppi clic fisici verificati; annotato l'eventuale limite firmware.
- [ ] Vibrazione cambio fase, passo veloce/lento e HR alta verificate.
- [ ] Suono cambio fase verificato con suoni di sistema attivi e assenza verificata in silenzioso.
- [ ] Previsione `Km N previsto` verificata dopo un confine osservato.
- [ ] Override selezionato, sincronizzato e poi rimosso tornando ad automatico.
- [ ] Avvio senza rete verificato usando la cache locale.
- [ ] Aggiornamento durante una sessione verificato: il piano attivo non cambia.
- [ ] Cambio pagina e ritorno verificati: stato riallineato e avvisi riattivati in primo piano.

Il collaudo fisico di vibrazioni, suoni, tasti e disponibilità Workout Extension non può essere sostituito dal simulatore: va completato sul firmware reale prima della pubblicazione.

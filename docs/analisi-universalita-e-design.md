# Zitto e Corri per tutti: quanto è universale l'app e come migliorarne design e UX

Data: 1 novembre 2026. Oggetto: (1) cosa impedisce oggi a un utente qualsiasi
di usare l'app e impostare da solo i propri dati; (2) quali skill di design e
UX per Claude Code valgono la pena e quali migliorie concrete suggeriscono,
con riferimento alla PWA installata su iPhone 15 Pro.

Marcature: **[CODICE]** verificato nel repository, **[DOC]** documentazione o
file primario letto, **[3P]** fonte terza, **[DA VERIFICARE]** non confermato.

---

## 1. Sintesi

1. **L'app è già multiutente nel modello dati, non nell'esperienza.** Ogni
   utente ha dati separati (RLS), memoria del coach separata, tema, chiavi AI
   e integrazioni proprie [CODICE]. Ma quattro scelte la rendono di fatto
   "l'app di Lorenzo": login solo Google, Coach AI solo con chiave Gemini o
   OpenRouter portata dall'utente, fuso orario Europe/Rome fisso in 27 file,
   lingua e unità fisse (italiano, km). Per un runner italiano con un account
   Google e voglia di procurarsi una chiave AI funziona bene; per chiunque
   altro è un muro all'ingresso.
2. **Il muro più alto è la chiave AI.** Senza chiave non c'è chat, piano,
   analisi delle corse: cioè il cuore dell'app. Il primo passo per renderla
   universale è un **piano gratuito con chiave dell'app e un tetto di spesa
   mensile per utente**, con la chiave personale come opzione "senza limiti".
   Il repo ha già la contabilità dei costi per utente (`ai_usage_events`,
   migrazione 0024) [CODICE]: manca solo la policy.
3. **Dati personali: si impostano dall'app, ma mancano quelli che servono a
   un runner qualunque.** Onboarding in tre passi (FC, obiettivo, chiave) e
   profilo modificabile [CODICE]. Mancano: stima automatica della FC massima
   dall'età, sesso e peso (per calorie e stime), lingua, unità, fuso orario,
   giorno di inizio settimana, preferenze sui giorni di allenamento, ritmo di
   riferimento o tempo recente su una distanza (per chi non ha corse
   importate). E manca del tutto la cancellazione dell'account e l'export dei
   dati dall'app.
4. **Design e PWA sono già curati**: design system con token, tema chiaro e
   scuro sincronizzato, safe area gestite, splash in standalone, tab bar a
   pillola, skeleton su cinque schermate, 82 attributi ARIA [CODICE]. Le
   migliorie sono di rifinitura, non di rifacimento. La più urgente è una sola
   riga: `userScalable: false` e `maximumScale: 1` in `app/layout.tsx`
   bloccano lo zoom, un'anomalia di accessibilità che tutte le guide citano.
5. **Skill consigliate**: `emilkowalski/skills` (`mobile-native` e
   `apple-design`), `vercel-labs/agent-skills` (`web-design-guidelines`) e
   `pbakaus/impeccable`. Da evitare `ui-ux-pro-max` (genera una nuova palette
   invece di rispettare il brand) e le skill "PWA" di provenienza incerta.

---

## 2. Quanto è universale oggi

### 2.1 Cosa c'è già [CODICE]

| Area | Stato |
| --- | --- |
| Separazione dati | RLS su tutte le tabelle; coach, memoria, chiavi e integrazioni per utente |
| Onboarding | 3 passi: FC max/riposo e nascita, obiettivo facoltativo, chiave Gemini facoltativa; gate in `lib/supabase/proxy.ts` |
| Profilo | FC max, FC riposo, nascita; valori dell'orologio con precedenza e sorgente indicata |
| Impostazioni | Caldo, tema (modo, accento, stile), notifiche push, Gemini, OpenRouter, modelli per compito e costi, memoria del coach, Zepp, Intervals.icu, chiave import |
| Obiettivi | Gara con data e tempo, oppure distanza generica |
| Import | Manuale, FIT/GPX, Comando Rapido iOS, Intervals.icu automatico |
| PWA | Manifest, service worker con precache, splash, diagnostica, notifiche push |

### 2.2 Le barriere, in ordine di impatto

**1. Coach AI solo con chiave propria.** Chat, proposte di piano, analisi
delle corse, riepilogo del lunedì: tutto passa da `getAiConfig`, che senza
chiave Gemini o OpenRouter restituisce null [CODICE]. Un utente nuovo vede il
link "Aggiungi una chiave Gemini o OpenRouter per parlare con il coach" e si
ferma: creare una chiave in Google AI Studio è un passaggio da sviluppatore.

Proposta: tre livelli, scelti dal server.
- **Incluso**: chiave dell'app (variabile d'ambiente), modello economico,
  tetto mensile per utente in euro o token, contato con `ai_usage_events`.
  Al superamento: messaggio chiaro e invito a mettere la propria chiave.
- **Personale**: come oggi (Gemini o OpenRouter), senza limiti.
- **Disattivato**: l'app resta utile senza AI (piano manuale, statistiche).
Serve una sola colonna di policy e un controllo in `getAiConfig`. Costo
stimato: 1 giorno.

**2. Solo Google.** `signInWithOAuth({ provider: "google" })` è l'unica via
[CODICE]. Su iPhone l'attesa è "Accedi con Apple" e "link via email". Supabase
li supporta entrambi; Apple richiede la configurazione del Services ID. Con
l'email magic link (OTP) si copre chiunque senza nuove configurazioni
esterne. Costo: mezzo giorno per l'OTP, un giorno per Apple.

**3. Fuso orario fisso.** `Europe/Rome` e `romeDay()` compaiono in 27 file
[CODICE]: cron, piano, "oggi", statistiche settimanali, meteo. Per un utente
fuori dall'Italia il giorno cambia all'ora sbagliata e i promemoria arrivano
nel momento sbagliato. Proposta: colonna `profiles.timezone` (default
`Europe/Rome`), letta una volta per richiesta e passata alle funzioni che oggi
chiamano `romeDay()`; i cron iterano per utente con il suo fuso. È il refactor
più lungo della lista (2–3 giorni) e si può rimandare finché il pubblico è
italiano.

**4. Lingua e unità.** Interfaccia, prompt del coach e metodologia sono in
italiano; chilometri e min/km ovunque, formattazione `it-IT` in 41 punti
[CODICE]. Per un pubblico italiano va bene. Se l'obiettivo è "tutti", l'ordine
giusto è: prima le unità (miglia/min/mi come preferenza, 1 giorno), poi
l'inglese (estrazione delle stringhe, 3–5 giorni, prompt del coach compresi).

**5. Dati fisiologici mancanti o troppo tecnici.**
- Il primo passo dell'onboarding chiede FC massima e a riposo: la maggior
  parte dei runner non le conosce. Senza, `hrZones()` restituisce null e
  spariscono zone, tempo in zona, parte della readiness [CODICE]. Proposta:
  stima automatica dall'età (Tanaka: 208 − 0,7 × età) con etichetta "stimata",
  sostituita dai valori dell'orologio o manuali quando arrivano.
- Mancano **sesso e peso** (calorie, stime di VO₂, HRV di riferimento) e un
  **ritmo di partenza**: un tempo recente su 5 o 10 km, o la sensazione
  "principiante / intermedio / esperto". Oggi il primo piano del coach parte
  senza alcun dato sul livello se non ci sono corse importate.
- Mancano **giorni disponibili** e **giorno lungo preferito**: il coach li
  deduce dalla chat, ma andrebbero nel profilo.

**6. Account e dati.** Non esiste "Elimina account" né "Esporta i miei dati"
[CODICE]. Per un servizio aperto ad altri sono obbligatori (GDPR) e vanno in
Impostazioni → App: cancellazione con conferma (una RPC che elimina
`auth.users`, le cascade fanno il resto) ed export JSON di attività, piano,
chat. Costo: 1 giorno.

**7. Integrazioni orologio non neutre.** La sezione "Orologio Zepp" presume
un Amazfit; Intervals.icu però copre anche Garmin, Coros, Polar, Suunto, Wahoo
[3P: Intervals.icu collega i principali marchi]. Basta rinominare la sezione
"Orologio e piattaforme" e spiegare che Intervals.icu funziona con qualsiasi
marca; Zepp resta un'opzione in più.

### 2.3 Priorità proposta (universalità)

| # | Intervento | Sforzo | Effetto |
| --- | --- | --- | --- |
| 1 | AI "inclusa" con tetto mensile + chiave personale facoltativa | 1 g | Toglie la barriera principale |
| 2 | Login via email (OTP) e Apple | 0,5–1,5 g | Tutti possono entrare |
| 3 | FC max stimata dall'età; sesso, peso, livello/ritmo nel profilo e nell'onboarding | 1 g | Piani sensati dal primo giorno |
| 4 | Elimina account ed export dati | 1 g | Requisito per aprire ad altri |
| 5 | Unità (km/mi) come preferenza | 1 g | Pubblico anglofono |
| 6 | Fuso orario per utente | 2–3 g | Utenti fuori dall'Italia |
| 7 | Inglese (i18n) | 3–5 g | Da fare solo con un pubblico reale |

---

## 3. Skill di design e UX: quali valgono

Nel catalogo skill dell'organizzazione non c'è nulla sul design. Tra quelle
pubbliche, lette direttamente nei repository:

| Skill | Cosa fa | Giudizio |
| --- | --- | --- |
| **`emilkowalski/skills` → `mobile-native`, `apple-design`** (Emil Kowalski, ex Vercel/Linear) [DOC] | Correzioni CSS e meta che separano "sito nel browser" da "app installata": hover solo con `(hover: hover)`, tap highlight, `100dvh`, input ≥ 16px, `touch-action: manipulation`, overscroll, `viewport-fit=cover` + safe area, theme-color per schema, `inputmode`/`enterkeyhint`; `apple-design` traduce i principi WWDC (latenza, interruzioni, molle, reduced motion) | **Installare.** L'unica fatta per il nostro caso esatto. Regola 4: "mai disabilitare lo zoom" |
| **`vercel-labs/agent-skills` → `web-design-guidelines`** [DOC] | Scarica ~100 regole (accessibilità, focus, form, animazioni, safe area, dark mode, i18n) e restituisce findings `file:riga` | **Installare** come revisore ripetibile prima dei merge. Non genera design |
| **`pbakaus/impeccable`** (Paul Bakaus) [DOC] | 24 comandi: `critique`, `audit` (accessibilità, performance, tema, responsive), `polish`, `onboard` (primo uso ed empty state), `typeset`, `quieter`; rilevatore di "slop" deterministico | **Installare** per gerarchia visiva, tipografia, empty state. Rifiutare l'hook automatico e spegnere la telemetria (`DO_NOT_TRACK=1`) |
| `anthropics/skills` → `frontend-design` [DOC] | Gusto e anti-cliché per pagine nuove | Ridondante con Impeccable, pensata per landing page |
| `nextlevelbuilder/ui-ux-pro-max` [DOC] | Generatore di design system da CSV (palette, font, stili); richiede Python | **Evitare**: propone una palette nuova invece di rispettare il brand; regole mobile scritte per app native |
| skill "PWA" varie (`dotagents/pwa`, `mobile-ux-optimizer`) [3P] | Boilerplate manifest e safe area | Evitare: autore incerto, duplicano `mobile-native` |

Installazione (dalla cartella del progetto):

```bash
npx skills@latest add emilkowalski/skills
npx skills add vercel-labs/agent-skills
npx impeccable install   # oppure /plugin marketplace add pbakaus/impeccable
```

Conflitti da decidere e scrivere in `AGENTS.md`:
- **Maiuscole**: Vercel vuole il Title Case inglese; per l'italiano vale la
  frase normale (sentence case), come già fa l'app.
- **Overscroll**: Emil lo spegne globalmente, Vercel solo con puntatore
  fine. In PWA standalone su iPhone non esiste il pull-to-refresh del
  browser: la regola di Emil, già applicata in `globals.css` (`overscroll-behavior-y: none`), va bene.
- **Hover**: in Tailwind v4 `hover:` è già limitato a `(hover: hover)`; mai
  scrivere `:hover` in CSS puro.
- **Zoom**: l'esempio nella documentazione Next 16 (`generate-viewport.md`)
  usa `maximumScale: 1, userScalable: false`; le skill lo marcano come errore.
  Seguire le skill.
- Non installare insieme Impeccable e ui-ux-pro-max: due "fonti di verità"
  del design system.

Nessuna skill copre i prompt di installazione e aggiornamento della PWA: va
fatto a mano (punto 4.3).

---

## 4. Revisione UX della PWA su iPhone 15 Pro

Schermo 393×852 pt, Dynamic Island, iOS 26, modalità standalone. Il codice è
stato controllato per ciascun punto delle guide (Apple HIG, WCAG 2.2, Vercel,
Emil Kowalski).

### 4.1 Già a posto [CODICE]

- `viewportFit: "cover"`, safe area in alto e in basso in `globals.css` e
  nella tab bar; chat a tutto schermo con `100dvh` e padding safe area.
- Tema chiaro e scuro con `color-scheme`, `theme-color` per schema, init
  script anti-flash, preferenze salvate nel profilo.
- Input e textarea a 16px (`text-base`) e altezza 44px (`h-11`): nessuno zoom
  automatico di iOS; pulsanti di default 44px.
- `inputMode` numerico/decimale sui campi numerici; `prefers-reduced-motion`
  rispettato in `globals.css`; 82 attributi ARIA; `aria-live` sui salvataggi.
- Skeleton (`loading.tsx`) su 5 schermate; conferme (`window.confirm`) sulle
  7 azioni distruttive; empty state con invito ("Registra le prime corse").
- Splash in standalone allineato al `background_color` del manifest;
  watchdog per le navigazioni bloccate su iOS.

### 4.2 Da correggere (piccoli, alto valore)

1. **Zoom bloccato** (`app/layout.tsx`, `maximumScale: 1`, `userScalable:
   false`): violazione WCAG 1.4.4 e regola esplicita di entrambe le skill.
   Togliere le due righe; gli input a 16px evitano già lo zoom indesiderato.
   Verificare sull'iPhone il doppio tap sulle card.
2. **Tocco nativo**: manca `-webkit-tap-highlight-color: transparent`,
   `touch-action: manipulation` e `user-select: none` sui controlli
   [CODICE: assenti in `globals.css`]. Tre regole CSS; eliminano il lampo
   grigio al tocco e il ritardo di 300 ms residuo.
3. **Form**: solo 6 usi di `autoComplete`/`enterKeyHint`/`autoCapitalize`
   [CODICE]. Aggiungere `enterKeyHint="send"` alla chat, `"done"` ai form,
   `autoCapitalize="none"` e `spellCheck={false}` ai campi chiave/codice,
   `autoComplete="one-time-code"` al codice di pairing.
4. **`window.confirm`** per le 7 azioni distruttive: su iOS standalone apre
   un alert di sistema fuori tema. Sostituire con un foglio di conferma (sheet
   dal basso) oppure con "annulla" temporizzato dove reversibile
   (es. elimina corsa).
5. **Manifest**: aggiungere `id`, `scope`, icona `purpose: "maskable"`,
   `shortcuts` (Nuova corsa, Piano di oggi) e `screenshots`; `theme_color`
   del manifest è fisso scuro mentre la pagina è chiara di giorno.
6. **Feedback aptico**: `navigator.vibrate` non esiste su iOS [CODICE,
   `lib/haptics.ts`]. Su iOS 18+ Safari dà feedback aptico ai controlli
   `<input type="checkbox" switch>` [DA VERIFICARE sull'iPhone]: si può usare
   per gli switch delle impostazioni e come "trucco" per il tocco di
   conferma.

### 4.3 Da aggiungere

7. **Invito all'installazione**: iOS non ha `beforeinstallprompt`. Quando
   l'app gira nel browser (non standalone) mostrare una volta un suggerimento
   chiudibile: "Condividi → Aggiungi alla schermata Home", con l'icona di
   iOS. Oggi chi apre il link in Safari non sa che è un'app.
8. **Aggiornamento**: il service worker fa `skipWaiting()` in silenzio
   [CODICE]. Aggiungere un toast "Nuova versione pronta · Ricarica" quando c'è
   un worker in attesa, così gli utenti non restano su build vecchie (è il
   problema visto con la Mini App Zepp).
9. **Primo uso guidato**: dopo l'onboarding la home è la chat vuota. Un
   percorso a tre caselle ("Importa una corsa", "Collega l'orologio",
   "Chiedi un piano") con stato fatto/da fare rende evidente cosa fare. È
   esattamente il campo del comando `onboard` di Impeccable.
10. **Contrasto**: verificare con `impeccable audit` i testi `text-micro`
    (11px) su sfondo `muted` in tema chiaro; 11px è sotto la soglia di
    comfort su iPhone per etichette non decorative.
11. **Target di tocco**: i `size="sm"` dei pulsanti sono 36px (`h-9`)
    [CODICE]. Dove sono l'unica azione (es. "Modifica" nel profilo) portare
    l'area cliccabile a 44px con padding, lasciando l'aspetto compatto.

### 4.4 Piano di lavoro

| Passo | Cosa | Sforzo |
| --- | --- | --- |
| 1 | Installare le tre skill; scrivere le regole di conflitto in `AGENTS.md` | 1 h |
| 2 | Eseguire `web-design-guidelines` e `impeccable audit` sull'app; raccogliere i findings | 1 h |
| 3 | Correzioni 1–3 e 5 (zoom, tocco nativo, form, manifest) | 0,5 g |
| 4 | Toast di aggiornamento e invito all'installazione | 0,5 g |
| 5 | Foglio di conferma al posto di `window.confirm`; target 44px | 0,5 g |
| 6 | Primo uso guidato (`impeccable onboard`) e contrasto `text-micro` | 1 g |

Tutto il blocco design vale circa 3 giorni; la parte universalità da 4 a 12
giorni a seconda di quanto si vuole andare oltre l'Italia.

---

## 5. Fonti

- Emil Kowalski, `mobile-native` e README: https://github.com/emilkowalski/skills
- Vercel Web Interface Guidelines: https://github.com/vercel-labs/web-interface-guidelines e skill https://github.com/vercel-labs/agent-skills
- Impeccable: https://github.com/pbakaus/impeccable
- Anthropic `frontend-design`: https://github.com/anthropics/skills
- UI UX Pro Max: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- WCAG 2.2: zoom 1.4.4 https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html · contrasto 1.4.3 https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html · target 2.5.8 https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html · animazioni 2.3.3 https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html
- Apple HIG, accessibilità e target 44 pt: https://developer.apple.com/design/human-interface-guidelines/accessibility
- MDN `env()` e safe area: https://developer.mozilla.org/en-US/docs/Web/CSS/env · `inputmode`: https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/inputmode · `theme-color`: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meta/name/theme-color
- web.dev installazione e aggiornamento PWA: https://web.dev/learn/pwa/installation-prompt · https://web.dev/learn/pwa/update
- Documentazione Next 16 locale: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-viewport.md`

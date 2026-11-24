# Estrazione delle stringhe per l'inglese (brief per chi converte un'area)

Contesto: l'app è una PWA Next.js 16 (App Router) in italiano. Stiamo aggiungendo
l'inglese con `next-intl` SENZA prefissi di rotta: la lingua arriva da un cookie
(vedi `i18n/request.ts`, `i18n/config.ts`). L'onboarding è già convertito: usalo
come esempio (`app/onboarding/onboarding-form.tsx`, `app/onboarding/actions.ts`,
`app/onboarding/page.tsx`, `messages/it/onboarding.json`).
AGENTS.md avverte che questo Next.js ha differenze: se serve un'API, leggi
`node_modules/next/dist/docs/` prima di scrivere.

## Cosa fai
Per i file della tua area (elenco nel prompt) sposti ogni testo visibile
all'utente in `messages/it/<namespace>.json` e lo sostituisci con una chiamata
di traduzione. **L'italiano mostrato deve restare identico, carattere per
carattere.** Non cambiare comportamento, stile o struttura dei componenti.
NON scrivere `messages/en/*`: l'inglese lo traduce un altro passaggio dal tuo
file italiano.

## Come
- Componente client: `const t = useTranslations("<ns>");` (da `next-intl`).
- Componente server / server action / route: `const t = await getTranslations("<ns>");`
  (da `next-intl/server`). Le stringhe d'errore restituite dalle server action
  (`{ error: "..." }`) vanno tradotte con `getTranslations` dentro l'azione.
- Chiavi: oggetti annidati per schermata/sezione, camelCase, es.
  `home.today.title`. Nessuna chiave generica che raggruppi frasi diverse.
- Segnaposto: `{name}`. Plurali con ICU: `{count, plural, one {# corsa} other {# corse}}`.
  Mai concatenare pezzi di frase: una frase = una chiave. Per frasi con un
  link o un grassetto in mezzo usa `t.rich("chiave", { b: (c) => <b>{c}</b> })`
  con tag `<b>…</b>` nel messaggio.
- Costanti a livello di modulo con etichette (es. `const MODES = [{ label: "Chiaro" }]`)
  diventano elenchi di chiavi; la traduzione si fa dentro il componente.
- Attributi: `aria-label`, `placeholder`, `title`, `alt`, `confirm` e testi di
  toast/errore sono testi visibili: vanno tradotti.
- Parole di marca restano così: «Zitto e Corri», Intervals.icu, Zepp, Gemini,
  OpenRouter, Amazfit, Strava, FIT, GPX.
- Le unità (`km`, `min/km`, `bpm`) restano nel codice quando sono accanto a un
  numero formattato; se fanno parte di una frase, vanno nella frase.
- **Non toccare** la formattazione di date e numeri (`toLocaleDateString("it-IT")`,
  `formatPace` ecc.): è una fase successiva. Se in una frase compare una data o
  un numero già formattato, passalo come segnaposto.
- **Fuori ambito**: stringhe dentro `lib/**` (moduli puri come `lib/metrics`,
  `lib/plan`, `lib/ai`) e prompt dell'AI. Se un file della tua area ne usa, lasciale
  come sono e elencale nel report finale (file + riga + cosa).
- Commenti nel codice: restano in italiano, non vanno toccati.
- Copy italiano: frasi brevi, «sentence case». Non correggere il testo italiano
  esistente, nemmeno gli errori, salvo che sia necessario per i segnaposto.

## Vincoli di lavoro
- Modifica SOLO i file della tua area e il tuo `messages/it/<namespace>.json`
  (già creato come `{}`). Altri agenti lavorano in parallelo sugli altri file:
  non toccare `i18n/*`, `package.json`, `messages/en/*` né file di altre aree.
  Se ti serve una chiave in un file non tuo, scrivila nel report.
- Non avviare il server di sviluppo e non committare.
- Controlli: `npx eslint <i tuoi file>` e `npx tsc --noEmit` (ignora gli
  errori in file che non sono tuoi: altri stanno modificando in parallelo).
  `npm run test:core` può fallire solo per `tests/i18n.test.ts` finché l'inglese
  non è tradotto: è atteso.
- Prima di finire, controlla che non restino stringhe italiane letterali nei tuoi
  file: `grep -nE "[àèéìòù]" <file>` ed esamina il resto a mano (parole senza
  accento sfuggono al grep: rileggi i JSX).

## Report finale (breve)
1. File modificati e numero di chiavi create.
2. Stringhe lasciate fuori e perché (file:riga).
3. Dubbi: frasi costruite da pezzi che non hai potuto unire, o testi che
   arrivano dal database o da `lib/`.

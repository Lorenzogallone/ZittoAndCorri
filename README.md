# Zitto e Corri

PWA multiutente per pianificazione running, import FIT/GPX e coaching conversazionale con Gemini.

## Configurazione

1. Copia `.env.example` in `.env.local` e configura le tre variabili Supabase.
2. Applica in ordine le migrazioni nella cartella `supabase/migrations`; la `0008` abilita Vault, onboarding e coach conversazionale.
3. In Supabase Auth abilita Google come provider OAuth.
4. Avvia l'app con `npm run dev`.

La chiave Gemini non è una variabile dell'app: ogni utente la inserisce dalle impostazioni e viene conservata cifrata in Supabase Vault. La secret key Supabase è esclusivamente server-side.

### Zepp OS (opzionale)

1. Applica anche `supabase/migrations/0014_zepp_os.sql`.
2. Compila e installa il progetto separato seguendo
   [`zepp-app/README.md`](zepp-app/README.md).

Non servono variabili d'ambiente Zepp: la funzionalità è sempre disponibile nel
codice, ma ogni account parte con lo switch disattivato e usa integralmente il
calcolo interno. L'utente la abilita da **Impostazioni → Zepp OS** e, nella
Settings App di Zepp, inserisce soltanto URL pubblico e codice monouso. Il token
dedicato è creato e gestito automaticamente usando la configurazione server
Supabase già esistente. Spegnere lo switch revoca il token; FIT e GPX restano
manuali.

## Flussi principali

- `/` — riepilogo e chat con il coach; le modifiche al piano richiedono conferma.
- `/activities` — attività manuali o importate da FIT/GPX, con feedback automatico non bloccante.
- `/plan` — calendario mobile di 14 giorni.
- `/settings` — profilo, memoria del coach, chiavi e integrazioni.
- `/onboarding` — configurazione guidata del nuovo utente.

Gli endpoint `/api/import`, `/api/import/gpx` e `/api/import/file` accettano la sessione browser oppure `Authorization: Bearer <chiave import personale>` generata nelle impostazioni.

## Verifiche

```bash
npm run test:core
npm run typecheck
npm run lint
npm run build
```

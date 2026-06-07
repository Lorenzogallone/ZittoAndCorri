# ZittoAndCorri — Piano d'azione (handoff per Claude Code)

> App personale per tracciare le corse, valutarle con un coach AI, generare piani di
> allenamento e stimare i tempi di gara. Uso personale + pochi amici. Budget: **zero**.
> Questo documento è la specifica da seguire.
>
> **Repo:** https://github.com/Lorenzogallone/ZittoAndCorri — repo creato e progetto già inizializzato.

---

## 1. Cosa costruiamo (MVP → evoluzione)

- Inserimento corse **manuale** (form) e via **import JSON** (un endpoint REST).
- DB con il dettaglio corsa + uno **snapshot leggero** dell'atleta da allegare all'LLM.
- Coach AI (Gemini) che **valuta** ogni corsa e mantiene una **narrativa** (stato, fatica, morale).
- Obiettivo di gara + **piano** di allenamento, vista **calendario** e vista **lista/dettaglio**.
- **Stime di gara** e metriche di forma calcolate in codice (deterministiche).

Fuori scope per ora (predisporre ma non implementare): API Strava, Apple Health automatico, upload file GPX/FIT, push da iOS Shortcuts.

---

## 2. Principi architetturali (NON negoziabili)

1. **L'LLM non è mai fonte di verità dei numeri.** Volume, passi, zone, carico, predizioni →
   calcolati da funzioni pure in `lib/metrics`, sempre ricostruibili dalle corse. L'LLM può
   *leggere* i numeri, mai *produrli*. All'LLM resta solo testo qualitativo (valutazione, note, morale).
2. **Ingest unificato.** Qualsiasi sorgente (form manuale, JSON, in futuro file/Shortcut) viene
   normalizzata nello **stesso schema `ActivityInput`** prima di toccare il DB. Aggiungere una
   sorgente domani = scrivere un adapter, non toccare il data model.
3. **Stream pesanti separati dal resto.** La serie HR/GPS va in `activity_streams` (JSONB) e non
   entra MAI nel prompt: all'LLM va solo lo snapshot + ultime corse in forma compatta.
4. **Sicurezza dati di default.** RLS su Supabase: ogni utente vede solo le proprie righe.
5. **Costo zero.** Solo free tier (Vercel + Supabase + Gemini).

---

## 3. Stack tecnologico (pinnato)

| Layer | Scelta | Note |
|---|---|---|
| Framework FE+BE | **Next.js (App Router, TypeScript)** | un solo progetto, Server Components + Route Handlers |
| DB + Auth + Storage | **Supabase (Postgres)** | Auth Google, RLS, Storage per file futuri |
| Client Supabase | **`@supabase/ssr` + `@supabase/supabase-js`** | NON usare `@supabase/auth-helpers` (deprecato) |
| Hosting | **Vercel** | deploy automatico da GitHub |
| AI | **Google Gemini** (free tier), `@google/genai`, solo server-side | chiave mai nel client |
| UI kit | **shadcn/ui + Tailwind** | incluso nello starter |
| PWA | manifest + service worker | installabile su iPhone da "Aggiungi a Home" |

**Stato scaffolding:** repo e init del progetto Next.js già fatti dall'utente. Claude Code deve **verificare**
che il progetto usi App Router + TypeScript e che siano installati `@supabase/ssr` + `@supabase/supabase-js`
(con le utility `lib/supabase/{client,server}.ts` e il `middleware.ts` di refresh sessione). Se mancano,
allinearsi al pattern dello starter ufficiale `npx create-next-app -e with-supabase` (App Router, `@supabase/ssr`,
shadcn/ui) **senza** reinizializzare il repo.

---

## 4. Setup manuale (DA FARE PRIMA — non lo fa Claude Code)

Questi passaggi sono click nei dashboard: falli tu, poi passa le chiavi a Claude Code via `.env.local`.

### 4.1 GitHub
✅ Già fatto: repo `ZittoAndCorri` creato e progetto inizializzato. Verifica solo che il `remote origin`
punti a `https://github.com/Lorenzogallone/ZittoAndCorri` e che `.env.local` sia in `.gitignore`
(non committare mai le chiavi).

### 4.2 Supabase
1. supabase.com → **New project**. Scegli regione EU (Frankfurt), salva la **DB password**.
2. **Settings → API Keys**: copia la **Publishable key** (`sb_publishable_…`) per il client e la
   **Secret key** (`sb_secret_…`) per il server. (Se vedi solo le legacy: `anon` = client, `service_role` = server.)
3. **Settings → API**: copia il **Project URL**.
4. **SQL Editor**: incolla ed esegui lo schema della sezione 5 (tabelle + RLS + trigger).
5. **Authentication → Providers → Google**: abilitalo (richiede il client OAuth del passo 4.3).

### 4.3 Google OAuth (per il login)
1. Google Cloud Console → crea progetto → **APIs & Services → OAuth consent screen** (External, modalità Testing va bene; aggiungi gli amici come test users).
2. **Credentials → Create credentials → OAuth client ID → Web application**.
3. **Authorized redirect URI**: incolla il callback che Supabase ti mostra nella pagina del provider Google
   (`https://<project-ref>.supabase.co/auth/v1/callback`).
4. Copia **Client ID** e **Client secret** → incollali nel provider Google di Supabase (passo 4.2.5).

### 4.4 Google AI Studio (Gemini)
1. aistudio.google.com → **Get API key** → crea una API key (nessuna carta di credito richiesta). Salvala.
2. Modello di default per l'app: **`gemini-2.5-flash`** (buon ragionamento, 250 richieste/giorno sul free tier —
   abbondante per uso personale + amici, una chiamata per corsa). Fallback `gemini-2.5-flash-lite` (15 RPM / 1.000 RPD)
   se si toccano i limiti; `gemini-2.5-pro` (5 RPM / 100 RPD) solo per task pesanti come la generazione del piano.
3. ⚠️ **Privacy:** sul free tier Google può usare prompt e risposte per migliorare i propri modelli. I dati di corsa
   non sono ipersensibili, ma tienilo presente; se in futuro vuoi escluderlo, serve il tier a pagamento.

### 4.5 Vercel (dopo che il repo ha del codice)
1. vercel.com → **Add New → Project** → importa il repo GitHub.
2. **Environment Variables**: aggiungi tutte quelle della sezione 11.
3. Deploy. D'ora in poi ogni `git push` su `main` ridistribuisce in automatico.
4. Torna su Supabase **Authentication → URL Configuration** e aggiungi l'URL Vercel
   (`https://zittoecorri.vercel.app`) come Site URL + redirect, e in Google Cloud aggiungi lo stesso
   dominio tra i redirect autorizzati.

> Ordine pratico: 4.1–4.4 prima di far partire Claude Code; 4.5 quando esiste un primo commit deployabile (fine Fase 0).

---

## 5. Modello dati (SQL — eseguire nel SQL Editor di Supabase)

```sql
-- ============ PROFILES (estende auth.users con config atleta) ============
create table public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text,
  -- config per il calcolo zone/carico (valori di default modificabili dall'utente)
  max_hr       int,            -- es. 190
  resting_hr   int default 50,
  birthdate    date,
  created_at   timestamptz default now()
);

-- crea automaticamente il profilo al signup
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end; $$;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- ============ GOALS (obiettivo di gara) ============
create table public.goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  race_name     text not null,
  race_date     date,
  distance_m    int not null,         -- es. 21097
  target_time_s int,                  -- tempo obiettivo in secondi
  is_active     boolean default true,
  created_at    timestamptz default now()
);

-- ============ PLANNED_WORKOUTS (il piano) ============
create type workout_type as enum ('easy','tempo','interval','long','race','recovery','cross');
create type planned_status as enum ('planned','completed','missed','skipped');

create table public.planned_workouts (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users on delete cascade,
  goal_id            uuid references public.goals on delete set null,
  date               date not null,
  type               workout_type not null,
  target_distance_m  int,
  target_pace_s_km   int,             -- passo target s/km
  target_duration_s  int,
  description        text,
  status             planned_status default 'planned',
  activity_id        uuid,            -- collega alla corsa reale che lo soddisfa (FK sotto)
  created_at         timestamptz default now()
);

-- ============ ACTIVITIES (la corsa, dettaglio leggero) ============
create type activity_source as enum ('manual','json_import','file','strava','healthkit');

create table public.activities (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users on delete cascade,
  source           activity_source not null default 'manual',
  type             workout_type not null default 'easy',
  started_at       timestamptz not null,
  distance_m       int not null,
  duration_s       int not null,           -- tempo totale
  moving_time_s    int,
  avg_pace_s_km    int,                    -- DERIVATO in ingest
  avg_hr           int,
  max_hr           int,
  elevation_gain_m int,
  rpe              int check (rpe between 1 and 10),  -- sforzo percepito (chiave per il carico)
  calories         int,
  time_in_zone     jsonb,                  -- {"z1":120,"z2":900,...} secondi — DERIVATO
  splits           jsonb,                  -- [{"km":1,"time_s":340,"avg_hr":150}, ...] DERIVATO
  notes            text,
  raw_payload      jsonb,                  -- payload originale, per audit/riprocessing
  created_at       timestamptz default now()
);

alter table public.planned_workouts
  add constraint fk_planned_activity
  foreign key (activity_id) references public.activities on delete set null;

-- ============ ACTIVITY_STREAMS (pesante, mai nel prompt) ============
create table public.activity_streams (
  activity_id uuid primary key references public.activities on delete cascade,
  hr_series   jsonb,   -- [{"t":0,"bpm":120}, ...]
  gps_series  jsonb,   -- [{"t":0,"lat":..,"lon":..,"ele":..}, ...]
  cadence     jsonb
);

-- ============ EVALUATIONS (output AI per singola corsa) ============
create table public.evaluations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  activity_id uuid not null references public.activities on delete cascade,
  model       text,
  summary     text,        -- valutazione discorsiva della corsa
  flags       jsonb,       -- es. {"overreaching":true,"good_progress":true}
  created_at  timestamptz default now()
);

-- ============ ATHLETE_SNAPSHOT (il digest per l'LLM, 1 riga per utente) ============
create table public.athlete_snapshot (
  user_id       uuid primary key references auth.users on delete cascade,
  metrics       jsonb,   -- BLOCCO 1: numeri deterministici (vol, passi, vdot, predizioni, carico)
  goal_summary  jsonb,   -- BLOCCO 2: obiettivo + settimane rimaste
  adherence     jsonb,   -- BLOCCO 2: aderenza al piano ultimi 14gg
  narrative     jsonb,   -- BLOCCO 3: {state, fatigue, morale, notes, coach_notes} — l'unico mantenuto dall'LLM
  updated_at    timestamptz default now()
);

-- ============ RLS: ogni utente vede solo le proprie righe ============
alter table public.profiles          enable row level security;
alter table public.goals             enable row level security;
alter table public.planned_workouts  enable row level security;
alter table public.activities        enable row level security;
alter table public.activity_streams  enable row level security;
alter table public.evaluations       enable row level security;
alter table public.athlete_snapshot  enable row level security;

create policy "own profile"   on public.profiles          for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "own goals"     on public.goals             for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own planned"   on public.planned_workouts  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own acts"      on public.activities        for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own eval"      on public.evaluations       for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own snap"      on public.athlete_snapshot  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- streams: accesso via join con activities di proprietà
create policy "own streams"   on public.activity_streams  for all using (
  exists (select 1 from public.activities a where a.id = activity_id and a.user_id = auth.uid())
);
```

---

## 6. Ingest unificato

Tutto entra dallo stesso tipo. Validare con **Zod**.

```ts
// lib/ingest/schema.ts
export const ActivityInput = z.object({
  source: z.enum(['manual','json_import','file','strava','healthkit']),
  type: z.enum(['easy','tempo','interval','long','race','recovery','cross']).default('easy'),
  started_at: z.string().datetime(),
  distance_m: z.number().int().positive(),
  duration_s: z.number().int().positive(),
  moving_time_s: z.number().int().optional(),
  avg_hr: z.number().int().optional(),
  max_hr: z.number().int().optional(),
  elevation_gain_m: z.number().int().optional(),
  rpe: z.number().int().min(1).max(10).optional(),
  notes: z.string().optional(),
  // stream opzionali (solo da import ricchi; il form manuale non li ha)
  hr_series: z.array(z.object({ t: z.number(), bpm: z.number() })).optional(),
  gps_series: z.array(z.object({ t: z.number(), lat: z.number(), lon: z.number(), ele: z.number().optional() })).optional(),
});
```

Pipeline `ingestActivity(input)`:
1. valida con Zod;
2. calcola i campi derivati (`avg_pace_s_km`, `splits` se c'è gps, `time_in_zone` se c'è `hr_series` + zone del profilo);
3. insert in `activities` (+ `activity_streams` se presenti stream), salva l'originale in `raw_payload`;
4. ricalcola lo snapshot (sezione 8) e lancia la valutazione AI.

**Sorgenti che usano questo ingest:**
- **Form manuale** → `/activities/new`: campi date, type, distance, duration, avg/max HR (opz.), RPE, elevation, notes → costruisce un `ActivityInput` con `source:'manual'`. (Senza stream: niente split GPS, ma pace medio e zone-da-media restano calcolabili.)
- **Import JSON** → `/import` (upload/incolla testo) **e** endpoint REST `POST /api/import` per uso programmatico futuro. Stesso `ActivityInput` (o un array).

**Auth dell'endpoint REST** (`/api/import`): accetta o la sessione utente (cookie) o un header
`Authorization: Bearer <INGEST_TOKEN>` (token statico per utente, per i futuri Shortcut). Validare il token
contro una colonna/segreto prima di scrivere.

---

## 7. Layer di calcolo (`lib/metrics`) — funzioni pure + unit test

Tutto deterministico, testabile, indipendente dall'AI.

- **`avgPace(distance_m, duration_s)`** → `s/km = duration_s / (distance_m/1000)`.
- **`splits(gps_series)`** → accumula 1000 m, registra tempo/HR per km. Se manca il GPS → `null`.
- **`hrZones(profile)`** → 5 zone con metodo HRR (Karvonen): `soglia_i = resting + pct_i*(max_hr - resting)`.
  Default pct: Z1 <0.6, Z2 0.6–0.7, Z3 0.7–0.8, Z4 0.8–0.9, Z5 >0.9. `timeInZone(hr_series, zones)` somma i secondi per zona.
- **Carico — usa sRPE (Foster), funziona anche senza HR:** `session_load = duration_min * RPE`.
  Se manca RPE, stima un RPE dal rapporto passo/zona. Poi:
  - `ATL` (fatica acuta) = media mobile esponenziale del load su 7 giorni;
  - `CTL` (fitness cronica) = EWMA su 42 giorni;
  - `TSB` (freshness) = `CTL - ATL` (positivo = fresco, negativo = affaticato).
- **Predizione gara — Riegel:** `T2 = T1 * (D2/D1)^1.06`, dove `T1/D1` è la miglior prestazione recente
  (ultime ~6 settimane). Produci stime per 5k/10k/half/target gara.
- **`vdot()` (opzionale, raffinamento):** tabelle di Daniels per passi-allenamento per zona; in MVP basta Riegel.

> Convenzione: queste funzioni leggono `activities`/`profiles` e **scrivono solo** il blocco `metrics`
> dello snapshot. Mai chiamate dall'LLM.

---

## 8. Snapshot + pipeline AI

**Ricalcolo snapshot** (`recomputeSnapshot(userId)`), chiamato dopo ogni ingest:
1. `metrics` (BLOCCO 1) ← `lib/metrics` su finestra recente: volume/sett + trend, passi medi per tipo,
   predizioni Riegel, ATL/CTL/TSB. **Deterministico.**
2. `goal_summary` + `adherence` (BLOCCO 2) ← denormalizza `goals` e confronta `planned_workouts` vs `activities`
   ultimi 14 gg (fatte/saltate). **Deterministico.**
3. `narrative` (BLOCCO 3) ← **una sola chiamata LLM** (sezione sotto) che valuta la corsa e aggiorna stato/fatica/morale/note.
4. persiste lo snapshot (`updated_at = now()`).

**Chiamata LLM** (`/app/api/ai/route.ts`, server-only, chiave Gemini da env, SDK `@google/genai`):
- Modello `gemini-2.5-flash`. Input prompt = snapshot serializzato in **markdown compatto** (~400–600 token)
  + ultime ~7 corse, una riga ciascuna.
- Usa l'**output strutturato nativo** di Gemini (`responseMimeType: "application/json"` + `responseSchema`)
  invece di chiedere il JSON nel prompt: garantisce la forma
  `{ evaluation_summary, flags, narrative_update: {state, fatigue, morale, notes, coach_notes} }`.
- Scrive `evaluations` (la valutazione) e aggiorna `narrative` nello snapshot. **Una chiamata per corsa.**
- Aggiungi **retry con backoff esponenziale** sui 429 (i limiti free tier sono per minuto/giorno).

```ts
// lib/ai/gemini.ts (schema indicativo)
import { GoogleGenAI, Type } from '@google/genai';
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

const res = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: prompt,                       // markdown snapshot + ultime corse
  config: {
    responseMimeType: 'application/json',
    responseSchema: {                     // forza la struttura dell'output
      type: Type.OBJECT,
      properties: {
        evaluation_summary: { type: Type.STRING },
        flags: { type: Type.OBJECT },
        narrative_update: {
          type: Type.OBJECT,
          properties: {
            state: { type: Type.STRING }, fatigue: { type: Type.STRING },
            morale: { type: Type.STRING }, notes: { type: Type.STRING },
            coach_notes: { type: Type.STRING },
          },
        },
      },
    },
  },
});
const out = JSON.parse(res.text);
```

Esempio di serializzazione da allegare al prompt:
```
## Atleta — agg. 07/06
Obiettivo: Mezza, 12/10/2026 (18 sett). Target 1:45:00.
Forma: VDOT ~48. Predizioni: 5k 22:10 · 10k 46:00 · half 1:42.
Carico: ATL 320 / CTL 290 → TSB -30 (lieve fatica). Volume 38 km/sett (↑).
Passi: easy 5:40 · tempo 4:45 · lungo 6:00.
Aderenza (14gg): 5/6 fatte, saltato 1 lungo.
Stato: motivato; fastidio lieve polpaccio dx da 3 gg.
Ultime corse:
- 05/06 Easy 8km 5:38 HR142 RPE4 "gambe ok"
- 03/06 Tempo 6km 4:42 HR165 RPE7 "fatica finale"
...
```

> Per la **generazione del piano** (feature successiva): stessa logica — l'LLM propone struttura
> settimanale, ma passi/volumi target li valida/clampa `lib/metrics` prima di salvarli in `planned_workouts`.

---

## 9. Struttura dell'app (route App Router)

```
app/
├── (auth)/login/page.tsx        # Google sign-in
├── page.tsx                     # Dashboard: forma, predizioni, prossimi allenamenti
├── activities/
│   ├── page.tsx                 # Lista corse
│   ├── new/page.tsx             # FORM inserimento manuale
│   └── [id]/page.tsx            # Dettaglio + valutazione AI + split/zone
├── import/page.tsx              # Import JSON (incolla/upload)
├── plan/page.tsx                # Vista CALENDARIO allenamenti previsti
├── goals/page.tsx               # Gestione obiettivi
└── api/
    ├── import/route.ts          # POST ingest (sessione o Bearer token)
    └── ai/route.ts              # proxy Gemini (server-only)

lib/
├── supabase/{client.ts,server.ts}   # @supabase/ssr
├── ingest/{schema.ts,ingest.ts}
├── metrics/{pace.ts,zones.ts,load.ts,predict.ts}
└── ai/{prompt.ts,gemini.ts}         # @google/genai
proxy.ts                         # refresh sessione Supabase (Next.js 16: Middleware → Proxy)
```

---

## 10. Fasi di build (milestone per Claude Code)

**Fase 0 — Verifica scaffolding + deploy end-to-end.** Repo e init già pronti: verifica App Router + TS +
`@supabase/ssr` (allinea allo starter `with-supabase` se manca qualcosa, senza reinizializzare). Configura env,
login Google funzionante, una pagina protetta. Deploy su Vercel. Obiettivo: il giro FE→Vercel→Supabase gira.

**Fase 1 — Dati + inserimento manuale.** Schema SQL applicato. Form `/activities/new`, lista e dettaglio.
Ingest unificato con `source:'manual'`. Calcolo `avg_pace_s_km` e zone-da-media.

**Fase 2 — Import JSON + calcolo completo.** `/import` + `POST /api/import` (con Bearer token). `lib/metrics`
completo (split, time-in-zone, sRPE/ATL/CTL/TSB, Riegel) con unit test.

**Fase 3 — Obiettivi + piano + calendario.** CRUD `goals`, `planned_workouts`, vista `/plan` calendario,
calcolo aderenza, link piano↔corsa.

**Fase 4 — Coach AI.** Proxy Gemini (`@google/genai`, output strutturato), `recomputeSnapshot`, valutazione
per corsa, narrativa aggiornata, visualizzazione in dettaglio + dashboard.

**Fase 5 — Predizioni + PWA.** Dashboard predizioni gara, manifest + service worker, installabilità iPhone, rifiniture.

---

## 11. Variabili d'ambiente (`.env.local` e Vercel)

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...     # (o anon key in transizione)
SUPABASE_SECRET_KEY=sb_secret_...                          # SOLO server (o service_role)
GEMINI_API_KEY=...                                        # Google AI Studio
INGEST_TOKEN=<stringa random lunga>                       # auth endpoint /api/import
```

> Le `NEXT_PUBLIC_*` sono esposte al client (ok, sono chiavi pubbliche). `SUPABASE_SECRET_KEY`,
> `GEMINI_API_KEY` e `INGEST_TOKEN` NON devono mai finire in codice client/Client Components.

---

## 12. Predisposizione futura (non implementare ora)

- **Upload file GPX/TCX/FIT** → adapter che produce `ActivityInput` (FIT/TCX = ricchi di stream; GPX = GPS).
- **iOS Shortcut** → POST su `/api/import` con `Authorization: Bearer INGEST_TOKEN`.
- **Apple Health** → import dell'export totale (XML + GPX) come backfill storico.
- **Strava API** → adapter `source:'strava'` + webhook, da attivare solo se in futuro accetti l'abbonamento
  Strava a pagamento e la sua zona grigia sull'uso AI.

Tutte queste sorgenti riusano ingest, metriche e snapshot **senza modifiche al data model**.
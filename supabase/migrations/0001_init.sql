-- ZittoAndCorri — Fase 1 schema (PLAN.md §5)
-- Da eseguire nel SQL Editor di Supabase. Idempotente dove possibile.

-- ============ PROFILES (estende auth.users con config atleta) ============
create table if not exists public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text,
  -- config per il calcolo zone/carico (valori di default modificabili dall'utente)
  max_hr       int,            -- es. 190
  resting_hr   int default 50,
  birthdate    date,
  created_at   timestamptz default now()
);

-- crea automaticamente il profilo al signup
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- ============ GOALS (obiettivo di gara) ============
create table if not exists public.goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  race_name     text not null,
  race_date     date,
  distance_m    int not null,         -- es. 21097
  target_time_s int,                  -- tempo obiettivo in secondi
  is_active     boolean default true,
  created_at    timestamptz default now()
);

-- ============ ENUM types ============
do $$ begin
  create type workout_type as enum ('easy','tempo','interval','long','race','recovery','cross');
exception when duplicate_object then null; end $$;

do $$ begin
  create type planned_status as enum ('planned','completed','missed','skipped');
exception when duplicate_object then null; end $$;

do $$ begin
  create type activity_source as enum ('manual','json_import','file','strava','healthkit');
exception when duplicate_object then null; end $$;

-- ============ PLANNED_WORKOUTS (il piano) ============
create table if not exists public.planned_workouts (
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
create table if not exists public.activities (
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

do $$ begin
  alter table public.planned_workouts
    add constraint fk_planned_activity
    foreign key (activity_id) references public.activities on delete set null;
exception when duplicate_object then null; end $$;

-- ============ ACTIVITY_STREAMS (pesante, mai nel prompt) ============
create table if not exists public.activity_streams (
  activity_id uuid primary key references public.activities on delete cascade,
  hr_series   jsonb,   -- [{"t":0,"bpm":120}, ...]
  gps_series  jsonb,   -- [{"t":0,"lat":..,"lon":..,"ele":..}, ...]
  cadence     jsonb
);

-- ============ EVALUATIONS (output AI per singola corsa) ============
create table if not exists public.evaluations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  activity_id uuid not null references public.activities on delete cascade,
  model       text,
  summary     text,        -- valutazione discorsiva della corsa
  flags       jsonb,       -- es. {"overreaching":true,"good_progress":true}
  created_at  timestamptz default now()
);

-- ============ ATHLETE_SNAPSHOT (il digest per l'LLM, 1 riga per utente) ============
create table if not exists public.athlete_snapshot (
  user_id       uuid primary key references auth.users on delete cascade,
  metrics       jsonb,   -- BLOCCO 1: numeri deterministici (vol, passi, vdot, predizioni, carico)
  goal_summary  jsonb,   -- BLOCCO 2: obiettivo + settimane rimaste
  adherence     jsonb,   -- BLOCCO 2: aderenza al piano ultimi 14gg
  narrative     jsonb,   -- BLOCCO 3: {state, fatigue, morale, notes, coach_notes}
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

drop policy if exists "own profile" on public.profiles;
create policy "own profile"   on public.profiles          for all using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "own goals" on public.goals;
create policy "own goals"     on public.goals             for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own planned" on public.planned_workouts;
create policy "own planned"   on public.planned_workouts  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own acts" on public.activities;
create policy "own acts"      on public.activities        for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own eval" on public.evaluations;
create policy "own eval"      on public.evaluations       for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own snap" on public.athlete_snapshot;
create policy "own snap"      on public.athlete_snapshot  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- streams: accesso via join con activities di proprietà
drop policy if exists "own streams" on public.activity_streams;
create policy "own streams"   on public.activity_streams  for all using (
  exists (select 1 from public.activities a where a.id = activity_id and a.user_id = auth.uid())
);

-- ZittoAndCorri — Phase 1 schema (PLAN.md §5)
-- Run in the Supabase SQL Editor. Idempotent where possible.

-- ============ PROFILES (extends auth.users with athlete config) ============
create table if not exists public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text,
  -- config for zone/load calculation (defaults the user can change)
  max_hr       int,            -- e.g. 190
  resting_hr   int default 50,
  birthdate    date,
  created_at   timestamptz default now()
);

-- automatically creates the profile on signup
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

-- ============ GOALS (race goal) ============
create table if not exists public.goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade,
  race_name     text not null,
  race_date     date,
  distance_m    int not null,         -- e.g. 21097
  target_time_s int,                  -- goal time in seconds
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

-- ============ PLANNED_WORKOUTS (the plan) ============
create table if not exists public.planned_workouts (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users on delete cascade,
  goal_id            uuid references public.goals on delete set null,
  date               date not null,
  type               workout_type not null,
  target_distance_m  int,
  target_pace_s_km   int,             -- target pace s/km
  target_duration_s  int,
  description        text,
  status             planned_status default 'planned',
  activity_id        uuid,            -- links to the actual run that fulfils it (FK below)
  created_at         timestamptz default now()
);

-- ============ ACTIVITIES (the run, light detail) ============
create table if not exists public.activities (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users on delete cascade,
  source           activity_source not null default 'manual',
  type             workout_type not null default 'easy',
  started_at       timestamptz not null,
  distance_m       int not null,
  duration_s       int not null,           -- total time
  moving_time_s    int,
  avg_pace_s_km    int,                    -- DERIVED at ingest
  avg_hr           int,
  max_hr           int,
  elevation_gain_m int,
  rpe              int check (rpe between 1 and 10),  -- perceived effort (key for load)
  calories         int,
  time_in_zone     jsonb,                  -- {"z1":120,"z2":900,...} seconds — DERIVED
  splits           jsonb,                  -- [{"km":1,"time_s":340,"avg_hr":150}, ...] DERIVED
  notes            text,
  raw_payload      jsonb,                  -- original payload, for audit/reprocessing
  created_at       timestamptz default now()
);

do $$ begin
  alter table public.planned_workouts
    add constraint fk_planned_activity
    foreign key (activity_id) references public.activities on delete set null;
exception when duplicate_object then null; end $$;

-- ============ ACTIVITY_STREAMS (heavy, never in the prompt) ============
create table if not exists public.activity_streams (
  activity_id uuid primary key references public.activities on delete cascade,
  hr_series   jsonb,   -- [{"t":0,"bpm":120}, ...]
  gps_series  jsonb,   -- [{"t":0,"lat":..,"lon":..,"ele":..}, ...]
  cadence     jsonb
);

-- ============ EVALUATIONS (AI output per run) ============
create table if not exists public.evaluations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  activity_id uuid not null references public.activities on delete cascade,
  model       text,
  summary     text,        -- narrative evaluation of the run
  flags       jsonb,       -- e.g. {"overreaching":true,"good_progress":true}
  created_at  timestamptz default now()
);

-- ============ ATHLETE_SNAPSHOT (the LLM digest, 1 row per user) ============
create table if not exists public.athlete_snapshot (
  user_id       uuid primary key references auth.users on delete cascade,
  metrics       jsonb,   -- BLOCK 1: deterministic numbers (vol, paces, vdot, predictions, load)
  goal_summary  jsonb,   -- BLOCK 2: goal + weeks left
  adherence     jsonb,   -- BLOCK 2: plan adherence over the last 14 days
  narrative     jsonb,   -- BLOCK 3: {state, fatigue, morale, notes, coach_notes}
  updated_at    timestamptz default now()
);

-- ============ RLS: each user sees only their own rows ============
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
-- streams: access via join with owned activities
drop policy if exists "own streams" on public.activity_streams;
create policy "own streams"   on public.activity_streams  for all using (
  exists (select 1 from public.activities a where a.id = activity_id and a.user_id = auth.uid())
);

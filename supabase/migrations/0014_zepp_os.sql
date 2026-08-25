-- Integrazione opzionale Zepp OS: pairing, connessione, audit degli invii e
-- riepiloghi giornalieri. Le attività restano intenzionalmente indipendenti.

create table if not exists public.zepp_pairing_codes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  code_hash   text not null unique,
  attempts    int not null default 0 check (attempts between 0 and 5),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists public.zepp_connections (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null unique references auth.users on delete cascade,
  token_hash            text unique,
  enabled               boolean not null default false,
  auto_sync             boolean not null default true,
  device_name           text,
  device_source         bigint,
  os_version            text,
  firmware_version      text,
  api_level             text,
  app_version           text,
  paired_at             timestamptz,
  last_sync_at          timestamptz,
  last_error            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table if not exists public.zepp_sync_events (
  id                    uuid primary key default gen_random_uuid(),
  connection_id         uuid not null references public.zepp_connections on delete cascade,
  user_id               uuid not null references auth.users on delete cascade,
  client_sync_id        text not null,
  schema_version        int not null default 1,
  trigger               text not null check (trigger in ('morning','evening','manual','retry')),
  captured_at           timestamptz not null,
  local_date            date not null,
  timezone_offset_min   int not null check (timezone_offset_min between -840 and 840),
  raw_payload           jsonb not null,
  created_at            timestamptz not null default now(),
  unique (connection_id, client_sync_id)
);

create index if not exists zepp_sync_events_user_captured_idx
  on public.zepp_sync_events (user_id, captured_at desc);

create table if not exists public.zepp_daily_metrics (
  user_id                uuid not null references auth.users on delete cascade,
  connection_id          uuid not null references public.zepp_connections on delete cascade,
  date                   date not null,
  captured_at            timestamptz not null,
  training_load          numeric,
  vo2_max                numeric,
  recovery_raw           numeric,
  sleep_score            numeric,
  sleep_total_min        int,
  sleep_deep_min         int,
  sleep_stages           jsonb,
  naps                    jsonb,
  resting_hr             int,
  max_hr                 int,
  hr_series               jsonb,
  stress_avg             numeric,
  stress_hourly          jsonb,
  stress_last_week        jsonb,
  spo2_avg               numeric,
  spo2_min               numeric,
  spo2_samples           jsonb,
  skin_temp_avg_c         numeric,
  skin_temp_min_c         numeric,
  skin_temp_max_c         numeric,
  skin_temp_samples       jsonb,
  pai_total               numeric,
  pai_today               numeric,
  pai_last_week           jsonb,
  steps                   int,
  calories                int,
  stand_hours             int,
  hr_zone_type            int,
  hr_zone_rest            int,
  hr_zone_ranges          jsonb,
  device_profile          jsonb,
  completeness            jsonb not null default '{}'::jsonb,
  updated_at              timestamptz not null default now(),
  primary key (user_id, date)
);

create index if not exists zepp_daily_metrics_user_date_idx
  on public.zepp_daily_metrics (user_id, date desc);

alter table public.zepp_pairing_codes enable row level security;
alter table public.zepp_connections enable row level security;
alter table public.zepp_sync_events enable row level security;
alter table public.zepp_daily_metrics enable row level security;

drop policy if exists "own zepp pairing" on public.zepp_pairing_codes;
create policy "own zepp pairing" on public.zepp_pairing_codes
  for select using (auth.uid() = user_id);

drop policy if exists "own zepp connection" on public.zepp_connections;
create policy "own zepp connection" on public.zepp_connections
  for select using (auth.uid() = user_id);

drop policy if exists "own zepp events" on public.zepp_sync_events;
create policy "own zepp events" on public.zepp_sync_events
  for select using (auth.uid() = user_id);

drop policy if exists "own zepp metrics" on public.zepp_daily_metrics;
create policy "own zepp metrics" on public.zepp_daily_metrics
  for select using (auth.uid() = user_id);

comment on table public.zepp_sync_events is
  'Payload Zepp originali per audit e riprocessamento; non crea attività.';
comment on column public.zepp_daily_metrics.recovery_raw is
  'Valore fullRecoveryTime non convertito finché l''unità non è validata sul dispositivo reale.';

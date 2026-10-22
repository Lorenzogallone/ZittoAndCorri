-- Intervals.icu: canale ufficiale Zepp → Intervals.icu → ZittoAndCorri.
-- 1. Chiave API personale (cifrata in Vault come Gemini e OpenRouter) con le
--    preferenze dell'integrazione e lo stato dell'ultima sincronizzazione.
-- 2. Wellness giornaliero generico (sonno, FC a riposo, HRV, SpO2, passi) con
--    sorgente esplicita: le metriche proprietarie Zepp restano in
--    zepp_daily_metrics.
-- 3. Identificativo esterno sulle attività per importare i FIT senza duplicati.

-- ── 1. Credenziali e preferenze ───────────────────────────────────────────────

create table if not exists public.user_intervals_credentials (
  user_id           uuid primary key references auth.users on delete cascade,
  vault_secret_id   uuid not null,
  last_four         text not null check (char_length(last_four) = 4),
  -- Id atleta Intervals.icu, es. "i12345". Verificato al salvataggio.
  athlete_id        text not null,
  athlete_name      text,
  import_activities boolean not null default true,
  import_wellness   boolean not null default true,
  publish_plan      boolean not null default true,
  -- Target da scrivere nelle fasi: "auto" (passo dove c'è, altrimenti FC),
  -- "pace" o "hr". Utile se l'orologio perde i target di passo.
  target_preference text not null default 'auto'
    check (target_preference in ('auto', 'pace', 'hr')),
  last_import_at    timestamptz,
  last_publish_at   timestamptz,
  last_error        text,
  verified_at       timestamptz not null,
  updated_at        timestamptz not null default now()
);

alter table public.user_intervals_credentials enable row level security;
drop policy if exists "own intervals credential metadata" on public.user_intervals_credentials;
create policy "own intervals credential metadata" on public.user_intervals_credentials
  for select using (auth.uid() = user_id);

create or replace function public.admin_set_intervals_credential(
  p_user_id uuid,
  p_secret text,
  p_last_four text,
  p_athlete_id text,
  p_athlete_name text
) returns void
language plpgsql security definer set search_path = public, vault as $$
declare
  v_secret_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'not authorized';
  end if;
  if p_secret is null or char_length(trim(p_secret)) < 8 then
    raise exception 'invalid secret';
  end if;

  select vault_secret_id into v_secret_id
  from public.user_intervals_credentials where user_id = p_user_id;

  if v_secret_id is null then
    select vault.create_secret(
      p_secret,
      'intervals:' || p_user_id::text,
      'Intervals.icu API key personale di ZittoAndCorri'
    ) into v_secret_id;
  else
    perform vault.update_secret(v_secret_id, p_secret);
  end if;

  insert into public.user_intervals_credentials (
    user_id, vault_secret_id, last_four, athlete_id, athlete_name, verified_at, updated_at
  ) values (
    p_user_id, v_secret_id, p_last_four, p_athlete_id, p_athlete_name, now(), now()
  )
  on conflict (user_id) do update set
    vault_secret_id = excluded.vault_secret_id,
    last_four = excluded.last_four,
    athlete_id = excluded.athlete_id,
    athlete_name = excluded.athlete_name,
    last_error = null,
    verified_at = excluded.verified_at,
    updated_at = excluded.updated_at;
end; $$;

create or replace function public.admin_get_intervals_credential(p_user_id uuid)
returns text
language plpgsql security definer set search_path = public, vault as $$
declare
  v_secret text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'not authorized';
  end if;
  select v.decrypted_secret into v_secret
  from public.user_intervals_credentials c
  join vault.decrypted_secrets v on v.id = c.vault_secret_id
  where c.user_id = p_user_id;
  return v_secret;
end; $$;

create or replace function public.admin_delete_intervals_credential(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public, vault as $$
declare
  v_secret_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'not authorized';
  end if;
  delete from public.user_intervals_credentials
  where user_id = p_user_id
  returning vault_secret_id into v_secret_id;
  if v_secret_id is not null then
    delete from vault.secrets where id = v_secret_id;
  end if;
end; $$;

revoke all on function public.admin_set_intervals_credential(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.admin_get_intervals_credential(uuid) from public, anon, authenticated;
revoke all on function public.admin_delete_intervals_credential(uuid) from public, anon, authenticated;
grant execute on function public.admin_set_intervals_credential(uuid, text, text, text, text) to service_role;
grant execute on function public.admin_get_intervals_credential(uuid) to service_role;
grant execute on function public.admin_delete_intervals_credential(uuid) to service_role;

-- ── 2. Wellness giornaliero per sorgente ─────────────────────────────────────

create table if not exists public.wellness_daily (
  user_id      uuid not null references auth.users on delete cascade,
  date         date not null,
  source       text not null check (source in ('intervals', 'zepp', 'manual')),
  captured_at  timestamptz not null default now(),
  sleep_secs   int,
  sleep_score  numeric,
  resting_hr   int,
  hrv          numeric,
  hrv_sdnn     numeric,
  spo2         numeric,
  steps        int,
  stress       numeric,
  readiness    numeric,
  vo2max       numeric,
  weight_kg    numeric,
  raw          jsonb,
  updated_at   timestamptz not null default now(),
  primary key (user_id, date, source)
);

create index if not exists wellness_daily_user_date_idx
  on public.wellness_daily (user_id, date desc);

alter table public.wellness_daily enable row level security;
drop policy if exists "own wellness" on public.wellness_daily;
create policy "own wellness" on public.wellness_daily
  for select using (auth.uid() = user_id);

comment on table public.wellness_daily is
  'Sonno, FC a riposo, HRV e simili per giorno e sorgente. Le metriche proprietarie Zepp restano in zepp_daily_metrics.';

-- ── 3. Attività importate da Intervals.icu ───────────────────────────────────

alter table public.activities
  add column if not exists external_id text;

create unique index if not exists activities_user_external_id_key
  on public.activities (user_id, external_id)
  where external_id is not null;

-- Nuova sorgente. L'enum si estende fuori dalla transazione che lo usa: dopo
-- questa migrazione il valore è disponibile alle prossime istruzioni.
alter type public.activity_source add value if not exists 'intervals';

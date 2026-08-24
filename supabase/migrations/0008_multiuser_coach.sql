-- ZittoAndCorri — coach conversazionale multiutente + credenziali AI personali.
-- Conserva i dati sportivi esistenti, ma sostituisce i vecchi contratti AI.

create extension if not exists supabase_vault with schema vault;

alter table public.profiles
  add column if not exists onboarding_completed_at timestamptz;

-- Gli utenti esistenti non devono ripetere l'onboarding. Per i nuovi utenti i
-- valori fisiologici restano null finché non vengono forniti esplicitamente.
update public.profiles
set onboarding_completed_at = coalesce(onboarding_completed_at, now());

alter table public.profiles alter column resting_hr drop default;

alter table public.activities
  add column if not exists source_title text,
  add column if not exists rpe_source text;

alter table public.activities
  drop constraint if exists activities_rpe_source_check;
alter table public.activities
  add constraint activities_rpe_source_check
  check (rpe_source is null or rpe_source in ('fit', 'user', 'api'));

alter table public.planned_workouts
  add column if not exists updated_at timestamptz default now(),
  add column if not exists origin text;

update public.planned_workouts set origin = 'user' where origin is null;
alter table public.planned_workouts alter column origin set default 'user';
alter table public.planned_workouts alter column origin set not null;

alter table public.planned_workouts
  drop constraint if exists planned_workouts_origin_check;
alter table public.planned_workouts
  add constraint planned_workouts_origin_check
  check (origin is null or origin in ('user', 'ai'));

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists planned_workouts_touch_updated_at on public.planned_workouts;
create trigger planned_workouts_touch_updated_at
  before update on public.planned_workouts
  for each row execute function public.touch_updated_at();

-- Metadati visibili all'utente; il segreto vero vive cifrato in Vault.
create table if not exists public.user_ai_credentials (
  user_id         uuid primary key references auth.users on delete cascade,
  provider        text not null default 'gemini' check (provider = 'gemini'),
  vault_secret_id uuid not null,
  last_four       text not null check (char_length(last_four) = 4),
  verified_at     timestamptz not null,
  updated_at      timestamptz not null default now()
);

alter table public.user_ai_credentials enable row level security;
drop policy if exists "own ai credential metadata" on public.user_ai_credentials;
create policy "own ai credential metadata" on public.user_ai_credentials
  for select using (auth.uid() = user_id);

-- Queste funzioni sono invocabili esclusivamente dal backend con secret key.
create or replace function public.admin_set_gemini_credential(
  p_user_id uuid,
  p_secret text,
  p_last_four text
) returns void
language plpgsql security definer set search_path = public, vault as $$
declare
  v_secret_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'not authorized';
  end if;
  if p_secret is null or char_length(trim(p_secret)) < 16 then
    raise exception 'invalid secret';
  end if;

  select vault_secret_id into v_secret_id
  from public.user_ai_credentials where user_id = p_user_id;

  if v_secret_id is null then
    select vault.create_secret(
      p_secret,
      'gemini:' || p_user_id::text,
      'Gemini API key personale di ZittoAndCorri'
    ) into v_secret_id;
  else
    perform vault.update_secret(v_secret_id, p_secret);
  end if;

  insert into public.user_ai_credentials (
    user_id, provider, vault_secret_id, last_four, verified_at, updated_at
  ) values (
    p_user_id, 'gemini', v_secret_id, p_last_four, now(), now()
  )
  on conflict (user_id) do update set
    vault_secret_id = excluded.vault_secret_id,
    last_four = excluded.last_four,
    verified_at = excluded.verified_at,
    updated_at = excluded.updated_at;
end; $$;

create or replace function public.admin_get_gemini_credential(p_user_id uuid)
returns text
language plpgsql security definer set search_path = public, vault as $$
declare
  v_secret text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'not authorized';
  end if;
  select v.decrypted_secret into v_secret
  from public.user_ai_credentials c
  join vault.decrypted_secrets v on v.id = c.vault_secret_id
  where c.user_id = p_user_id;
  return v_secret;
end; $$;

create or replace function public.admin_delete_gemini_credential(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public, vault as $$
declare
  v_secret_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'not authorized';
  end if;
  delete from public.user_ai_credentials
  where user_id = p_user_id
  returning vault_secret_id into v_secret_id;
  if v_secret_id is not null then
    delete from vault.secrets where id = v_secret_id;
  end if;
end; $$;

revoke all on function public.admin_set_gemini_credential(uuid, text, text) from public, anon, authenticated;
revoke all on function public.admin_get_gemini_credential(uuid) from public, anon, authenticated;
revoke all on function public.admin_delete_gemini_credential(uuid) from public, anon, authenticated;
grant execute on function public.admin_set_gemini_credential(uuid, text, text) to service_role;
grant execute on function public.admin_get_gemini_credential(uuid) to service_role;
grant execute on function public.admin_delete_gemini_credential(uuid) to service_role;

create table if not exists public.coach_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  role        text not null check (role in ('user', 'assistant', 'system')),
  kind        text not null default 'chat'
              check (kind in ('chat', 'activity_feedback', 'plan_proposal', 'status')),
  content     text not null,
  activity_id uuid references public.activities on delete set null,
  job_id      uuid references public.ai_jobs on delete set null,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists coach_messages_user_created_idx
  on public.coach_messages (user_id, created_at desc);

create table if not exists public.coach_memories (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users on delete cascade,
  category          text not null check (category in (
                      'availability', 'vacation', 'weather', 'preference',
                      'fatigue', 'limitation', 'pace_hr', 'long_term'
                    )),
  content           text not null,
  valid_from        date,
  valid_until       date,
  source            text not null default 'chat'
                    check (source in ('chat', 'activity_feedback', 'migration')),
  confidence        real not null default 1 check (confidence between 0 and 1),
  source_message_id uuid references public.coach_messages on delete set null,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.coach_state (
  user_id               uuid primary key references auth.users on delete cascade,
  conversation_summary  text,
  summarized_through    timestamptz,
  updated_at            timestamptz not null default now()
);

create index if not exists coach_memories_user_active_idx
  on public.coach_memories (user_id, is_active, valid_until);

create table if not exists public.plan_proposals (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users on delete cascade,
  source_message_id      uuid references public.coach_messages on delete set null,
  summary                text not null,
  range_start            date not null,
  range_end              date not null,
  workouts               jsonb not null,
  base_workout_ids       uuid[] not null default '{}',
  base_latest_updated_at timestamptz,
  status                 text not null default 'pending'
                         check (status in ('pending', 'applied', 'rejected', 'stale')),
  created_at             timestamptz not null default now(),
  applied_at             timestamptz
);

alter table public.coach_messages
  add column if not exists plan_proposal_id uuid references public.plan_proposals on delete set null;

alter table public.coach_messages enable row level security;
alter table public.coach_memories enable row level security;
alter table public.coach_state enable row level security;
alter table public.plan_proposals enable row level security;

drop policy if exists "own coach messages" on public.coach_messages;
create policy "own coach messages" on public.coach_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own coach memories" on public.coach_memories;
create policy "own coach memories" on public.coach_memories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own coach state" on public.coach_state;
create policy "own coach state" on public.coach_state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own plan proposals" on public.plan_proposals;
create policy "own plan proposals" on public.plan_proposals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Porta la memoria narrativa esistente nel nuovo modello una volta sola.
insert into public.coach_memories (user_id, category, content, source, confidence)
select s.user_id, 'long_term', s.narrative->>'coach_memory', 'migration', 0.8
from public.athlete_snapshot s
where nullif(trim(s.narrative->>'coach_memory'), '') is not null
  and not exists (
    select 1 from public.coach_memories m
    where m.user_id = s.user_id and m.category = 'long_term'
  );

alter table public.ai_jobs
  add column if not exists output_message_id uuid references public.coach_messages on delete set null;

-- Applica una proposta in una sola transazione e rifiuta snapshot obsoleti.
create or replace function public.apply_plan_proposal(p_proposal_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  p public.plan_proposals%rowtype;
  v_ids uuid[];
  v_latest timestamptz;
begin
  select * into p from public.plan_proposals
  where id = p_proposal_id and user_id = auth.uid()
  for update;
  if p.id is null or p.status <> 'pending' then
    raise exception 'proposal unavailable';
  end if;

  perform 1 from public.planned_workouts
  where user_id = auth.uid() and status = 'planned' and activity_id is null
    and date between p.range_start and p.range_end
  for update;

  select coalesce(array_agg(id order by id), '{}'), max(updated_at)
  into v_ids, v_latest
  from public.planned_workouts
  where user_id = auth.uid() and status = 'planned' and activity_id is null
    and date between p.range_start and p.range_end;

  if v_ids is distinct from p.base_workout_ids
     or v_latest is distinct from p.base_latest_updated_at then
    update public.plan_proposals set status = 'stale' where id = p.id;
    return 'stale';
  end if;

  delete from public.planned_workouts
  where user_id = auth.uid() and status = 'planned' and activity_id is null
    and date between p.range_start and p.range_end;

  insert into public.planned_workouts (
    user_id, goal_id, date, type, target_distance_m, target_pace_s_km,
    target_duration_s, target_hr_bpm, description, focus, status, origin
  )
  select
    auth.uid(),
    case when exists (
      select 1 from public.goals g
      where g.id = x.goal_id and g.user_id = auth.uid()
    ) then x.goal_id else null end,
    x.date, x.type, x.target_distance_m,
    x.target_pace_s_km, x.target_duration_s, x.target_hr_bpm,
    x.description, x.focus, 'planned', 'ai'
  from jsonb_to_recordset(p.workouts) as x(
    goal_id uuid, date date, type public.workout_type,
    target_distance_m int, target_pace_s_km int, target_duration_s int,
    target_hr_bpm int, description text, focus text
  )
  where x.date between p.range_start and p.range_end;

  update public.plan_proposals
  set status = 'applied', applied_at = now()
  where id = p.id;
  return 'applied';
end; $$;

-- L'RPC usa auth.uid() e non accetta user_id dal client.
revoke all on function public.apply_plan_proposal(uuid) from public, anon;
grant execute on function public.apply_plan_proposal(uuid) to authenticated;

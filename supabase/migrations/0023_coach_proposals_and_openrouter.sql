-- Coach: proposte applicate giorno per giorno e OpenRouter come alternativa a Gemini.
--
-- 1. Prima una proposta cancellava tutte le sedute non completate tra il
--    giorno della proposta e i 13 successivi, anche quelle non citate e anche
--    giorni ormai passati (se applicata il giorno dopo). Ora tocca solo i
--    giorni delle nuove sedute e quelli da svuotare esplicitamente
--    (remove_dates), mai giorni passati né giorni in cui l'atleta ha già corso.
-- 2. Chiave OpenRouter personale (cifrata in Vault come quella Gemini) e
--    preferenza del provider AI attivo.

-- ── 1. Proposte giorno per giorno ───────────────────────────────────────────

alter table public.plan_proposals
  add column if not exists remove_dates date[] not null default '{}',
  -- Prima/dopo per giorno, mostrato in chat: [{date, before: [...], after: [...]}]
  add column if not exists changes jsonb;

create or replace function public.apply_plan_proposal_v2(p_proposal_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  p public.plan_proposals%rowtype;
  v_today date := (now() at time zone 'Europe/Rome')::date;
  v_touched date[];
  v_dates date[];
  v_ids uuid[];
  v_latest timestamptz;
begin
  select * into p from public.plan_proposals
  where id = p_proposal_id and user_id = auth.uid()
  for update;
  if not found then return 'missing'; end if;
  if p.status <> 'pending' then return p.status; end if;

  -- Giorni citati dalla proposta: nuove sedute e giorni da svuotare.
  select coalesce(array_agg(distinct d order by d), '{}') into v_touched
  from (
    select (x->>'date')::date as d from jsonb_array_elements(p.workouts) as x
    union all
    select unnest(p.remove_dates)
  ) t
  where d is not null;

  -- Se nel frattempo il piano di quei giorni è cambiato, la proposta è superata.
  select coalesce(array_agg(id order by id), '{}'), max(updated_at)
  into v_ids, v_latest
  from public.planned_workouts
  where user_id = auth.uid() and status in ('planned', 'skipped')
    and date = any(v_touched);
  if v_ids is distinct from p.base_workout_ids
     or v_latest is distinct from p.base_latest_updated_at then
    update public.plan_proposals set status = 'stale' where id = p.id;
    return 'stale';
  end if;

  -- Mai nel passato, mai un giorno già corso o con una seduta completata.
  select coalesce(array_agg(d order by d), '{}') into v_dates
  from unnest(v_touched) as d
  where d >= v_today
    and not exists (
      select 1 from public.activities a
      where a.user_id = auth.uid()
        and a.sport = 'running'
        and (a.started_at at time zone 'Europe/Rome')::date = d
    )
    and not exists (
      select 1 from public.planned_workouts w
      where w.user_id = auth.uid() and w.date = d and w.status = 'completed'
    );

  if cardinality(v_dates) = 0 then
    update public.plan_proposals set status = 'stale' where id = p.id;
    return 'stale';
  end if;

  delete from public.planned_workouts
  where user_id = auth.uid() and status in ('planned', 'skipped')
    and date = any(v_dates);

  insert into public.planned_workouts (
    user_id, goal_id, date, type, target_distance_m, target_pace_s_km,
    target_duration_s, target_hr_bpm, workout_steps, description, focus,
    status, origin
  )
  select
    auth.uid(),
    case when exists (
      select 1 from public.goals g
      where g.id = x.goal_id and g.user_id = auth.uid()
    ) then x.goal_id else null end,
    x.date, x.type, x.target_distance_m,
    x.target_pace_s_km, x.target_duration_s, x.target_hr_bpm,
    coalesce(x.workout_steps, '[]'::jsonb),
    x.description, x.focus, 'planned', 'ai'
  from jsonb_to_recordset(p.workouts) as x(
    goal_id uuid, date date, type public.workout_type,
    target_distance_m int, target_pace_s_km int, target_duration_s int,
    target_hr_bpm int, workout_steps jsonb, description text, focus text
  )
  where x.date = any(v_dates);

  update public.plan_proposals
  set status = 'applied', applied_at = now()
  where id = p.id;
  return 'applied';
end; $$;

revoke all on function public.apply_plan_proposal_v2(uuid) from public, anon;
grant execute on function public.apply_plan_proposal_v2(uuid) to authenticated;

-- La vecchia funzione passa alla logica nuova: nessun client può più usare
-- quella che cancellava l'intera finestra.
create or replace function public.apply_plan_proposal(p_proposal_id uuid)
returns text
language sql security definer set search_path = public as $$
  select public.apply_plan_proposal_v2(p_proposal_id);
$$;

-- ── 2. OpenRouter ───────────────────────────────────────────────────────────

create table if not exists public.user_openrouter_credentials (
  user_id         uuid primary key references auth.users on delete cascade,
  vault_secret_id uuid not null,
  last_four       text not null check (char_length(last_four) = 4),
  -- Modello scelto, es. "openai/gpt-5-mini" (id del catalogo OpenRouter).
  model           text,
  verified_at     timestamptz not null,
  updated_at      timestamptz not null default now()
);

alter table public.user_openrouter_credentials enable row level security;
drop policy if exists "own openrouter credential metadata" on public.user_openrouter_credentials;
create policy "own openrouter credential metadata" on public.user_openrouter_credentials
  for select using (auth.uid() = user_id);

create or replace function public.admin_set_openrouter_credential(
  p_user_id uuid,
  p_secret text,
  p_last_four text,
  p_model text
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
  from public.user_openrouter_credentials where user_id = p_user_id;

  if v_secret_id is null then
    select vault.create_secret(
      p_secret,
      'openrouter:' || p_user_id::text,
      'OpenRouter API key personale di ZittoAndCorri'
    ) into v_secret_id;
  else
    perform vault.update_secret(v_secret_id, p_secret);
  end if;

  insert into public.user_openrouter_credentials (
    user_id, vault_secret_id, last_four, model, verified_at, updated_at
  ) values (
    p_user_id, v_secret_id, p_last_four, p_model, now(), now()
  )
  on conflict (user_id) do update set
    vault_secret_id = excluded.vault_secret_id,
    last_four = excluded.last_four,
    model = coalesce(excluded.model, public.user_openrouter_credentials.model),
    verified_at = excluded.verified_at,
    updated_at = excluded.updated_at;
end; $$;

create or replace function public.admin_get_openrouter_credential(p_user_id uuid)
returns text
language plpgsql security definer set search_path = public, vault as $$
declare
  v_secret text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'not authorized';
  end if;
  select v.decrypted_secret into v_secret
  from public.user_openrouter_credentials c
  join vault.decrypted_secrets v on v.id = c.vault_secret_id
  where c.user_id = p_user_id;
  return v_secret;
end; $$;

create or replace function public.admin_delete_openrouter_credential(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public, vault as $$
declare
  v_secret_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'not authorized';
  end if;
  delete from public.user_openrouter_credentials
  where user_id = p_user_id
  returning vault_secret_id into v_secret_id;
  if v_secret_id is not null then
    delete from vault.secrets where id = v_secret_id;
  end if;
end; $$;

revoke all on function public.admin_set_openrouter_credential(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.admin_get_openrouter_credential(uuid) from public, anon, authenticated;
revoke all on function public.admin_delete_openrouter_credential(uuid) from public, anon, authenticated;

-- Provider AI attivo (scelto in chat o nelle impostazioni).
alter table public.profiles
  add column if not exists ai_provider text not null default 'gemini'
  check (ai_provider in ('gemini', 'openrouter'));

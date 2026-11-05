-- Il coach ha pieno controllo di piano e corse:
-- 1. una seduta passata non corsa si può togliere dal piano (spostata a oggi,
--    saltata): prima i giorni passati erano intoccabili e restavano "saltati";
-- 2. una corsa si può escludere da totali e carico (malessere, errore,
--    interrotta) senza cancellarla: resta visibile, ripristinabile e non viene
--    reimportata da Intervals.icu.

-- ── 1. Corse escluse ───────────────────────────────────────────────────────

alter table public.activities
  add column if not exists excluded_at timestamptz,
  add column if not exists excluded_reason text;

comment on column public.activities.excluded_at is
  'Se valorizzato la corsa non conta in totali, record, carico e contesto del coach (ma il coach la vede tra le escluse).';

-- ── 2. Proposte: anche i giorni passati non corsi si possono svuotare ──────

create or replace function public.apply_plan_proposal_v2(p_proposal_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  p public.plan_proposals%rowtype;
  v_today date := (now() at time zone 'Europe/Rome')::date;
  v_remove_from date := (now() at time zone 'Europe/Rome')::date - 14;
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

  select coalesce(array_agg(distinct d order by d), '{}') into v_touched
  from (
    select (x->>'date')::date as d from jsonb_array_elements(p.workouts) as x
    union all
    select unnest(p.remove_dates)
  ) t
  where d is not null;

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

  -- Giorni modificabili: da oggi in avanti per nuove sedute; fino a 14 giorni
  -- indietro solo per svuotare (remove_dates). Mai un giorno già corso o con
  -- una seduta completata.
  select coalesce(array_agg(d order by d), '{}') into v_dates
  from unnest(v_touched) as d
  where (d >= v_today or (d >= v_remove_from and d = any(p.remove_dates)))
    and not exists (
      select 1 from public.activities a
      where a.user_id = auth.uid()
        and a.sport = 'running'
        and a.excluded_at is null
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
  where x.date = any(v_dates) and x.date >= v_today;

  update public.plan_proposals
  set status = 'applied', applied_at = now()
  where id = p.id;
  return 'applied';
end; $$;

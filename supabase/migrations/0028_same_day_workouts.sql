-- Più sedute nello stesso giorno dalle proposte del coach.
-- Le sedute proposte per un giorno sostituiscono quelle in calendario (che
-- possono essere più d'una). In un giorno già corso (o con una seduta
-- completata), da oggi in poi, la proposta può solo aggiungere sedute: quelle
-- esistenti non si cancellano mai.

create or replace function public.apply_plan_proposal_v2(p_proposal_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  p public.plan_proposals%rowtype;
  v_today date := (now() at time zone 'Europe/Rome')::date;
  v_remove_from date := (now() at time zone 'Europe/Rome')::date - 14;
  v_touched date[];
  v_replace date[];
  v_add date[];
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

  with days as (
    select d,
      exists (
        select 1 from public.activities a
        where a.user_id = auth.uid()
          and a.sport = 'running'
          and a.excluded_at is null
          and (a.started_at at time zone 'Europe/Rome')::date = d
      ) or exists (
        select 1 from public.planned_workouts w
        where w.user_id = auth.uid() and w.date = d and w.status = 'completed'
      ) as done
    from unnest(v_touched) as d
  )
  select
    -- Giorni da riscrivere: da oggi in avanti, o fino a 14 giorni indietro
    -- solo per svuotarli; mai un giorno già corso.
    coalesce(array_agg(d order by d) filter (
      where not done and (d >= v_today or (d >= v_remove_from and d = any(p.remove_dates)))
    ), '{}'),
    -- Giorni già corsi, da oggi in avanti: si aggiungono sedute e basta.
    coalesce(array_agg(d order by d) filter (
      where done and d >= v_today and not (d = any(p.remove_dates))
    ), '{}')
  into v_replace, v_add
  from days;

  if cardinality(v_replace) = 0 and cardinality(v_add) = 0 then
    update public.plan_proposals set status = 'stale' where id = p.id;
    return 'stale';
  end if;

  delete from public.planned_workouts
  where user_id = auth.uid() and status in ('planned', 'skipped')
    and date = any(v_replace);

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
  where (x.date = any(v_replace) or x.date = any(v_add)) and x.date >= v_today;

  update public.plan_proposals
  set status = 'applied', applied_at = now()
  where id = p.id;
  return 'applied';
end; $$;

revoke all on function public.apply_plan_proposal_v2(uuid) from public, anon;
grant execute on function public.apply_plan_proposal_v2(uuid) to authenticated;

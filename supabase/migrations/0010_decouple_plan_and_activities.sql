-- Prerequisite: 0009_unclassified_activity_type.sql already run and committed.
-- Future imports without an explicit tag start as an unclassified run.
alter table public.activities alter column type set default 'unclassified';

-- Coach proposals only work on the calendar plan. There is no longer
-- a persisted relationship with a specific real activity.
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
  where user_id = auth.uid() and status = 'planned'
    and date between p.range_start and p.range_end
  for update;

  select coalesce(array_agg(id order by id), '{}'), max(updated_at)
  into v_ids, v_latest
  from public.planned_workouts
  where user_id = auth.uid() and status = 'planned'
    and date between p.range_start and p.range_end;

  if v_ids is distinct from p.base_workout_ids
     or v_latest is distinct from p.base_latest_updated_at then
    update public.plan_proposals set status = 'stale' where id = p.id;
    return 'stale';
  end if;

  delete from public.planned_workouts
  where user_id = auth.uid() and status = 'planned'
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

revoke all on function public.apply_plan_proposal(uuid) from public, anon;
grant execute on function public.apply_plan_proposal(uuid) to authenticated;

-- Completed states created automatically by the old link
-- must not survive as false proof of adherence. States set by hand
-- senza activity_id restano invece invariati.
update public.planned_workouts
set status = 'planned'
where activity_id is not null and status = 'completed';

alter table public.planned_workouts drop constraint if exists fk_planned_activity;
alter table public.planned_workouts drop column if exists activity_id;

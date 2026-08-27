-- Allenamenti guidati e secondo client Zepp dedicato alla Workout Extension.

alter table public.planned_workouts
  add column if not exists workout_steps jsonb not null default '[]'::jsonb;

comment on column public.planned_workouts.workout_steps is
  'Schema V1 delle fasi guidate: tempo/distanza/manuale con range passo e HR.';

-- Gli allenamenti già presenti diventano una singola fase guidata. In questo
-- modo anche client meno recenti ricevono immediatamente uno schema completo.
update public.planned_workouts
set workout_steps = jsonb_build_array(jsonb_build_object(
  'id', 'step-1',
  'order', 0,
  'kind', 'steady',
  'label', case when type = 'interval' then 'Allenamento' else 'Corsa' end,
  'completion_type', case
    when target_distance_m is not null and target_distance_m > 0 then 'distance'
    when target_duration_s is not null and target_duration_s > 0 then 'time'
    else 'manual'
  end,
  'completion_value', case
    when target_distance_m is not null and target_distance_m > 0 then target_distance_m
    when target_duration_s is not null and target_duration_s > 0 then target_duration_s
    else null
  end,
  'pace_min_s_km', case when target_pace_s_km between 130 and 1190 then target_pace_s_km - 10 else null end,
  'pace_max_s_km', case when target_pace_s_km between 130 and 1190 then target_pace_s_km + 10 else null end,
  'hr_min_bpm', null,
  'hr_max_bpm', case when target_hr_bpm between 80 and 220 then target_hr_bpm else null end
))
where workout_steps = '[]'::jsonb;

alter table public.zepp_connections
  add column if not exists client_kind text not null default 'health';

alter table public.zepp_connections
  drop constraint if exists zepp_connections_user_id_key;
alter table public.zepp_connections
  drop constraint if exists zepp_connections_client_kind_check;
alter table public.zepp_connections
  add constraint zepp_connections_client_kind_check
  check (client_kind in ('health', 'workout'));
alter table public.zepp_connections
  drop constraint if exists zepp_connections_user_client_kind_key;
alter table public.zepp_connections
  add constraint zepp_connections_user_client_kind_key unique (user_id, client_kind);

create index if not exists zepp_connections_user_kind_idx
  on public.zepp_connections (user_id, client_kind);

-- Sostituisce l'ultima versione della RPC: le fasi arrivano dalla proposta
-- validata e vengono applicate nella stessa transazione del resto del piano.
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
  where x.date between p.range_start and p.range_end;

  update public.plan_proposals
  set status = 'applied', applied_at = now()
  where id = p.id;
  return 'applied';
end; $$;

revoke all on function public.apply_plan_proposal(uuid) from public, anon;
grant execute on function public.apply_plan_proposal(uuid) to authenticated;

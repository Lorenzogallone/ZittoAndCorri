-- Progressi e adattamenti del piano.
-- - best_efforts: migliori tempi su 1k/5k/10k/mezza/maratona di ogni corsa.
-- - pace_check: confronto tra passo previsto e reale nelle sedute con target.
-- - adapted_from: valori originali di una seduta alleggerita ("Non mi sento al
--   100%"), così l'adattamento si può annullare.
-- - heat_adjust: adatta i passi a caldo e umidità (default attivo).
-- - Le sedute in pausa usano lo stato 'skipped' (già presente nell'enum).

alter table public.activities
  add column if not exists best_efforts jsonb,
  add column if not exists pace_check jsonb;

alter table public.planned_workouts
  add column if not exists adapted_from jsonb;

alter table public.profiles
  add column if not exists heat_adjust boolean not null default true;

-- Le proposte del coach sostituiscono anche le sedute messe in pausa: il nuovo
-- piano tiene già conto del motivo (ricordo del coach) e non deve sovrapporsi.
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
  where user_id = auth.uid() and status in ('planned', 'skipped')
    and date between p.range_start and p.range_end
  for update;

  select coalesce(array_agg(id order by id), '{}'), max(updated_at)
  into v_ids, v_latest
  from public.planned_workouts
  where user_id = auth.uid() and status in ('planned', 'skipped')
    and date between p.range_start and p.range_end;

  if v_ids is distinct from p.base_workout_ids
     or v_latest is distinct from p.base_latest_updated_at then
    update public.plan_proposals set status = 'stale' where id = p.id;
    return 'stale';
  end if;

  delete from public.planned_workouts
  where user_id = auth.uid() and status in ('planned', 'skipped')
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

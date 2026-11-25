-- Multi-sport: adds the `sport` column to activities. Non-running activities
-- (bike, football, gym…) feed the load (sRPE) but not the running
-- stats. text + CHECK instead of enum: adding a sport in the
-- future is a constraint swap, not an ALTER TYPE.
-- Backward compatible: existing rows become 'running' via default.

alter table public.activities
  add column if not exists sport text not null default 'running';

alter table public.activities
  drop constraint if exists activities_sport_check;

alter table public.activities
  add constraint activities_sport_check check (
    sport in (
      'running',
      'cycling',
      'swimming',
      'strength',
      'hiking',
      'walking',
      'soccer',
      'tennis',
      'padel',
      'yoga',
      'pilates',
      'ski',
      'other'
    )
  );

-- Non-running activities have no sensible running workout type: they always
-- sempre 'cross' (già presente nell'enum workout_type).
alter table public.activities
  drop constraint if exists activities_sport_type_check;

alter table public.activities
  add constraint activities_sport_type_check check (
    sport = 'running' or type = 'cross'
  );

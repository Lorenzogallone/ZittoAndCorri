-- Ordered details extracted by the coach from the athlete's free-form notes.
alter table public.evaluations
  add column if not exists details jsonb not null default '[]'::jsonb;

alter table public.evaluations
  drop constraint if exists evaluations_details_array_check;
alter table public.evaluations
  add constraint evaluations_details_array_check
  check (jsonb_typeof(details) = 'array');

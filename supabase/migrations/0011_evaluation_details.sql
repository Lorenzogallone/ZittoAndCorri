-- Dettagli ordinati estratti dal coach dalle note libere dell'atleta.
alter table public.evaluations
  add column if not exists details jsonb not null default '[]'::jsonb;

alter table public.evaluations
  drop constraint if exists evaluations_details_array_check;
alter table public.evaluations
  add constraint evaluations_details_array_check
  check (jsonb_typeof(details) = 'array');

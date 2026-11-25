-- Migration: lets a pairing code be used once
-- per client_kind ('health' and 'workout') instead of only once overall.
-- The used_at field is kept for compatibility (marks when the first use happens).
-- The new used_kinds field tracks which kinds have already completed pairing.

alter table public.zepp_pairing_codes
  add column if not exists used_kinds text[] not null default '{}';

comment on column public.zepp_pairing_codes.used_kinds is
  'Array delle client_kind che hanno già usato questo codice. Valori possibili: health, workout.';

-- Update codes already "used" to mark that the health kind consumed them
-- (previous behaviour: used_at != null → health had used the code).
update public.zepp_pairing_codes
set used_kinds = array['health']
where used_at is not null and used_kinds = '{}';

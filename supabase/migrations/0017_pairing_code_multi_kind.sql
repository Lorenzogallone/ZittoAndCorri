-- Migration: permette a un codice di pairing di essere usato una volta
-- per ogni client_kind ('health' e 'workout') invece di una sola volta in assoluto.
-- Il campo used_at viene mantenuto per compatibilità (segna quando il primo uso avviene).
-- Il nuovo campo used_kinds traccia quali kind hanno già completato il pairing.

alter table public.zepp_pairing_codes
  add column if not exists used_kinds text[] not null default '{}';

comment on column public.zepp_pairing_codes.used_kinds is
  'Array delle client_kind che hanno già usato questo codice. Valori possibili: health, workout.';

-- Aggiorna i codici già "usati" per segnare che il kind health li ha consumati
-- (comportamento precedente: usato_at != null → health aveva usato il codice).
update public.zepp_pairing_codes
set used_kinds = array['health']
where used_at is not null and used_kinds = '{}';

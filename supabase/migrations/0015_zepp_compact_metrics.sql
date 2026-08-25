-- Riepiloghi Zepp compatti: i dati grezzi minuto-per-minuto e la temperatura
-- non vengono più scritti. Manteniamo solo indicatori utili a profilo e coach.

alter table public.zepp_daily_metrics
  add column if not exists sleep_start_min int,
  add column if not exists sleep_end_min int,
  add column if not exists nap_total_min int,
  add column if not exists nap_count int,
  add column if not exists step_target int,
  add column if not exists calorie_target int,
  add column if not exists stand_target int;

comment on column public.zepp_daily_metrics.sleep_start_min is
  'Minuti dalla mezzanotte dell''inizio del sonno principale.';
comment on column public.zepp_daily_metrics.sleep_end_min is
  'Minuti dalla mezzanotte della fine del sonno principale.';
comment on column public.zepp_daily_metrics.nap_total_min is
  'Durata totale giornaliera dei sonnellini, senza salvare le singole fasi.';

comment on table public.zepp_sync_events is
  'Invii Zepp compattati per audit: niente serie grezze, temperatura o PII.';

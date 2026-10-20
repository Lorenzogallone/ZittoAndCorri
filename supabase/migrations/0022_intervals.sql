-- Analisi delle ripetute.
-- - activity_streams.distance_series: distanza cumulativa dell'orologio dal
--   file FIT, più precisa del GPS per misurare i singoli tratti.
-- - activity_streams.laps: lap del file FIT (pulsante, workout guidato).
-- - activities.intervals: tratti riconosciuti (dai lap, dalla nota, dal piano o
--   in automatico) con tempo, distanza, passo e cuore di ciascuno.

alter table public.activity_streams
  add column if not exists distance_series jsonb,
  add column if not exists laps jsonb;

alter table public.activities
  add column if not exists intervals jsonb;

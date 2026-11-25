-- Interval analysis.
-- - activity_streams.distance_series: cumulative watch distance from the
--   FIT file, more precise than GPS for measuring individual segments.
-- - activity_streams.laps: laps from the FIT file (button, guided workout).
-- - activities.intervals: recognised segments (from laps, the note, the plan or
--   automatically) with time, distance, pace and heart rate of each.

alter table public.activity_streams
  add column if not exists distance_series jsonb,
  add column if not exists laps jsonb;

alter table public.activities
  add column if not exists intervals jsonb;

-- ZittoAndCorri — Detailed coaching + richer metrics from the import.
-- Run in the Supabase SQL Editor. Idempotent.
--
-- 1. `activities` gains two metrics derived from the streams (computed at
--    ingest, never by the LLM):
--    - avg_cadence_spm: average cadence in steps/minute (from FIT records).
--    - hr_drift_pct: cardiac drift (pace/HR decoupling between first and second
--      half). Positive = heart rate rises at the same effort → the session is
--      harder than the pace suggests. Helps the coach tell whether an "easy"
--      pace is really easy.
-- 2. `planned_workouts` gains the fields of a "coach who follows you in detail":
--    - target_hr_bpm: indicative maximum average HR for the session.
--    - focus: what to think about during the run, what to prioritise and what
--      to sacrifice (text from the AI coach or the user).

alter table public.activities
  add column if not exists avg_cadence_spm int,
  add column if not exists hr_drift_pct real;

alter table public.planned_workouts
  add column if not exists target_hr_bpm int,
  add column if not exists focus text;

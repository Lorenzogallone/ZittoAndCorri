-- ZittoAndCorri — Coaching di dettaglio + metriche ricche dall'import.
-- Da eseguire nel SQL Editor di Supabase. Idempotente.
--
-- 1. `activities` guadagna due metriche derivate dagli stream (calcolate in
--    ingest, mai dall'LLM):
--    - avg_cadence_spm: cadenza media in passi/minuto (dai record FIT).
--    - hr_drift_pct: deriva cardiaca (decoupling passo/HR tra prima e seconda
--      metà). Positiva = il cuore sale a parità di sforzo → seduta più
--      faticosa di quanto dica il passo. Serve al coach per capire se un
--      ritmo "easy" è davvero easy.
-- 2. `planned_workouts` guadagna i campi da "coach che ti segue nel dettaglio":
--    - target_hr_bpm: HR media massima indicativa per la seduta.
--    - focus: cosa pensare durante la corsa, cosa privilegiare e cosa
--      sacrificare (testo del coach AI o dell'utente).

alter table public.activities
  add column if not exists avg_cadence_spm int,
  add column if not exists hr_drift_pct real;

alter table public.planned_workouts
  add column if not exists target_hr_bpm int,
  add column if not exists focus text;

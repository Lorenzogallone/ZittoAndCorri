-- Affidabilità e costi del coach.
--
-- Lo stato "non inviato" dei messaggi della chat NON richiede colonne: vive in
-- coach_messages.metadata.send_error ({message, at}), scritto quando il turno
-- del coach fallisce e tolto da "Riprova" (lib/coach-failures.ts).
-- Anche la scadenza delle proposte in attesa è solo logica dell'app
-- (lib/plan/proposal-expiry.ts): nel db lo stato resta 'pending'.
--
-- Qui solo il dettaglio delle chiamate AI (lib/ai/llm.ts funziona anche senza):
-- 1. failed: la chiamata è fallita (risposta non valida o errore del provider);
--    il costo, se il provider l'ha addebitato, resta in cost_usd.
-- 2. cache_write_tokens: token di input scritti nella cache del prompt (Claude
--    via OpenRouter). Quelli letti dalla cache sono già in cached_tokens.

alter table public.ai_usage_events
  add column if not exists failed boolean not null default false,
  add column if not exists cache_write_tokens integer not null default 0;

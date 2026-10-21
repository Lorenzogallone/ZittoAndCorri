-- Modello per compito e costo di ogni chiamata AI.
--
-- 1. profiles.ai_routing: provider e modello per la chat del coach e per
--    l'analisi delle corse, es.
--    {"chat": {"provider": "openrouter", "gemini": null, "openrouter": "anthropic/claude-sonnet-5-5"},
--     "analysis": {"provider": "gemini", "gemini": "gemini-3.5-flash-lite", "openrouter": null}}
--    Senza valore vale ai_provider (migrazione 0023) per entrambi.
-- 2. evaluations.ai_usage: token e costo dell'analisi, mostrati sotto il
--    commento del coach. Per i messaggi della chat basta coach_messages.metadata.
-- 3. ai_usage_events: una riga per chiamata, per il totale del mese.

alter table public.profiles
  add column if not exists ai_routing jsonb;

alter table public.evaluations
  add column if not exists ai_usage jsonb;

create table if not exists public.ai_usage_events (
  id               bigint generated always as identity primary key,
  user_id          uuid not null references auth.users on delete cascade,
  created_at       timestamptz not null default now(),
  task             text not null check (task in ('chat', 'analysis')),
  -- coach, evaluation, interval_structure, weekly_recap
  purpose          text not null,
  provider         text not null check (provider in ('gemini', 'openrouter')),
  model            text not null,
  input_tokens     integer not null default 0,
  output_tokens    integer not null default 0,
  cached_tokens    integer not null default 0,
  reasoning_tokens integer not null default 0,
  -- Dollari; null se il prezzo del modello non è noto.
  cost_usd         numeric(12, 6),
  -- true se stimato da listino (Gemini), false se addebitato (OpenRouter).
  estimated        boolean not null default false
);

create index if not exists ai_usage_events_user_created_idx
  on public.ai_usage_events (user_id, created_at desc);

alter table public.ai_usage_events enable row level security;
drop policy if exists "own ai usage" on public.ai_usage_events;
create policy "own ai usage" on public.ai_usage_events
  for select using (auth.uid() = user_id);

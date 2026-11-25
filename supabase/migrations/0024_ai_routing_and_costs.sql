-- Model per task and cost of each AI call.
--
-- 1. profiles.ai_routing: provider and model for the coach chat and for
--    run analysis, e.g.
--    {"chat": {"provider": "openrouter", "gemini": null, "openrouter": "anthropic/claude-sonnet-5-5"},
--     "analysis": {"provider": "gemini", "gemini": "gemini-3.5-flash-lite", "openrouter": null}}
--    Without a value, ai_provider (migration 0023) applies to both.
-- 2. evaluations.ai_usage: tokens and cost of the analysis, shown under the
--    coach's comment. For chat messages coach_messages.metadata is enough.
-- 3. ai_usage_events: one row per call, for the monthly total.

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
  -- Dollars; null if the model price is unknown.
  cost_usd         numeric(12, 6),
  -- true if estimated from the price list (Gemini), false if charged (OpenRouter).
  estimated        boolean not null default false
);

create index if not exists ai_usage_events_user_created_idx
  on public.ai_usage_events (user_id, created_at desc);

alter table public.ai_usage_events enable row level security;
drop policy if exists "own ai usage" on public.ai_usage_events;
create policy "own ai usage" on public.ai_usage_events
  for select using (auth.uid() = user_id);

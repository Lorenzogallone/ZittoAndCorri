-- Coach reliability and costs.
--
-- The "not sent" state of chat messages does NOT require columns: it lives in
-- coach_messages.metadata.send_error ({message, at}), written when the coach
-- turn fails and removed by "Retry" (lib/coach-failures.ts).
-- The expiry of pending proposals is also just app logic
-- (lib/plan/proposal-expiry.ts): in the db the state stays 'pending'.
--
-- Here only the AI call detail (lib/ai/llm.ts also works without it):
-- 1. failed: the call failed (invalid response or provider error);
--    the cost, if the provider charged it, stays in cost_usd.
-- 2. cache_write_tokens: input tokens written to the prompt cache (Claude
--    via OpenRouter). Those read from the cache are already in cached_tokens.

alter table public.ai_usage_events
  add column if not exists failed boolean not null default false,
  add column if not exists cache_write_tokens integer not null default 0;

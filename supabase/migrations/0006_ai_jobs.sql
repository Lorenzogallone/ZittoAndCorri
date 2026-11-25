-- ZittoAndCorri — Async AI jobs (fix PWA crash on long AI requests)
-- Run in the Supabase SQL Editor. Idempotent where possible.
--
-- Gemini calls are slow (tens of seconds). Keeping them inside the server
-- action's response means holding an HTTP connection open for a long time:
-- on mobile network/PWA an idle timeout closes it, Next receives an invalid
-- response and forces a full reload (in standalone PWA = "crash" on the
-- splash screen). Solution: the server action creates a 'pending' job and
-- replies immediately; the heavy work runs in the background (Next `after()`)
-- and updates the job status; the client polls this table.

-- ============ AI_JOBS (status of background AI requests) ============
create table if not exists public.ai_jobs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  kind        text not null,                    -- 'plan' | 'evaluation'
  ref_id      uuid,                             -- activity_id for evaluations
  status      text not null default 'pending',  -- 'pending' | 'done' | 'error'
  error       text,                             -- user-facing message on error
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists ai_jobs_user_created_idx
  on public.ai_jobs (user_id, created_at desc);

-- ============ RLS: each user sees/writes only their own jobs ============
alter table public.ai_jobs enable row level security;

drop policy if exists "own ai_jobs" on public.ai_jobs;
create policy "own ai_jobs" on public.ai_jobs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

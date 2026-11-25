-- ZittoAndCorri — Phase 4: output of the "Plan" button (review + comments)
-- Run in the Supabase SQL Editor. Idempotent where possible.

-- ============ PLAN_REVIEWS (biweekly review + generated plan) ============
create table if not exists public.plan_reviews (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  goal_id      uuid references public.goals on delete set null,
  range_start  date not null,
  range_end    date not null,
  summary      text not null,          -- narrative review of the last 2 weeks
  comments     text,                   -- free comments entered by the user
  model        text,
  created_at   timestamptz default now()
);

-- ============ RLS: each user sees only their own rows ============
alter table public.plan_reviews enable row level security;

drop policy if exists "own reviews" on public.plan_reviews;
create policy "own reviews" on public.plan_reviews
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

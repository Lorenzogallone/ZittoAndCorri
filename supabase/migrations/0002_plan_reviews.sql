-- ZittoAndCorri — Fase 4: output del bottone "Pianifica" (review + commenti)
-- Da eseguire nel SQL Editor di Supabase. Idempotente dove possibile.

-- ============ PLAN_REVIEWS (review bisettimanale + piano generato) ============
create table if not exists public.plan_reviews (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  goal_id      uuid references public.goals on delete set null,
  range_start  date not null,
  range_end    date not null,
  summary      text not null,          -- review discorsiva ultime 2 settimane
  comments     text,                   -- commenti liberi inseriti dall'utente
  model        text,
  created_at   timestamptz default now()
);

-- ============ RLS: ogni utente vede solo le proprie righe ============
alter table public.plan_reviews enable row level security;

drop policy if exists "own reviews" on public.plan_reviews;
create policy "own reviews" on public.plan_reviews
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

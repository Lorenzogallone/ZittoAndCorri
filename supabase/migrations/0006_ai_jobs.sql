-- ZittoAndCorri — Job AI asincroni (fix crash PWA su richieste AI lunghe)
-- Da eseguire nel SQL Editor di Supabase. Idempotente dove possibile.
--
-- Le chiamate a Gemini sono lente (decine di secondi). Tenerle dentro la
-- risposta della server action significa tenere aperta una connessione HTTP a
-- lungo: su rete mobile/PWA un timeout di idle la chiude, Next riceve una
-- risposta non valida e forza un reload completo (in PWA standalone = "crash"
-- sullo splash). Soluzione: la server action crea un job 'pending' e risponde
-- subito; il lavoro pesante gira in background (Next `after()`) e aggiorna lo
-- stato del job; il client fa polling di questa tabella.

-- ============ AI_JOBS (stato delle richieste AI in background) ============
create table if not exists public.ai_jobs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  kind        text not null,                    -- 'plan' | 'evaluation'
  ref_id      uuid,                             -- activity_id per le valutazioni
  status      text not null default 'pending',  -- 'pending' | 'done' | 'error'
  error       text,                             -- messaggio utente in caso di errore
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists ai_jobs_user_created_idx
  on public.ai_jobs (user_id, created_at desc);

-- ============ RLS: ogni utente vede/scrive solo i propri job ============
alter table public.ai_jobs enable row level security;

drop policy if exists "own ai_jobs" on public.ai_jobs;
create policy "own ai_jobs" on public.ai_jobs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

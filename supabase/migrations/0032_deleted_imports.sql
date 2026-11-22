-- Corse importate cancellate dall'atleta. Senza traccia, l'import successivo
-- da Intervals.icu (finestra di 28 giorni) le ricreava. Una riga per corsa
-- cancellata: l'id esterno quando c'è, altrimenti sport e inizio per
-- riconoscerla dopo aver letto il FIT.
-- Il codice funziona anche senza questa tabella (la cancellazione resta come
-- prima): è un no-op finché la migrazione non è applicata.

create table if not exists public.deleted_imports (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users on delete cascade,
  external_id text,
  sport       text not null,
  started_at  timestamptz not null,
  deleted_at  timestamptz not null default now()
);

create unique index if not exists deleted_imports_user_external_id_key
  on public.deleted_imports (user_id, external_id)
  where external_id is not null;

create index if not exists deleted_imports_user_started_idx
  on public.deleted_imports (user_id, started_at desc);

alter table public.deleted_imports enable row level security;

drop policy if exists "own deleted imports read" on public.deleted_imports;
create policy "own deleted imports read" on public.deleted_imports
  for select using (auth.uid() = user_id);

drop policy if exists "own deleted imports insert" on public.deleted_imports;
create policy "own deleted imports insert" on public.deleted_imports
  for insert with check (auth.uid() = user_id);

comment on table public.deleted_imports is
  'Corse importate cancellate dall''atleta: l''import da Intervals.icu non le ricrea.';

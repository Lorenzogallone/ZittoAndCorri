-- Imported runs deleted by the athlete. Without a trace, the next import
-- from Intervals.icu (28-day window) would recreate them. One row per deleted
-- run: the external id when present, otherwise sport and start, to
-- recognise it after reading the FIT.
-- The code also works without this table (deletion stays as
-- before): it is a no-op until the migration is applied.

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

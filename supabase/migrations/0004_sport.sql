-- Multi-sport: aggiunge la colonna `sport` ad activities. Le attività non di
-- corsa (bici, calcio, palestra…) alimentano il carico (sRPE) ma non le
-- statistiche running. text + CHECK invece di enum: aggiungere uno sport in
-- futuro è uno swap di constraint, non un ALTER TYPE.
-- Retro-compatibile: le righe esistenti diventano 'running' via default.

alter table public.activities
  add column if not exists sport text not null default 'running';

alter table public.activities
  drop constraint if exists activities_sport_check;

alter table public.activities
  add constraint activities_sport_check check (
    sport in (
      'running',
      'cycling',
      'swimming',
      'strength',
      'hiking',
      'walking',
      'soccer',
      'tennis',
      'padel',
      'yoga',
      'pilates',
      'ski',
      'other'
    )
  );

-- Le attività non running non hanno un tipo workout di corsa sensato: usano
-- sempre 'cross' (già presente nell'enum workout_type).
alter table public.activities
  drop constraint if exists activities_sport_type_check;

alter table public.activities
  add constraint activities_sport_type_check check (
    sport = 'running' or type = 'cross'
  );

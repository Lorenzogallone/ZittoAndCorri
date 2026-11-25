-- Adds Beach volley to the sport taxonomy without changing existing data.
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
      'beach_volley',
      'tennis',
      'padel',
      'yoga',
      'pilates',
      'ski',
      'other'
    )
  );

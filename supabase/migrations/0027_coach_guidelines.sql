-- Linee guida di allenamento: regole decise per l'atleta in un periodo
-- (volume, lunghi, sedute chiave, forza, recupero, avvicinamento gara).
-- Sono ricordi del coach come gli altri: il coach le scrive, aggiorna e chiude
-- dalla chat, scadono con valid_until e prevalgono sulla metodologia generica.

alter table public.coach_memories
  drop constraint if exists coach_memories_category_check;

alter table public.coach_memories
  add constraint coach_memories_category_check check (category in (
    'availability', 'vacation', 'weather', 'preference',
    'fatigue', 'limitation', 'pace_hr', 'long_term', 'guideline'
  ));

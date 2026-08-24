-- Tipo neutro per le attività importate: non attribuisce automaticamente
-- l'intenzione "easy" a una corsa prima della valutazione dell'atleta/coach.
alter type public.workout_type add value if not exists 'unclassified';

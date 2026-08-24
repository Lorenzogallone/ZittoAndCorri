-- ESEGUI QUESTA MIGRAZIONE DA SOLA e attendi il commit prima della 0010:
-- PostgreSQL deve rendere visibile il nuovo valore enum prima che possa essere
-- usato come default in una transazione successiva.
-- Il tipo neutro non attribuisce automaticamente l'intenzione "easy".
alter type public.workout_type add value if not exists 'unclassified';

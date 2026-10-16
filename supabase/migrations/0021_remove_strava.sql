-- Rimozione dell'integrazione Strava (richiede un abbonamento Strava per
-- l'app API): serve solo a chi aveva applicato la vecchia migrazione 0020.
-- Idempotente: su un database che non l'ha mai avuta non fa nulla.

drop function if exists public.admin_set_strava_tokens(uuid, text);
drop function if exists public.admin_get_strava_tokens(uuid);
drop function if exists public.admin_delete_strava_connection(uuid);

-- Token OAuth eventualmente salvati in Vault.
delete from vault.secrets where name like 'strava:%';

drop table if exists public.strava_connections;

drop index if exists public.activities_user_source_external_id_key;
alter table public.activities drop column if exists external_id;

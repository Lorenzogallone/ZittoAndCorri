-- Removal of the Strava integration (requires a Strava subscription for
-- the API app): only needed by those who applied the old 0020 migration.
-- Idempotent: on a database that never had it, it does nothing.

drop function if exists public.admin_set_strava_tokens(uuid, text);
drop function if exists public.admin_get_strava_tokens(uuid);
drop function if exists public.admin_delete_strava_connection(uuid);

-- OAuth tokens possibly stored in Vault.
delete from vault.secrets where name like 'strava:%';

drop table if exists public.strava_connections;

drop index if exists public.activities_user_source_external_id_key;
alter table public.activities drop column if exists external_id;

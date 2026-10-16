-- Integrazione Strava: collegamento OAuth per utente con token cifrati in
-- Vault (stesso schema delle chiavi Gemini) e id esterno sulle attività per
-- rendere idempotenti gli import automatici (webhook + sync manuale).

create extension if not exists supabase_vault with schema vault;

-- Metadati visibili all'utente; access/refresh token vivono cifrati in Vault.
create table if not exists public.strava_connections (
  user_id          uuid primary key references auth.users on delete cascade,
  athlete_id       bigint not null unique,
  athlete_name     text,
  scope            text,
  vault_secret_id  uuid,
  token_expires_at timestamptz,
  connected_at     timestamptz not null default now(),
  last_sync_at     timestamptz,
  last_error       text,
  updated_at       timestamptz not null default now()
);

alter table public.strava_connections enable row level security;
-- Solo lettura della propria riga: le scritture passano dal backend (service role).
drop policy if exists "own strava connection" on public.strava_connections;
create policy "own strava connection" on public.strava_connections
  for select using (auth.uid() = user_id);

drop trigger if exists strava_connections_touch_updated_at on public.strava_connections;
create trigger strava_connections_touch_updated_at
  before update on public.strava_connections
  for each row execute function public.touch_updated_at();

-- p_secret = JSON {access_token, refresh_token, expires_at}. La riga di
-- connessione deve già esistere (creata dal callback OAuth).
create or replace function public.admin_set_strava_tokens(
  p_user_id uuid,
  p_secret text
) returns void
language plpgsql security definer set search_path = public, vault as $$
declare
  v_secret_id uuid;
  v_expires_at timestamptz;
begin
  if auth.role() <> 'service_role' then
    raise exception 'not authorized';
  end if;
  if p_secret is null or char_length(trim(p_secret)) < 16 then
    raise exception 'invalid secret';
  end if;
  v_expires_at := to_timestamp((p_secret::jsonb ->> 'expires_at')::double precision);

  select vault_secret_id into v_secret_id
  from public.strava_connections where user_id = p_user_id;
  if not found then
    raise exception 'strava connection not found';
  end if;

  -- Recupera un eventuale segreto orfano con lo stesso nome (nome univoco in Vault).
  if v_secret_id is null then
    select id into v_secret_id from vault.secrets
    where name = 'strava:' || p_user_id::text;
  end if;

  if v_secret_id is null then
    select vault.create_secret(
      p_secret,
      'strava:' || p_user_id::text,
      'Token OAuth Strava di ZittoAndCorri'
    ) into v_secret_id;
  else
    perform vault.update_secret(v_secret_id, p_secret);
  end if;

  update public.strava_connections set
    vault_secret_id = v_secret_id,
    token_expires_at = v_expires_at,
    updated_at = now()
  where user_id = p_user_id;
end; $$;

create or replace function public.admin_get_strava_tokens(p_user_id uuid)
returns text
language plpgsql security definer set search_path = public, vault as $$
declare
  v_secret text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'not authorized';
  end if;
  select v.decrypted_secret into v_secret
  from public.strava_connections c
  join vault.decrypted_secrets v on v.id = c.vault_secret_id
  where c.user_id = p_user_id;
  return v_secret;
end; $$;

create or replace function public.admin_delete_strava_connection(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public, vault as $$
declare
  v_secret_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'not authorized';
  end if;
  delete from public.strava_connections
  where user_id = p_user_id
  returning vault_secret_id into v_secret_id;
  delete from vault.secrets
  where id = v_secret_id or name = 'strava:' || p_user_id::text;
end; $$;

revoke all on function public.admin_set_strava_tokens(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_get_strava_tokens(uuid) from public, anon, authenticated;
revoke all on function public.admin_delete_strava_connection(uuid) from public, anon, authenticated;
grant execute on function public.admin_set_strava_tokens(uuid, text) to service_role;
grant execute on function public.admin_get_strava_tokens(uuid) to service_role;
grant execute on function public.admin_delete_strava_connection(uuid) to service_role;

-- Id dell'attività nel servizio di origine (oggi: id Strava). Una riga
-- importata da file e poi arricchita da Strava conserva source = 'file'.
alter table public.activities add column if not exists external_id text;

create unique index if not exists activities_user_source_external_id_key
  on public.activities (user_id, source, external_id)
  where external_id is not null;

comment on table public.strava_connections is
  'Collegamento Strava per utente; i token OAuth sono cifrati in Vault.';

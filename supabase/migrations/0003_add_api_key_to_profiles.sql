-- ZittoAndCorri — Aggiunta Chiave API personale per integrazione iPhone
-- Da eseguire nel SQL Editor di Supabase o tramite CLI. Idempotente.

-- 1. Aggiunge la colonna api_key come UUID autogenerato se non esiste
alter table public.profiles add column if not exists api_key uuid unique default gen_random_uuid();

-- 2. Aggiorna il trigger/funzione handle_new_user per popolare api_key al signup
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, api_key)
  values (new.id, new.raw_user_meta_data->>'full_name', gen_random_uuid())
  on conflict (id) do nothing;
  return new;
end; $$;

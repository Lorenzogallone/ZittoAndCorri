-- ZittoAndCorri — Add personal API key for iPhone integration
-- Run in the Supabase SQL Editor or via CLI. Idempotent.

-- 1. Add the api_key column as an auto-generated UUID if it does not exist
alter table public.profiles add column if not exists api_key uuid unique default gen_random_uuid();

-- 2. Update the handle_new_user trigger/function to populate api_key on signup
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, api_key)
  values (new.id, new.raw_user_meta_data->>'full_name', gen_random_uuid())
  on conflict (id) do nothing;
  return new;
end; $$;

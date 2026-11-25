-- Interface language chosen by the user (it | en). Jobs without a request
-- (cron, push notifications, weekly recap) have no NEXT_LOCALE cookie: they
-- read the language from here. The code also works without this column
-- (notifications stay in Italian) until the migration is applied. The
-- existing RLS policies on profiles ("own profile") already cover the new
-- column.

alter table public.profiles
  add column if not exists locale text not null default 'it';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_locale_check' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_locale_check check (locale in ('it', 'en'));
  end if;
end $$;

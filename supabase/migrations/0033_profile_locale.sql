-- Lingua dell'interfaccia scelta dall'utente (it | en). I job senza richiesta
-- (cron, notifiche push, riepilogo settimanale) non hanno il cookie
-- NEXT_LOCALE: leggono la lingua da qui. Il codice funziona anche senza questa
-- colonna (le notifiche restano in italiano) finché la migrazione non è
-- applicata. Le policy RLS esistenti su profiles ("own profile") valgono già
-- per la nuova colonna.

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

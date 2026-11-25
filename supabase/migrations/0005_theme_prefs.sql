-- ZittoAndCorri — Per-user theme preferences (Settings → Appearance)
-- Run in the Supabase SQL Editor or via CLI. Idempotent.
--
-- Three independent preferences, synced across devices via the DB:
--   theme_mode   → 'auto' | 'light' | 'dark'
--   theme_accent → main colour ('coral','amber','green','blue','violet','pink')
--   theme_style  → theme preset ('warm','night','ocean','forest')
-- The values are validated server-side anyway (see app/settings/actions.ts),
-- so no strict CHECKs here: new themes/colours can be added in the future
-- without a migration.

alter table public.profiles add column if not exists theme_mode   text default 'auto';
alter table public.profiles add column if not exists theme_accent text default 'coral';
alter table public.profiles add column if not exists theme_style  text default 'warm';

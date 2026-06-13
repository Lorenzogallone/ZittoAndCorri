-- ZittoAndCorri — Preferenze tema per-utente (Impostazioni → Aspetto)
-- Da eseguire nel SQL Editor di Supabase o tramite CLI. Idempotente.
--
-- Tre preferenze indipendenti, sincronizzate via DB tra i dispositivi:
--   theme_mode   → 'auto' | 'light' | 'dark'
--   theme_accent → colore principale ('coral','amber','green','blue','violet','pink')
--   theme_style  → preset di tema ('warm','night','ocean','forest')
-- I valori sono comunque validati lato server (vedi app/settings/actions.ts),
-- quindi niente CHECK rigidi qui: così si possono aggiungere nuovi temi/colori
-- in futuro senza migrazione.

alter table public.profiles add column if not exists theme_mode   text default 'auto';
alter table public.profiles add column if not exists theme_accent text default 'coral';
alter table public.profiles add column if not exists theme_style  text default 'warm';

-- Modello Gemini scelto dall'utente. Il default privilegia la quota gratuita
-- (500 richieste/giorno nel piano disponibile al momento della migration).
alter table public.user_ai_credentials
  add column if not exists model text not null default 'gemini-3.5-flash-lite';

comment on column public.user_ai_credentials.model is
  'Endpoint Gemini usato per chat e valutazioni; validato lato server.';


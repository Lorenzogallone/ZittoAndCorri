-- Gemini model chosen by the user. The default favours the free quota
-- (500 requests/day on the plan available at the time of the migration).
alter table public.user_ai_credentials
  add column if not exists model text not null default 'gemini-3.5-flash-lite';

comment on column public.user_ai_credentials.model is
  'Endpoint Gemini usato per chat e valutazioni; validato lato server.';


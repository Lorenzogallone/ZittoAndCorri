-- Notifiche push web: una riga per ogni browser/dispositivo iscritto.
-- Le subscription scadute (404/410 dal push service) vengono rimosse dal server.

create table if not exists public.push_subscriptions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users on delete cascade,
  endpoint         text not null unique,
  p256dh           text not null,
  auth             text not null,
  user_agent       text,
  created_at       timestamptz not null default now(),
  last_success_at  timestamptz
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

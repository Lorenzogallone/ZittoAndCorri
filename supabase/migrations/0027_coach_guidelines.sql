-- Training guidelines: rules decided for the athlete over a period
-- (volume, long runs, key sessions, strength, recovery, race approach).
-- They are coach memories like the others: the coach writes, updates and closes them
-- from the chat, they expire with valid_until and take precedence over generic methodology.

alter table public.coach_memories
  drop constraint if exists coach_memories_category_check;

alter table public.coach_memories
  add constraint coach_memories_category_check check (category in (
    'availability', 'vacation', 'weather', 'preference',
    'fatigue', 'limitation', 'pace_hr', 'long_term', 'guideline'
  ));

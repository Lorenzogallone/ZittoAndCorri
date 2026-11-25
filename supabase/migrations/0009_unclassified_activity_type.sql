-- RUN THIS MIGRATION ON ITS OWN and wait for the commit before 0010:
-- PostgreSQL must make the new enum value visible before it can be
-- used as a default in a later transaction.
-- The neutral type does not automatically assign the "easy" intent.
alter type public.workout_type add value if not exists 'unclassified';

BEGIN;
SELECT plan(2);

SELECT is_empty(
  $$ SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public' AND tablename = 'recipes' $$,
  'recipes is not published to Realtime'
);

-- Realtime sends DELETE events to every subscriber without RLS, so a public
-- table should only be added on purpose
SELECT is_empty(
  $$ SELECT tablename FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' $$,
  'No public table is published to Realtime'
);

SELECT * FROM finish();
ROLLBACK;

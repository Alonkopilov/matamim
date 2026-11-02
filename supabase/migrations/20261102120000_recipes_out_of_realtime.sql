-- The app syncs recipes by polling and never subscribes to Realtime. While
-- the table is published, Realtime sends every subscriber the id of each
-- hard-deleted recipe (RLS can't filter DELETE events), and checks RLS per
-- subscriber on every write.
ALTER PUBLICATION supabase_realtime DROP TABLE public.recipes;

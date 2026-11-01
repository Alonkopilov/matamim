-- Deleted recipes are soft-deleted (is_deleted) so other devices learn about
-- the deletion on their next sync. After 30 days the rows are removed for
-- good, and so are images no recipe points to anymore. A device that stays
-- offline longer than that keeps its copy of the deleted recipe.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.purge_deleted_recipes()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM public.recipes
  WHERE is_deleted AND updated_at < now() - INTERVAL '30 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Images in the bucket that no recipe (deleted or not) points to. Images
-- younger than a week are skipped: the app uploads the image before the
-- recipe that points to it syncs, and that sync can wait for a connection.
-- Storage only allows removing objects through its API, so the purge-images
-- function removes the images this returns.
CREATE OR REPLACE FUNCTION public.list_orphan_recipe_images(p_limit INTEGER)
RETURNS SETOF TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT o.name
  FROM storage.objects o
  WHERE o.bucket_id = 'recipe-images'
    AND o.created_at < now() - INTERVAL '7 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.recipes r
      -- The image is the public URL, whose host differs between setups
      WHERE right(r.image, length(o.name) + 16) = '/recipe-images/' || o.name
    )
  ORDER BY o.created_at
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.purge_deleted_recipes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_orphan_recipe_images(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_orphan_recipe_images(INTEGER) TO service_role;

SELECT cron.schedule(
  'purge_deleted_recipes',
  '0 3 * * *',
  'SELECT public.purge_deleted_recipes()'
);

-- Needs two Vault secrets in each project, created by hand since they differ
-- per environment: project_url (the API URL the database can reach) and
-- purge_auth (the same value as the purge-images function's PURGE_AUTH).
SELECT cron.schedule(
  'purge_orphan_images',
  '30 3 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
      || '/functions/v1/purge-images',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'purge_auth')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Recipe images follow the same rule as recipes: only the owner and their
-- team can see them. The bucket stops serving public links, and the app
-- loads images from Storage's authenticated endpoint with the user's token.
-- Recipes keep the object path (<user_id>/<uuid>.jpg) instead of the URL.

UPDATE storage.buckets SET public = false WHERE id = 'recipe-images';

DROP POLICY IF EXISTS "Users can see their own image objects" ON storage.objects;

-- Same audience as the recipes policy, through the same helper
CREATE POLICY "Owner and teammates can see images" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'recipe-images' AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text OR
      (storage.foldername(name))[1] IN (
        SELECT id::text FROM public.my_team_user_ids() AS id
      )
    )
  );

-- Existing recipes hold the public URL, keep only the path. The update
-- trigger bumps updated_at, so devices pull the new value on their next sync.
UPDATE public.recipes
SET image = substring(image from '/storage/v1/object/public/recipe-images/(.*)$')
WHERE image LIKE '%/storage/v1/object/public/recipe-images/%';

-- An image is in use when a recipe holds its path. The previous version
-- compared 16 characters for '/recipe-images/' (15), so it matched no
-- recipe and listed every image older than a week. A device that hasn't
-- synced yet may push an old public URL back, so a URL that ends with the
-- path still counts.
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
      WHERE r.image = o.name
        OR right(r.image, length(o.name) + 15) = '/recipe-images/' || o.name
    )
  ORDER BY o.created_at
  LIMIT p_limit;
$$;

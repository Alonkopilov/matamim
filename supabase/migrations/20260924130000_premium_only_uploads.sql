-- =========================================================================
-- Only premium users can upload recipes and images. Everyone can still read
-- their own and their team's recipes, so a free member downloads the team's
-- recipes without being able to share their own.
-- A user whose premium ended keeps what is already in the cloud (still
-- visible to the team) and can delete it, but cannot add or change anything.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Premium status for the app, so it can gate the cloud sync toggle
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.am_i_premium()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.is_user_premium(auth.uid());
$$;

REVOKE ALL ON FUNCTION public.am_i_premium() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.am_i_premium() TO authenticated;

-- -------------------------------------------------------------------------
-- 2. Recipes
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "Owner can insert recipes" ON public.recipes;
DROP POLICY IF EXISTS "Owner can update recipes" ON public.recipes;

CREATE POLICY "Premium owner can insert recipes" ON public.recipes
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid()) AND
    (SELECT public.is_user_premium(auth.uid()))
  );

-- The app deletes by setting is_deleted, so a soft delete is allowed without
-- premium
CREATE POLICY "Premium owner can update recipes" ON public.recipes
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (
    user_id = (SELECT auth.uid()) AND
    ((SELECT public.is_user_premium(auth.uid())) OR is_deleted = true)
  );

-- -------------------------------------------------------------------------
-- 3. Recipe images (delete stays open, same as recipes)
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can upload images to their own folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own images" ON storage.objects;

CREATE POLICY "Premium users can upload images to their own folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'recipe-images' AND
    (storage.foldername(name))[1] = (SELECT auth.uid())::text AND
    (SELECT public.is_user_premium(auth.uid()))
  );

CREATE POLICY "Premium users can update their own images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'recipe-images' AND
    (storage.foldername(name))[1] = (SELECT auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'recipe-images' AND
    (storage.foldername(name))[1] = (SELECT auth.uid())::text AND
    (SELECT public.is_user_premium(auth.uid()))
  );

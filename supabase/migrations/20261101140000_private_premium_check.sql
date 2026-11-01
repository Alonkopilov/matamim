-- =========================================================================
-- is_user_premium(uuid) answers for any user and skips the RLS on
-- premium_entitlements, so anyone with the publishable key could ask whether
-- a user ID is paying. The policies now use am_i_premium(), which only
-- answers for the caller, and is_user_premium is left to the service role
-- (enforce_premium_host runs as the service role when an edge function
-- writes a team) and to SECURITY DEFINER functions.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Recipes (same rules as before)
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "Premium owner can insert recipes" ON public.recipes;
DROP POLICY IF EXISTS "Premium owner can update recipes" ON public.recipes;

CREATE POLICY "Premium owner can insert recipes" ON public.recipes
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid()) AND
    (SELECT public.am_i_premium())
  );

CREATE POLICY "Premium owner can update recipes" ON public.recipes
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (
    user_id = (SELECT auth.uid()) AND
    ((SELECT public.am_i_premium()) OR is_deleted = true)
  );

-- -------------------------------------------------------------------------
-- 2. Recipe images (same rules as before)
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "Premium users can upload images to their own folder" ON storage.objects;
DROP POLICY IF EXISTS "Premium users can update their own images" ON storage.objects;

CREATE POLICY "Premium users can upload images to their own folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'recipe-images' AND
    (storage.foldername(name))[1] = (SELECT auth.uid())::text AND
    (SELECT public.am_i_premium())
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
    (SELECT public.am_i_premium())
  );

-- -------------------------------------------------------------------------
-- 3. Lock is_user_premium
-- -------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.is_user_premium(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_premium(UUID) TO service_role;

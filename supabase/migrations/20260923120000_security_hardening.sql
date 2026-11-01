-- =========================================================================
-- Security hardening
--  * Recipes: only the owner and the owner's teammates can read a recipe,
--    only the owner can write it.
--  * Profiles: only visible to yourself and your teammates.
--  * owner_name is set by the server, never trusted from the client.
--  * SECURITY DEFINER functions get a fixed search_path.
--  * leave_team() makes host hand-off atomic.
--  * recipe-images storage bucket (images no longer stored as base64 rows).
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Helper: the user ids of everyone in the caller's team (host + members)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_team_user_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH my_team AS (
    SELECT id FROM public.teams WHERE host_id = auth.uid()
    UNION
    SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
  )
  SELECT t.host_id FROM public.teams t JOIN my_team m ON t.id = m.id
  UNION
  SELECT tm.user_id FROM public.team_members tm JOIN my_team m ON tm.team_id = m.id;
$$;

REVOKE ALL ON FUNCTION public.my_team_user_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_team_user_ids() TO authenticated;

-- -------------------------------------------------------------------------
-- 2. Recipes policies
-- -------------------------------------------------------------------------
-- This policy had USING (true) with no FOR clause, which let any
-- authenticated user read, update and delete every recipe.
DROP POLICY IF EXISTS "Users can create and manage their own private recipes" ON public.recipes;
-- There is no UI for public recipes yet, drop until the feature exists.
DROP POLICY IF EXISTS "Anyone can view public recipes" ON public.recipes;
DROP POLICY IF EXISTS "Read access for owner and team members" ON public.recipes;
DROP POLICY IF EXISTS "Write access strictly locked to creator" ON public.recipes;

-- Team visibility follows the owner's membership, so joining or leaving a
-- team immediately shows/hides that user's recipes.
CREATE POLICY "Owner and teammates can read recipes" ON public.recipes
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid()) OR
    user_id IN (SELECT public.my_team_user_ids())
  );

CREATE POLICY "Owner can insert recipes" ON public.recipes
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Owner can update recipes" ON public.recipes
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Owner can delete recipes" ON public.recipes
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE INDEX IF NOT EXISTS recipes_user_id_idx ON public.recipes (user_id);

-- -------------------------------------------------------------------------
-- 3. Profiles: stop exposing every user's email
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow authenticated users to view profiles" ON public.profiles;

CREATE POLICY "Users can view their own and teammates' profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = (SELECT auth.uid()) OR
    id IN (SELECT public.my_team_user_ids())
  );

-- -------------------------------------------------------------------------
-- 4. owner_name is derived from the owner's profile, not the client
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_recipe_owner_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  SELECT p.username INTO NEW.owner_name
  FROM public.profiles p
  WHERE p.id = NEW.user_id;

  IF NEW.owner_name IS NULL OR NEW.owner_name = '' THEN
    NEW.owner_name := 'שף אנונימי';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_recipe_owner_name ON public.recipes;
CREATE TRIGGER trg_set_recipe_owner_name
  BEFORE INSERT OR UPDATE ON public.recipes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_recipe_owner_name();

-- Keep profiles (and the cached owner_name on recipes) in sync on rename.
CREATE OR REPLACE FUNCTION public.handle_auth_user_updated()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.profiles
  SET
    email = NEW.email,
    username = COALESCE(NEW.raw_user_meta_data->>'display_name', username)
  WHERE id = NEW.id;

  IF NEW.raw_user_meta_data->>'display_name' IS DISTINCT FROM OLD.raw_user_meta_data->>'display_name' THEN
    -- Touching the rows fires set_recipe_owner_name and bumps updated_at,
    -- so synced clients pick up the new name.
    UPDATE public.recipes SET owner_name = '' WHERE user_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

-- Backfill existing rows
UPDATE public.recipes r
SET owner_name = COALESCE(NULLIF(p.username, ''), 'שף אנונימי')
FROM public.profiles p
WHERE p.id = r.user_id;

-- -------------------------------------------------------------------------
-- 5. Fixed search_path on remaining SECURITY DEFINER functions
-- -------------------------------------------------------------------------
ALTER FUNCTION public.delete_user_account() SET search_path = '';
ALTER FUNCTION public.is_user_premium(UUID) SET search_path = '';
ALTER FUNCTION public.handle_new_user_signup() SET search_path = '';

REVOKE ALL ON FUNCTION public.delete_user_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;

-- -------------------------------------------------------------------------
-- 6. Atomic leave / host hand-off (called by the leave-team edge function)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leave_team(p_user_id UUID, p_team_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_next_host UUID;
BEGIN
  -- Regular member: just remove the membership
  IF EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = p_team_id AND user_id = p_user_id
  ) THEN
    DELETE FROM public.team_members
    WHERE team_id = p_team_id AND user_id = p_user_id;
    RETURN 'left';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.teams
    WHERE id = p_team_id AND host_id = p_user_id
  ) THEN
    RETURN 'not_in_team';
  END IF;

  -- Host: promote the oldest premium member
  SELECT tm.user_id INTO v_next_host
  FROM public.team_members tm
  WHERE tm.team_id = p_team_id
    AND public.is_user_premium(tm.user_id)
  ORDER BY tm.joined_at ASC
  LIMIT 1;

  IF v_next_host IS NULL THEN
    DELETE FROM public.teams WHERE id = p_team_id;
    RETURN 'deleted';
  END IF;

  -- Delete the host from the team members table
  DELETE FROM public.team_members
  WHERE team_id = p_team_id AND user_id = v_next_host;

  -- Update the new host
  UPDATE public.teams SET host_id = v_next_host WHERE id = p_team_id;

  RETURN 'transferred';
END;
$$;

REVOKE ALL ON FUNCTION public.leave_team(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leave_team(UUID, UUID) TO service_role;

-- -------------------------------------------------------------------------
-- 7. Recipe images bucket
-- -------------------------------------------------------------------------
-- Public bucket: objects live under unguessable <user_id>/<uuid>.jpg paths
-- and are served by URL so expo-image can cache them.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'recipe-images',
  'recipe-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- Needed by storage remove()/upsert, which read the object row first
CREATE POLICY "Users can see their own image objects" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'recipe-images' AND
    (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

CREATE POLICY "Users can upload images to their own folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'recipe-images' AND
    (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

CREATE POLICY "Users can update their own images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'recipe-images' AND
    (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

CREATE POLICY "Users can delete their own images" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'recipe-images' AND
    (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

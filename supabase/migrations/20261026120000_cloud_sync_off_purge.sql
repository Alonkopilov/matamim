-- Turning cloud sync off keeps the recipes on the device, and their copy in
-- the cloud for 30 days. After that the cloud copy is deleted for good, and
-- turning cloud sync on again uploads the device's recipes again. The same
-- happens 30 days after premium ends (the app turns cloud sync off then).
-- Teammates see the recipes until they're deleted.

-- -------------------------------------------------------------------------
-- 1. Per-user state, readable only by its user (profiles are readable by
--    teammates)
-- -------------------------------------------------------------------------
CREATE TABLE public.cloud_sync_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- When cloud sync was turned off, null while it's on
  off_since TIMESTAMPTZ,
  -- When the cloud copy was deleted, until the app has uploaded the
  -- device's recipes again
  purged_at TIMESTAMPTZ
);

ALTER TABLE public.cloud_sync_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cloud_sync_state FROM PUBLIC, anon, authenticated;

-- -------------------------------------------------------------------------
-- 2. The setting itself stays in the user's auth metadata
--    (is_syncing_to_cloud), where the app saves it. This follows it.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_cloud_sync_setting()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_new TEXT := NEW.raw_user_meta_data->>'is_syncing_to_cloud';
BEGIN
  IF TG_OP = 'UPDATE'
    AND v_new IS NOT DISTINCT FROM (OLD.raw_user_meta_data->>'is_syncing_to_cloud') THEN
    RETURN NEW;
  END IF;

  IF v_new = 'true' THEN
    UPDATE public.cloud_sync_state SET off_since = NULL WHERE user_id = NEW.id;
  ELSIF v_new = 'false' THEN
    -- Turned off again: the countdown started the first time
    INSERT INTO public.cloud_sync_state (user_id, off_since)
    VALUES (NEW.id, now())
    ON CONFLICT (user_id) DO UPDATE
      SET off_since = COALESCE(public.cloud_sync_state.off_since, now());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cloud_sync_setting
  AFTER INSERT OR UPDATE OF raw_user_meta_data ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_cloud_sync_setting();

-- Accounts that already have cloud sync off start their countdown now
INSERT INTO public.cloud_sync_state (user_id, off_since)
SELECT id, now() FROM auth.users
WHERE raw_user_meta_data->>'is_syncing_to_cloud' = 'false'
ON CONFLICT (user_id) DO NOTHING;

-- -------------------------------------------------------------------------
-- 3. The purge. Rows are deleted, not marked deleted: a deleted mark would
--    reach the owner's devices and delete the recipes there too. Teammates'
--    apps drop cached recipes that are no longer on the server, and the
--    purge_orphan_images job removes the images the next night.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_cloud_sync_off_recipes()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH targets AS (
    SELECT user_id FROM public.cloud_sync_state
    WHERE off_since < now() - INTERVAL '30 days'
    UNION
    SELECT user_id FROM public.premium_entitlements
    WHERE expires_at < now() - INTERVAL '30 days'
  ),
  deleted AS (
    DELETE FROM public.recipes
    WHERE user_id IN (SELECT user_id FROM targets)
    RETURNING user_id
  ),
  marked AS (
    INSERT INTO public.cloud_sync_state (user_id, purged_at)
    SELECT DISTINCT user_id, now() FROM deleted
    ON CONFLICT (user_id) DO UPDATE SET purged_at = now()
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM deleted;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_cloud_sync_off_recipes() FROM PUBLIC, anon, authenticated;

-- Before purge_orphan_images (03:30), so the images go the same night
SELECT cron.schedule(
  'purge_cloud_sync_off_recipes',
  '15 3 * * *',
  'SELECT public.purge_cloud_sync_off_recipes()'
);

-- -------------------------------------------------------------------------
-- 4. For the app: whether its cloud copy was deleted, and clearing that once
--    it has uploaded the device's recipes again
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_cloud_copy_purged()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cloud_sync_state
    WHERE user_id = auth.uid() AND purged_at IS NOT NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.clear_my_cloud_copy_purged()
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.cloud_sync_state SET purged_at = NULL
  WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.my_cloud_copy_purged() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.clear_my_cloud_copy_purged() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_cloud_copy_purged() TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_my_cloud_copy_purged() TO authenticated;

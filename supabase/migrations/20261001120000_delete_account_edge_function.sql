-- =========================================================================
-- Account deletion moves to the delete-account edge function, which removes
-- the user's images from Storage before calling this. The function now takes
-- the user id from the edge function's verified token and only service_role
-- can run it, so the app can't skip the image cleanup.
-- =========================================================================
DROP FUNCTION IF EXISTS public.delete_user_account();

CREATE FUNCTION public.delete_user_account(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_team_id UUID;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized user identity';
  END IF;

  SELECT id INTO v_team_id FROM public.teams WHERE host_id = p_user_id;
  IF v_team_id IS NULL THEN
    SELECT team_id INTO v_team_id FROM public.team_members WHERE user_id = p_user_id;
  END IF;

  -- Promotes the oldest premium member, or deletes the team if there is none
  IF v_team_id IS NOT NULL THEN
    PERFORM public.leave_team(p_user_id, v_team_id);
  END IF;

  DELETE FROM auth.users WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_account(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_account(UUID) TO service_role;

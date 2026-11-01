-- =========================================================================
-- Deleting an account leaves the team the same way the leave-team function
-- does. Before this, deleting auth.users cascaded straight through
-- teams.host_id, so a host's team skipped the promotion step.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_team_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized user identity';
  END IF;

  SELECT id INTO v_team_id FROM public.teams WHERE host_id = v_user_id;
  IF v_team_id IS NULL THEN
    SELECT team_id INTO v_team_id FROM public.team_members WHERE user_id = v_user_id;
  END IF;

  -- Promotes the oldest premium member, or deletes the team if there is none
  IF v_team_id IS NOT NULL THEN
    PERFORM public.leave_team(v_user_id, v_team_id);
  END IF;

  DELETE FROM auth.users WHERE id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;

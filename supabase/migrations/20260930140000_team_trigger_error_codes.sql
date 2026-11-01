-- =========================================================================
-- The team triggers raise codes instead of Hebrew text. The edge functions
-- send them to the app, which shows them in the user's language. Keep the
-- codes in sync with supabase/functions/_shared/errors.ts.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.enforce_premium_host()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT public.is_user_premium(NEW.host_id) THEN
    RAISE EXCEPTION 'TEAM_PREMIUM_REQUIRED'
      USING DETAIL = 'Only premium users can create or manage a team';
  END IF;

  -- The host can't also be a member of another team
  IF EXISTS (SELECT 1 FROM public.team_members WHERE user_id = NEW.host_id) THEN
    RAISE EXCEPTION 'MEMBER_CANNOT_HOST'
      USING DETAIL = 'A member of a team cannot host another one';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.enforce_member_constraints()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.teams WHERE host_id = NEW.user_id) THEN
    RAISE EXCEPTION 'CANNOT_JOIN_AS_HOST'
      USING DETAIL = 'A team host cannot join another team';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

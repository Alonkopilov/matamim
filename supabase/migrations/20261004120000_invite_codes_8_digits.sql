-- Invite codes go from 5 to 8 digits, so an active code can't be guessed.
-- Codes only live for 5 minutes, so the old ones are just dropped.
DELETE FROM public.team_invites;

ALTER TABLE public.team_invites
  DROP CONSTRAINT chk_code_length,
  ALTER COLUMN code TYPE VARCHAR(8),
  ADD CONSTRAINT chk_code_format CHECK (code ~ '^[0-9]{8}$');

-- Teammates may read each other's profiles, but only the name. Emails reach
-- the app only through get-team, which shows them to the team's host.
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (id, username) ON public.profiles TO authenticated;

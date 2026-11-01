-- Usernames are at most 30 characters, like the app's sign-up and rename
-- forms allow.

UPDATE public.profiles
SET username = left(username, 30)
WHERE char_length(username) > 30;

ALTER TABLE public.profiles
  ADD CONSTRAINT chk_username_length CHECK (char_length(username) <= 30);

-- The name lives in the auth metadata the app reads, so a long one is
-- rejected there, on sign-up and on rename, before it reaches the profile.
CREATE OR REPLACE FUNCTION public.check_display_name_length()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF char_length(NEW.raw_user_meta_data->>'display_name') > 30 THEN
    RAISE EXCEPTION 'Username is longer than 30 characters'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_display_name_length ON auth.users;
CREATE TRIGGER trg_check_display_name_length
  BEFORE INSERT OR UPDATE OF raw_user_meta_data ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.check_display_name_length();

-- A user with no name gets the start of their email, cut to fit
CREATE OR REPLACE FUNCTION public.handle_new_user_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, username)
  VALUES (
    NEW.id,
    NEW.email,
    left(
      COALESCE(
        NEW.raw_user_meta_data->>'display_name',
        NEW.raw_user_meta_data->>'username',
        split_part(NEW.email, '@', 1)
      ),
      30
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

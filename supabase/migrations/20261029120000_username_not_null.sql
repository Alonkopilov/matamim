-- A profile's username is never null. The app shows an empty one as
-- "New Cook" in the user's language.

UPDATE public.profiles SET username = '' WHERE username IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN username SET DEFAULT '',
  ALTER COLUMN username SET NOT NULL;

-- A blank name counts as no name, and falls back to the start of the email
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
        NULLIF(trim(NEW.raw_user_meta_data->>'display_name'), ''),
        NULLIF(trim(NEW.raw_user_meta_data->>'username'), ''),
        split_part(NEW.email, '@', 1),
        ''
      ),
      30
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

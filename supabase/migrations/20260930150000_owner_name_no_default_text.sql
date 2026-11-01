-- =========================================================================
-- A recipe's owner_name is empty when the owner has no name, instead of a
-- Hebrew placeholder, so the app can show its own in the user's language.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.set_recipe_owner_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  SELECT COALESCE(p.username, '') INTO NEW.owner_name
  FROM public.profiles p
  WHERE p.id = NEW.user_id;

  NEW.owner_name := COALESCE(NEW.owner_name, '');

  RETURN NEW;
END;
$$;

ALTER TABLE public.recipes ALTER COLUMN owner_name SET DEFAULT '';

-- Bumps updated_at (handle_times), so synced devices download the change
UPDATE public.recipes SET owner_name = '' WHERE owner_name = 'שף אנונימי';

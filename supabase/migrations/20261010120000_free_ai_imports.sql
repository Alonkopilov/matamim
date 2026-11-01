-- =========================================================================
-- Free users get a few AI imports to try the feature before buying Premium.
-- One pool per account that never refills, shared by every kind of AI
-- import. Only import-recipe (service role) uses one up, after a success.
-- =========================================================================

-- A user without a row hasn't used any. Editing a row gives a tester more.
CREATE TABLE public.free_ai_imports (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  remaining INT NOT NULL CHECK (remaining >= 0)
);

-- No policies: the app reads its count through my_free_ai_imports_left()
ALTER TABLE public.free_ai_imports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.free_ai_imports FROM anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.free_ai_imports TO service_role;

-- How many a new account gets
CREATE OR REPLACE FUNCTION public.free_ai_imports_allowance()
RETURNS INT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT 3;
$$;

CREATE OR REPLACE FUNCTION public.free_ai_imports_left(target_user_id UUID)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT remaining FROM public.free_ai_imports WHERE user_id = target_user_id),
    public.free_ai_imports_allowance()
  );
$$;

-- Returns what's left after using one, or NULL if none were left. A single
-- statement, so two imports at once can't both take the last one.
CREATE OR REPLACE FUNCTION public.use_free_ai_import(target_user_id UUID)
RETURNS INT
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.free_ai_imports AS f (user_id, remaining)
  VALUES (target_user_id, public.free_ai_imports_allowance() - 1)
  ON CONFLICT (user_id) DO UPDATE
    SET remaining = f.remaining - 1
    WHERE f.remaining > 0
  RETURNING remaining;
$$;

CREATE OR REPLACE FUNCTION public.my_free_ai_imports_left()
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.free_ai_imports_left(auth.uid());
$$;

REVOKE ALL ON FUNCTION public.free_ai_imports_left(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.use_free_ai_import(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.free_ai_imports_left(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.use_free_ai_import(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.my_free_ai_imports_left() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_free_ai_imports_left() TO authenticated;

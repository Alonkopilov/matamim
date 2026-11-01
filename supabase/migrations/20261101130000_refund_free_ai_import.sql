-- A free user pays one free import for every call to the model, taken just
-- before the call, even when the model finds no recipe. When Anthropic is
-- busy or down the model never answers, so import-recipe gives it back.
-- Only import-recipe (service role) calls this, right after taking one, so it
-- can't give back more than was used.
CREATE OR REPLACE FUNCTION public.refund_free_ai_import(target_user_id UUID)
RETURNS INT
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.free_ai_imports
  SET remaining = remaining + 1
  WHERE user_id = target_user_id
  RETURNING remaining;
$$;

REVOKE ALL ON FUNCTION public.refund_free_ai_import(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_free_ai_import(UUID) TO service_role;

-- =========================================================================
-- Real premium status, mirrored from RevenueCat by the sync-premium and
-- revenuecat-webhook edge functions. Replaces the placeholder that returned
-- TRUE for everyone.
-- =========================================================================

CREATE TABLE public.premium_entitlements (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- NULL for a lifetime purchase
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No policies: only the edge functions (service role) read or write it
ALTER TABLE public.premium_entitlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.premium_entitlements FROM anon, authenticated;

-- Checks the expiry date itself, so a lapsed subscription stops counting even
-- if the expiration webhook never arrives
CREATE OR REPLACE FUNCTION public.is_user_premium(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.premium_entitlements
    WHERE user_id = target_user_id
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;

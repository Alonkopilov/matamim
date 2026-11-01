-- New tables aren't exposed to the API roles automatically, so the edge
-- functions (service role) couldn't write premium status
GRANT ALL PRIVILEGES ON TABLE public.premium_entitlements TO service_role;

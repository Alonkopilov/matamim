BEGIN;
SELECT plan(1);

-- Setup, as superuser. Only premium users can save recipes.
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('cccccccc-0000-0000-0000-000000000000', 'carol@test.com', '{"display_name":"Carol"}');
INSERT INTO public.premium_entitlements (user_id, expires_at)
VALUES ('cccccccc-0000-0000-0000-000000000000', NULL);

-- Act as Carol
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-000000000000"}';

SELECT lives_ok(
  $$ INSERT INTO public.recipes (user_id, name)
     VALUES ('cccccccc-0000-0000-0000-000000000000', 'Shakshuka') $$,
  'Carol can create her own recipe'
);

SELECT * FROM finish();
ROLLBACK;

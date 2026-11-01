BEGIN;
SELECT plan(16);

-- Setup, as superuser. Paz has Premium, Gil doesn't and has a recipe saved
-- from when they did. Both confirmed their email, which creates the profile
-- a team host needs.
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('11111111-0000-0000-0000-000000000000', 'paz@test.com', now()),
  ('22222222-0000-0000-0000-000000000000', 'gil@test.com', now());
INSERT INTO public.premium_entitlements (user_id, expires_at)
VALUES ('11111111-0000-0000-0000-000000000000', NULL);
INSERT INTO public.recipes (id, user_id, name)
VALUES ('22222222-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000000', 'Old recipe');

-- Without signing in, the app can't ask about anyone
SET LOCAL ROLE anon;

SELECT throws_ok(
  $$ SELECT public.is_user_premium('11111111-0000-0000-0000-000000000000') $$,
  '42501', NULL,
  'Signed out, the app can''t ask whether a user is Premium'
);

-- Act as Gil, a free user
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"22222222-0000-0000-0000-000000000000"}';

SELECT throws_ok(
  $$ SELECT public.is_user_premium('11111111-0000-0000-0000-000000000000') $$,
  '42501', NULL,
  'A signed-in user can''t ask whether another user is Premium'
);
SELECT is(public.am_i_premium(), false, 'A free user sees they aren''t Premium');
SELECT throws_ok(
  $$ INSERT INTO public.recipes (user_id, name)
     VALUES ('22222222-0000-0000-0000-000000000000', 'New recipe') $$,
  '42501', NULL,
  'A free user can''t create a recipe'
);
SELECT throws_ok(
  $$ UPDATE public.recipes SET name = 'Renamed'
     WHERE id = '22222222-0000-0000-0000-000000000001' $$,
  '42501', NULL,
  'A free user can''t change a saved recipe'
);
SELECT lives_ok(
  $$ UPDATE public.recipes SET is_deleted = true
     WHERE id = '22222222-0000-0000-0000-000000000001' $$,
  'A free user can still delete a saved recipe'
);
SELECT is(
  (SELECT is_deleted FROM public.recipes WHERE id = '22222222-0000-0000-0000-000000000001'),
  true,
  'The deleted recipe is marked deleted'
);
SELECT throws_ok(
  $$ INSERT INTO storage.objects (bucket_id, name)
     VALUES ('recipe-images', '22222222-0000-0000-0000-000000000000/0b6f0f43-6f0e-4a4b-9d8e-2f1b7c3a9e11.jpg') $$,
  '42501', NULL,
  'A free user can''t upload an image'
);

-- Act as Paz, a Premium user
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000000"}';

SELECT is(public.am_i_premium(), true, 'A Premium user sees they are Premium');
SELECT lives_ok(
  $$ INSERT INTO public.recipes (id, user_id, name)
     VALUES ('11111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000000', 'Shakshuka') $$,
  'A Premium user can create a recipe'
);
SELECT lives_ok(
  $$ UPDATE public.recipes SET name = 'Green shakshuka'
     WHERE id = '11111111-0000-0000-0000-000000000001' $$,
  'A Premium user can change a recipe'
);
SELECT is(
  (SELECT name FROM public.recipes WHERE id = '11111111-0000-0000-0000-000000000001'),
  'Green shakshuka',
  'The change is saved'
);
SELECT lives_ok(
  $$ INSERT INTO storage.objects (bucket_id, name)
     VALUES ('recipe-images', '11111111-0000-0000-0000-000000000000/0b6f0f43-6f0e-4a4b-9d8e-2f1b7c3a9e11.jpg') $$,
  'A Premium user can upload an image to their own folder'
);
SELECT throws_ok(
  $$ INSERT INTO storage.objects (bucket_id, name)
     VALUES ('recipe-images', '22222222-0000-0000-0000-000000000000/5d1c2a7e-3b4f-4e8a-9c6d-1a2b3c4d5e6f.jpg') $$,
  '42501', NULL,
  'A Premium user can''t upload an image to someone else''s folder'
);

-- The edge functions write teams as the service role, and the team trigger
-- still checks the host's Premium
RESET ROLE;
SET LOCAL ROLE service_role;

SELECT lives_ok(
  $$ INSERT INTO public.teams (title, host_id)
     VALUES ('Paz''s kitchen', '11111111-0000-0000-0000-000000000000') $$,
  'A Premium user can host a team'
);
SELECT throws_ok(
  $$ INSERT INTO public.teams (title, host_id)
     VALUES ('Gil''s kitchen', '22222222-0000-0000-0000-000000000000') $$,
  'P0001', 'TEAM_PREMIUM_REQUIRED',
  'A free user can''t host a team'
);

SELECT * FROM finish();
ROLLBACK;

BEGIN;
SELECT plan(11);

-- Setup, as superuser. Only premium users can save recipes.
INSERT INTO auth.users (id, email)
VALUES ('dddddddd-0000-0000-0000-000000000000', 'dana@test.com');
INSERT INTO public.premium_entitlements (user_id, expires_at)
VALUES ('dddddddd-0000-0000-0000-000000000000', NULL);

-- Act as Dana
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"dddddddd-0000-0000-0000-000000000000"}';

-- Every kind of image the app saves, or saved in the past
SELECT lives_ok(
  $$ INSERT INTO public.recipes (user_id, name, image)
     VALUES ('dddddddd-0000-0000-0000-000000000000', 'No image', '') $$,
  'A recipe without an image is accepted'
);

SELECT lives_ok(
  $$ INSERT INTO public.recipes (id, user_id, name, image)
     VALUES (
       'eeeeeeee-0000-0000-0000-000000000000',
       'dddddddd-0000-0000-0000-000000000000',
       'Storage path',
       'dddddddd-0000-0000-0000-000000000000/0b6f0f43-6f0e-4a4b-9d8e-2f1b7c3a9e11.jpg'
     ) $$,
  'A Storage path is accepted'
);

SELECT lives_ok(
  $$ INSERT INTO public.recipes (user_id, name, image)
     VALUES (
       'dddddddd-0000-0000-0000-000000000000',
       'Local file',
       'local:0b6f0f43-6f0e-4a4b-9d8e-2f1b7c3a9e11.jpg'
     ) $$,
  'A local file name is accepted'
);

SELECT lives_ok(
  $$ INSERT INTO public.recipes (user_id, name, image)
     VALUES (
       'dddddddd-0000-0000-0000-000000000000',
       'Old public URL',
       'https://abc.supabase.co/storage/v1/object/public/recipe-images/dddddddd-0000-0000-0000-000000000000/0b6f0f43-6f0e-4a4b-9d8e-2f1b7c3a9e11.png'
     ) $$,
  'An old public URL is accepted'
);

SELECT lives_ok(
  $$ INSERT INTO public.recipes (user_id, name, image)
     VALUES (
       'dddddddd-0000-0000-0000-000000000000',
       'Old base64',
       E'data:image/jpeg;base64,/9j/4AAQ\nSkZJRg=='
     ) $$,
  'An old base64 image split into lines is accepted'
);

-- Paths that lead a teammate's request away from the image
SELECT throws_ok(
  $$ INSERT INTO public.recipes (user_id, name, image)
     VALUES (
       'dddddddd-0000-0000-0000-000000000000',
       'Dot segments',
       '../../../../functions/v1/delete-account'
     ) $$,
  '23514', NULL,
  'A path with ".." is refused'
);

SELECT throws_ok(
  $$ INSERT INTO public.recipes (user_id, name, image)
     VALUES (
       'dddddddd-0000-0000-0000-000000000000',
       'Encoded dot segments',
       '%2e%2e/%2E%2E/%2e%2e/%2e%2e/functions/v1/delete-account'
     ) $$,
  '23514', NULL,
  'A path with percent escapes is refused'
);

SELECT throws_ok(
  $$ INSERT INTO public.recipes (user_id, name, image)
     VALUES (
       'dddddddd-0000-0000-0000-000000000000',
       'Split dot segments',
       E'.\t./.\t./.\t./.\t./functions/v1/delete-account'
     ) $$,
  '23514', NULL,
  'A path with ".." split by a tab is refused'
);

SELECT throws_ok(
  $$ INSERT INTO public.recipes (user_id, name, image)
     VALUES (
       'dddddddd-0000-0000-0000-000000000000',
       'Old URL form',
       'https://x/storage/v1/object/public/recipe-images/../../../../functions/v1/delete-account'
     ) $$,
  '23514', NULL,
  'An old URL with ".." after the bucket is refused'
);

SELECT throws_ok(
  $$ INSERT INTO public.recipes (user_id, name, image)
     VALUES (
       'dddddddd-0000-0000-0000-000000000000',
       'Fake base64',
       'data:image/recipe-images/../../../../functions/v1/delete-account'
     ) $$,
  '23514', NULL,
  'A data URI that isn''t base64 is refused'
);

SELECT throws_ok(
  $$ UPDATE public.recipes
     SET image = '../../../../functions/v1/delete-account'
     WHERE id = 'eeeeeeee-0000-0000-0000-000000000000' $$,
  '23514', NULL,
  'Changing an image to a path with ".." is refused'
);

SELECT * FROM finish();
ROLLBACK;

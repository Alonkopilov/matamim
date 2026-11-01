BEGIN;
SELECT plan(10);

-- Setup, as superuser. A new account, so no free_ai_imports row yet.
INSERT INTO auth.users (id, email)
VALUES ('ffffffff-0000-0000-0000-000000000000', 'fay@test.com');

-- import-recipe takes one before each call to the model, as the service role
SET LOCAL ROLE service_role;

SELECT is(
  public.use_free_ai_import('ffffffff-0000-0000-0000-000000000000'),
  2,
  'The first import leaves 2'
);
SELECT is(
  public.use_free_ai_import('ffffffff-0000-0000-0000-000000000000'),
  1,
  'The second import leaves 1'
);
SELECT is(
  public.use_free_ai_import('ffffffff-0000-0000-0000-000000000000'),
  0,
  'The third import leaves none'
);
SELECT is(
  public.use_free_ai_import('ffffffff-0000-0000-0000-000000000000'),
  NULL::int,
  'A fourth import gets nothing, so import-recipe refuses it'
);
SELECT is(
  public.free_ai_imports_left('ffffffff-0000-0000-0000-000000000000'),
  0,
  'A refused import leaves the count at 0'
);

-- Given back when Anthropic is busy or down and the model never answered
SELECT is(
  public.refund_free_ai_import('ffffffff-0000-0000-0000-000000000000'),
  1,
  'A refund gives one back'
);
SELECT is(
  public.use_free_ai_import('ffffffff-0000-0000-0000-000000000000'),
  0,
  'The refunded import can be used again'
);

-- The app reads its own count, and can't use or refund one itself
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"ffffffff-0000-0000-0000-000000000000"}';

SELECT is(
  public.my_free_ai_imports_left(),
  0,
  'The app sees none left'
);
SELECT throws_ok(
  $$ SELECT public.use_free_ai_import('ffffffff-0000-0000-0000-000000000000') $$,
  '42501', NULL,
  'The app can''t use a free import itself'
);
SELECT throws_ok(
  $$ SELECT public.refund_free_ai_import('ffffffff-0000-0000-0000-000000000000') $$,
  '42501', NULL,
  'The app can''t give itself a free import back'
);

SELECT * FROM finish();
ROLLBACK;

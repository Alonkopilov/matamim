-- E2E seed. Loaded by scripts/e2e/seed.sh after `supabase db reset --no-seed`,
-- instead of supabase/seed.sql. Every row here exists because a flow needs it;
-- add data together with the flow that needs it.
--
-- Fixed ids keep flows and assertions stable across runs. All accounts use
-- the password E2E_PASSWORD from scripts/e2e/env.sh.

CREATE OR REPLACE FUNCTION pg_temp.e2e_user(p_id uuid, p_email text, p_name text)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated',
    'authenticated', p_email, crypt('e2e-password-1', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}',
    jsonb_build_object('display_name', p_name), now(), now(), '', '', '', ''
  );
  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at,
    created_at, updated_at
  ) VALUES (
    gen_random_uuid(), p_id,
    jsonb_build_object('sub', p_id::text, 'email', p_email), 'email',
    p_id::text, now(), now(), now()
  );
$$;

-- Users
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000001', 'owner@e2e.test', 'E2E Owner');
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000002', 'member@e2e.test', 'E2E Member');

-- Free accounts, one per flow, so a flow that changes or deletes its account
-- can't affect another. None of them is ever premium in RevenueCat, except
-- buyer@, which flows/free/premium-purchase.yaml resets there first.
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000003', 'local@e2e.test', 'Local Cook');
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000004', 'buyer@e2e.test', 'Buyer Cook');
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000005', 'filters@e2e.test', 'Filter Cook');
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000006', 'settings@e2e.test', 'Settings Cook');
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000007', 'email@e2e.test', 'Email Cook');
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000008', 'password@e2e.test', 'Password Cook');
-- flows/account/forgot-password.yaml resets its password
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000051', 'forgot@e2e.test', 'Forgot Cook');

-- flows/free/delete-account.yaml: delete@ gets a row in every table that
-- references a user, and keeper@ the same kinds of rows, which must all
-- survive delete@'s deletion. delete@ is a free member of keeper@'s team,
-- with an expired entitlement like a lapsed subscriber, and recipes from back
-- when it was premium. Its photo in Storage is uploaded by seed.sh.
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000009', 'delete@e2e.test', 'Delete Cook');
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000010', 'keeper@e2e.test', 'Keeper Cook');
-- flows/free/delete-account-message.yaml deletes it
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000011', 'gone@e2e.test', 'Gone Cook');

INSERT INTO public.premium_entitlements (user_id, expires_at) VALUES
  ('e2e00000-0000-0000-0000-000000000010', NULL),
  -- Less than 30 days, or the nightly purge of a lapsed subscriber's cloud
  -- copy (flows/premium/sync-off.yaml runs it) would delete its recipes
  ('e2e00000-0000-0000-0000-000000000009', now() - interval '10 days');

INSERT INTO public.teams (id, title, host_id) VALUES
  ('e2e7ea00-0000-0000-0000-000000000010', 'Keeper Team', 'e2e00000-0000-0000-0000-000000000010');
INSERT INTO public.team_members (user_id, team_id) VALUES
  ('e2e00000-0000-0000-0000-000000000009', 'e2e7ea00-0000-0000-0000-000000000010');
INSERT INTO public.team_invites (code, team_id, created_by, expires_at) VALUES
  ('90000010', 'e2e7ea00-0000-0000-0000-000000000010', 'e2e00000-0000-0000-0000-000000000010', now() + interval '1 day');

INSERT INTO public.recipes (id, user_id, name, ingredients, instructions, team_id) VALUES
  ('e2ec0000-0000-0000-0000-000000000901', 'e2e00000-0000-0000-0000-000000000009', 'Deleted Soup', '[]', '[]', 'e2e7ea00-0000-0000-0000-000000000010'),
  ('e2ec0000-0000-0000-0000-000000000902', 'e2e00000-0000-0000-0000-000000000009', 'Deleted Pie', '[]', '[]', NULL),
  ('e2ec0000-0000-0000-0000-000000001001', 'e2e00000-0000-0000-0000-000000000010', 'Kept Soup', '[]', '[]', 'e2e7ea00-0000-0000-0000-000000000010'),
  ('e2ec0000-0000-0000-0000-000000001002', 'e2e00000-0000-0000-0000-000000000010', 'Kept Pie', '[]', '[]', NULL);

INSERT INTO public.free_ai_imports (user_id, remaining) VALUES
  ('e2e00000-0000-0000-0000-000000000009', 1),
  ('e2e00000-0000-0000-0000-000000000010', 2);
INSERT INTO public.ai_import_events (user_id, premium, kind, outcome, duration_ms) VALUES
  ('e2e00000-0000-0000-0000-000000000009', false, 'url', 'success', 1000),
  ('e2e00000-0000-0000-0000-000000000010', true, 'url', 'success', 1000);

-- flows/free/filters.yaml: filters@ is a member of teamhost@'s team, whose
-- recipes are listed and filtered with its own. Picnic Basket is a lunch
-- tagged with two other meals, and Dinner Rolls a breakfast named after
-- another meal: meal filters go by the meal alone.
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000012', 'teamhost@e2e.test', 'Team Host');
INSERT INTO public.premium_entitlements (user_id, expires_at) VALUES
  ('e2e00000-0000-0000-0000-000000000012', NULL);
INSERT INTO public.teams (id, title, host_id) VALUES
  ('e2e7ea00-0000-0000-0000-000000000012', 'Filter Team', 'e2e00000-0000-0000-0000-000000000012');
INSERT INTO public.team_members (user_id, team_id) VALUES
  ('e2e00000-0000-0000-0000-000000000005', 'e2e7ea00-0000-0000-0000-000000000012');
INSERT INTO public.recipes (id, user_id, name, category, tags, ingredients, instructions, team_id) VALUES
  ('e2ec0000-0000-0000-0000-000000001201', 'e2e00000-0000-0000-0000-000000000012', 'Picnic Basket', 'lunch', '{Breakfast,Dinner}', '[]', '[]', 'e2e7ea00-0000-0000-0000-000000000012'),
  ('e2ec0000-0000-0000-0000-000000001202', 'e2e00000-0000-0000-0000-000000000012', 'Dinner Rolls', 'breakfast', '{}', '[]', '[]', 'e2e7ea00-0000-0000-0000-000000000012');

-- Premium accounts. Premium in RevenueCat comes from a lifetime promotional
-- entitlement each flow gives its account first (scripts/revenuecat-grant.js),
-- and in the database from the rows below, as sync-premium would write them.
-- Cloud sync is on or off in the Auth metadata, as the app saves it.
CREATE OR REPLACE FUNCTION pg_temp.e2e_cloud_sync(p_id uuid, p_on boolean)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE auth.users
  SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object('is_syncing_to_cloud', p_on)
  WHERE id = p_id;
$$;

-- One ingredient and one step, as the app saves them
CREATE OR REPLACE FUNCTION pg_temp.e2e_recipe(
  p_id uuid, p_user uuid, p_name text, p_category text, p_ingredient text,
  p_image text DEFAULT '', p_team uuid DEFAULT NULL, p_deleted boolean DEFAULT false
)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO public.recipes (
    id, user_id, name, category, prep_time, servings, difficulty, image,
    ingredients, instructions, team_id, is_deleted
  ) VALUES (
    p_id, p_user, p_name, p_category, '30', '4', 'easy', p_image,
    jsonb_build_array(jsonb_build_object(
      'id', p_id::text || '-i', 'sort_order', 0, 'item', p_ingredient,
      'amount', '1', 'unit', '')),
    jsonb_build_array(jsonb_build_object(
      'id', p_id::text || '-s', 'sort_order', 0, 'text', 'Cook it')),
    p_team, p_deleted
  );
$$;

-- teamhost@ (flows/free/filters.yaml) shares its team's recipes through the
-- cloud, so it has cloud sync on. flows/premium/sync-off.yaml checks the
-- purge keeps such an account's cloud copy.
SELECT pg_temp.e2e_cloud_sync('e2e00000-0000-0000-0000-000000000012', true);

-- flows/premium/turn-on-sync.yaml: premium with cloud sync off, nothing in
-- the cloud yet
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000013', 'upload@e2e.test', 'Upload Cook');
SELECT pg_temp.e2e_cloud_sync('e2e00000-0000-0000-0000-000000000013', false);

-- flows/premium/fresh-install.yaml: cloud sync on, recipes in the cloud, one
-- with a photo (uploaded by seed.sh) and one deleted, which never shows
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000014', 'cloud@e2e.test', 'Cloud Cook');
SELECT pg_temp.e2e_cloud_sync('e2e00000-0000-0000-0000-000000000014', true);
SELECT pg_temp.e2e_recipe('e2ec0000-0000-0000-0000-000000001401', 'e2e00000-0000-0000-0000-000000000014', 'Magenta Soup', 'dinner', 'Beets', 'e2e00000-0000-0000-0000-000000000014/e2ef0700-0000-0000-0000-000000000001.jpg');
SELECT pg_temp.e2e_recipe('e2ec0000-0000-0000-0000-000000001402', 'e2e00000-0000-0000-0000-000000000014', 'Cloud Bread', 'breakfast', 'Flour');
SELECT pg_temp.e2e_recipe('e2ec0000-0000-0000-0000-000000001403', 'e2e00000-0000-0000-0000-000000000014', 'Removed Stew', 'dinner', 'Beans', '', NULL, true);

-- flows/premium/offline.yaml
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000015', 'offline@e2e.test', 'Offline Cook');
SELECT pg_temp.e2e_cloud_sync('e2e00000-0000-0000-0000-000000000015', true);
SELECT pg_temp.e2e_recipe('e2ec0000-0000-0000-0000-000000001501', 'e2e00000-0000-0000-0000-000000000015', 'Magenta Soup', 'dinner', 'Beets', 'e2e00000-0000-0000-0000-000000000015/e2ef0700-0000-0000-0000-000000000001.jpg');
SELECT pg_temp.e2e_recipe('e2ec0000-0000-0000-0000-000000001502', 'e2e00000-0000-0000-0000-000000000015', 'Offline Bread', 'breakfast', 'Flour');

-- flows/premium/sync-off.yaml
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000016', 'syncoff@e2e.test', 'Syncoff Cook');
SELECT pg_temp.e2e_cloud_sync('e2e00000-0000-0000-0000-000000000016', true);
SELECT pg_temp.e2e_recipe('e2ec0000-0000-0000-0000-000000001601', 'e2e00000-0000-0000-0000-000000000016', 'Magenta Soup', 'dinner', 'Beets', 'e2e00000-0000-0000-0000-000000000016/e2ef0700-0000-0000-0000-000000000001.jpg');
SELECT pg_temp.e2e_recipe('e2ec0000-0000-0000-0000-000000001602', 'e2e00000-0000-0000-0000-000000000016', 'Syncoff Bread', 'breakfast', 'Flour');
-- The same flow runs the nightly purge, which must delete the cloud copy of a
-- subscriber whose premium ended over 30 days ago, and keep that of an
-- account with cloud sync off for less than 30 days
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000020', 'lapsed@e2e.test', 'Lapsed Cook');
SELECT pg_temp.e2e_cloud_sync('e2e00000-0000-0000-0000-000000000020', true);
SELECT pg_temp.e2e_recipe('e2ec0000-0000-0000-0000-000000002001', 'e2e00000-0000-0000-0000-000000000020', 'Lapsed Soup', 'dinner', 'Beets');
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000021', 'grace@e2e.test', 'Grace Cook');
SELECT pg_temp.e2e_cloud_sync('e2e00000-0000-0000-0000-000000000021', false);
UPDATE public.cloud_sync_state SET off_since = now() - interval '29 days'
WHERE user_id = 'e2e00000-0000-0000-0000-000000000021';
SELECT pg_temp.e2e_recipe('e2ec0000-0000-0000-0000-000000002101', 'e2e00000-0000-0000-0000-000000000021', 'Grace Soup', 'dinner', 'Beets');

-- flows/premium/edit-delete.yaml
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000017', 'editor@e2e.test', 'Editor Cook');
SELECT pg_temp.e2e_cloud_sync('e2e00000-0000-0000-0000-000000000017', true);
SELECT pg_temp.e2e_recipe('e2ec0000-0000-0000-0000-000000001701', 'e2e00000-0000-0000-0000-000000000017', 'Editor Soup', 'lunch', 'Beets');
SELECT pg_temp.e2e_recipe('e2ec0000-0000-0000-0000-000000001702', 'e2e00000-0000-0000-0000-000000000017', 'Magenta Pie', 'dessert', 'Apples', 'e2e00000-0000-0000-0000-000000000017/e2ef0700-0000-0000-0000-000000000001.jpg');
SELECT pg_temp.e2e_recipe('e2ec0000-0000-0000-0000-000000001703', 'e2e00000-0000-0000-0000-000000000017', 'Editor Bread', 'breakfast', 'Flour');

-- flows/premium/team-purge.yaml: sharer@ hosts a team with teammate@, a free
-- member who sees its recipe until its cloud copy is deleted
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000018', 'sharer@e2e.test', 'Sharer Cook');
SELECT pg_temp.e2e_cloud_sync('e2e00000-0000-0000-0000-000000000018', true);
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000019', 'teammate@e2e.test', 'Teammate Cook');

INSERT INTO public.premium_entitlements (user_id, expires_at) VALUES
  ('e2e00000-0000-0000-0000-000000000013', NULL),
  ('e2e00000-0000-0000-0000-000000000014', NULL),
  ('e2e00000-0000-0000-0000-000000000015', NULL),
  ('e2e00000-0000-0000-0000-000000000016', NULL),
  ('e2e00000-0000-0000-0000-000000000017', NULL),
  ('e2e00000-0000-0000-0000-000000000018', NULL),
  ('e2e00000-0000-0000-0000-000000000020', now() - interval '31 days'),
  ('e2e00000-0000-0000-0000-000000000021', NULL);

INSERT INTO public.teams (id, title, host_id) VALUES
  ('e2e7ea00-0000-0000-0000-000000000018', 'Sharing Team', 'e2e00000-0000-0000-0000-000000000018');
INSERT INTO public.team_members (user_id, team_id) VALUES
  ('e2e00000-0000-0000-0000-000000000019', 'e2e7ea00-0000-0000-0000-000000000018');
SELECT pg_temp.e2e_recipe('e2ec0000-0000-0000-0000-000000001801', 'e2e00000-0000-0000-0000-000000000018', 'Shared Stew', 'dinner', 'Beans', 'e2e00000-0000-0000-0000-000000000018/e2ef0700-0000-0000-0000-000000000001.jpg', 'e2e7ea00-0000-0000-0000-000000000018');

-- Team flows (flows/team/*.yaml). Premium accounts are premium in the database
-- from premium_entitlements below, and each flow that logs one in on the device
-- gives it lifetime premium in RevenueCat first. Accounts a flow only drives
-- through the host probe (as-user.js) never log in on the device.

SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000022', 'creator@e2e.test', 'Creator Cook');  -- team/create-team.yaml
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000023', 'joinhost@e2e.test', 'Join Host');  -- team/join-team.yaml
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000024', 'joiner@e2e.test', 'Joiner Cook');  -- team/join-team.yaml
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000025', 'otherhost@e2e.test', 'Other Host');  -- team/join-team.yaml
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000026', 'sharehost@e2e.test', 'Share Host');  -- team/shared-recipes.yaml
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000027', 'viewer@e2e.test', 'Share Viewer');  -- team/shared-recipes.yaml
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000028', 'sharemate@e2e.test', 'Share Mate');  -- team/shared-recipes.yaml
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000029', 'latejoin@e2e.test', 'Late Joiner');  -- team/shared-recipes.yaml
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000030', 'rehost@e2e.test', 'Reinstall Host');  -- team/reinstall.yaml
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000031', 'remember@e2e.test', 'Reinstall Member');  -- team/reinstall.yaml
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000032', 'leavehost@e2e.test', 'Leave Host');  -- team/member-leaves.yaml
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000033', 'leaver@e2e.test', 'Leaver Cook');  -- team/member-leaves.yaml
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000034', 'stayer@e2e.test', 'Stayer Cook');  -- team/member-leaves.yaml
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000035', 'quitter@e2e.test', 'Quitter Cook');  -- team/member-leaves.yaml
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000036', 'movehost@e2e.test', 'Transfer Host');  -- team/host-leaves.yaml
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000037', 'oldlapsed@e2e.test', 'Lapsed Member');  -- team/host-leaves.yaml
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000038', 'earlyfree@e2e.test', 'Early Free');  -- team/host-leaves.yaml
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000039', 'firstprem@e2e.test', 'First Premium');  -- team/host-leaves.yaml
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000040', 'secondprem@e2e.test', 'Second Premium');  -- team/host-leaves.yaml
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000041', 'delhost@e2e.test', 'Delete Host');  -- team/host-leaves.yaml
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000042', 'heir@e2e.test', 'Heir Cook');  -- team/host-leaves.yaml
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000043', 'lateheir@e2e.test', 'Late Heir');  -- team/host-leaves.yaml
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000044', 'solohost@e2e.test', 'Solo Host');  -- team/team-deleted.yaml
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000045', 'solofree@e2e.test', 'Free Member');  -- team/team-deleted.yaml
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000046', 'soloexpired@e2e.test', 'Expired Member');  -- team/team-deleted.yaml
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000047', 'rmhost@e2e.test', 'Remove Host');  -- team/remove-member.yaml
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000048', 'removed@e2e.test', 'Removed Cook');  -- team/remove-member.yaml
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000049', 'kept@e2e.test', 'Kept Cook');  -- team/remove-member.yaml
SELECT pg_temp.e2e_user('e2e00000-0000-0000-0000-000000000050', 'kicked@e2e.test', 'Kicked Cook');  -- team/remove-member.yaml

SELECT pg_temp.e2e_cloud_sync('e2e00000-0000-0000-0000-000000000022', true);
SELECT pg_temp.e2e_cloud_sync('e2e00000-0000-0000-0000-000000000023', true);
SELECT pg_temp.e2e_cloud_sync('e2e00000-0000-0000-0000-000000000026', true);
SELECT pg_temp.e2e_cloud_sync('e2e00000-0000-0000-0000-000000000028', true);
SELECT pg_temp.e2e_cloud_sync('e2e00000-0000-0000-0000-000000000030', true);
SELECT pg_temp.e2e_cloud_sync('e2e00000-0000-0000-0000-000000000031', true);
SELECT pg_temp.e2e_cloud_sync('e2e00000-0000-0000-0000-000000000032', true);
SELECT pg_temp.e2e_cloud_sync('e2e00000-0000-0000-0000-000000000033', true);
SELECT pg_temp.e2e_cloud_sync('e2e00000-0000-0000-0000-000000000035', true);
SELECT pg_temp.e2e_cloud_sync('e2e00000-0000-0000-0000-000000000036', true);
SELECT pg_temp.e2e_cloud_sync('e2e00000-0000-0000-0000-000000000039', true);
SELECT pg_temp.e2e_cloud_sync('e2e00000-0000-0000-0000-000000000044', true);
SELECT pg_temp.e2e_cloud_sync('e2e00000-0000-0000-0000-000000000047', true);

-- Premium has no expiry. Expired = ended 10 days ago, a lapsed subscriber who
-- still counts as a member but is not premium (less than 30 days, so the
-- nightly purge of cloud copies leaves it alone).
INSERT INTO public.premium_entitlements (user_id, expires_at) VALUES
  ('e2e00000-0000-0000-0000-000000000022', NULL),
  ('e2e00000-0000-0000-0000-000000000023', NULL),
  ('e2e00000-0000-0000-0000-000000000025', NULL),
  ('e2e00000-0000-0000-0000-000000000026', NULL),
  ('e2e00000-0000-0000-0000-000000000028', NULL),
  ('e2e00000-0000-0000-0000-000000000030', NULL),
  ('e2e00000-0000-0000-0000-000000000031', NULL),
  ('e2e00000-0000-0000-0000-000000000032', NULL),
  ('e2e00000-0000-0000-0000-000000000033', NULL),
  ('e2e00000-0000-0000-0000-000000000035', NULL),
  ('e2e00000-0000-0000-0000-000000000036', NULL),
  ('e2e00000-0000-0000-0000-000000000039', NULL),
  ('e2e00000-0000-0000-0000-000000000040', NULL),
  ('e2e00000-0000-0000-0000-000000000041', NULL),
  ('e2e00000-0000-0000-0000-000000000042', NULL),
  ('e2e00000-0000-0000-0000-000000000043', NULL),
  ('e2e00000-0000-0000-0000-000000000044', NULL),
  ('e2e00000-0000-0000-0000-000000000047', NULL),
  ('e2e00000-0000-0000-0000-000000000037', now() - interval '10 days'),
  ('e2e00000-0000-0000-0000-000000000046', now() - interval '10 days');

-- Teams. The host must be premium first (enforce_premium_host).
INSERT INTO public.teams (id, title, host_id) VALUES
  ('e2e7ea00-0000-0000-0000-000000000023', 'Join Team', 'e2e00000-0000-0000-0000-000000000023'),
  ('e2e7ea00-0000-0000-0000-000000000025', 'Other Team', 'e2e00000-0000-0000-0000-000000000025'),
  ('e2e7ea00-0000-0000-0000-000000000026', 'Share Team', 'e2e00000-0000-0000-0000-000000000026'),
  ('e2e7ea00-0000-0000-0000-000000000030', 'Reinstall Team', 'e2e00000-0000-0000-0000-000000000030'),
  ('e2e7ea00-0000-0000-0000-000000000032', 'Leave Team', 'e2e00000-0000-0000-0000-000000000032'),
  ('e2e7ea00-0000-0000-0000-000000000036', 'Transfer Team', 'e2e00000-0000-0000-0000-000000000036'),
  ('e2e7ea00-0000-0000-0000-000000000041', 'Heir Team', 'e2e00000-0000-0000-0000-000000000041'),
  ('e2e7ea00-0000-0000-0000-000000000044', 'Solo Team', 'e2e00000-0000-0000-0000-000000000044'),
  ('e2e7ea00-0000-0000-0000-000000000047', 'Remove Team', 'e2e00000-0000-0000-0000-000000000047');

-- Members, with joined_at set where the order matters (the oldest premium
-- member takes over a host's team, flows/team/host-leaves.yaml)
INSERT INTO public.team_members (user_id, team_id, joined_at) VALUES
  ('e2e00000-0000-0000-0000-000000000027', 'e2e7ea00-0000-0000-0000-000000000026', now() - interval '3 days'),
  ('e2e00000-0000-0000-0000-000000000028', 'e2e7ea00-0000-0000-0000-000000000026', now() - interval '2 days'),
  ('e2e00000-0000-0000-0000-000000000031', 'e2e7ea00-0000-0000-0000-000000000030', now() - interval '1 days'),
  ('e2e00000-0000-0000-0000-000000000033', 'e2e7ea00-0000-0000-0000-000000000032', now() - interval '5 days'),
  ('e2e00000-0000-0000-0000-000000000034', 'e2e7ea00-0000-0000-0000-000000000032', now() - interval '4 days'),
  ('e2e00000-0000-0000-0000-000000000035', 'e2e7ea00-0000-0000-0000-000000000032', now() - interval '3 days'),
  ('e2e00000-0000-0000-0000-000000000037', 'e2e7ea00-0000-0000-0000-000000000036', now() - interval '4 days'),
  ('e2e00000-0000-0000-0000-000000000038', 'e2e7ea00-0000-0000-0000-000000000036', now() - interval '3 days'),
  ('e2e00000-0000-0000-0000-000000000039', 'e2e7ea00-0000-0000-0000-000000000036', now() - interval '2 days'),
  ('e2e00000-0000-0000-0000-000000000040', 'e2e7ea00-0000-0000-0000-000000000036', now() - interval '1 days'),
  ('e2e00000-0000-0000-0000-000000000042', 'e2e7ea00-0000-0000-0000-000000000041', now() - interval '2 days'),
  ('e2e00000-0000-0000-0000-000000000043', 'e2e7ea00-0000-0000-0000-000000000041', now() - interval '1 days'),
  ('e2e00000-0000-0000-0000-000000000045', 'e2e7ea00-0000-0000-0000-000000000044', now() - interval '3 days'),
  ('e2e00000-0000-0000-0000-000000000046', 'e2e7ea00-0000-0000-0000-000000000044', now() - interval '2 days'),
  ('e2e00000-0000-0000-0000-000000000048', 'e2e7ea00-0000-0000-0000-000000000047', now() - interval '3 days'),
  ('e2e00000-0000-0000-0000-000000000049', 'e2e7ea00-0000-0000-0000-000000000047', now() - interval '2 days'),
  ('e2e00000-0000-0000-0000-000000000050', 'e2e7ea00-0000-0000-0000-000000000047', now() - interval '1 days');

-- Shared recipes carry their team's id, like Shared Stew. Host Pie's magenta
-- photo is uploaded by seed.sh.
SELECT pg_temp.e2e_recipe('e2ec0000-0000-0000-0000-000000002301', 'e2e00000-0000-0000-0000-000000000023', 'Welcome Soup', 'dinner', 'Beets', '', 'e2e7ea00-0000-0000-0000-000000000023');
SELECT pg_temp.e2e_recipe('e2ec0000-0000-0000-0000-000000002601', 'e2e00000-0000-0000-0000-000000000026', 'Host Pie', 'dessert', 'Apples', 'e2e00000-0000-0000-0000-000000000026/e2ef0700-0000-0000-0000-000000000001.jpg', 'e2e7ea00-0000-0000-0000-000000000026');
SELECT pg_temp.e2e_recipe('e2ec0000-0000-0000-0000-000000002602', 'e2e00000-0000-0000-0000-000000000026', 'Host Soup', 'dinner', 'Beans', '', 'e2e7ea00-0000-0000-0000-000000000026');
SELECT pg_temp.e2e_recipe('e2ec0000-0000-0000-0000-000000002603', 'e2e00000-0000-0000-0000-000000000026', 'Host Bread', 'breakfast', 'Flour', '', 'e2e7ea00-0000-0000-0000-000000000026');
SELECT pg_temp.e2e_recipe('e2ec0000-0000-0000-0000-000000002801', 'e2e00000-0000-0000-0000-000000000028', 'Mate Curry', 'dinner', 'Rice', '', 'e2e7ea00-0000-0000-0000-000000000026');
SELECT pg_temp.e2e_recipe('e2ec0000-0000-0000-0000-000000003001', 'e2e00000-0000-0000-0000-000000000030', 'Host Lasagna', 'dinner', 'Pasta', '', 'e2e7ea00-0000-0000-0000-000000000030');
SELECT pg_temp.e2e_recipe('e2ec0000-0000-0000-0000-000000003101', 'e2e00000-0000-0000-0000-000000000031', 'Member Tacos', 'lunch', 'Corn', '', 'e2e7ea00-0000-0000-0000-000000000030');
SELECT pg_temp.e2e_recipe('e2ec0000-0000-0000-0000-000000003201', 'e2e00000-0000-0000-0000-000000000032', 'Host Stew', 'dinner', 'Beans', '', 'e2e7ea00-0000-0000-0000-000000000032');
SELECT pg_temp.e2e_recipe('e2ec0000-0000-0000-0000-000000003301', 'e2e00000-0000-0000-0000-000000000033', 'Leaver Curry', 'dinner', 'Rice', '', 'e2e7ea00-0000-0000-0000-000000000032');
SELECT pg_temp.e2e_recipe('e2ec0000-0000-0000-0000-000000003501', 'e2e00000-0000-0000-0000-000000000035', 'Quitter Pasta', 'dinner', 'Pasta', '', 'e2e7ea00-0000-0000-0000-000000000032');
SELECT pg_temp.e2e_recipe('e2ec0000-0000-0000-0000-000000003601', 'e2e00000-0000-0000-0000-000000000036', 'Old Host Soup', 'dinner', 'Beets', '', 'e2e7ea00-0000-0000-0000-000000000036');
SELECT pg_temp.e2e_recipe('e2ec0000-0000-0000-0000-000000003901', 'e2e00000-0000-0000-0000-000000000039', 'First Pie', 'dessert', 'Apples', '', 'e2e7ea00-0000-0000-0000-000000000036');
SELECT pg_temp.e2e_recipe('e2ec0000-0000-0000-0000-000000004401', 'e2e00000-0000-0000-0000-000000000044', 'Solo Pie', 'dessert', 'Apples', '', 'e2e7ea00-0000-0000-0000-000000000044');
SELECT pg_temp.e2e_recipe('e2ec0000-0000-0000-0000-000000004701', 'e2e00000-0000-0000-0000-000000000047', 'Remove Host Pie', 'dessert', 'Apples', '', 'e2e7ea00-0000-0000-0000-000000000047');

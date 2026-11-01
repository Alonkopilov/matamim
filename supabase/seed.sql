-- create local users (insiders)
INSERT INTO auth.users ( instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token) 
VALUES 
  ('00000000-0000-0000-0000-000000000000', uuid_generate_v4(), 'authenticated', 'authenticated', 'alon@kopilov.me', crypt('12345678', gen_salt('bf')), current_timestamp, current_timestamp, current_timestamp, '{"provider":"email","providers":["email"]}', '{}', current_timestamp, current_timestamp, '', '', '', '');


-- test user email identity
INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
VALUES 
  (uuid_generate_v4(), (SELECT id FROM auth.users WHERE email = 'alon@kopilov.me'), format('{"sub":"%s","email":"%s"}', (SELECT id FROM auth.users WHERE email = 'alon@kopilov.me')::text, 'alon@kopilov.me')::jsonb, 'email', uuid_generate_v4(), current_timestamp, current_timestamp, current_timestamp);

-- Lifetime premium, or the team below is refused with TEAM_PREMIUM_REQUIRED
INSERT INTO public.premium_entitlements (user_id, expires_at)
VALUES ((SELECT id FROM auth.users WHERE email = 'alon@kopilov.me'), NULL);

-- 3. Create your default test data in public tables
INSERT INTO public.teams (id, title, host_id)
VALUES (
  '11111111-1111-1111-1111-111111111111', 
  'המתכונים המשפחתיים של אלון (Seed)', 
  (SELECT id FROM auth.users WHERE email = 'alon@kopilov.me')
) ON CONFLICT (id) DO NOTHING;
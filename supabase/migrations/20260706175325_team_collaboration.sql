-- 1. Create a public profiles lookup table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  username TEXT
);

-- 2. Open up permissions for authenticated users to view profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.profiles TO authenticated;
CREATE POLICY "Allow authenticated users to view profiles" ON public.profiles
  FOR SELECT TO authenticated USING (true);

-- 3. Automate the synchronization from auth.users via a trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user_signup()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, username)
  VALUES (
    NEW.id, 
    NEW.email, 
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      NEW.raw_user_meta_data->>'username', 
      split_part(NEW.email, '@', 1)
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Attach the bouncer to auth.users
DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_signup();

ALTER TABLE public.team_members
ADD CONSTRAINT fk_team_members_profiles
FOREIGN KEY (user_id) 
REFERENCES public.profiles(id)
ON DELETE CASCADE;

-- 1. Enable RLS on both tables
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- 2. Drop all previous experimental policies to clear the slate
DROP POLICY IF EXISTS "Allow authenticated users to create a team" ON public.teams;
DROP POLICY IF EXISTS "Allow authenticated users to view teams" ON public.teams;
DROP POLICY IF EXISTS "Hosts can delete/disband their team" ON public.teams;
DROP POLICY IF EXISTS "Hosts can update their team metadata" ON public.teams;
DROP POLICY IF EXISTS "Members can remove themselves" ON public.team_members;
DROP POLICY IF EXISTS "Members can view membership layout" ON public.team_members;

-- 3. Only allow users to VIEW their data via the Client API.
-- (Inserts, Updates, and Deletes are completely blocked from the client side!)
CREATE POLICY "Strict read-only teams" ON public.teams
  FOR SELECT TO authenticated USING (host_id = auth.uid());

CREATE POLICY "Strict read-only members" ON public.team_members
  FOR SELECT TO authenticated USING (
    user_id = auth.uid() OR 
    team_id IN (SELECT id FROM public.teams WHERE host_id = auth.uid())
  );

-- 1. Grant overall usage access on the public schema to the service_role
GRANT USAGE ON SCHEMA public TO service_role;

-- 2. Grant all access privileges specifically for the team_invites table
GRANT ALL PRIVILEGES ON TABLE public.team_invites TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.profiles TO service_role;

ALTER TABLE public.teams
ADD CONSTRAINT fk_teams_host_id
FOREIGN KEY (host_id) 
REFERENCES public.profiles(id)
ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.handle_auth_user_updated()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.profiles
  SET 
    email = NEW.email,
    username = COALESCE(NEW.raw_user_meta_data->>'display_name', username)
  WHERE id = NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE OF email, raw_user_meta_data ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_auth_user_updated();
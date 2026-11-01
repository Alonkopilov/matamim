-- =========================================================================
-- 1. BASELINE CONFIGURATION & EXTENSIONS
-- =========================================================================
-- Ensure UUID generation is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =========================================================================
-- 2. PREMIUM MOCK INTEGRATION
-- =========================================================================
-- Rule 9 & 13: This function mimics checking if a user is premium.
-- REPLACE THE BODY OF THIS FUNCTION with your actual premium lookup logic later.
CREATE OR REPLACE FUNCTION public.is_user_premium(target_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Temporary placeholder: returns true for all users so development doesn't block.
  -- Replace this with: RETURN EXISTS(SELECT 1 FROM purchases WHERE user_id = target_user_id AND status = 'active');
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- 3. SCHEMA CREATION (TEAMS & INVITES)
-- =========================================================================

-- Create the main Teams table (Rule 11)
CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  -- Rule 1: A team can only have one host.
  -- Rule 3: A user cannot host more than one team globally.
  host_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  
  CONSTRAINT unique_host UNIQUE (host_id)
);

-- Create a junction/profile tracking table to manage membership safely
-- Rule 2 & 4: An account can only be a member OR a host.
CREATE TABLE public.team_members (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5-Digit Temporary Invites Table (Rule 14)
CREATE TABLE public.team_invites (
  code VARCHAR(5) PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc'::text, now()) + INTERVAL '5 minutes'),
  
  CONSTRAINT chk_code_length CHECK (length(code) = 5)
);

-- =========================================================================
-- 4. EVOLVING THE EXISTING RECIPES TABLE
-- =========================================================================
-- Add the team reference relation column to allow structural visibility (Rule 7)
ALTER TABLE public.recipes 
ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;

-- Add a column to store the owner's display name or name string cached for easy local reading (Rule 15)
ALTER TABLE public.recipes 
ADD COLUMN IF NOT EXISTS owner_name TEXT DEFAULT 'שף אנונימי' NOT NULL;

-- =========================================================================
-- 5. BUSINESS RULES ENFORCEMENT & AUTOMATION (TRIGGERS)
-- =========================================================================

-- Rule 9 & 12: Validate that ONLY premium users can create/host a team
CREATE OR REPLACE FUNCTION public.enforce_premium_host()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT public.is_user_premium(NEW.host_id) THEN
    RAISE EXCEPTION 'רק משתמשי פרימיום יכולים ליצור או לנהל צוות.';
  END IF;
  
  -- Rule 2 & 3: Ensure the host isn't already a member of another team
  IF EXISTS (SELECT 1 FROM public.team_members WHERE user_id = NEW.host_id) THEN
    RAISE EXCEPTION 'משתמש לא יכול להיות גם מנהל וגם חבר בצוות אחר בו זמנית.';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_premium_host
  BEFORE INSERT OR UPDATE ON public.teams
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_premium_host();


-- Rule 2 & 3: Ensure a member joining a team does not already host a team
CREATE OR REPLACE FUNCTION public.enforce_member_constraints()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.teams WHERE host_id = NEW.user_id) THEN
    RAISE EXCEPTION 'מנהל צוות אינו יכול להצטרף כחבר לצוות אחר.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_member_constraints
  BEFORE INSERT OR UPDATE ON public.team_members
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_member_constraints();

-- =========================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- =========================================================================
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

-- === TEAMS POLICIES ===
CREATE POLICY "Users can see teams they belong to" ON public.teams
  FOR SELECT TO authenticated
  USING (host_id = auth.uid() OR id = (SELECT team_id FROM public.team_members WHERE user_id = auth.uid()));

CREATE POLICY "Hosts can update their team metadata" ON public.teams
  FOR UPDATE TO authenticated
  USING (host_id = auth.uid());

CREATE POLICY "Hosts can delete/disband their team" ON public.teams
  FOR DELETE TO authenticated
  USING (host_id = auth.uid());

-- === MEMBERS POLICIES ===
CREATE POLICY "Members can view membership layout" ON public.team_members
  FOR SELECT TO authenticated
  USING (team_id = (SELECT id FROM public.teams WHERE host_id = auth.uid()) OR team_id = (SELECT team_id FROM public.team_members WHERE user_id = auth.uid()));

CREATE POLICY "Members can remove themselves" ON public.team_members
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR team_id = (SELECT id FROM public.teams WHERE host_id = auth.uid()));

-- === RECIPES POLICIES ===
-- Rule 7 & 8: View everything shared, but only edit your own rows.
CREATE POLICY "Read access for owner and team members" ON public.recipes
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() OR
    team_id = (SELECT team_id FROM public.team_members WHERE user_id = auth.uid()) OR
    team_id = (SELECT id FROM public.teams WHERE host_id = auth.uid())
  );

CREATE POLICY "Write access strictly locked to creator" ON public.recipes
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
GRANT ALL PRIVILEGES ON TABLE public.teams TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.teams TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.team_members TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.team_members TO service_role;

DROP POLICY IF EXISTS "Only premium accounts can create teams" ON public.teams;
DROP POLICY IF EXISTS "Users can see teams they belong to" ON public.teams;
DROP POLICY IF EXISTS "Members can view membership layout" ON public.team_members;

CREATE POLICY "Allow authenticated users to create a team" ON public.teams
  FOR INSERT TO authenticated
  WITH CHECK (host_id = auth.uid());

CREATE POLICY "Allow authenticated users to view teams" ON public.teams
  FOR SELECT TO authenticated
  USING (host_id = auth.uid());

CREATE POLICY "Members can view membership layout" ON public.team_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
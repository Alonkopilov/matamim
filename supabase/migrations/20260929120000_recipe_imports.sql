-- =========================================================================
-- Cache for the import-recipe edge function. Each normalized URL is processed
-- once (by its JSON-LD or by the AI model) and later imports of the same page
-- are served from here, so they cost nothing.
-- =========================================================================

CREATE TABLE public.recipe_imports (
  url TEXT PRIMARY KEY,
  -- 'json_ld' or 'ai' when a recipe was found, 'none' when the page has none
  source TEXT NOT NULL CHECK (source IN ('json_ld', 'ai', 'none')),
  -- Same shape as the matching columns of public.recipes
  name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  prep_time TEXT NOT NULL DEFAULT '',
  difficulty TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  servings TEXT NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  ingredients JSONB NOT NULL DEFAULT '[]',
  instructions JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Set for 'none' results so a page that gains a recipe is retried later.
  -- NULL means the result never expires.
  expires_at TIMESTAMPTZ
);

-- No policies: only the edge function (service role) reads or writes it
ALTER TABLE public.recipe_imports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.recipe_imports FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.recipe_imports TO service_role;

-- =========================================================================
-- One row per AI import request, to watch failure rates, cost and speed.
-- Facts about the import only: never the link, the photos, the transcript
-- or the recipe. import-recipe (service role) writes it after answering.
-- =========================================================================

CREATE TABLE public.ai_import_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Deleted with the account
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  premium BOOLEAN,
  -- NULL when the request was turned away before its body was read (no free
  -- imports left, too many requests)
  kind TEXT CHECK (kind IN ('url', 'images')),
  -- 'success' or the error code the app got, e.g. IMAGE_NOT_RECIPE
  outcome TEXT NOT NULL,
  -- Set when the model declined for safety, e.g. general_harms
  refusal_category TEXT,
  -- Link imports: what the model read (ai_json_ld / ai_page), and whether
  -- the recipe came from the cache without a model call
  source TEXT,
  cached BOOLEAN,
  photo_count SMALLINT,
  model TEXT,
  input_tokens INT,
  output_tokens INT,
  cost_usd NUMERIC(10, 6),
  duration_ms INT NOT NULL,
  -- The recipe the user got
  ingredients SMALLINT,
  steps SMALLINT,
  -- Words marked "(?)", ones the model couldn't read for sure
  unsure_words SMALLINT,
  -- Ingredients and steps removed because they weren't in the source
  dropped_by_check SMALLINT
);

CREATE INDEX ai_import_events_created_at_idx ON public.ai_import_events (created_at);
CREATE INDEX ai_import_events_user_id_idx ON public.ai_import_events (user_id, created_at);

-- No policies: only the service role and the dashboard read it
ALTER TABLE public.ai_import_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_import_events FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.ai_import_events TO service_role;

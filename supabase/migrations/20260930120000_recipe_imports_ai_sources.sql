-- Every import now goes through the AI model, reading the page's schema.org
-- data when it has one ('ai_json_ld') or its text otherwise ('ai_page').
-- Results cached by the old JSON-LD parser were often incomplete, and the
-- rest came from an older prompt, so the cache starts over.
DELETE FROM public.recipe_imports;

ALTER TABLE public.recipe_imports
  DROP CONSTRAINT recipe_imports_source_check,
  ADD CONSTRAINT recipe_imports_source_check
    CHECK (source IN ('ai_json_ld', 'ai_page', 'none'));

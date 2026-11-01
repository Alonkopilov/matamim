-- Share to Matamim: a TikTok, Instagram or YouTube link is read from the
-- post's caption ('ai_caption'), and the user can share a recipe's text.
-- Shared text is never cached, but its imports are counted in the events.

ALTER TABLE public.recipe_imports
  DROP CONSTRAINT recipe_imports_source_check,
  ADD CONSTRAINT recipe_imports_source_check
    CHECK (source IN ('ai_json_ld', 'ai_page', 'ai_caption', 'none'));

ALTER TABLE public.ai_import_events
  DROP CONSTRAINT ai_import_events_kind_check,
  ADD CONSTRAINT ai_import_events_kind_check
    CHECK (kind IN ('url', 'images', 'text'));

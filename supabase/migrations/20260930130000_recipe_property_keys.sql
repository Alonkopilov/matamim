-- =========================================================================
-- Meal and difficulty are saved as keys (breakfast, easy, ...) and the app
-- shows them in the user's language. Rewrites the Hebrew values saved before
-- that. Updating a recipe bumps its updated_at (handle_times), so synced
-- devices download the new values.
-- Values that match no key, free text typed before there were pickers, are
-- left as they are.
-- =========================================================================

CREATE FUNCTION pg_temp.meal_key(value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE btrim(value)
    WHEN 'בוקר' THEN 'breakfast'
    WHEN 'ארוחת בוקר' THEN 'breakfast'
    WHEN 'צהריים' THEN 'lunch'
    WHEN 'ארוחת צהריים' THEN 'lunch'
    WHEN 'ערב' THEN 'dinner'
    WHEN 'ארוחת ערב' THEN 'dinner'
    WHEN 'קינוח' THEN 'dessert'
    WHEN 'קינוחים' THEN 'dessert'
  END;
$$;

CREATE FUNCTION pg_temp.difficulty_key(value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE btrim(value)
    WHEN 'קל' THEN 'easy'
    WHEN 'קלה' THEN 'easy'
    WHEN 'בינוני' THEN 'medium'
    WHEN 'בינונית' THEN 'medium'
    WHEN 'קשה' THEN 'hard'
  END;
$$;

UPDATE public.recipes
SET
  category = COALESCE(pg_temp.meal_key(category), category),
  difficulty = COALESCE(pg_temp.difficulty_key(difficulty), difficulty)
WHERE
  pg_temp.meal_key(category) IS NOT NULL OR
  pg_temp.difficulty_key(difficulty) IS NOT NULL;

-- Cached imports are returned as they are, so they need the keys too
UPDATE public.recipe_imports
SET
  category = COALESCE(pg_temp.meal_key(category), category),
  difficulty = COALESCE(pg_temp.difficulty_key(difficulty), difficulty)
WHERE
  pg_temp.meal_key(category) IS NOT NULL OR
  pg_temp.difficulty_key(difficulty) IS NOT NULL;

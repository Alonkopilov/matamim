-- Store listing seed: two families for the Play Store screenshots, one in
-- Hebrew and one in English. Loaded by scripts/store/seed.sh into the LOCAL
-- database, on top of whatever is there, and safe to load again: it first
-- removes everything it added before.
--
-- Each family is a premium host with a team of three premium members, all
-- with cloud sync on, so the host's app downloads the whole family's recipes.
-- Ids match the probe's seeded-account pattern, so seed.sh can give the hosts
-- premium in RevenueCat (Test Store). Photos are uploaded by seed.sh, to
-- <user id>/<photo>.jpg. All accounts use the e2e password, e2e-password-1.

-- Leftovers of an earlier load. Recipes and members first: deleting a user
-- cascades to them, and the team triggers refuse some of those orders.
DELETE FROM public.recipes WHERE user_id IN (
  SELECT id FROM auth.users WHERE id::text ~ '^e2e00000-0000-0000-0000-0000000(007|008)'
);
DELETE FROM public.team_members WHERE user_id IN (
  SELECT id FROM auth.users WHERE id::text ~ '^e2e00000-0000-0000-0000-0000000(007|008)'
);
DELETE FROM public.teams WHERE host_id IN (
  SELECT id FROM auth.users WHERE id::text ~ '^e2e00000-0000-0000-0000-0000000(007|008)'
);
DELETE FROM auth.users WHERE id::text ~ '^e2e00000-0000-0000-0000-0000000(007|008)';

-- A premium account with cloud sync on, as the app and sync-premium leave it
CREATE OR REPLACE FUNCTION pg_temp.store_user(p_id uuid, p_email text, p_name text)
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
    jsonb_build_object('display_name', p_name, 'is_syncing_to_cloud', true),
    now(), now(), '', '', '', ''
  );
  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at,
    created_at, updated_at
  ) VALUES (
    gen_random_uuid(), p_id,
    jsonb_build_object('sub', p_id::text, 'email', p_email), 'email',
    p_id::text, now(), now(), now()
  );
  INSERT INTO public.premium_entitlements (user_id, expires_at) VALUES (p_id, NULL);
$$;

-- Ingredients are [amount, unit, item] and instructions plain strings, in
-- order. p_age_days spreads the recipes over the past weeks.
CREATE OR REPLACE FUNCTION pg_temp.store_recipe(
  p_id uuid, p_user uuid, p_team uuid, p_photo text, p_age_days int,
  p_name text, p_description text, p_category text, p_prep_time text,
  p_servings text, p_difficulty text, p_ingredients jsonb, p_instructions jsonb
)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO public.recipes (
    id, user_id, team_id, name, description, image, category, prep_time,
    servings, difficulty, ingredients, instructions
  ) VALUES (
    p_id, p_user, p_team, p_name, p_description,
    p_user::text || '/' || p_photo || '.jpg', p_category, p_prep_time,
    p_servings, p_difficulty,
    (SELECT jsonb_agg(jsonb_build_object(
        'id', p_id::text || '-i' || n, 'sort_order', n - 1,
        'amount', i->>0, 'unit', i->>1, 'item', i->>2) ORDER BY n)
     FROM jsonb_array_elements(p_ingredients) WITH ORDINALITY AS t(i, n)),
    (SELECT jsonb_agg(jsonb_build_object(
        'id', p_id::text || '-s' || n, 'sort_order', n - 1,
        'text', s #>> '{}') ORDER BY n)
     FROM jsonb_array_elements(p_instructions) WITH ORDINALITY AS t(s, n))
  );
  -- handle_times sets both to now() on insert, and keeps created_at on update
  ALTER TABLE public.recipes DISABLE TRIGGER handle_times;
  UPDATE public.recipes
  SET created_at = now() - make_interval(days => p_age_days, hours => p_age_days * 3),
      updated_at = now() - make_interval(days => p_age_days, hours => p_age_days * 3)
  WHERE id = p_id;
  ALTER TABLE public.recipes ENABLE TRIGGER handle_times;
$$;

-- =========================================================================
-- Hebrew: משפחת כהן. Log in as noa.cohen@example.com.
-- =========================================================================
SELECT pg_temp.store_user('e2e00000-0000-0000-0000-000000000701', 'noa.cohen@example.com', 'נועה כהן');
SELECT pg_temp.store_user('e2e00000-0000-0000-0000-000000000702', 'rachel.cohen@example.com', 'סבתא רחל');
SELECT pg_temp.store_user('e2e00000-0000-0000-0000-000000000703', 'itai.cohen@example.com', 'איתי כהן');
SELECT pg_temp.store_user('e2e00000-0000-0000-0000-000000000704', 'maya.cohen@example.com', 'מאיה כהן');

INSERT INTO public.teams (id, title, host_id) VALUES
  ('e2e7ea00-0000-0000-0000-000000000701', 'המטבח של משפחת כהן', 'e2e00000-0000-0000-0000-000000000701');
INSERT INTO public.team_members (user_id, team_id) VALUES
  ('e2e00000-0000-0000-0000-000000000702', 'e2e7ea00-0000-0000-0000-000000000701'),
  ('e2e00000-0000-0000-0000-000000000703', 'e2e7ea00-0000-0000-0000-000000000701'),
  ('e2e00000-0000-0000-0000-000000000704', 'e2e7ea00-0000-0000-0000-000000000701');

-- נועה
SELECT pg_temp.store_recipe('e2ec0000-0000-0000-0000-000000070001', 'e2e00000-0000-0000-0000-000000000701', 'e2e7ea00-0000-0000-0000-000000000701', 'shakshuka', 0,
  'שקשוקה ביתית', 'ביצים ברוטב עגבניות פיקנטי, עם הרבה לחם לניגוב.', 'breakfast', '25', '4', 'easy',
  '[["2","כפות","שמן זית"],["1","","בצל קצוץ"],["1","","פלפל אדום חתוך לרצועות"],["3","שיני","שום פרוסות"],["6","","עגבניות בשלות קצוצות"],["2","כפות","רסק עגבניות"],["1","כפית","פפריקה מתוקה"],["1","כפית","כמון"],["1/2","כפית","צ׳ילי גרוס"],["6","","ביצים"],["","","מלח ופלפל שחור"],["1/2","צרור","פטרוזיליה קצוצה"]]',
  '["מחממים שמן זית במחבת רחבה ומטגנים את הבצל והפלפל עד שהם מתרככים, כ־8 דקות.","מוסיפים את השום והתבלינים ומערבבים דקה עד שעולה ריח.","מוסיפים את העגבניות ואת הרסק, ומבשלים על אש בינונית כ־10 דקות עד שהרוטב מסמיך. מתבלים במלח ופלפל.","עושים שש גומות ברוטב ושוברים ביצה לתוך כל אחת.","מכסים ומבשלים על אש נמוכה 5–7 דקות, עד שהחלבון מתייצב והחלמון עדיין רך.","מפזרים פטרוזיליה ומגישים מיד, ישר מהמחבת."]');

SELECT pg_temp.store_recipe('e2ec0000-0000-0000-0000-000000070002', 'e2e00000-0000-0000-0000-000000000701', 'e2e7ea00-0000-0000-0000-000000000701', 'israeli-salad', 2,
  'סלט ישראלי קצוץ דק', 'הסלט שעל השולחן בכל ארוחה. הסוד הוא לקצוץ הכי דק שאפשר.', 'lunch', '15', '4', 'easy',
  '[["4","","עגבניות"],["4","","מלפפונים"],["1","","בצל סגול קטן"],["1/2","צרור","פטרוזיליה"],["3","כפות","שמן זית"],["1","","לימון, סחוט"],["","","מלח ופלפל"]]',
  '["קוצצים את העגבניות, המלפפונים והבצל לקוביות קטנות ואחידות.","קוצצים דק את הפטרוזיליה ומוסיפים לקערה.","ממש לפני ההגשה מתבלים בשמן זית, מיץ לימון, מלח ופלפל ומערבבים."]');

SELECT pg_temp.store_recipe('e2ec0000-0000-0000-0000-000000070003', 'e2e00000-0000-0000-0000-000000000701', 'e2e7ea00-0000-0000-0000-000000000701', 'sabich', 5,
  'סביח', 'פיתה עם חציל מטוגן, ביצה קשה, טחינה ועמבה. ארוחת צהריים של שבת.', 'lunch', '40', '4', 'medium',
  '[["2","","חצילים גדולים"],["4","","ביצים"],["4","","פיתות"],["1/2","כוס","טחינה גולמית"],["2","כפות","עמבה"],["1","כוס","סלט ישראלי קצוץ"],["","","מלח ושמן לטיגון"]]',
  '["פורסים את החצילים לפרוסות בעובי סנטימטר, ממליחים ומניחים לחצי שעה. מייבשים היטב.","מטגנים את החצילים בשמן עמוק עד שהם שחומים משני הצדדים, ומניחים על נייר סופג.","מבשלים את הביצים 10 דקות במים רותחים, מקררים, מקלפים ופורסים.","מערבבים את הטחינה עם מים, לימון ומלח עד שהיא חלקה.","ממלאים כל פיתה בחציל, ביצה, סלט, טחינה ומעט עמבה."]');

SELECT pg_temp.store_recipe('e2ec0000-0000-0000-0000-000000070004', 'e2e00000-0000-0000-0000-000000000701', 'e2e7ea00-0000-0000-0000-000000000701', 'majadra', 9,
  'מג׳דרה עם בצל מטוגן', 'אורז ועדשים חומות עם הרבה בצל מקורמל. פשוט, זול ומנחם.', 'dinner', '50', '6', 'easy',
  '[["1","כוס","עדשים חומות"],["1","כוס","אורז בסמטי"],["3","","בצלים גדולים פרוסים לטבעות"],["1/2","כוס","שמן"],["1","כפית","כמון"],["1/2","כפית","קינמון"],["2","כוסות","מים רותחים"],["","","מלח ופלפל"]]',
  '["מבשלים את העדשים במים 15 דקות, עד שהן כמעט רכות, ומסננים.","מטגנים את הבצל בשמן על אש בינונית כ־20 דקות, עד שהוא חום ופריך. מוציאים חצי ושומרים להגשה.","מוסיפים לסיר את האורז, העדשים והתבלינים ומערבבים דקה.","מוסיפים את המים הרותחים ומלח, מכסים ומבשלים על אש נמוכה 18 דקות.","מניחים 10 דקות מכוסה, מפוררים במזלג ומגישים עם הבצל ששמרנו מעל."]');

SELECT pg_temp.store_recipe('e2ec0000-0000-0000-0000-000000070005', 'e2e00000-0000-0000-0000-000000000701', 'e2e7ea00-0000-0000-0000-000000000701', 'stuffed-peppers', 14,
  'פלפלים ממולאים', 'פלפלים צבעוניים במילוי אורז ובשר, מבושלים ברוטב עגבניות.', 'dinner', '90', '6', 'medium',
  '[["6","","פלפלים בצבעים שונים"],["500","גרם","בשר בקר טחון"],["1","כוס","אורז פרסי"],["1","","בצל מגורר"],["1/2","צרור","פטרוזיליה קצוצה"],["1","כפית","בהרט"],["1","קופסה","רסק עגבניות"],["2","כוסות","מים"],["1","כף","סוכר"],["","","מלח ופלפל"]]',
  '["חותכים את הכיפה של כל פלפל ומנקים את הזרעים. שומרים את הכיפות.","מערבבים את הבשר, האורז, הבצל, הפטרוזיליה, הבהרט, מלח ופלפל.","ממלאים את הפלפלים עד שלושה רבעים, כי האורז מתנפח, ומכסים בכיפות.","מסדרים את הפלפלים זקופים בסיר רחב.","מערבבים את הרסק עם המים, הסוכר ומלח ויוצקים סביב הפלפלים.","מביאים לרתיחה ומבשלים מכוסה על אש נמוכה כשעה, עד שהאורז רך."]');

SELECT pg_temp.store_recipe('e2ec0000-0000-0000-0000-000000070006', 'e2e00000-0000-0000-0000-000000000701', 'e2e7ea00-0000-0000-0000-000000000701', 'roast-chicken', 20,
  'עוף בתנור עם לימון ושום', 'עוף שלם עם עור פריך, לימון ועשבי תיבול. ארוחת שישי בלי מאמץ.', 'dinner', '90', '6', 'easy',
  '[["1","","עוף שלם (כ־2 ק״ג)"],["2","","לימונים"],["1","ראש","שום"],["4","ענפי","רוזמרין"],["3","כפות","שמן זית"],["1","כפית","פפריקה"],["","","מלח גס ופלפל"],["6","","תפוחי אדמה קטנים חצויים"]]',
  '["מחממים תנור ל־200 מעלות.","מייבשים את העוף ומורחים עליו שמן זית, פפריקה, מלח ופלפל.","ממלאים את חלל העוף בלימון חצוי, חצי ראש שום ושני ענפי רוזמרין.","מסדרים את תפוחי האדמה ושאר השום והלימון בתבנית ומניחים את העוף מעל.","אופים כשעה ורבע, עד שהעור זהוב והנוזלים בירך שקופים.","מניחים לעוף לנוח 10 דקות לפני שפורסים."]');

-- סבתא רחל
SELECT pg_temp.store_recipe('e2ec0000-0000-0000-0000-000000070007', 'e2e00000-0000-0000-0000-000000000702', 'e2e7ea00-0000-0000-0000-000000000701', 'chicken-soup', 1,
  'מרק עוף של סבתא', 'המרק של כל יום שישי, עם הרבה ירקות ושמיר. מבשלים לאט.', 'dinner', '180', '8', 'easy',
  '[["1","ק״ג","כרעיים וגב עוף"],["3","","גזרים"],["2","","קישואים"],["1","","שורש סלרי"],["1","","בצל שלם"],["1","","פטרוזיליה שורש"],["1","צרור","שמיר"],["1","צרור","פטרוזיליה"],["3","ליטר","מים"],["","","מלח ופלפל לבן"]]',
  '["מכניסים את העוף לסיר גדול עם המים ומביאים לרתיחה. מסירים את הקצף שעולה.","מוסיפים את הבצל, הגזרים, הסלרי והפטרוזיליה שורש.","מבשלים על אש נמוכה מאוד כשעתיים, בלי לכסות עד הסוף.","מוסיפים את הקישואים, צרורות השמיר והפטרוזיליה ומבשלים עוד חצי שעה.","מוציאים את צרורות העשבים, מתבלים במלח ופלפל לבן ומגישים עם אטריות או קניידלך."]');

SELECT pg_temp.store_recipe('e2ec0000-0000-0000-0000-000000070008', 'e2e00000-0000-0000-0000-000000000702', 'e2e7ea00-0000-0000-0000-000000000701', 'challah', 4,
  'חלה לשבת', 'חלה רכה ומתוקה בקליעה של שישה. המתכון מחזיק בדיוק לשתי חלות.', 'breakfast', '180', '12', 'medium',
  '[["1","ק״ג","קמח לבן"],["1","שקית","שמרים יבשים (11 גרם)"],["1/2","כוס","סוכר"],["2","כפיות","מלח"],["2","","ביצים"],["1/2","כוס","שמן"],["1.5","כוסות","מים פושרים"],["1","","חלמון להברשה"],["","","שומשום לקישוט"]]',
  '["מערבבים בקערה גדולה את הקמח, השמרים והסוכר.","מוסיפים את הביצים, השמן והמים ולשים כ־10 דקות. מוסיפים את המלח בסוף הלישה.","מכסים ומתפיחים כשעה וחצי, עד שהבצק מכפיל את נפחו.","מחלקים לשניים, ואת כל חצי לשישה גלילים. קולעים שתי חלות.","מתפיחים עוד 45 דקות, מברישים בחלמון ומפזרים שומשום.","אופים בתנור שחומם ל־180 מעלות כ־30 דקות, עד שהחלות זהובות."]');

SELECT pg_temp.store_recipe('e2ec0000-0000-0000-0000-000000070009', 'e2e00000-0000-0000-0000-000000000702', 'e2e7ea00-0000-0000-0000-000000000701', 'rugelach', 11,
  'רוגלך שוקולד', 'בצק שמרים רך עם מילוי שוקולד עשיר. נעלם מהצלחת תוך דקות.', 'dessert', '150', '30', 'medium',
  '[["500","גרם","קמח"],["1","כף","שמרים יבשים"],["1/3","כוס","סוכר"],["200","גרם","חמאה רכה"],["1","","ביצה"],["3/4","כוס","חלב פושר"],["1","קורט","מלח"],["200","גרם","ממרח שוקולד"],["1","","ביצה להברשה"]]',
  '["לשים את הקמח, השמרים, הסוכר, החמאה, הביצה, החלב והמלח לבצק רך וחלק.","מתפיחים שעה, עד שהבצק מכפיל את נפחו.","מחלקים לשלושה, מרדדים כל חלק לעיגול ומורחים בממרח השוקולד.","חותכים כל עיגול לעשרה משולשים ומגלגלים מהצד הרחב אל החוד.","מסדרים בתבנית, מברישים בביצה ומתפיחים עוד 20 דקות.","אופים ב־180 מעלות כ־20 דקות, עד שהרוגלך זהובים."]');

SELECT pg_temp.store_recipe('e2ec0000-0000-0000-0000-000000070010', 'e2e00000-0000-0000-0000-000000000702', 'e2e7ea00-0000-0000-0000-000000000701', 'cheesecake', 25,
  'עוגת גבינה אפויה', 'עוגת גבינה גבוהה וקרמית על בסיס פירורי ביסקוויטים. של שבועות, ושל כל השנה.', 'dessert', '90', '12', 'medium',
  '[["200","גרם","ביסקוויטים"],["100","גרם","חמאה מומסת"],["750","גרם","גבינה לבנה 5%"],["250","גרם","שמנת חמוצה"],["1","כוס","סוכר"],["4","","ביצים"],["3","כפות","קורנפלור"],["1","כפית","תמצית וניל"],["1","","גרידת לימון"]]',
  '["טוחנים את הביסקוויטים, מערבבים עם החמאה ומשטחים בתחתית תבנית קפיצית.","מערבבים את הגבינה, השמנת, הסוכר, הקורנפלור, הווניל והגרידה עד שהתערובת חלקה.","מוסיפים את הביצים אחת אחת ומערבבים רק עד שהן נבלעות.","יוצקים על הבסיס ואופים ב־160 מעלות כשעה, עד שהמרכז כמעט יציב.","מכבים את התנור ומשאירים את העוגה בפנים עם דלת פתוחה מעט, שעה.","מקררים לילה שלם במקרר לפני ההגשה."]');

-- איתי
SELECT pg_temp.store_recipe('e2ec0000-0000-0000-0000-000000070011', 'e2e00000-0000-0000-0000-000000000703', 'e2e7ea00-0000-0000-0000-000000000701', 'schnitzel', 3,
  'שניצל פריך', 'חזה עוף בציפוי פירורי לחם ושומשום. הילדים מבקשים אותו כל שבוע.', 'lunch', '30', '4', 'easy',
  '[["600","גרם","חזה עוף פרוס דק"],["2","","ביצים"],["1","כף","חרדל"],["1","כוס","פירורי לחם"],["1/4","כוס","שומשום"],["1/2","כוס","קמח"],["1","כפית","פפריקה"],["","","מלח ופלפל"],["","","שמן לטיגון"]]',
  '["מכים קלות את פרוסות החזה לעובי אחיד ומתבלים במלח ופלפל.","מכינים שלוש צלחות: קמח, ביצים טרופות עם החרדל, ופירורי לחם עם השומשום והפפריקה.","טובלים כל פרוסה בקמח, אחר כך בביצה ולבסוף בפירורים.","מטגנים בשמן חם 3 דקות מכל צד, עד שהשניצלים זהובים.","מניחים על נייר סופג ומגישים עם לימון."]');

SELECT pg_temp.store_recipe('e2ec0000-0000-0000-0000-000000070012', 'e2e00000-0000-0000-0000-000000000703', 'e2e7ea00-0000-0000-0000-000000000701', 'hummus', 8,
  'חומוס ביתי', 'חומוס חלק ואוורירי כמו בחומוסייה. משרים את הגרגרים מהערב.', 'lunch', '120', '6', 'medium',
  '[["500","גרם","גרגרי חומוס יבשים"],["1","כפית","סודה לשתייה"],["1","כוס","טחינה גולמית"],["2","","לימונים, סחוטים"],["2","שיני","שום"],["1","כפית","כמון"],["","","מלח"],["","","שמן זית ופפריקה להגשה"]]',
  '["משרים את הגרגרים לילה שלם במים עם חצי כפית סודה.","מסננים, מכסים במים טריים עם שאר הסודה ומבשלים כשעה וחצי, עד שהגרגרים מתפרקים בין האצבעות.","שומרים כוס מנוזלי הבישול ומסננים.","טוחנים במעבד מזון את הגרגרים החמים עם הטחינה, הלימון, השום, הכמון והמלח.","מוסיפים מנוזלי הבישול עד שהחומוס חלק ואוורירי.","מגישים בצלחת שטוחה עם שמן זית, פפריקה וכמה גרגרים שלמים."]');

SELECT pg_temp.store_recipe('e2ec0000-0000-0000-0000-000000070013', 'e2e00000-0000-0000-0000-000000000703', 'e2e7ea00-0000-0000-0000-000000000701', 'kebab', 17,
  'קבב על האש', 'קבבים עסיסיים של בקר וכבש עם פטרוזיליה ובהרט. למנגל של יום העצמאות.', 'dinner', '40', '6', 'easy',
  '[["700","גרם","בשר בקר טחון"],["300","גרם","בשר כבש טחון"],["1","","בצל מגורר וסחוט"],["1","צרור","פטרוזיליה קצוצה"],["2","שיני","שום כתוש"],["1","כף","בהרט"],["1","כפית","כמון"],["1.5","כפיות","מלח"]]',
  '["מערבבים את כל המרכיבים ולשים היטב, כדי שהקבבים יחזיקו על האש.","מקררים חצי שעה במקרר.","מעצבים קבבים מוארכים סביב שיפודים, בידיים רטובות.","צולים על גחלים לוהטות 4–5 דקות מכל צד.","מגישים בפיתה עם טחינה, סלט ובצל סגול."]');

-- מאיה
SELECT pg_temp.store_recipe('e2ec0000-0000-0000-0000-000000070014', 'e2e00000-0000-0000-0000-000000000704', 'e2e7ea00-0000-0000-0000-000000000701', 'malabi', 6,
  'מלבי עם סירופ ורדים', 'פודינג חלב רך עם סירופ ורדים, קוקוס ובוטנים. קינוח קיץ מושלם.', 'dessert', '20', '6', 'easy',
  '[["1","ליטר","חלב"],["1/2","כוס","קורנפלור"],["1/2","כוס","סוכר"],["1","כף","מי ורדים"],["1/2","כוס","סירופ ורדים"],["1/4","כוס","קוקוס טחון"],["1/4","כוס","בוטנים קצוצים"]]',
  '["ממיסים את הקורנפלור בכוס מהחלב.","מחממים את שאר החלב עם הסוכר עד שהוא כמעט רותח.","מוסיפים את תערובת הקורנפלור ומערבבים כל הזמן עד שהמלבי מסמיך.","מורידים מהאש, מוסיפים את מי הוורדים ויוצקים לכוסות.","מקררים לפחות 4 שעות, ומגישים עם סירופ, קוקוס ובוטנים מעל."]');

SELECT pg_temp.store_recipe('e2ec0000-0000-0000-0000-000000070015', 'e2e00000-0000-0000-0000-000000000704', 'e2e7ea00-0000-0000-0000-000000000701', 'pancakes', 12,
  'פנקייק אמריקאי', 'מגדל של פנקייקים אווריריים עם מייפל ופירות יער. ארוחת הבוקר של שבת.', 'breakfast', '25', '4', 'easy',
  '[["1.5","כוסות","קמח"],["2","כפות","סוכר"],["2","כפיות","אבקת אפייה"],["1","קורט","מלח"],["1.25","כוסות","חלב"],["1","","ביצה"],["3","כפות","חמאה מומסת"],["","","מייפל ופירות יער להגשה"]]',
  '["מערבבים בקערה את הקמח, הסוכר, אבקת האפייה והמלח.","בקערה אחרת טורפים את החלב, הביצה והחמאה.","מוסיפים את הרטובים ליבשים ומערבבים רק עד שאין קמח יבש. גושים קטנים זה בסדר.","מחממים מחבת משומנת ויוצקים רבע כוס בלילה לכל פנקייק.","כשמופיעות בועות, הופכים ומטגנים עוד דקה.","מגישים חם, עם מייפל ופירות יער."]');

SELECT pg_temp.store_recipe('e2ec0000-0000-0000-0000-000000070016', 'e2e00000-0000-0000-0000-000000000704', 'e2e7ea00-0000-0000-0000-000000000701', 'chocolate-chip-cookies', 22,
  'עוגיות שוקולד צ׳יפס', 'עוגיות רכות במרכז ופריכות בקצוות, עם הרבה שוקולד.', 'dessert', '30', '24', 'easy',
  '[["200","גרם","חמאה רכה"],["3/4","כוס","סוכר חום"],["1/2","כוס","סוכר לבן"],["2","","ביצים"],["1","כפית","תמצית וניל"],["2.5","כוסות","קמח"],["1","כפית","סודה לשתייה"],["1/2","כפית","מלח"],["300","גרם","שוקולד צ׳יפס"]]',
  '["מקציפים את החמאה עם שני סוגי הסוכר עד שהתערובת בהירה.","מוסיפים את הביצים והווניל ומערבבים.","מוסיפים את הקמח, הסודה והמלח, ואחריהם את השוקולד צ׳יפס.","יוצרים כדורים בגודל כף ומסדרים בתבנית ברווחים.","אופים ב־180 מעלות 10–12 דקות, עד שהקצוות זהובים והמרכז עוד רך.","מצננים בתבנית 5 דקות לפני שמזיזים."]');

-- =========================================================================
-- English: the Carters. Log in as emma.carter@example.com.
-- =========================================================================
SELECT pg_temp.store_user('e2e00000-0000-0000-0000-000000000801', 'emma.carter@example.com', 'Emma Carter');
SELECT pg_temp.store_user('e2e00000-0000-0000-0000-000000000802', 'ruth.carter@example.com', 'Grandma Ruth');
SELECT pg_temp.store_user('e2e00000-0000-0000-0000-000000000803', 'daniel.carter@example.com', 'Daniel Carter');
SELECT pg_temp.store_user('e2e00000-0000-0000-0000-000000000804', 'lily.carter@example.com', 'Lily Carter');

INSERT INTO public.teams (id, title, host_id) VALUES
  ('e2e7ea00-0000-0000-0000-000000000801', 'The Carter Family Kitchen', 'e2e00000-0000-0000-0000-000000000801');
INSERT INTO public.team_members (user_id, team_id) VALUES
  ('e2e00000-0000-0000-0000-000000000802', 'e2e7ea00-0000-0000-0000-000000000801'),
  ('e2e00000-0000-0000-0000-000000000803', 'e2e7ea00-0000-0000-0000-000000000801'),
  ('e2e00000-0000-0000-0000-000000000804', 'e2e7ea00-0000-0000-0000-000000000801');

-- Emma
SELECT pg_temp.store_recipe('e2ec0000-0000-0000-0000-000000080001', 'e2e00000-0000-0000-0000-000000000801', 'e2e7ea00-0000-0000-0000-000000000801', 'lasagna', 0,
  'Classic Beef Lasagna', 'Layers of rich meat sauce, creamy ricotta and bubbling mozzarella. Worth every minute.', 'dinner', '120', '8', 'medium',
  '[["12","","lasagna noodles"],["1","lb","ground beef"],["1/2","lb","Italian sausage"],["1","","onion, diced"],["3","cloves","garlic, minced"],["28","oz","crushed tomatoes"],["2","tbsp","tomato paste"],["2","tsp","dried basil"],["15","oz","ricotta cheese"],["1","","egg"],["1/2","cup","grated Parmesan"],["3","cups","shredded mozzarella"],["","","salt and pepper"]]',
  '["Brown the beef and sausage with the onion. Add the garlic and cook for a minute.","Stir in the crushed tomatoes, tomato paste and basil. Simmer for 30 minutes and season.","Cook the noodles until just tender and drain.","Mix the ricotta with the egg and half the Parmesan.","In a 9x13 dish, layer sauce, noodles, ricotta and mozzarella. Repeat three times, ending with sauce and cheese.","Cover with foil and bake at 375°F for 25 minutes, then uncover and bake 20 minutes more.","Let it rest for 15 minutes before slicing."]');

SELECT pg_temp.store_recipe('e2ec0000-0000-0000-0000-000000080002', 'e2e00000-0000-0000-0000-000000000801', 'e2e7ea00-0000-0000-0000-000000000801', 'roast-chicken', 3,
  'Lemon Garlic Roast Chicken', 'Crispy golden skin, juicy meat and potatoes roasted in the drippings.', 'dinner', '90', '4', 'easy',
  '[["1","","whole chicken (4 lb)"],["2","","lemons"],["1","head","garlic"],["4","sprigs","fresh rosemary"],["3","tbsp","olive oil"],["1","tsp","smoked paprika"],["1.5","lb","baby potatoes, halved"],["","","kosher salt and pepper"]]',
  '["Heat the oven to 425°F.","Pat the chicken dry and rub it all over with olive oil, paprika, salt and pepper.","Stuff the cavity with a halved lemon, half the garlic and two rosemary sprigs.","Scatter the potatoes, remaining garlic and lemon in a roasting pan and set the chicken on top.","Roast for about 75 minutes, until the skin is golden and the thigh juices run clear.","Rest for 10 minutes before carving."]');

SELECT pg_temp.store_recipe('e2ec0000-0000-0000-0000-000000080003', 'e2e00000-0000-0000-0000-000000000801', 'e2e7ea00-0000-0000-0000-000000000801', 'shakshuka', 6,
  'Shakshuka', 'Eggs poached in a spiced tomato and pepper sauce. Bring plenty of bread.', 'breakfast', '25', '4', 'easy',
  '[["2","tbsp","olive oil"],["1","","onion, chopped"],["1","","red bell pepper, sliced"],["3","cloves","garlic, sliced"],["28","oz","whole peeled tomatoes"],["1","tsp","sweet paprika"],["1","tsp","ground cumin"],["1/2","tsp","chili flakes"],["6","","eggs"],["","","salt and pepper"],["","","fresh parsley and feta, to serve"]]',
  '["Warm the olive oil in a wide skillet and cook the onion and pepper until soft, about 8 minutes.","Add the garlic and spices and stir for a minute.","Add the tomatoes, crush them with a spoon and simmer for 10 minutes until thick. Season.","Make six wells in the sauce and crack an egg into each.","Cover and cook on low for 5–7 minutes, until the whites are set.","Top with parsley and feta and serve straight from the pan."]');

SELECT pg_temp.store_recipe('e2ec0000-0000-0000-0000-000000080004', 'e2e00000-0000-0000-0000-000000000801', 'e2e7ea00-0000-0000-0000-000000000801', 'caesar-salad', 10,
  'Chicken Caesar Salad', 'Crisp romaine, grilled chicken, homemade croutons and a punchy dressing.', 'lunch', '25', '4', 'easy',
  '[["2","","chicken breasts"],["2","heads","romaine lettuce"],["2","cups","day-old bread, cubed"],["1/2","cup","shaved Parmesan"],["1/2","cup","mayonnaise"],["2","","anchovy fillets, minced"],["1","clove","garlic, grated"],["1","tbsp","lemon juice"],["1","tsp","Dijon mustard"],["3","tbsp","olive oil"]]',
  '["Season the chicken and grill for 6 minutes per side. Rest, then slice.","Toss the bread with olive oil and bake at 400°F for 10 minutes until golden.","Whisk the mayonnaise, anchovies, garlic, lemon juice and mustard into a dressing.","Toss the romaine with the dressing, then top with chicken, croutons and Parmesan."]');

SELECT pg_temp.store_recipe('e2ec0000-0000-0000-0000-000000080005', 'e2e00000-0000-0000-0000-000000000801', 'e2e7ea00-0000-0000-0000-000000000801', 'tomato-soup', 16,
  'Roasted Tomato Soup', 'Sweet roasted tomatoes blended smooth. Perfect with a grilled cheese.', 'lunch', '50', '4', 'easy',
  '[["3","lb","ripe tomatoes, halved"],["1","","onion, quartered"],["6","cloves","garlic"],["3","tbsp","olive oil"],["2","cups","vegetable stock"],["1/2","cup","heavy cream"],["1","handful","fresh basil"],["","","salt and pepper"]]',
  '["Heat the oven to 400°F.","Spread the tomatoes, onion and garlic on a tray, drizzle with oil and season.","Roast for 35 minutes, until soft and lightly charred.","Blend with the stock and basil until smooth.","Warm in a pot, stir in the cream and adjust the seasoning."]');

SELECT pg_temp.store_recipe('e2ec0000-0000-0000-0000-000000080006', 'e2e00000-0000-0000-0000-000000000801', 'e2e7ea00-0000-0000-0000-000000000801', 'avocado-toast', 21,
  'Avocado Toast with Poached Eggs', 'Sourdough, smashed avocado and a runny egg. Five minutes to a great breakfast.', 'breakfast', '15', '2', 'easy',
  '[["2","slices","sourdough bread"],["1","","ripe avocado"],["2","","eggs"],["1/2","","lemon"],["1","pinch","chili flakes"],["1","tsp","white vinegar"],["","","flaky salt and pepper"]]',
  '["Toast the bread until crisp.","Mash the avocado with lemon juice, salt and pepper.","Bring a pot of water to a gentle simmer and add the vinegar.","Swirl the water, slip in the eggs and poach for 3 minutes.","Spread the avocado on the toast, top with the eggs and finish with chili flakes."]');

-- Grandma Ruth
SELECT pg_temp.store_recipe('e2ec0000-0000-0000-0000-000000080007', 'e2e00000-0000-0000-0000-000000000802', 'e2e7ea00-0000-0000-0000-000000000801', 'apple-pie', 1,
  'Grandma''s Apple Pie', 'A flaky butter crust filled with cinnamon apples. The one everyone asks for at Thanksgiving.', 'dessert', '150', '8', 'medium',
  '[["2.5","cups","all-purpose flour"],["1","cup","cold butter, cubed"],["1","tsp","salt"],["6","tbsp","ice water"],["6","","Granny Smith apples"],["3/4","cup","sugar"],["2","tbsp","flour"],["1","tsp","cinnamon"],["1/4","tsp","nutmeg"],["1","tbsp","lemon juice"],["1","","egg, for brushing"]]',
  '["Rub the butter into the flour and salt until it looks like coarse crumbs. Add the ice water and gather into two discs. Chill for an hour.","Peel and slice the apples and toss with the sugar, flour, spices and lemon juice.","Roll out one disc and line a 9-inch pie dish. Fill with the apples.","Roll out the second disc, lay it on top, crimp the edges and cut a few vents.","Brush with egg and bake at 400°F for 50 minutes, until golden and bubbling.","Cool for at least two hours so the filling sets."]');

SELECT pg_temp.store_recipe('e2ec0000-0000-0000-0000-000000080008', 'e2e00000-0000-0000-0000-000000000802', 'e2e7ea00-0000-0000-0000-000000000801', 'chicken-soup', 5,
  'Chicken Noodle Soup', 'The soup for cold days and sick days. Simple and so comforting.', 'dinner', '90', '6', 'easy',
  '[["2","lb","bone-in chicken thighs"],["3","","carrots, sliced"],["3","stalks","celery, sliced"],["1","","onion, diced"],["2","cloves","garlic"],["10","cups","water"],["2","","bay leaves"],["8","oz","egg noodles"],["2","tbsp","fresh dill, chopped"],["","","salt and pepper"]]',
  '["Put the chicken, onion, garlic and bay leaves in a large pot with the water and bring to a boil. Skim the foam.","Simmer gently for 45 minutes.","Lift out the chicken, shred the meat and discard the bones.","Add the carrots and celery and simmer for 15 minutes.","Add the noodles and cook until tender, then return the chicken.","Stir in the dill and season well."]');

SELECT pg_temp.store_recipe('e2ec0000-0000-0000-0000-000000080009', 'e2e00000-0000-0000-0000-000000000802', 'e2e7ea00-0000-0000-0000-000000000801', 'cinnamon-rolls', 12,
  'Cinnamon Rolls', 'Soft, pillowy rolls with a gooey cinnamon swirl and cream cheese frosting.', 'breakfast', '180', '12', 'hard',
  '[["4","cups","all-purpose flour"],["2.25","tsp","instant yeast"],["1/3","cup","sugar"],["1","cup","warm milk"],["1/3","cup","melted butter"],["2","","eggs"],["1","tsp","salt"],["3/4","cup","brown sugar"],["2","tbsp","cinnamon"],["1/3","cup","soft butter"],["4","oz","cream cheese"],["1","cup","powdered sugar"]]',
  '["Mix the flour, yeast, sugar, milk, melted butter, eggs and salt and knead for 8 minutes.","Let the dough rise for an hour, until doubled.","Roll it into a large rectangle, spread with soft butter and sprinkle with brown sugar and cinnamon.","Roll up tightly, cut into 12 rolls and arrange in a buttered pan.","Let rise for 30 minutes, then bake at 350°F for 25 minutes.","Beat the cream cheese with the powdered sugar and spread over the warm rolls."]');

SELECT pg_temp.store_recipe('e2ec0000-0000-0000-0000-000000080010', 'e2e00000-0000-0000-0000-000000000802', 'e2e7ea00-0000-0000-0000-000000000801', 'banana-bread', 24,
  'Banana Bread', 'Moist, tender and the best use for overripe bananas.', 'dessert', '70', '10', 'easy',
  '[["3","","very ripe bananas"],["1/3","cup","melted butter"],["3/4","cup","brown sugar"],["1","","egg"],["1","tsp","vanilla extract"],["1","tsp","baking soda"],["1","pinch","salt"],["1.5","cups","all-purpose flour"],["1/2","cup","chopped walnuts"]]',
  '["Heat the oven to 350°F and butter a loaf pan.","Mash the bananas and stir in the melted butter.","Mix in the sugar, egg and vanilla.","Sprinkle over the baking soda and salt, then fold in the flour and walnuts.","Pour into the pan and bake for 55–60 minutes, until a skewer comes out clean.","Cool in the pan for 10 minutes before turning out."]');

-- Daniel
SELECT pg_temp.store_recipe('e2ec0000-0000-0000-0000-000000080011', 'e2e00000-0000-0000-0000-000000000803', 'e2e7ea00-0000-0000-0000-000000000801', 'beef-tacos', 2,
  'Weeknight Beef Tacos', 'Seasoned ground beef with all the toppings. Taco Tuesday sorted.', 'dinner', '30', '4', 'easy',
  '[["1","lb","ground beef"],["1","","onion, finely diced"],["2","tsp","chili powder"],["1","tsp","ground cumin"],["1","tsp","smoked paprika"],["1/2","cup","tomato sauce"],["8","","small tortillas"],["1","cup","shredded lettuce"],["1","cup","shredded cheddar"],["1","","tomato, diced"],["","","sour cream, salsa and lime"]]',
  '["Brown the beef with the onion over medium-high heat, breaking it up as it cooks.","Add the spices and stir for a minute.","Add the tomato sauce and simmer for 5 minutes until thick.","Warm the tortillas in a dry pan.","Fill with the beef and top with lettuce, cheese, tomato, sour cream and salsa."]');

SELECT pg_temp.store_recipe('e2ec0000-0000-0000-0000-000000080012', 'e2e00000-0000-0000-0000-000000000803', 'e2e7ea00-0000-0000-0000-000000000801', 'smash-burgers', 8,
  'Smash Burgers', 'Thin patties with crispy, lacy edges and melted cheese.', 'dinner', '25', '4', 'easy',
  '[["1","lb","ground beef (80/20)"],["4","","burger buns"],["4","slices","American cheese"],["1","","onion, thinly sliced"],["","","pickles"],["3","tbsp","mayonnaise"],["1","tbsp","ketchup"],["1","tsp","mustard"],["","","salt and pepper"]]',
  '["Mix the mayonnaise, ketchup and mustard into a sauce.","Divide the beef into eight loose balls.","Heat a cast-iron pan until smoking hot. Add two balls and smash them flat with a spatula.","Season, cook for 2 minutes until the edges are crispy, then flip and top with cheese.","Stack two patties on each toasted bun with onion, pickles and sauce."]');

SELECT pg_temp.store_recipe('e2ec0000-0000-0000-0000-000000080013', 'e2e00000-0000-0000-0000-000000000803', 'e2e7ea00-0000-0000-0000-000000000801', 'beef-chili', 18,
  'Beef and Bean Chili', 'A big pot of hearty chili for game day. Even better the next day.', 'dinner', '90', '6', 'easy',
  '[["2","lb","ground beef"],["1","","onion, diced"],["1","","green bell pepper, diced"],["4","cloves","garlic"],["3","tbsp","chili powder"],["2","tsp","ground cumin"],["28","oz","crushed tomatoes"],["2","cans","kidney beans, drained"],["1","cup","beef stock"],["","","salt, cheddar and sour cream"]]',
  '["Brown the beef in a large pot and drain most of the fat.","Add the onion, pepper and garlic and cook until soft.","Stir in the spices for a minute.","Add the tomatoes, beans and stock and bring to a simmer.","Cook uncovered for an hour, stirring now and then, until thick.","Season and serve with cheddar and sour cream."]');

-- Lily
SELECT pg_temp.store_recipe('e2ec0000-0000-0000-0000-000000080014', 'e2e00000-0000-0000-0000-000000000804', 'e2e7ea00-0000-0000-0000-000000000801', 'pancakes', 4,
  'Fluffy Buttermilk Pancakes', 'A tall stack of light, fluffy pancakes with maple syrup and berries.', 'breakfast', '25', '4', 'easy',
  '[["2","cups","all-purpose flour"],["2","tbsp","sugar"],["2","tsp","baking powder"],["1/2","tsp","baking soda"],["1/2","tsp","salt"],["2","cups","buttermilk"],["2","","eggs"],["3","tbsp","melted butter"],["","","maple syrup and berries, to serve"]]',
  '["Whisk the flour, sugar, baking powder, baking soda and salt.","In another bowl, whisk the buttermilk, eggs and melted butter.","Pour the wet into the dry and stir until just combined. A few lumps are fine.","Heat a buttered griddle and pour 1/4 cup of batter per pancake.","Flip when bubbles form on top and cook for another minute.","Serve warm with maple syrup and berries."]');

SELECT pg_temp.store_recipe('e2ec0000-0000-0000-0000-000000080015', 'e2e00000-0000-0000-0000-000000000804', 'e2e7ea00-0000-0000-0000-000000000801', 'chocolate-chip-cookies', 9,
  'Chewy Chocolate Chip Cookies', 'Crisp edges, chewy centers and pools of melted chocolate.', 'dessert', '30', '24', 'easy',
  '[["1","cup","soft butter"],["3/4","cup","brown sugar"],["1/2","cup","white sugar"],["2","","eggs"],["2","tsp","vanilla extract"],["2.25","cups","all-purpose flour"],["1","tsp","baking soda"],["1/2","tsp","salt"],["2","cups","chocolate chips"]]',
  '["Beat the butter with both sugars until light and fluffy.","Beat in the eggs and vanilla.","Mix in the flour, baking soda and salt, then fold in the chocolate chips.","Scoop tablespoon-sized balls onto lined trays, well spaced.","Bake at 350°F for 10–12 minutes, until the edges are golden but the centers are still soft.","Cool on the tray for 5 minutes."]');

SELECT pg_temp.store_recipe('e2ec0000-0000-0000-0000-000000080016', 'e2e00000-0000-0000-0000-000000000804', 'e2e7ea00-0000-0000-0000-000000000801', 'cheesecake', 27,
  'New York Cheesecake', 'Tall, dense and creamy, on a buttery graham cracker crust.', 'dessert', '90', '12', 'hard',
  '[["2","cups","graham cracker crumbs"],["1/2","cup","melted butter"],["32","oz","cream cheese, softened"],["1","cup","sugar"],["1","cup","sour cream"],["4","","eggs"],["2","tsp","vanilla extract"],["1","tbsp","lemon zest"]]',
  '["Mix the crumbs with the butter and press into the bottom of a springform pan.","Beat the cream cheese and sugar until smooth, then add the sour cream, vanilla and zest.","Add the eggs one at a time, mixing just until blended.","Pour over the crust and bake at 325°F for about an hour, until the center barely jiggles.","Turn off the oven and leave the cheesecake inside with the door ajar for an hour.","Chill overnight before slicing."]');

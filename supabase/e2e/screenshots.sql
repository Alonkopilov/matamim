-- Demo data for the store screenshots (scripts/e2e/screenshots.sh), loaded
-- after supabase/e2e/seed.sql only when E2E_SCREENSHOTS=1. Not used by any
-- test flow.
--
-- Two copies of the same kitchen, one in English and one in Hebrew. Each has
-- a premium host with cloud sync on who logs in on the device, a premium
-- teammate who shares two recipes (the team screen is captured from its
-- account, which shows no emails or remove buttons), and three free members. Ids start with e2e like
-- the rest of the seed, so the probe leaves them out of its row counts. Emails
-- are @example.com, not @e2e.test, since the team screen shows them.
--
-- Every recipe has a photo, uploaded by seed.sh from store/screenshots/photos/
-- (dish 01 is shakshuka.jpg, and so on, see DEMO_DISHES in env.sh). The
-- path's file name is the dish number, the same in both languages.

CREATE OR REPLACE FUNCTION pg_temp.demo_user(p_id uuid, p_email text, p_name text, p_premium boolean)
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
    jsonb_build_object('display_name', p_name, 'is_syncing_to_cloud', p_premium),
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
  INSERT INTO public.premium_entitlements (user_id, expires_at)
  SELECT p_id, NULL WHERE p_premium;
$$;

-- p_ingredients are "amount|unit|item", p_steps one string each. The app
-- lists recipes in the order they're fetched, which has no ORDER BY, so in the
-- order they're inserted here (handle_times sets the timestamps).
CREATE OR REPLACE FUNCTION pg_temp.demo_recipe(
  p_id uuid, p_user uuid, p_team uuid, p_dish int, p_name text,
  p_description text, p_category text, p_prep_time text, p_servings text,
  p_difficulty text, p_ingredients text[], p_steps text[]
)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO public.recipes (
    id, user_id, team_id, name, description, category, prep_time, servings,
    difficulty, image, ingredients, instructions
  ) VALUES (
    p_id, p_user, p_team, p_name, p_description, p_category, p_prep_time,
    p_servings, p_difficulty,
    p_user::text || '/e2ef0700-0000-0000-0000-0000000060' || lpad(p_dish::text, 2, '0') || '.jpg',
    (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', p_id::text || '-i' || n, 'sort_order', n - 1,
        'amount', split_part(x, '|', 1), 'unit', split_part(x, '|', 2),
        'item', split_part(x, '|', 3)) ORDER BY n), '[]'::jsonb)
     FROM unnest(p_ingredients) WITH ORDINALITY AS t(x, n)),
    (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', p_id::text || '-s' || n, 'sort_order', n - 1, 'text', x) ORDER BY n), '[]'::jsonb)
     FROM unnest(p_steps) WITH ORDINALITY AS t(x, n))
  );
$$;

-- English
SELECT pg_temp.demo_user('e2e00000-0000-0000-0000-000000000060', 'dana@example.com', 'Dana', true);
SELECT pg_temp.demo_user('e2e00000-0000-0000-0000-000000000061', 'tom@example.com', 'Tom', true);
SELECT pg_temp.demo_user('e2e00000-0000-0000-0000-000000000062', 'maya@example.com', 'Maya', false);
SELECT pg_temp.demo_user('e2e00000-0000-0000-0000-000000000063', 'ruth@example.com', 'Grandma Ruth', false);
SELECT pg_temp.demo_user('e2e00000-0000-0000-0000-000000000064', 'noah@example.com', 'Noah', false);

INSERT INTO public.teams (id, title, host_id) VALUES
  ('e2e7ea00-0000-0000-0000-000000000060', 'Family Kitchen', 'e2e00000-0000-0000-0000-000000000060');
INSERT INTO public.team_members (user_id, team_id, joined_at) VALUES
  ('e2e00000-0000-0000-0000-000000000061', 'e2e7ea00-0000-0000-0000-000000000060', now() - interval '20 days'),
  ('e2e00000-0000-0000-0000-000000000062', 'e2e7ea00-0000-0000-0000-000000000060', now() - interval '10 days'),
  ('e2e00000-0000-0000-0000-000000000063', 'e2e7ea00-0000-0000-0000-000000000060', now() - interval '8 days'),
  ('e2e00000-0000-0000-0000-000000000064', 'e2e7ea00-0000-0000-0000-000000000060', now() - interval '5 days');

SELECT pg_temp.demo_recipe('e2ec0000-0000-0000-0000-000000006001', 'e2e00000-0000-0000-0000-000000000060', 'e2e7ea00-0000-0000-0000-000000000060', 1,
  'Shakshuka', 'Eggs poached in a spiced tomato and pepper sauce. Serve straight from the pan with fresh bread.',
  'breakfast', '30', '4', 'easy',
  ARRAY['2|tbsp|olive oil', '1||onion, diced', '1||red bell pepper, diced', '3|cloves|garlic, sliced',
        '1|tsp|ground cumin', '1|tsp|sweet paprika', '800|g|crushed tomatoes', '6||eggs', '1|handful|parsley, chopped'],
  ARRAY['Heat the oil in a wide pan and cook the onion and pepper until soft, about 8 minutes.',
        'Add the garlic, cumin and paprika and stir for a minute until fragrant.',
        'Pour in the tomatoes, season with salt and simmer for 10 minutes until thick.',
        'Make six wells in the sauce and crack an egg into each. Cover and cook for 6 to 8 minutes.',
        'Scatter the parsley on top and serve with warm bread.']);
SELECT pg_temp.demo_recipe('e2ec0000-0000-0000-0000-000000006002', 'e2e00000-0000-0000-0000-000000000060', 'e2e7ea00-0000-0000-0000-000000000060', 2,
  'Lemon Garlic Pasta', 'A bright weeknight pasta ready in 20 minutes.',
  'lunch', '20', '2', 'easy',
  ARRAY['250|g|spaghetti', '3|tbsp|butter', '3|cloves|garlic, minced', '1||lemon, zest and juice', '50|g|parmesan, grated'],
  ARRAY['Cook the spaghetti in salted water, keeping a cup of the water.',
        'Melt the butter, add the garlic and cook for a minute.',
        'Toss in the pasta, lemon and parmesan, loosening with the pasta water.']);
SELECT pg_temp.demo_recipe('e2ec0000-0000-0000-0000-000000006003', 'e2e00000-0000-0000-0000-000000000060', 'e2e7ea00-0000-0000-0000-000000000060', 3,
  'Roast Chicken and Potatoes', 'Crispy skin, tender potatoes, one tray.',
  'dinner', '90', '4', 'medium',
  ARRAY['1||whole chicken', '1|kg|potatoes, quartered', '1||head of garlic, halved', '3|tbsp|olive oil', '4|sprigs|rosemary'],
  ARRAY['Heat the oven to 220°C.',
        'Toss the potatoes and garlic with oil, salt and rosemary in a tray.',
        'Rub the chicken with oil and salt, set it on top and roast for 75 minutes.']);
SELECT pg_temp.demo_recipe('e2ec0000-0000-0000-0000-000000006004', 'e2e00000-0000-0000-0000-000000000060', 'e2e7ea00-0000-0000-0000-000000000060', 4,
  'Greek Salad', 'Ripe tomatoes, cucumber and feta.',
  'lunch', '15', '4', 'easy',
  ARRAY['4||tomatoes', '1||cucumber', '1||red onion', '200|g|feta', '1|handful|kalamata olives', '3|tbsp|olive oil'],
  ARRAY['Cut the vegetables into large chunks.',
        'Top with the feta and olives, drizzle with oil and season.']);
SELECT pg_temp.demo_recipe('e2ec0000-0000-0000-0000-000000006005', 'e2e00000-0000-0000-0000-000000000060', 'e2e7ea00-0000-0000-0000-000000000060', 5,
  'Chocolate Babka', 'Soft braided bread swirled with dark chocolate.',
  'dessert', '240', '10', 'hard',
  ARRAY['500|g|flour', '7|g|dry yeast', '100|g|sugar', '3||eggs', '150|g|butter, soft', '200|g|dark chocolate'],
  ARRAY['Knead the flour, yeast, sugar, eggs and butter into a soft dough and let it rise.',
        'Roll it out, spread the melted chocolate and roll up tightly.',
        'Cut in half lengthwise, braid, and bake at 180°C for 35 minutes.']);
SELECT pg_temp.demo_recipe('e2ec0000-0000-0000-0000-000000006006', 'e2e00000-0000-0000-0000-000000000060', 'e2e7ea00-0000-0000-0000-000000000060', 6,
  'Banana Pancakes', 'Fluffy pancakes for slow mornings.',
  'breakfast', '25', '4', 'easy',
  ARRAY['2||ripe bananas', '2||eggs', '200|g|flour', '250|ml|milk', '1|tsp|baking powder'],
  ARRAY['Mash the bananas and whisk in the eggs and milk.',
        'Fold in the flour and baking powder.',
        'Cook small ladles in a buttered pan until golden on both sides.']);
SELECT pg_temp.demo_recipe('e2ec0000-0000-0000-0000-000000006007', 'e2e00000-0000-0000-0000-000000000061', 'e2e7ea00-0000-0000-0000-000000000060', 7,
  'Red Lentil Soup', 'Grandma''s soup, warming and simple.',
  'dinner', '45', '6', 'easy',
  ARRAY['300|g|red lentils', '1||onion', '2||carrots', '1|tsp|ground cumin', '1.5|l|vegetable stock'],
  ARRAY['Soften the onion and carrots in a little oil.',
        'Add the lentils, cumin and stock and simmer for 25 minutes.',
        'Blend until smooth and finish with lemon juice.']);
SELECT pg_temp.demo_recipe('e2ec0000-0000-0000-0000-000000006008', 'e2e00000-0000-0000-0000-000000000061', 'e2e7ea00-0000-0000-0000-000000000060', 8,
  'Apple Crumble', 'Warm apples under a buttery crumble.',
  'dessert', '60', '6', 'easy',
  ARRAY['6||apples', '1|tsp|cinnamon', '150|g|flour', '100|g|butter, cold', '100|g|brown sugar'],
  ARRAY['Slice the apples into a dish and toss with the cinnamon.',
        'Rub the flour, butter and sugar into crumbs and scatter on top.',
        'Bake at 180°C for 40 minutes until golden.']);

-- Hebrew
SELECT pg_temp.demo_user('e2e00000-0000-0000-0000-000000000070', 'dana.levi@example.com', 'דנה', true);
SELECT pg_temp.demo_user('e2e00000-0000-0000-0000-000000000071', 'tom.levi@example.com', 'תום', true);
SELECT pg_temp.demo_user('e2e00000-0000-0000-0000-000000000072', 'maya.levi@example.com', 'מאיה', false);
SELECT pg_temp.demo_user('e2e00000-0000-0000-0000-000000000073', 'ruth.levi@example.com', 'סבתא רותי', false);
SELECT pg_temp.demo_user('e2e00000-0000-0000-0000-000000000074', 'yoav.levi@example.com', 'יואב', false);

INSERT INTO public.teams (id, title, host_id) VALUES
  ('e2e7ea00-0000-0000-0000-000000000070', 'המטבח המשפחתי', 'e2e00000-0000-0000-0000-000000000070');
INSERT INTO public.team_members (user_id, team_id, joined_at) VALUES
  ('e2e00000-0000-0000-0000-000000000071', 'e2e7ea00-0000-0000-0000-000000000070', now() - interval '20 days'),
  ('e2e00000-0000-0000-0000-000000000072', 'e2e7ea00-0000-0000-0000-000000000070', now() - interval '10 days'),
  ('e2e00000-0000-0000-0000-000000000073', 'e2e7ea00-0000-0000-0000-000000000070', now() - interval '8 days'),
  ('e2e00000-0000-0000-0000-000000000074', 'e2e7ea00-0000-0000-0000-000000000070', now() - interval '5 days');

SELECT pg_temp.demo_recipe('e2ec0000-0000-0000-0000-000000007001', 'e2e00000-0000-0000-0000-000000000070', 'e2e7ea00-0000-0000-0000-000000000070', 1,
  'שקשוקה', 'ביצים ברוטב עגבניות ופלפלים מתובל. מגישים ישר מהמחבת עם לחם טרי.',
  'breakfast', '30', '4', 'easy',
  ARRAY['2|כפות|שמן זית', '1||בצל, קצוץ', '1||פלפל אדום, קצוץ', '3|שיני|שום, פרוס',
        '1|כפית|כמון טחון', '1|כפית|פפריקה מתוקה', '800|גרם|עגבניות מרוסקות', '6||ביצים', '1|חופן|פטרוזיליה, קצוצה'],
  ARRAY['מחממים שמן במחבת רחבה ומטגנים את הבצל והפלפל עד שמתרככים, כ-8 דקות.',
        'מוסיפים את השום, הכמון והפפריקה ומערבבים דקה עד שעולה ריח.',
        'מוסיפים את העגבניות, ממליחים ומבשלים 10 דקות עד שהרוטב מסמיך.',
        'יוצרים שש גומות ברוטב ושוברים ביצה לכל אחת. מכסים ומבשלים 6 עד 8 דקות.',
        'מפזרים פטרוזיליה ומגישים עם לחם חם.']);
SELECT pg_temp.demo_recipe('e2ec0000-0000-0000-0000-000000007002', 'e2e00000-0000-0000-0000-000000000070', 'e2e7ea00-0000-0000-0000-000000000070', 2,
  'פסטה לימון ושום', 'פסטה רעננה לאמצע השבוע, מוכנה תוך 20 דקות.',
  'lunch', '20', '2', 'easy',
  ARRAY['250|גרם|ספגטי', '3|כפות|חמאה', '3|שיני|שום, כתוש', '1||לימון, גרידה ומיץ', '50|גרם|פרמזן, מגורר'],
  ARRAY['מבשלים את הספגטי במים עם מלח ושומרים כוס ממי הבישול.',
        'ממיסים את החמאה, מוסיפים את השום ומבשלים דקה.',
        'מוסיפים את הפסטה, הלימון והפרמזן ומדללים במי הבישול.']);
SELECT pg_temp.demo_recipe('e2ec0000-0000-0000-0000-000000007003', 'e2e00000-0000-0000-0000-000000000070', 'e2e7ea00-0000-0000-0000-000000000070', 3,
  'עוף צלוי עם תפוחי אדמה', 'עור פריך ותפוחי אדמה רכים, בתבנית אחת.',
  'dinner', '90', '4', 'medium',
  ARRAY['1||עוף שלם', '1|ק"ג|תפוחי אדמה, ברבעים', '1||ראש שום, חצוי', '3|כפות|שמן זית', '4|ענפי|רוזמרין'],
  ARRAY['מחממים תנור ל-220 מעלות.',
        'מערבבים בתבנית את תפוחי האדמה והשום עם שמן, מלח ורוזמרין.',
        'משמנים וממליחים את העוף, מניחים מעל וצולים 75 דקות.']);
SELECT pg_temp.demo_recipe('e2ec0000-0000-0000-0000-000000007004', 'e2e00000-0000-0000-0000-000000000070', 'e2e7ea00-0000-0000-0000-000000000070', 4,
  'סלט יווני', 'עגבניות בשלות, מלפפון ופטה.',
  'lunch', '15', '4', 'easy',
  ARRAY['4||עגבניות', '1||מלפפון', '1||בצל סגול', '200|גרם|פטה', '1|חופן|זיתי קלמטה', '3|כפות|שמן זית'],
  ARRAY['חותכים את הירקות לקוביות גדולות.',
        'מוסיפים פטה וזיתים, מזלפים שמן ומתבלים.']);
SELECT pg_temp.demo_recipe('e2ec0000-0000-0000-0000-000000007005', 'e2e00000-0000-0000-0000-000000000070', 'e2e7ea00-0000-0000-0000-000000000070', 5,
  'באבקה שוקולד', 'לחם קלוע ורך עם מערבולות שוקולד מריר.',
  'dessert', '240', '10', 'hard',
  ARRAY['500|גרם|קמח', '7|גרם|שמרים יבשים', '100|גרם|סוכר', '3||ביצים', '150|גרם|חמאה רכה', '200|גרם|שוקולד מריר'],
  ARRAY['לשים את הקמח, השמרים, הסוכר, הביצים והחמאה לבצק רך ומתפיחים.',
        'מרדדים, מורחים את השוקולד המומס ומגלגלים בחוזקה.',
        'חוצים לאורך, קולעים ואופים ב-180 מעלות 35 דקות.']);
SELECT pg_temp.demo_recipe('e2ec0000-0000-0000-0000-000000007006', 'e2e00000-0000-0000-0000-000000000070', 'e2e7ea00-0000-0000-0000-000000000070', 6,
  'פנקייק בננה', 'פנקייקים אווריריים לבקרים רגועים.',
  'breakfast', '25', '4', 'easy',
  ARRAY['2||בננות בשלות', '2||ביצים', '200|גרם|קמח', '250|מ"ל|חלב', '1|כפית|אבקת אפייה'],
  ARRAY['מועכים את הבננות ומקציפים עם הביצים והחלב.',
        'מקפלים פנימה את הקמח ואבקת האפייה.',
        'מטגנים מצקות קטנות במחבת משומנת עד להזהבה משני הצדדים.']);
SELECT pg_temp.demo_recipe('e2ec0000-0000-0000-0000-000000007007', 'e2e00000-0000-0000-0000-000000000071', 'e2e7ea00-0000-0000-0000-000000000070', 7,
  'מרק עדשים כתומות', 'המרק של סבתא, מחמם ופשוט.',
  'dinner', '45', '6', 'easy',
  ARRAY['300|גרם|עדשים כתומות', '1||בצל', '2||גזרים', '1|כפית|כמון טחון', '1.5|ליטר|ציר ירקות'],
  ARRAY['מרככים את הבצל והגזר במעט שמן.',
        'מוסיפים עדשים, כמון וציר ומבשלים 25 דקות.',
        'טוחנים עד שמתקבל מרק חלק ומסיימים במיץ לימון.']);
SELECT pg_temp.demo_recipe('e2ec0000-0000-0000-0000-000000007008', 'e2e00000-0000-0000-0000-000000000071', 'e2e7ea00-0000-0000-0000-000000000070', 8,
  'קראמבל תפוחים', 'תפוחים חמים מתחת לפירורי חמאה.',
  'dessert', '60', '6', 'easy',
  ARRAY['6||תפוחים', '1|כפית|קינמון', '150|גרם|קמח', '100|גרם|חמאה קרה', '100|גרם|סוכר חום'],
  ARRAY['פורסים את התפוחים לתבנית ומערבבים עם הקינמון.',
        'מפוררים את הקמח, החמאה והסוכר ומפזרים מעל.',
        'אופים ב-180 מעלות 40 דקות עד להזהבה.']);

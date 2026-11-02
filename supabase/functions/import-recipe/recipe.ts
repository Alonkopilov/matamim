import { replaceTags } from "./html.ts";

// Matches the columns of public.recipes that an import fills in. Ingredient and
// instruction ids are added by the app.
export interface ImportedRecipe {
  name: string;
  description: string;
  prep_time: string;
  servings: string;
  category: string;
  difficulty: string;
  tags: string[];
  ingredients: { sort_order: number; amount: string; unit: string; item: string }[];
  instructions: { sort_order: number; text: string }[];
}

// Keep in sync with types/recipe.ts in the app, the property pickers only
// offer these values
const PREP_TIME_VALUES: number[] = [
  ...Array.from({ length: 12 }, (_, i) => (i + 1) * 5),
  ...Array.from({ length: 8 }, (_, i) => 75 + i * 15),
  ...Array.from({ length: 10 }, (_, i) => 210 + i * 30),
];
const MAX_SERVINGS = 50;
// Keys the app shows in the user's language
export const MEAL_OPTIONS = ["breakfast", "lunch", "dinner", "dessert"];
export const DIFFICULTY_OPTIONS = ["easy", "medium", "hard"];

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  frac12: "½",
  frac14: "¼",
  frac34: "¾",
  deg: "°",
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
  shy: "",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1].toLowerCase() === "x"
        ? parseInt(entity.slice(2), 16)
        : parseInt(entity.slice(1), 10);
      return isNaN(code) ? match : String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

// Hebrew abbreviations are often typed with an ASCII quote (ק"ג, אח"כ), which
// the model sometimes fails to escape in its JSON, cutting the text at the
// quote. The Hebrew gershayim looks the same and needs no escaping.
export function toGershayim(text: string): string {
  return text.replace(/([\u05D0-\u05EA])"(?=[\u05D0-\u05EA])/g, "$1\u05F4");
}

// The WP Recipe Maker plugin, used by many recipe sites, wraps an
// ingredient's notes in another pair of brackets and points to the page's
// notes: "4 drumsticks ((Note 1))", "mushrooms (, sliced)"
function tidyBrackets(text: string): string {
  return text
    .replace(/\s*\((?:see )?notes?(?: \d+)?\)/gi, "")
    .replace(/\(\s*,\s*/g, "(")
    .replace(/\(\(([^()]*)\)\)/g, "($1)")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+,/g, ",");
}

// Strips markup and entities that sites leave inside JSON-LD strings
export function cleanText(text: unknown): string {
  if (typeof text !== "string") return "";
  return tidyBrackets(
    toGershayim(decodeEntities(replaceTags(text, /<[^>]*>/g, " ")))
      .replace(/\s+/g, " "),
  ).trim();
}

// Snaps to the closest value the time wheel offers, "" when unknown
export function toPrepTime(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "";
  const closest = PREP_TIME_VALUES.reduce((best, value) =>
    Math.abs(value - minutes) < Math.abs(best - minutes) ? value : best
  );
  return String(closest);
}

export function toServings(servings: number | null | undefined): string {
  if (!servings || servings <= 0) return "";
  return String(Math.min(Math.round(servings), MAX_SERVINGS));
}

// Caps on what an import fills in. A real recipe fits easily, while text
// dumped into a page or a photo to fill the form is cut.
const MAX_NAME = 100;
const MAX_DESCRIPTION = 300;
const MAX_INGREDIENT = 150;
const MAX_STEP = 600;
const MAX_INGREDIENTS = 60;
const MAX_STEPS = 40;

// By code points, so an emoji or an accented letter isn't cut in half
function cut(text: string, max: number): string {
  const chars = [...text.trim()];
  return chars.length > max ? chars.slice(0, max).join("").trim() : text.trim();
}

export function buildRecipe(fields: {
  name: string;
  description: string;
  minutes: number | null;
  servings: number | null;
  category: string;
  difficulty: string;
  ingredients: { amount: string; unit: string; item: string }[];
  instructions: string[];
}): ImportedRecipe {
  return {
    name: cut(fields.name, MAX_NAME),
    description: cut(fields.description, MAX_DESCRIPTION),
    prep_time: toPrepTime(fields.minutes),
    servings: toServings(fields.servings),
    category: MEAL_OPTIONS.includes(fields.category) ? fields.category : "",
    difficulty: DIFFICULTY_OPTIONS.includes(fields.difficulty)
      ? fields.difficulty
      : "",
    tags: [],
    ingredients: fields.ingredients
      .map((i) => ({
        amount: cut(i.amount, MAX_INGREDIENT),
        unit: cut(i.unit, MAX_INGREDIENT),
        item: cut(i.item, MAX_INGREDIENT),
      }))
      .filter((i) => i.item || i.amount)
      .slice(0, MAX_INGREDIENTS)
      .map((i, index) => ({ sort_order: index, ...i })),
    instructions: fields.instructions
      .map((text) => cut(text, MAX_STEP))
      .filter(Boolean)
      .slice(0, MAX_STEPS)
      .map((text, index) => ({ sort_order: index, text })),
  };
}

import { cleanText } from "./recipe.ts";

type Json = any;

// The parts of a schema.org Recipe the model needs, without the images,
// reviews, ratings and nutrition that make up most of its size
export interface JsonLdRecipe {
  name: string;
  description: string;
  category: string;
  cuisine: string;
  keywords: string;
  yield: string;
  ingredients: string[];
  instructions: string[];
  // Computed here rather than by the model, since they're exact in the data
  minutes: number | null;
  servings: number | null;
}

// ISO 8601 duration ("PT1H30M", "P0DT0H45M") in minutes
function durationMinutes(value: Json): number | null {
  if (typeof value !== "string") return null;
  const match = value.match(
    /^P(?:(\d+)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+)S)?)?$/i,
  );
  if (!match) return null;
  const [, days, hours, minutes] = match.map((part) => Number(part) || 0);
  const total = days * 1440 + hours * 60 + minutes;
  return total > 0 ? Math.round(total) : null;
}

function firstNumber(value: Json): number | null {
  const values = Array.isArray(value) ? value : [value];
  for (const v of values) {
    const match = String(v ?? "").match(/\d+/);
    if (match) return Number(match[0]);
  }
  return null;
}

function joinText(value: Json): string {
  return (Array.isArray(value) ? value : [value]).map(cleanText)
    .filter(Boolean).join(", ");
}

// Instructions come as a string, a list of strings, HowToStep objects, or
// HowToSection objects that group more steps. Section names are kept as
// headings so the model knows where each group starts.
function flattenInstructions(value: Json): string[] {
  if (!value) return [];
  if (typeof value === "string") {
    return value.split(/\n+/).map(cleanText).filter(Boolean);
  }
  if (Array.isArray(value)) return value.flatMap(flattenInstructions);
  if (typeof value === "object") {
    if (value.itemListElement) {
      const heading = cleanText(value.name);
      const steps = flattenInstructions(value.itemListElement);
      return heading ? [`## ${heading}`, ...steps] : steps;
    }
    const text = cleanText(value.text) || cleanText(value.name);
    return text ? [text] : [];
  }
  return [];
}

function isRecipe(node: Json): boolean {
  const type = node?.["@type"];
  return type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"));
}

// Finds the Recipe node, which may sit in a list, an @graph or a mainEntity
function findRecipe(node: Json, depth = 0): Json | null {
  if (!node || typeof node !== "object" || depth > 5) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRecipe(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (isRecipe(node)) return node;
  return findRecipe(node["@graph"], depth + 1) ??
    findRecipe(node.mainEntity, depth + 1);
}

/**
 * Reads the schema.org Recipe that most recipe sites embed for search engines.
 * @returns null when there is none, or it is missing ingredients or steps.
 */
export function extractJsonLdRecipe(html: string): JsonLdRecipe | null {
  const scripts = html.matchAll(
    /<script[^>]+type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi,
  );

  for (const [, content] of scripts) {
    let data: Json;
    try {
      data = JSON.parse(content.trim());
    } catch {
      continue;
    }

    const node = findRecipe(data);
    if (!node) continue;

    const ingredientLines: Json[] = Array.isArray(node.recipeIngredient)
      ? node.recipeIngredient
      : Array.isArray(node.ingredients)
      ? node.ingredients
      : [];
    const recipe: JsonLdRecipe = {
      name: cleanText(node.name),
      description: cleanText(node.description),
      category: joinText(node.recipeCategory),
      cuisine: joinText(node.recipeCuisine),
      keywords: joinText(node.keywords),
      yield: joinText(node.recipeYield),
      ingredients: ingredientLines.map(cleanText).filter(Boolean),
      instructions: flattenInstructions(node.recipeInstructions),
      minutes: durationMinutes(node.totalTime) ??
        ((durationMinutes(node.prepTime) ?? 0) +
            (durationMinutes(node.cookTime) ?? 0) || null),
      servings: firstNumber(node.recipeYield),
    };

    if (recipe.ingredients.length > 0 && recipe.instructions.length > 0) {
      return recipe;
    }
  }

  return null;
}

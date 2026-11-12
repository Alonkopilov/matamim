import type { Recipe } from "@/types/recipe";
import * as Crypto from "expo-crypto";

// The id of a new ingredient or step, which its tick and React key go by
export const newItemId = () => Crypto.randomUUID();

/**
 * Gives every ingredient and step that has no id, or one an earlier item in
 * its list already has, a new id. Recipes from older versions of the app have
 * ingredients without ids, and then ticking one ticked them all. Changes the
 * recipe in place and returns it.
 */
export function ensureItemIds(recipe: Recipe): Recipe {
  for (const items of [recipe.ingredients, recipe.instructions]) {
    const seen = new Set<string>();
    for (const item of items) {
      if (!item.id || seen.has(item.id)) item.id = newItemId();
      seen.add(item.id);
    }
  }
  return recipe;
}

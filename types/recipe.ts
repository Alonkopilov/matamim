import { TextInput } from "react-native";

export interface Ingredient {
  id: string;
  sort_order: number;
  item: string;
  amount: string;
  unit: string;
}

export interface Instruction {
  id: string;
  sort_order: number;
  text: string;
}

export interface Recipe {
  id: string;
  user_id: string;
  name: string;
  description: string;
  image: string;
  prep_time: string;
  difficulty: string;
  category: string;
  servings: string;
  tags: string[];
  ingredients: Ingredient[];
  instructions: Instruction[];
  is_public: boolean;
  // Set by the server from the owner's profile
  owner_name?: string;
}

export interface IngredientRowRefs {
  amount: TextInput | null;
  unit: TextInput | null;
  item: TextInput | null;
}

export const EMPTY_RECIPE: Recipe = {
  id: "",
  user_id: "",
  name: "",
  description: "",
  image: "",
  ingredients: [],
  instructions: [],
  prep_time: "",
  servings: "",
  category: "",
  difficulty: "",
  tags: [],
  is_public: false,
};

// Minutes, finer steps for short recipes and coarser ones for long cooks
export const PREP_TIME_VALUES: number[] = [
  ...Array.from({ length: 12 }, (_, i) => (i + 1) * 5), // 5-60
  ...Array.from({ length: 8 }, (_, i) => 75 + i * 15), // 75-180
  ...Array.from({ length: 10 }, (_, i) => 210 + i * 30), // 210-480
];

export const SERVINGS_VALUES: number[] = Array.from(
  { length: 50 },
  (_, i) => i + 1,
);

// Stored on recipes as these keys and shown through the "meals" and
// "difficulties" translations. Keep in sync with the import-recipe function.
export const MEAL_KEYS = ["breakfast", "lunch", "dinner", "dessert"] as const;
export type MealKey = (typeof MEAL_KEYS)[number];

export const DIFFICULTY_KEYS = ["easy", "medium", "hard"] as const;
export type DifficultyKey = (typeof DIFFICULTY_KEYS)[number];

export const isMealKey = (value: string | undefined): value is MealKey =>
  MEAL_KEYS.includes(value as MealKey);

export const isDifficultyKey = (
  value: string | undefined,
): value is DifficultyKey => DIFFICULTY_KEYS.includes(value as DifficultyKey);

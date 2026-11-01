import type MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ComponentProps } from "react";
import { MealKey } from "./recipe";

export interface CategoryMap {
  // The meal a recipe is saved with, and its label under "categories"
  key: MealKey;
  icon: ComponentProps<typeof MaterialIcons>["name"];
}

export const categories: CategoryMap[] = [
  {
    key: "breakfast",
    icon: "egg-alt",
  },
  {
    key: "lunch",
    icon: "lunch-dining",
  },
  {
    key: "dinner",
    icon: "dinner-dining",
  },
  {
    key: "dessert",
    icon: "emoji-food-beverage",
  },
];

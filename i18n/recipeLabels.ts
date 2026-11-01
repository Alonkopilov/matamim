import { isDifficultyKey, isMealKey } from "@/types/recipe";
import i18n from ".";

// A value that isn't a known key (text typed before there were pickers) is
// shown as it was saved

export const mealLabel = (value: string | undefined) =>
  isMealKey(value) ? i18n.t(`meals.${value}`) : (value ?? "");

export const difficultyLabel = (value: string | undefined) =>
  isDifficultyKey(value) ? i18n.t(`difficulties.${value}`) : (value ?? "");

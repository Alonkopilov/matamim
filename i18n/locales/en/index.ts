import account from "./account.json";
import auth from "./auth.json";
import categories from "./categories.json";
import common from "./common.json";
import difficulties from "./difficulties.json";
import errors from "./errors.json";
import home from "./home.json";
import meals from "./meals.json";
import premium from "./premium.json";
import recipe from "./recipe.json";
import recipeImport from "./recipeImport.json";
import recipes from "./recipes.json";
import settings from "./settings.json";
import tabs from "./tabs.json";
import team from "./team.json";

// One file per namespace, so screens can be translated without touching
// each other's files
export default {
  common,
  tabs,
  categories,
  meals,
  difficulties,
  home,
  recipes,
  settings,
  team,
  errors,
  account,
  auth,
  recipe,
  recipeImport,
  premium,
};

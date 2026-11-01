// The recipes in the app's own storage on the device, read by the probe, not
// from the screen. Sets output.deviceRecipeCount, output.deviceRecipeNames
// (sorted, joined by "|"), output.deviceRecipeOwners (the distinct user_ids,
// sorted, joined by ","), output.devicePending (changes waiting to upload)
// output.deviceTeamRecipeCount (team members' recipes kept on the device),
// output.deviceTeamNames (their names, sorted, joined by "|") and
// output.deviceImages (by recipe name, its image: "local:<file>" while it's
// only on the device, its path in Storage once uploaded).
// output.deviceRecipes is by recipe name: { ingredients: [{amount, unit,
// item}] and steps: [text], both in sort_order, and sortOrdersOk }.
// Fails if the app's storage couldn't be read, so 0 recipes means none saved.
const body = json(http.get("http://127.0.0.1:54399/device-recipes").body);
if (body.error) throw new Error("probe: " + body.error);
if (!body.storage_read) throw new Error("probe: the app's storage wasn't read");
const names = body.recipes.map((recipe) => recipe.name).sort();
const owners = [];
for (const recipe of body.recipes) {
  if (owners.indexOf(recipe.user_id) === -1) owners.push(recipe.user_id);
}
output.deviceRecipeCount = body.recipes.length;
output.deviceRecipeNames = names.join("|");
output.deviceRecipeOwners = owners.sort().join(",");
output.devicePending = body.pending;
output.deviceTeamRecipeCount = body.team_recipes;
output.deviceTeamNames = body.team_names.join("|");
output.deviceImages = {};
output.deviceRecipes = {};
for (const recipe of body.recipes) {
  output.deviceImages[recipe.name] = recipe.image;
  output.deviceRecipes[recipe.name] = {
    ingredients: recipe.ingredients,
    steps: recipe.steps,
    sortOrdersOk: recipe.sort_orders_ok,
  };
}
console.log(
  "Device recipes: " + output.deviceRecipeNames + " owned by " +
    output.deviceRecipeOwners + ", " + body.pending + " pending",
);

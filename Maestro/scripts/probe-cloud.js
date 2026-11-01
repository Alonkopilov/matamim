// USER's recipes and images in the cloud, and its cloud sync state. Sets:
//   output.cloudNames         live recipes' names, sorted, joined by "|"
//   output.cloudDeletedNames  recipes marked deleted, the same way
//   output.cloudRowCount      every row, deleted ones included
//   output.cloudRecipe        by name: { id, category, image, isDeleted,
//                             updatedAt, ingredientCount, firstIngredient }
//   output.cloudImages        image paths in Storage, sorted, joined by "|"
//   output.cloudImageSizes    "<path>=<bytes>", the same way
//   output.cloudSetting       is_syncing_to_cloud in Auth: "true", "false"
//                             or "" when not set
//   output.cloudOffSeconds    how long ago cloud sync was turned off, -1 when
//                             it's on (or never turned off)
//   output.cloudPurged        the cloud copy was deleted and not restored yet
const body = json(http.get("http://127.0.0.1:54399/cloud?user=" + USER).body);
if (body.error) throw new Error("probe: " + body.error);
const live = [];
const deleted = [];
output.cloudRecipe = {};
for (const row of body.recipes) {
  (row.is_deleted ? deleted : live).push(row.name);
  output.cloudRecipe[row.name] = {
    id: row.id,
    category: row.category,
    image: row.image,
    isDeleted: row.is_deleted,
    updatedAt: row.updated_at,
    ingredientCount: row.ingredient_count,
    firstIngredient: row.first_ingredient,
  };
}
output.cloudNames = live.sort().join("|");
output.cloudDeletedNames = deleted.sort().join("|");
output.cloudRowCount = body.recipes.length;
output.cloudImages = body.images.map((image) => image.name).join("|");
output.cloudImageSizes = body.images
  .map((image) => image.name + "=" + image.size)
  .join("|");
output.cloudSetting = body.setting || "";
const state = body.state;
output.cloudOffSeconds =
  state && state.off_since !== null ? state.off_seconds : -1;
output.cloudPurged = !!(state && state.purged_at);
console.log(
  "Cloud of " + USER + ": [" + output.cloudNames + "], deleted [" +
    output.cloudDeletedNames + "], images [" + output.cloudImageSizes +
    "], setting " + output.cloudSetting + ", off " + output.cloudOffSeconds +
    " s, purged " + output.cloudPurged,
);

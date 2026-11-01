// Runs the nightly purge (purge_cloud_sync_off_recipes): deletes the cloud
// copy of accounts with cloud sync off, or premium ended, for over 30 days.
// Sets output.purgedRecipes, how many rows it deleted.
const body = json(
  http.post("http://127.0.0.1:54399/purge-cloud", { body: "" }).body,
);
if (body.error) throw new Error("probe: " + body.error);
output.purgedRecipes = body.purged;
console.log("Purged " + body.purged + " recipes");

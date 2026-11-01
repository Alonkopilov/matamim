// Adds a recipe to EMAIL's account the way another device logged in to it
// would: logs in with the password and inserts the row through the API.
// NAME is the title, CATEGORY the meal key ("lunch"). Sets
// output.otherDeviceRecipeId.
const body = json(
  http.post(
    "http://127.0.0.1:54399/other-device?email=" + encodeURIComponent(EMAIL) +
      "&name=" + encodeURIComponent(NAME) + "&category=" + CATEGORY,
    { body: "" },
  ).body,
);
if (body.error) throw new Error("probe: " + body.error);
output.otherDeviceRecipeId = body.id;

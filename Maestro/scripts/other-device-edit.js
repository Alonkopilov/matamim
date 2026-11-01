// Edits EMAIL's recipe ID the way another device logged in to the account
// would, through the API. NAME and INGREDIENT (the first ingredient's item)
// are optional, pass "" to leave them; DELETED "1" marks it deleted. The
// row's updated_at is bumped by the database like for an edit from the app.
// Sets output.otherDeviceEditUpdatedAt.
const body = json(
  http.post(
    "http://127.0.0.1:54399/other-device-edit?email=" + encodeURIComponent(EMAIL) +
      "&id=" + ID + "&name=" + encodeURIComponent(NAME) +
      "&ingredient=" + encodeURIComponent(INGREDIENT) + "&deleted=" + DELETED,
    { body: "" },
  ).body,
);
if (body.error) throw new Error("probe: " + body.error);
output.otherDeviceEditUpdatedAt = body.updated_at;

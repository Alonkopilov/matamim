// Puts an all-magenta photo in the device's gallery, as its only photo, for
// subflows/pick-photo.yaml
const body = json(
  http.post("http://127.0.0.1:54399/gallery-photo", { body: "" }).body,
);
if (body.error) throw new Error("probe: " + body.error);

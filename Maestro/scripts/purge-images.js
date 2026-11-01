// Runs the nightly cleanup of images no recipe points to (the purge-images
// function) on USER's images, after making them look old enough for it.
// Sets output.purgedImages, how many it removed (USER's or not).
const body = json(
  http.post("http://127.0.0.1:54399/purge-images?user=" + USER, { body: "" })
    .body,
);
if (body.error) throw new Error("probe: " + body.error);
output.purgedImages = body.removed;
console.log("Removed " + body.removed + " images");

// The image copies the app keeps on the device while cloud sync is off, read
// from the app's files. Sets output.keptImages (file names, which are the
// image paths with "/" as "_", sorted, joined by "|") and
// output.keptImageCount.
const body = json(http.get("http://127.0.0.1:54399/kept-images").body);
if (body.error) throw new Error("probe: " + body.error);
output.keptImages = body.files.join("|");
output.keptImageCount = body.files.length;
console.log("Kept images: " + (output.keptImages || "none"));

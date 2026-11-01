// Every photo file the app has on the device, read from the app's files.
// Sets output.cachedImageCount (downloads cached by expo-image),
// output.localImageCount (the app's own photos, not uploaded yet) and
// output.keptImageCount (copies kept while cloud sync is off).
const body = json(http.get("http://127.0.0.1:54399/device-images").body);
if (body.error) throw new Error("probe: " + body.error);
output.cachedImageCount = body.cached.length;
output.localImageCount = body.local.length;
output.keptImageCount = body.kept.length;
console.log(
  "Device images: cached " + body.cached.length + ", local " +
    body.local.length + ", kept " + body.kept.length,
);

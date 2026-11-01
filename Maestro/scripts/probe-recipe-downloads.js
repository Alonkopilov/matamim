// How USER's recipes were downloaded since SINCE, from Kong's access log.
// Sets:
//   output.fullDownloads         fetches of all of USER's recipes
//   output.incrementalDownloads  fetches of only those changed since the
//                                last sync (updated_at=gt.)
//   output.idChecks              fetches of USER's recipe ids only (the
//                                check that every recipe reached the device)
//   output.imageDownloads        recipe photos downloaded from Storage
function requests(path) {
  const body = json(
    http.get(
      "http://127.0.0.1:54399/requests?since=" + SINCE + "&path=" + path,
    ).body,
  );
  if (body.error) throw new Error("probe: " + body.error);
  return body.requests;
}
const own = requests("/rest/v1/recipes").filter(
  (request) =>
    request.indexOf("GET ") === 0 &&
    request.indexOf("user_id=eq." + USER) !== -1,
);
const all = own.filter((request) => request.indexOf("select=*") !== -1);
output.incrementalDownloads = all.filter(
  (request) => request.indexOf("updated_at=gt.") !== -1,
).length;
output.fullDownloads = all.length - output.incrementalDownloads;
output.idChecks = own.filter(
  (request) => request.indexOf("select=id") !== -1,
).length;
output.imageDownloads = requests(
  "/storage/v1/object/authenticated/recipe-images/",
).length;
console.log(
  "Downloads of " + USER + ": full " + output.fullDownloads +
    ", incremental " + output.incrementalDownloads + ", id checks " +
    output.idChecks + ", images " + output.imageDownloads,
);

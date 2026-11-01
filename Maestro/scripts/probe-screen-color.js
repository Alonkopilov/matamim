// The share of the screen (0 to 1) in the color RGB (hex, e.g. "ff00ff"), in
// output.screenColorShare. Seeded photos are a single bright color no screen
// of the app has otherwise, so a share above 0 means the photo is shown.
const body = json(
  http.get("http://127.0.0.1:54399/screen-color?rgb=" + RGB).body,
);
if (body.error) throw new Error("probe: " + body.error);
output.screenColorShare = body.share;
console.log("Screen in #" + RGB + ": " + body.share);

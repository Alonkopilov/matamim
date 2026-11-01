// The live recipes EMAIL can read through the API, as row level security
// allows (its own and its team's). Sets output.visibleNames, sorted, joined
// by "|".
const body = json(
  http.get("http://127.0.0.1:54399/visible-recipes?email=" + encodeURIComponent(EMAIL)).body,
);
if (body.error) throw new Error("probe: " + body.error);
output.visibleNames = body.names.join("|");
console.log("Visible to " + EMAIL + ": " + output.visibleNames);

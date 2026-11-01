// Makes USER's cloud sync look turned off DAYS days earlier, so the purge 30
// days later can be checked without waiting
const body = json(
  http.post(
    "http://127.0.0.1:54399/age-sync-off?user=" + USER + "&days=" + DAYS,
    { body: "" },
  ).body,
);
if (body.error) throw new Error("probe: " + body.error);

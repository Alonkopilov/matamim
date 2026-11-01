// Makes TEAM's invite codes look created SECONDS seconds earlier, so they
// expire without waiting 5 minutes
const body = json(
  http.post(
    "http://127.0.0.1:54399/age-invites?team=" + TEAM + "&seconds=" + SECONDS,
    { body: "" },
  ).body,
);
if (body.error) throw new Error("probe: " + body.error);

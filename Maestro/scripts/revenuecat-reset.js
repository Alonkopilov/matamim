// Deletes USER's customer from RevenueCat, with its Test Store purchases, so
// a seeded account starts free even after an earlier run bought premium. The
// probe refuses any id that isn't a seeded e2e account.
const response = http.post(
  "http://127.0.0.1:54399/revenuecat-reset?user=" + USER,
  { body: "" },
);
const body = json(response.body);
if (body.error) throw new Error("probe: " + body.error);

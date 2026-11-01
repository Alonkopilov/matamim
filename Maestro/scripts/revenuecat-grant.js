// Gives USER lifetime premium in RevenueCat (a promotional entitlement),
// unless it has premium there already, so a seeded account is premium
// without a purchase. Kept across runs. The probe refuses any id that isn't a
// seeded e2e account. Sets output.revenuecatGranted (granted just now).
const body = json(
  http.post("http://127.0.0.1:54399/revenuecat-grant?user=" + USER, {
    body: "",
  }).body,
);
if (body.error) throw new Error("probe: " + body.error);
if (!body.active) throw new Error("RevenueCat doesn't report premium for " + USER);
output.revenuecatGranted = body.granted;

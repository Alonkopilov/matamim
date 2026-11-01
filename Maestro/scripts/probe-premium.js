// USER's premium as the server sees it. Sets output.dbPremiumRows (rows in
// premium_entitlements), output.dbPremium (one of them is active, what upload
// policies check) and output.revenuecatPremium (RevenueCat's REST API has
// the entitlement active)
const body = json(http.get("http://127.0.0.1:54399/premium?user=" + USER).body);
if (body.error) throw new Error("probe: " + body.error);
output.dbPremiumRows = body.db_rows;
output.dbPremium = body.db_active;
output.revenuecatPremium = body.revenuecat_active;
console.log(
  "Premium " + USER + ": db rows " + body.db_rows + ", db active " +
    body.db_active + ", RevenueCat " + body.revenuecat_active,
);

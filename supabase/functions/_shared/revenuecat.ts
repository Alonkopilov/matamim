const REVENUECAT_SECRET_API_KEY = Deno.env.get("REVENUECAT_SECRET_API_KEY");
const PREMIUM_ENTITLEMENT_ID = Deno.env.get("REVENUECAT_ENTITLEMENT_ID") ??
  "premium";
// Hosts SUPABASE_URL has on a local stack (`supabase start` / `functions serve`)
const LOCAL_HOSTS = new Set(["kong", "localhost", "127.0.0.1"]);

/**
 * Whether this runs against a local Supabase. RevenueCat entitlements are
 * shared by the whole project, so a free sandbox, TestFlight or Test Store
 * purchase would otherwise give real premium; they only count locally (dev
 * and E2E). The CLI sets SUPABASE_URL and won't take it from an env file or
 * `secrets set`, so this can't be switched on in production by mistake.
 * Internal testers get premium from a promotional grant in RevenueCat.
 */
function isLocalSupabase() {
  try {
    return LOCAL_HOSTS.has(
      new URL(Deno.env.get("SUPABASE_URL") ?? "").hostname,
    );
  } catch {
    return false;
  }
}

type AdminClient = { from: (table: string) => any };

type Purchase = { is_sandbox?: boolean; store?: string };

/** The purchase behind an entitlement, from the subscriber's purchases */
function entitlementPurchase(
  subscriber: any,
  productId: string,
): Purchase | undefined {
  const subscription = subscriber?.subscriptions?.[productId];
  if (subscription) return subscription;
  // One-time purchases, newest last
  return subscriber?.non_subscriptions?.[productId]?.at(-1);
}

function isTestPurchase(purchase: Purchase) {
  return purchase.is_sandbox === true || purchase.store === "test_store";
}

/**
 * Whether the entitlement comes from a real purchase. Fails closed: when the
 * purchase behind it can't be found, it can't be shown not to be a test one.
 */
function isRealEntitlement(subscriber: any, entitlement: any, userId: string) {
  if (isLocalSupabase()) return true;
  const purchase = entitlementPurchase(
    subscriber,
    entitlement.product_identifier,
  );
  if (!purchase) {
    console.warn(
      "Ignoring premium with no matching purchase for",
      userId,
      entitlement.product_identifier,
    );
    return false;
  }
  if (isTestPurchase(purchase)) {
    console.warn("Ignoring a sandbox premium purchase for", userId);
    return false;
  }
  return true;
}

/**
 * Reads the user's premium entitlement from RevenueCat and mirrors it into
 * premium_entitlements, which is what RLS checks. RevenueCat's customer id
 * is the Supabase user id (the app calls Purchases.logIn with it).
 * @returns Whether the user is premium right now.
 */
export async function refreshPremium(
  supabaseAdmin: AdminClient,
  userId: string,
): Promise<boolean> {
  if (!REVENUECAT_SECRET_API_KEY) {
    throw new Error("REVENUECAT_SECRET_API_KEY is not set");
  }

  const res = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
    { headers: { Authorization: `Bearer ${REVENUECAT_SECRET_API_KEY}` } },
  );
  if (!res.ok) {
    throw new Error(`RevenueCat request failed: ${res.status}`);
  }

  const { subscriber } = await res.json();
  let entitlement = subscriber?.entitlements?.[PREMIUM_ENTITLEMENT_ID];
  if (entitlement && !isRealEntitlement(subscriber, entitlement, userId)) {
    entitlement = undefined;
  }

  if (!entitlement) {
    // Ends premium now instead of deleting the row (a refund, a transfer, or
    // a test purchase): purge_cloud_sync_off_recipes() deletes the cloud copy
    // 30 days after expires_at, and needs the row for that. A row that has
    // already expired keeps its date, so the countdown doesn't restart.
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("premium_entitlements")
      .update({ expires_at: now, updated_at: now })
      .eq("user_id", userId)
      .or(`expires_at.is.null,expires_at.gt.${now}`);
    if (error) throw error;
    return false;
  }

  // Expired entitlements are kept too, is_user_premium() checks the date
  const expiresAt: string | null = entitlement.expires_date ?? null;
  const { error } = await supabaseAdmin
    .from("premium_entitlements")
    .upsert({
      user_id: userId,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    });
  if (error) throw error;

  return expiresAt === null || new Date(expiresAt) > new Date();
}

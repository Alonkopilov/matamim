// Run: cd supabase/functions/_shared && REVENUECAT_SECRET_API_KEY=test deno test --allow-env revenuecat_test.ts
import { refreshPremium } from "./revenuecat.ts";

const USER = "11111111-1111-1111-1111-111111111111";
const FUTURE = "2099-01-01T00:00:00Z";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

/** Answers RevenueCat's subscriber request with the given subscriber */
function stubRevenueCat(subscriber: unknown) {
  globalThis.fetch = () =>
    Promise.resolve(Response.json({ subscriber }));
}

/** Records the premium_entitlements writes refreshPremium makes */
function fakeAdmin() {
  const calls: { op: string; values?: any; filters: string[] }[] = [];
  const builder = (op: string, values?: any) => {
    const call = { op, values, filters: [] as string[] };
    calls.push(call);
    const chain: any = {
      eq: (col: string, val: string) => {
        call.filters.push(`${col}=${val}`);
        return chain;
      },
      or: (filter: string) => {
        call.filters.push(`or(${filter})`);
        return chain;
      },
      then: (resolve: (r: { error: null }) => void) => resolve({ error: null }),
    };
    return chain;
  };
  return {
    calls,
    client: {
      from: () => ({
        update: (values: any) => builder("update", values),
        upsert: (values: any) => builder("upsert", values),
        delete: () => builder("delete"),
      }),
    },
  };
}

const entitlement = { product_identifier: "premium_monthly", expires_date: FUTURE };

Deno.test("a real purchase is mirrored as premium", async () => {
  stubRevenueCat({
    entitlements: { premium: entitlement },
    subscriptions: { premium_monthly: { is_sandbox: false, store: "play_store" } },
  });
  const admin = fakeAdmin();
  assert(await refreshPremium(admin.client, USER), "should be premium");
  assert(admin.calls[0].op === "upsert", "should upsert");
  assert(admin.calls[0].values.expires_at === FUTURE, "should keep the expiry");
});

Deno.test("a sandbox purchase isn't premium", async () => {
  stubRevenueCat({
    entitlements: { premium: entitlement },
    subscriptions: { premium_monthly: { is_sandbox: true, store: "play_store" } },
  });
  const admin = fakeAdmin();
  assert(!(await refreshPremium(admin.client, USER)), "should not be premium");
  assert(admin.calls[0].op === "update", "should end premium, not upsert");
});

Deno.test("F5: no matching purchase isn't premium", async () => {
  stubRevenueCat({
    entitlements: { premium: entitlement },
    subscriptions: {},
    non_subscriptions: {},
  });
  const admin = fakeAdmin();
  assert(!(await refreshPremium(admin.client, USER)), "should fail closed");
  assert(admin.calls[0].op === "update", "should end premium, not upsert");
});

Deno.test("F14: a dropped entitlement expires the row instead of deleting it", async () => {
  stubRevenueCat({ entitlements: {}, subscriptions: {} });
  const admin = fakeAdmin();
  assert(!(await refreshPremium(admin.client, USER)), "should not be premium");
  assert(admin.calls.length === 1, "one write");
  const call = admin.calls[0];
  assert(call.op === "update", `should update, got ${call.op}`);
  assert(call.values.expires_at, "should set expires_at");
  assert(call.filters.includes(`user_id=${USER}`), "only this user");
  assert(
    call.filters.some((f) => f.startsWith("or(expires_at.is.null,expires_at.gt.")),
    "should leave already-expired rows alone",
  );
});

// Run: cd supabase/functions/_shared && REVENUECAT_SECRET_API_KEY=test deno test --allow-env revenuecat_test.ts
import { refreshPremium } from "./revenuecat.ts";

const PROD_URL = "https://abcdefghijklmnop.supabase.co";
const LOCAL_URL = "http://kong:8000";
// Tests run as production unless they say otherwise
Deno.env.set("SUPABASE_URL", PROD_URL);

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

Deno.test("F12: a sandbox purchase counts against a local Supabase", async () => {
  Deno.env.set("SUPABASE_URL", LOCAL_URL);
  try {
    stubRevenueCat({
      entitlements: { premium: entitlement },
      subscriptions: { premium_monthly: { store: "test_store" } },
    });
    const admin = fakeAdmin();
    assert(await refreshPremium(admin.client, USER), "should be premium locally");
    assert(admin.calls[0].op === "upsert", "should upsert");
  } finally {
    Deno.env.set("SUPABASE_URL", PROD_URL);
  }
});

Deno.test("F12: a missing or bad SUPABASE_URL counts as production", async () => {
  for (const url of [undefined, "not a url", "https://kong.example.com"]) {
    if (url === undefined) Deno.env.delete("SUPABASE_URL");
    else Deno.env.set("SUPABASE_URL", url);
    try {
      stubRevenueCat({
        entitlements: { premium: entitlement },
        subscriptions: { premium_monthly: { store: "test_store" } },
      });
      assert(
        !(await refreshPremium(fakeAdmin().client, USER)),
        `should not be premium with SUPABASE_URL=${url}`,
      );
    } finally {
      Deno.env.set("SUPABASE_URL", PROD_URL);
    }
  }
});

Deno.test("a promotional grant from the dashboard is premium", async () => {
  const promo = { product_identifier: "rc_promo_premium_monthly", expires_date: FUTURE };
  stubRevenueCat({
    entitlements: { premium: promo },
    subscriptions: {
      rc_promo_premium_monthly: { is_sandbox: false, store: "promotional" },
    },
  });
  const admin = fakeAdmin();
  assert(await refreshPremium(admin.client, USER), "should be premium");
  assert(admin.calls[0].op === "upsert", "should upsert");
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

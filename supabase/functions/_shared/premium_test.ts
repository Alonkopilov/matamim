// Run: cd supabase/functions/_shared && deno test --node-modules-dir=none premium_test.ts
import { isActiveEntitlement, isPremium } from "./premium.ts";

const USER = "11111111-1111-1111-1111-111111111111";
const NOW = new Date("2026-11-02T12:00:00Z");

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

/** A client whose premium_entitlements lookup returns the given result */
function fakeAdmin(result: { data: unknown; error: unknown }) {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => Promise.resolve(result),
  };
  return { from: () => chain };
}

Deno.test("no expiry is a lifetime purchase", () => {
  assert(isActiveEntitlement({ expires_at: null }, NOW), "lifetime should count");
});

Deno.test("a future expiry counts, a past or current one doesn't", () => {
  assert(isActiveEntitlement({ expires_at: "2026-12-01T00:00:00Z" }, NOW), "future should count");
  assert(!isActiveEntitlement({ expires_at: "2026-11-01T00:00:00Z" }, NOW), "past shouldn't count");
  assert(!isActiveEntitlement({ expires_at: NOW.toISOString() }, NOW), "now shouldn't count");
});

Deno.test("a user without a row isn't premium", async () => {
  assert(!(await isPremium(fakeAdmin({ data: null, error: null }), USER)), "no row should be free");
});

Deno.test("a user whose Premium ended isn't premium", async () => {
  const admin = fakeAdmin({ data: { expires_at: "2020-01-01T00:00:00Z" }, error: null });
  assert(!(await isPremium(admin, USER)), "expired should be free");
});

Deno.test("an active or lifetime row is premium", async () => {
  assert(await isPremium(fakeAdmin({ data: { expires_at: "2099-01-01T00:00:00Z" }, error: null }), USER), "active");
  assert(await isPremium(fakeAdmin({ data: { expires_at: null }, error: null }), USER), "lifetime");
});

Deno.test("a failed lookup throws instead of answering", async () => {
  let threw = false;
  try {
    await isPremium(fakeAdmin({ data: null, error: { message: "boom" } }), USER);
  } catch {
    threw = true;
  }
  assert(threw, "a lookup error must not be read as free or premium");
});

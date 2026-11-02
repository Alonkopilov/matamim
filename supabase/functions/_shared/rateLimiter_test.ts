// Run: cd supabase/functions/_shared && deno test --allow-env --node-modules-dir=none rateLimiter_test.ts
// Each test waits for Upstash's 5 s timeout, so the file takes about 10 s

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

// rateLimiter.ts reads these when it's first imported
Deno.env.set("UPSTASH_REDIS_REST_URL", "https://redis.test.invalid");
Deno.env.set("UPSTASH_REDIS_REST_TOKEN", "test");
const { enforceRateLimit } = await import("./rateLimiter.ts");

/** Makes every Redis request hang, the way a slow Upstash would */
function stubHangingRedis() {
  globalThis.fetch = () => new Promise<Response>(() => {});
}

Deno.test("a failClosed limit refuses the request when Redis hangs", async () => {
  stubHangingRedis();
  const res = await enforceRateLimit("user-1", "test-closed", {
    requests: 5,
    duration: "10 s",
    failClosed: true,
  });
  assert(res !== null, "the request was let through");
  assert(res!.status === 503, `expected 503, got ${res!.status}`);
  const body = await res!.json();
  assert(body.code === "RATE_LIMITED", `expected RATE_LIMITED, got ${body.code}`);
});

Deno.test("a fail-open limit lets the request through when Redis hangs", async () => {
  stubHangingRedis();
  const res = await enforceRateLimit("user-1", "test-open", {
    requests: 5,
    duration: "10 s",
  });
  assert(res === null, `expected null, got status ${res?.status}`);
});

import { Ratelimit } from "npm:@upstash/ratelimit@2.1.0";
import { Redis } from "npm:@upstash/redis@1.39.0";
import { errorResponse } from "./errors.ts";

const redisUrl = Deno.env.get("UPSTASH_REDIS_REST_URL");
const redisToken = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");

const redis = redisUrl && redisToken
  ? new Redis({ url: redisUrl, token: redisToken })
  : null;

if (!redis) {
  console.warn("Rate limiting disabled: UPSTASH_REDIS_REST_URL/TOKEN are not set");
}

interface RateLimitConfig {
  requests: number;  // Number of requests allowed
  duration: string;  // Window duration string (e.g., "10 s", "1 m", "24 h")
  // Reject the request if Redis is unreachable or not configured. Use for
  // endpoints that are brute-force targets (e.g. guessing invite codes).
  failClosed?: boolean;
  // Sent instead of the default error, e.g. for a usage quota
  error?: {
    code: string;
    params?: Record<string, string | number>;
  };
}

/**
 * Throttles user requests using an elegant sliding window algorithm over Upstash Redis.
 * @returns A JSON Response object if limited, or null if the user is cleared to proceed.
 */
export async function enforceRateLimit(
  userId: string,
  actionName: string,
  config: RateLimitConfig = { requests: 5, duration: "10 s" }
): Promise<Response | null> {
  if (!redis) {
    return config.failClosed ? errorResponse(503, "RATE_LIMITED") : null;
  }

  try {
    const ratelimit = new Ratelimit({
      redis: redis,
      limiter: Ratelimit.slidingWindow(config.requests, config.duration as any),
      prefix: `@ratelimit:${actionName}`, // Isolate counts between endpoints
    });

    const { success, limit, reset, remaining } = await ratelimit.limit(userId);

    if (!success) {
      const error = config.error ?? { code: "RATE_LIMITED" };
      return errorResponse(429, error.code, {
        params: error.params,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "X-RateLimit-Limit": limit.toString(),
          "X-RateLimit-Remaining": remaining.toString(),
          "X-RateLimit-Reset": reset.toString(),
        },
      });
    }

    return null;
  } catch (err) {
    console.error("Rate limiting tracking error: ", err);
    if (config.failClosed) {
      return errorResponse(503, "RATE_LIMITED");
    }
    return null;
  }
}

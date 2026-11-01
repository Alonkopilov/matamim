import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { enforceRateLimit } from "../_shared/rateLimiter.ts";
import { refreshPremium } from "../_shared/revenuecat.ts";

// Called by the app after login and after a purchase or restore, so the
// server knows about a new purchase before the webhook arrives. Also the only
// way premium reaches a local Supabase, which RevenueCat's webhooks can't reach.
export default {
  fetch: withSupabase({ auth: "user" }, async (_req, ctx) => {
    try {
      const userId = ctx.userClaims?.id;
      if (!userId) {
        return Response.json({ error: "Unauthorized user identity" }, {
          status: 401,
        });
      }

      const rateLimitResponse = await enforceRateLimit(userId, "sync-premium", {
        requests: 5,
        duration: "10 s",
      });

      if (rateLimitResponse) return rateLimitResponse;

      const isPremium = await refreshPremium(ctx.supabaseAdmin, userId);

      return Response.json({ success: true, isPremium });
    } catch (err: any) {
      return Response.json(
        { error: err.message || "Internal Server Error" },
        { status: 500 },
      );
    }
  }),
};

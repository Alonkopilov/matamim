import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { timingSafeEqual } from "node:crypto";
import { refreshPremium } from "../_shared/revenuecat.ts";

const WEBHOOK_AUTH = Deno.env.get("REVENUECAT_WEBHOOK_AUTH");

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isAuthorized = (header: string | null) => {
  if (!WEBHOOK_AUTH || !header) return false;
  const expected = new TextEncoder().encode(WEBHOOK_AUTH);
  const received = new TextEncoder().encode(header);
  return expected.length === received.length &&
    timingSafeEqual(expected, received);
};

// RevenueCat calls this on every purchase, renewal, expiration, refund and
// transfer. The event payload is only used to find which users changed; their
// status is re-read from RevenueCat so out-of-order events can't go stale.
export default {
  fetch: withSupabase({ auth: "none" }, async (req, ctx) => {
    if (!isAuthorized(req.headers.get("Authorization"))) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      const { event } = await req.json();
      const candidateIds: unknown[] = [
        event?.app_user_id,
        event?.original_app_user_id,
        ...(event?.aliases ?? []),
        ...(event?.transferred_from ?? []),
        ...(event?.transferred_to ?? []),
      ];
      // Anonymous RevenueCat ids ($RCAnonymousID:...) aren't Supabase users
      const userIds = [
        ...new Set(
          candidateIds.filter((id): id is string =>
            typeof id === "string" && UUID_PATTERN.test(id)
          ),
        ),
      ];

      for (const userId of userIds) {
        await refreshPremium(ctx.supabaseAdmin, userId);
      }

      return Response.json({ success: true });
    } catch (err: any) {
      // A non-2xx response makes RevenueCat retry the event
      return Response.json(
        { error: err.message || "Internal Server Error" },
        { status: 500 },
      );
    }
  }),
};

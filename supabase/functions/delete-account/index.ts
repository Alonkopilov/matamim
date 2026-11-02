import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import {
  errorResponse,
  internalErrorResponse,
  unauthorizedResponse,
} from "../_shared/errors.ts";
import { enforceRateLimit } from "../_shared/rateLimiter.ts";

const BUCKET = "recipe-images";
// Storage lists and removes at most this many objects per call
const PAGE_SIZE = 1000;

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    // The app POSTs. Images are loaded and downloaded with GET and the user's
    // token, so a recipe image whose path leads here (older apps follow any
    // path) must not delete the account of whoever's app loads it.
    if (req.method !== "POST") {
      return errorResponse(405, "METHOD_NOT_ALLOWED", {
        headers: { Allow: "POST" },
      });
    }

    try {
      const userId = ctx.userClaims?.id;
      if (!userId) {
        return unauthorizedResponse();
      }

      const rateLimitResponse = await enforceRateLimit(userId, "delete-account", {
        requests: 3,
        duration: "1 m",
      });

      if (rateLimitResponse) return rateLimitResponse;

      // Images first, so they're gone right away as the privacy policy says,
      // not at the next orphan image purge. If this fails the account still
      // exists and the user can try again.
      const storage = ctx.supabaseAdmin.storage.from(BUCKET);
      while (true) {
        const { data: objects, error: listError } = await storage.list(userId, {
          limit: PAGE_SIZE,
        });
        if (listError) throw listError;
        if (!objects || objects.length === 0) break;

        const { data: removed, error: removeError } = await storage.remove(
          objects.map((object) => `${userId}/${object.name}`),
        );
        if (removeError) throw removeError;
        // Listing again would return the same objects forever
        if (!removed || removed.length === 0) {
          throw new Error("Storage listed images it couldn't remove");
        }
        if (objects.length < PAGE_SIZE) break;
      }

      // Leaves or hands off the team, then deletes the user, which cascades
      // to their recipes, profile, membership and entitlement
      const { error } = await ctx.supabaseAdmin.rpc("delete_user_account", {
        p_user_id: userId,
      });
      if (error) throw error;

      return Response.json({ success: true }, { status: 200 });
    } catch (err) {
      return internalErrorResponse("delete-account", err);
    }
  }),
};

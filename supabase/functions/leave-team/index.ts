import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import {
  errorResponse,
  internalErrorResponse,
  unauthorizedResponse,
} from "../_shared/errors.ts";
import { enforceRateLimit } from "../_shared/rateLimiter.ts";

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    try {
      const userId = ctx.userClaims?.id;
      if (!userId) {
        return unauthorizedResponse();
      }

      const rateLimitResponse = await enforceRateLimit(userId, "leave-team", {
        requests: 5,
        duration: "10 s"
      });
    
      if (rateLimitResponse) return rateLimitResponse;

      const { team_id } = await req.json();

      if (!team_id) {
        return errorResponse(400, "TEAM_ID_MISSING");
      }

      // Runs as a single transaction: removes a member, or hands the team
      // to the oldest premium member / deletes it when the host leaves.
      const { data: outcome, error } = await ctx.supabaseAdmin.rpc("leave_team", {
        p_user_id: userId,
        p_team_id: team_id,
      });

      if (error) throw error;

      if (!["left", "transferred", "deleted"].includes(outcome)) {
        return errorResponse(400, "NOT_IN_TEAM");
      }

      return Response.json({
        success: true,
        outcome,
      }, { status: 200 });

    } catch (err) {
      return internalErrorResponse("leave-team", err);
    }
  }),
};
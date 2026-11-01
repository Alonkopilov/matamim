import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import {
  errorResponse,
  internalErrorResponse,
  unauthorizedResponse,
} from "../_shared/errors.ts";
import { enforceRateLimit } from "../_shared/rateLimiter.ts";

// Lets the host remove a member from their team. The member's device finds
// out on its next get-team, which then answers 403.
export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    try {
      const userId = ctx.userClaims?.id;
      if (!userId) {
        return unauthorizedResponse();
      }

      const rateLimitResponse = await enforceRateLimit(
        userId,
        "remove-member",
        {
          requests: 5,
          duration: "10 s",
        },
      );

      if (rateLimitResponse) return rateLimitResponse;

      const { user_id: memberId } = await req.json();

      if (typeof memberId !== "string" || !memberId) {
        return errorResponse(400, "NOT_IN_TEAM");
      }

      const { data: team, error: teamError } = await ctx.supabaseAdmin
        .from("teams")
        .select("id")
        .eq("host_id", userId)
        .maybeSingle();

      if (teamError) throw teamError;
      if (!team) {
        return errorResponse(403, "NOT_TEAM_HOST");
      }

      const { data: removed, error } = await ctx.supabaseAdmin
        .from("team_members")
        .delete()
        .eq("team_id", team.id)
        .eq("user_id", memberId)
        .select("user_id");

      if (error) throw error;
      if (!removed || removed.length === 0) {
        return errorResponse(400, "NOT_IN_TEAM");
      }

      return Response.json({ success: true }, { status: 200 });
    } catch (err) {
      return internalErrorResponse("remove-member", err);
    }
  }),
};

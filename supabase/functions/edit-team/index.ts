import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import {
  dbErrorResponse,
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

      const rateLimitResponse = await enforceRateLimit(userId, "edit-team", {
        requests: 5,
        duration: "10 s"
      });
    
      if (rateLimitResponse) return rateLimitResponse;

      const body = await req.json()
      const team_id = body.team_id
      const title = typeof body.title === "string" ? body.title.trim() : ""

      if (title === "" || title.length > 50) {
        return errorResponse(400, "TEAM_NAME_INVALID");
      }
      
      // Check if the user is a team host
      const { data: existingTeamHost } = await ctx.supabaseAdmin
        .from("teams")
        .select("id,host_id")
        .eq("host_id", userId)
        .eq("id", team_id)
        .maybeSingle();

      if (!existingTeamHost) {
        return errorResponse(400, "NOT_TEAM_HOST");
      }

      // Add user as a new member in the team
      const { data: edit, error } = await ctx.supabaseAdmin
        .from("teams")
        .update({ title })
        .eq("host_id", userId)
        .eq("id", team_id)
        .select()
        .single();

      if (error || !edit) {
        const dbError = dbErrorResponse(error);
        if (dbError) return dbError;
        throw new Error(`Failed to edit team metadata: ${error?.message}`);
      }

      return Response.json({
        success: true,
        title
      }, { status: 201 });
    } catch (err) {
      return internalErrorResponse("edit-team", err);
    }
  }),
};

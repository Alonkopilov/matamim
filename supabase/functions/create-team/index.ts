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

      const rateLimitResponse = await enforceRateLimit(userId, "create-team", {
        requests: 5,
        duration: "10 s"
      });
    
      if (rateLimitResponse) return rateLimitResponse;

      const { title } = await req.json();
      if (typeof title !== "string" || title.trim() === "" || title.trim().length > 50) {
        return errorResponse(400, "TEAM_NAME_INVALID");
      }

      const { data: existingTeam } = await ctx.supabaseAdmin
        .from("teams")
        .select("id")
        .eq("host_id", userId)
        .maybeSingle();

      if (existingTeam) {
        return errorResponse(400, "ALREADY_HOSTING");
      }

      const { data: newTeam, error } = await ctx.supabaseAdmin
        .from("teams")
        .insert({
          title: title.trim(),
          host_id: userId,
        })
        .select()
        .single();

      if (error || !newTeam) {
        const dbError = dbErrorResponse(error);
        if (dbError) return dbError;
        throw new Error(`Failed to create team row: ${error?.message}`);
      }

      return Response.json({
        success: true,
        team: {
          id: newTeam.id,
          title: newTeam.title,
          hostId: newTeam.host_id,
        },
      }, { status: 201 });
    } catch (err) {
      return internalErrorResponse("create-team", err);
    }
  }),
};

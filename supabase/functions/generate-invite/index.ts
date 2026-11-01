import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { randomInt } from "node:crypto";
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

      const rateLimitResponse = await enforceRateLimit(userId, "generate-invite", {
        requests: 5,
        duration: "10 s"
      });
    
      if (rateLimitResponse) return rateLimitResponse;

      // Check if the user is a team host
      const { data: existingTeam } = await ctx.supabaseAdmin
        .from("teams")
        .select("id, host_id")
        .eq("host_id", userId)
        .maybeSingle();

      if (!existingTeam) {
        console.warn("Only a team host can create invites");
        return errorResponse(400, "NOT_TEAM_HOST");
      }

      // Expired codes are never reused, clear them so the code space stays free
      const { error: cleanupError } = await ctx.supabaseAdmin
        .from("team_invites")
        .delete()
        .lte("expires_at", new Date().toISOString());

      if (cleanupError) {
        console.warn("Failed to clean up expired invites", cleanupError);
      }

      // Check if the team already has a non-expired code
      const { data: existingInvite } = await ctx.supabaseAdmin
        .from("team_invites")
        .select("*")
        .eq("team_id", existingTeam.id)
        .gt("expires_at", new Date().toISOString())
        .limit(1)
        .maybeSingle()

      if (existingInvite) {
        return Response.json({
          success: true,
          invite: {
            code: existingInvite.code,
            team_id: existingInvite.team_id,
            created_by: existingInvite.created_by,
          },
        }, { status: 201 });
      }

      // Generate a temporary 8 digit invite code, retrying if it collides
      // with another team's active code. 8 digits keep it typeable on a
      // numpad while making an active code impractical to guess.
      let invite = null;
      let error = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = randomInt(0, 100_000_000).toString().padStart(8, "0");

        ({ data: invite, error } = await ctx.supabaseAdmin
          .from("team_invites")
          .insert({
            code,
            team_id: existingTeam.id,
            created_by: existingTeam.host_id,
          })
          .select()
          .single());

        // 23505 = unique_violation
        if (error?.code !== "23505") break;
      }

      if (error || !invite) {
        throw new Error(`Failed to create invite: ${error?.message}`);
      }

      return Response.json({
        success: true,
        invite: {
          code: invite.code,
          team_id: invite.team_id,
          created_by: invite.created_by
        },
      }, { status: 201 });
    } catch (err) {
      return internalErrorResponse("generate-invite", err);
    }
  }),
};

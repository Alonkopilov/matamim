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

      const rateLimitResponse = await enforceRateLimit(userId, "join-team", {
        requests: 5,
        duration: "10 s",
        failClosed: true,
      });
    
      if (rateLimitResponse) return rateLimitResponse;
      
      const { code } = await req.json()

      if (typeof code !== "string" || !/^\d{8}$/.test(code)) {
        return errorResponse(400, "INVITE_CODE_FORMAT");
      }
      
      // Check if the user is a team host
      const { data: existingTeamHost } = await ctx.supabaseAdmin
        .from("teams")
        .select("host_id")
        .eq("host_id", userId)
        .maybeSingle();

      if (existingTeamHost) {
        return errorResponse(400, "CANNOT_JOIN_AS_HOST");
      }

      // Check if the user is a team member
      const { data: existingTeamMember } = await ctx.supabaseAdmin
        .from("team_members")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();

      if (existingTeamMember) {
        return errorResponse(400, "ALREADY_IN_TEAM");
      }

      // Check if the provided invite code exists
      const { data: invite } = await ctx.supabaseAdmin
        .from("team_invites")
        .select("*")
        .eq("code", code)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle()

      if (!invite) {
        return errorResponse(400, "INVITE_CODE_INVALID");
      }

      // Add user as a new member in the team
      const { data: member, error } = await ctx.supabaseAdmin
        .from("team_members")
        .insert({
          user_id: userId,
          team_id: invite.team_id,
        })
        .select()
        .single();

      if (error || !member) {
        const dbError = dbErrorResponse(error);
        if (dbError) return dbError;
        throw new Error(`Failed to add member: ${error?.message}`);
      }

      return Response.json({
        success: true,
        member: {
          user_id: member.user_id,
          team_id: member.team_id,
          joined_at: member.joined_at
        },
      }, { status: 201 });
    } catch (err) {
      return internalErrorResponse("join-team", err);
    }
  }),
};

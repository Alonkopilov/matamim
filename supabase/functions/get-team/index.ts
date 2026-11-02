import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import {
  errorResponse,
  internalErrorResponse,
  unauthorizedResponse,
} from "../_shared/errors.ts";
import { isActiveEntitlement } from "../_shared/premium.ts";
import { enforceRateLimit } from "../_shared/rateLimiter.ts";

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    try {
      const userId = ctx.userClaims?.id;
      if (!userId) {
        return unauthorizedResponse();
      }

      const rateLimitResponse = await enforceRateLimit(userId, "get-team", {
        requests: 5,
        duration: "10 s"
      });

      if (rateLimitResponse) return rateLimitResponse;

      const [hostCheck, memberCheck] = await Promise.all([
        ctx.supabaseAdmin
          .from("teams")
          .select("id")
          .eq("host_id", userId)
          .maybeSingle(),

        ctx.supabaseAdmin
          .from("team_members")
          .select("team_id")
          .eq("user_id", userId)
          .maybeSingle()
      ]);

      if (hostCheck.error || memberCheck.error) {
        throw new Error(`Auth query failed: ${hostCheck.error?.message || memberCheck.error?.message}`);
      }

      const isHost = !!hostCheck.data;
      const isMember = !!memberCheck.data;

      // Not an error, so the app learns whether the user has a team and loads
      // it in one call
      if (!isHost && !isMember) {
        return Response.json({ success: true, team: null, premium_user_ids: [] });
      }

      let teamId = ""
      if (isHost && hostCheck.data) {
        teamId = hostCheck.data.id
      }
      if (isMember && memberCheck.data) {
        teamId = memberCheck.data.team_id
      }

      const { data: team, error: fetchError } = await ctx.supabaseAdmin
        .from("teams")
        .select(`
          id,
          title,
          host_id,
          host_profile:profiles!host_id (
            username,
            email
          ),
          team_members (
            user_id,
            joined_at,
            member_profile:profiles!user_id (
              username,
              email
            )
          )
        `)
        .eq("id", teamId)
        .single();

      if (fetchError) {
        throw new Error(`Failed to fetch team data: ${fetchError.message}`);
      }

      if (!team) {
        return errorResponse(400, "TEAM_NOT_FOUND");
      }

      // Only the host sees emails, members see names (and their own email)
      if (!isHost) {
        const visibleProfile = <T extends { email?: string }>(
          profile: T | null,
          ownerId: string,
        ) => {
          if (!profile || ownerId === userId) return profile;
          const { email: _email, ...rest } = profile;
          return rest;
        };
        const visibleTeam = team as {
          host_id: string;
          host_profile: { email?: string } | null;
          team_members: {
            user_id: string;
            member_profile: { email?: string } | null;
          }[];
        };
        visibleTeam.host_profile = visibleProfile(
          visibleTeam.host_profile,
          visibleTeam.host_id,
        );
        for (const member of visibleTeam.team_members) {
          member.member_profile = visibleProfile(
            member.member_profile,
            member.user_id,
          );
        }
      }

      // Which teammates have premium, for the badges in the member list.
      // Members are listed whether or not the host still has Premium.
      const { host_id, team_members } = team as {
        host_id: string;
        team_members: { user_id: string }[];
      };
      const teamUserIds = [
        host_id,
        ...team_members.map((member) => member.user_id),
      ];
      const { data: entitlements, error: premiumError } = await ctx.supabaseAdmin
        .from("premium_entitlements")
        .select("user_id, expires_at")
        .in("user_id", teamUserIds);

      if (premiumError) {
        throw new Error(`Failed to fetch premium status: ${premiumError.message}`);
      }

      const now = new Date();
      const premiumUserIds = entitlements
        .filter((row: { expires_at: string | null }) =>
          isActiveEntitlement(row, now)
        )
        .map((row: { user_id: string }) => row.user_id);

      return Response.json({
        success: true,
        team: team,
        premium_user_ids: premiumUserIds,
      }, { status: 201 });
    } catch (err) {
      return internalErrorResponse("get-team", err);
    }
  }),
};

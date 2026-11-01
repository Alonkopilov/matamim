import i18n from "@/i18n";
import { team$ } from "@/stores/teamStore";
import { showToast } from "@/stores/toastStore";
import { logger } from "./logger";
import { toServerError } from "./serverErrors";
import { supabase } from "./supabase";

const invokeTeamFunction = async (functionName: string, body?: object) => {
  const logFunctionName = functionName.toUpperCase().replace(/-/g, "_");
  logger.info(`${logFunctionName}_STARTED`)
  const { data, error } = await supabase.functions.invoke(functionName, { body });
  
  if (error) {
    logger.error(`${logFunctionName}_FAILED`, error)
    // Keeps the status so callers can tell "not allowed" from a failure
    throw await toServerError(error);
  }
  logger.info(`${logFunctionName}_SUCCESS`)

  return data;
};

// What happened to the team, from leave-team
export type LeaveOutcome = "left" | "transferred" | "deleted";

const clearTeam = () => {
  team$.assign({
    id: null,
    inTeam: false,
    title: null,
    host_id: null,
    host_profile: null,
    members: [],
    premiumUserIds: [],
  });
};

export const teamActions = {
  /**
   * Loads the user's team. Returns whether the user is in a team, or null
   * when the request failed, so callers can tell "no team" from "unknown".
   */
  fetchTeam: async (): Promise<boolean | null> => {
    team$.isLoading.set(true);
    team$.error.set(null);
    try {
      const res = await invokeTeamFunction("get-team");

      if (!res.team) {
        // Had a team on this device, so the host deleted it or removed them
        if (team$.id.peek()) showToast(i18n.t("team.removed"), "error");
        clearTeam();
        return false;
      }

      team$.assign({
        id: res.team.id,
        inTeam: true,
        title: res.team.title,
        host_id: res.team.host_id,
        host_profile: res.team.host_profile,
        members: res.team.team_members || [],
        premiumUserIds: res.premium_user_ids || [],
      });
      return true;
    } catch (err: any) {
      team$.error.set(err);
      return null;
    } finally {
      team$.isLoading.set(false);
    }
  },

  leaveTeam: async (
    teamId: string,
  ): Promise<{ success: boolean; outcome?: LeaveOutcome }> => {
    team$.isLoading.set(true);
    try {
      const res = await invokeTeamFunction("leave-team", { team_id: teamId });

      clearTeam();

      return { success: true, outcome: res.outcome };
    } catch (err: any) {
      team$.error.set(err);
      return { success: false };
    } finally {
      team$.isLoading.set(false);
    }
  },

  joinTeam: async (code: string) => {
    team$.isLoading.set(true);
    try {
      const res = await invokeTeamFunction("join-team", { code });
      await teamActions.fetchTeam();
      return { success: true }
    } catch (err: any) {
      team$.error.set(err);
      return { success: false }
    } finally {
      team$.isLoading.set(false);
    }
  },

  // Host only. The member's device finds out on its next fetchTeam.
  removeMember: async (userId: string) => {
    team$.isLoading.set(true);
    try {
      await invokeTeamFunction("remove-member", { user_id: userId });
      await teamActions.fetchTeam();
      return { success: true };
    } catch (err: any) {
      team$.error.set(err);
      return { success: false };
    } finally {
      team$.isLoading.set(false);
    }
  },

  generateInvite: async () => {
    try {
      const res = await invokeTeamFunction("generate-invite");

      return res
    } catch (err: any) {
      team$.error.set(err);
    }
  },

  editTeam: async (teamId: string, title: string) => {
    team$.isLoading.set(true)
    try {
      const res = await invokeTeamFunction("edit-team", {team_id: teamId, title});
      team$.title.set(res.title)
      return { success: true }
    } catch (err: any) {
      team$.error.set(err);
      return { success: false }
    } finally {
      team$.isLoading.set(false);
    }
  },

  createTeam: async (title: string) => {
    team$.isLoading.set(true)
    try {
      // The team is saved before the function answers, so it can load now
      await invokeTeamFunction("create-team", {title})
      await teamActions.fetchTeam();
    } catch (err: any) {
      team$.error.set(err);
    } finally {
      team$.isLoading.set(false);
    }
  }
};
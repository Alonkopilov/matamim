import { observable } from "@legendapp/state";
import { showToast } from "./toastStore";

export interface TeamMember {
  user_id: string;
  joined_at: string;
  member_profile: {
    username: string;
    // Only sent to the host, and to each member for their own profile
    email?: string;
  };
}

interface TeamStore {
  id: string | null;
  title: string | null;
  host_id: string | null;
  // Whether the server says the user is in a team, null until it's been asked
  inTeam: boolean | null;
  host_profile: {
    username: string;
    email?: string;
  } | null;
  isLoading: boolean;
  error: Error | null;
  members: TeamMember[];
  // Host and members who have premium, for the member list badges
  premiumUserIds: string[];
}

export const team$ = observable<TeamStore>({
  id: null,
  title: null,
  host_id: null,
  inTeam: null,
  host_profile: null,
  isLoading: false,
  error: null,
  members: [],
  premiumUserIds: [],
});

// Cleared once shown: errors compare as equal (their message isn't an own
// enumerable key), so setting the next one wouldn't count as a change
team$.error.onChange((error) => {
  if (error.value) {
    showToast(error.value.message, "error");
    team$.error.set(null);
  }
});

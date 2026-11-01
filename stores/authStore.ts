import { configureLoggerUserId, logger } from "@/utils/logger";
import { supabase } from "@/utils/supabase";
import { teamActions } from "@/utils/teamManagement";
import { observable } from "@legendapp/state";
import { useSelector } from "@legendapp/state/react";
import * as Sentry from "@sentry/react-native";
import { Session } from "@supabase/supabase-js";
import { team$ } from "./teamStore";
import { showToast } from "./toastStore";

interface Authentication {
  session: Session | null;
  isLoading: boolean;
  error: Error | null;
}

export const auth$ = observable<Authentication>({
  session: null,
  isLoading: true,
  error: null
});

export const refreshSession = async () => {
  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) throw error;

    if (!data.session) {
      logger.info("REFRESH_SESSION_NO_USER");
      return;
    }

    auth$.session.set(data.session);
    logger.info("REFRESH_SESSION_SUCCESS");
  } catch (error) {
    logger.error("REFRESH_SESSION_FAILED", error);
  }
};

export const initAuth = async () => {
  logger.info("GETTING_SESSION");
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    auth$.session.set(session);
    logger.info("AUTH_INIT");
  } catch (error) {
    logger.error("AUTH_INIT_FAILED", error);
  } finally {
    auth$.isLoading.set(false);
  }
};

const loadTeam = async () => {
  await teamActions.fetchTeam();
};

export const refreshTeam = loadTeam;

// Logged out, so whether there's a team is unknown again
const clearTeam = () => {
  team$.assign({
    id: null,
    inTeam: null,
    title: null,
    host_id: null,
    host_profile: null,
    members: [],
  });
};

let previousUserId: string | undefined;

const {
  data: { subscription },
} = supabase.auth.onAuthStateChange((_event, currentSession) => {
  auth$.session.set(currentSession);
  logger.info("AUTH_SESSION_CHANGED");
  auth$.isLoading.set(false);

  // Token refreshes also land here, only react when the user changes.
  // Deferred so no Supabase call runs inside the auth callback.
  const userId = currentSession?.user.id;
  if (userId === previousUserId) return;
  previousUserId = userId;
  // Crash reports carry the user's ID only, never the email
  Sentry.setUser(userId ? { id: userId } : null);

  setTimeout(() => {
    if (userId) loadTeam();
    else clearTeam();
  }, 0);
});

export const unsubscribeAuth = () => subscription.unsubscribe();

export function getCurrentUserId(reactive = false): string {
  const session = reactive ? auth$.session.get() : auth$.session.peek();

  return session?.user.id || "guest";
}

/** The current access token, re-rendering the caller when it's refreshed */
export const useAccessToken = () =>
  useSelector(() => auth$.session.get()?.access_token);

configureLoggerUserId(() => getCurrentUserId());
initAuth();


// Cleared once shown: errors compare as equal (their message isn't an own
// enumerable key), so setting the next one wouldn't count as a change
auth$.error.onChange((error) => {
  if (error.value) {
    showToast(error.value.message, "error");
    auth$.error.set(null);
  }
});
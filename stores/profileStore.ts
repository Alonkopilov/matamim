import i18n from "@/i18n";
import { logger } from "@/utils/logger";
import { supabase } from "@/utils/supabase";
import { observable, observe, when } from "@legendapp/state";
import { ObservablePersistAsyncStorage } from "@legendapp/state/persist-plugins/async-storage";
import { syncObservable } from "@legendapp/state/sync";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { auth$ } from "./authStore";

interface Profile {
  // Whose name this is, so another account's saved name is never shown
  userId: string | null;
  username: string;
}

// The logged in user's name from their profile, the one teammates see. Saved
// on the device so it shows offline too.
export const profile$ = observable<Profile>({ userId: null, username: "" });

const metadata = syncObservable(profile$, {
  persist: {
    name: "profile",
    plugin: new ObservablePersistAsyncStorage({
      AsyncStorage,
    }),
  },
});

/** A user's name to show, never blank */
export const displayName = (username: string | null | undefined) =>
  username?.trim() || i18n.t("common.newCook");

/** The user's name from their profile, null when it couldn't be read */
export const fetchUsername = async (userId: string) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    logger.error("LOAD_PROFILE_FAILED", error);
    return null;
  }
  return data?.username ?? "";
};

export const refreshProfile = async () => {
  const userId = auth$.session.peek()?.user.id;
  if (!userId) return;

  const username = await fetchUsername(userId);
  // Logged out or switched accounts while loading
  if (username === null || auth$.session.peek()?.user.id !== userId) return;
  profile$.assign({ userId, username });
};

/** The logged in user's name to show, re-rendering the caller on changes */
export const currentUserName = () => {
  const user = auth$.session.get()?.user;
  if (!user) return i18n.t("common.anonymousChef");

  // Until the profile loads for this user, the name in the auth metadata,
  // which the profile copies on sign-up and rename
  const username =
    profile$.userId.get() === user.id
      ? profile$.username.get()
      : user.user_metadata?.display_name;
  return displayName(username);
};

when(
  () => metadata.isPersistLoaded.get() && !auth$.isLoading.get(),
).then(() => {
  // Every new session, which includes a rename (it refreshes the session) and
  // the hourly token refresh, so a rename on another device shows up too
  observe(() => {
    const session = auth$.session.get();
    if (!session) {
      profile$.assign({ userId: null, username: "" });
      return;
    }
    refreshProfile();
  });
});

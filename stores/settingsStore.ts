import i18n, {
  applyLanguage,
  LanguagePreference,
  resolveLanguage,
} from "@/i18n";
import { logger } from "@/utils/logger";
import { supabase } from "@/utils/supabase";
import { teamActions } from "@/utils/teamManagement";
import { observable, observe, when } from "@legendapp/state";
import { ObservablePersistAsyncStorage } from "@legendapp/state/persist-plugins/async-storage";
import { syncObservable } from "@legendapp/state/sync";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { auth$ } from "./authStore";
import { team$ } from "./teamStore";

interface Settings {
  isKeepScreenAwake: boolean;
  isSyncingToCloud: boolean;
  isCollaborativeTeam: boolean;
  language: LanguagePreference;
}

export const settings$ = observable<Settings>({
  isKeepScreenAwake: true,
  isSyncingToCloud: false,
  isCollaborativeTeam: false,
  language: "system",
});

const metadata = syncObservable(settings$, {
  persist: {
    name: "global_settings",
    plugin: new ObservablePersistAsyncStorage({
      AsyncStorage,
    }),
  },
});

// False until the saved language is applied, so the first render is already in
// it. Stays false when the app reloads to flip the layout direction.
export const isLanguageReady$ = observable(false);

when(() => metadata.isPersistLoaded.get()).then(async () => {
  // Settings saved before the language setting existed don't have it
  const isReloading = await applyLanguage(
    settings$.language.peek() ?? "system",
  );
  if (!isReloading) isLanguageReady$.set(true);

  settings$.language.onChange(({ value }) => {
    logger.info("CHANGED_LANGUAGE", { language: value });
    applyLanguage(value);
  });
});

// Cloud sync is a per-account preference, stored in the user's auth metadata.
// The local value only mirrors whichever user is currently logged in.
const CLOUD_SYNC_METADATA_KEY = "is_syncing_to_cloud";
let isApplyingUserSetting = false;

const applyUserCloudSync = (value: boolean) => {
  isApplyingUserSetting = true;
  settings$.isSyncingToCloud.set(value);
  isApplyingUserSetting = false;
};

// A choice that hasn't reached the server yet (offline, or the app closed
// first), saved later instead of being replaced by the server's older value.
// The server deletes the cloud copy 30 days after cloud sync is turned off,
// so turning it back on must reach it.
const UNSAVED_CLOUD_SYNC_KEY = "cloud_sync_unsaved";
// How long to wait before trying again after a failure
const SAVE_RETRY_MS = 30000;

type UnsavedCloudSync = { userId: string; value: boolean };

const readUnsavedCloudSync = async (): Promise<UnsavedCloudSync | null> => {
  const saved = await AsyncStorage.getItem(UNSAVED_CLOUD_SYNC_KEY);
  return saved ? JSON.parse(saved) : null;
};

let isSavingCloudSync = false;

const saveUnsavedCloudSync = async () => {
  if (isSavingCloudSync) return;
  isSavingCloudSync = true;
  try {
    // Again if it was changed while saving
    while (true) {
      const unsaved = await readUnsavedCloudSync();
      const user = auth$.session.peek()?.user;
      if (!unsaved || unsaved.userId !== user?.id) return;

      const { error } = await supabase.auth.updateUser({
        data: { [CLOUD_SYNC_METADATA_KEY]: unsaved.value },
      });
      if (error) {
        logger.error("SAVE_CLOUD_SYNC_SETTING_FAILED", error);
        setTimeout(saveUnsavedCloudSync, SAVE_RETRY_MS);
        return;
      }

      const latest = await readUnsavedCloudSync();
      if (
        latest?.userId === unsaved.userId &&
        latest.value === unsaved.value
      ) {
        await AsyncStorage.removeItem(UNSAVED_CLOUD_SYNC_KEY);
        return;
      }
    }
  } finally {
    isSavingCloudSync = false;
  }
};

const saveUserCloudSync = async (userId: string, value: boolean) => {
  await AsyncStorage.setItem(
    UNSAVED_CLOUD_SYNC_KEY,
    JSON.stringify({ userId, value }),
  );
  await saveUnsavedCloudSync();
};

when(
  () => metadata.isPersistLoaded.get() && !auth$.isLoading.get(),
).then(() => {
  // The recipe store follows this setting live, nothing to restart
  settings$.isSyncingToCloud.onChange(async ({ value }) => {
    const user = auth$.session.peek()?.user;
    if (isApplyingUserSetting || !user) return;
    // Saved even when it matches the session's copy: an earlier change may
    // be on its way to the server
    await saveUserCloudSync(user.id, value);
  });

  let currentUserId: string | undefined;
  observe(async () => {
    const user = auth$.session.get()?.user;
    if (user?.id === currentUserId) return;
    currentUserId = user?.id;

    if (!user) {
      // Logged out, a choice that wasn't saved is dropped with the session
      await AsyncStorage.removeItem(UNSAVED_CLOUD_SYNC_KEY);
      applyUserCloudSync(false);
      return;
    }

    const unsaved = await readUnsavedCloudSync();
    if (unsaved?.userId === user.id) {
      applyUserCloudSync(unsaved.value);
      saveUnsavedCloudSync();
      return;
    }

    const saved = user.user_metadata?.[CLOUD_SYNC_METADATA_KEY];
    if (typeof saved === "boolean") {
      applyUserCloudSync(saved);
    } else {
      // Accounts from before this setting was per-user: keep the local value.
      saveUserCloudSync(user.id, settings$.isSyncingToCloud.peek());
    }
  });
});

// Auth emails (the password reset code) are written in the language saved in
// the user's auth metadata, so it follows the app's language.
const LANGUAGE_METADATA_KEY = "language";

// After the language is applied, which loads the store country "system"
// depends on
when(() => isLanguageReady$.get() && !auth$.isLoading.get()).then(() => {
  observe(async () => {
    const user = auth$.session.get()?.user;
    const language = resolveLanguage(settings$.language.get());
    if (!user || user.user_metadata?.[LANGUAGE_METADATA_KEY] === language) {
      return;
    }

    const { error } = await supabase.auth.updateUser({
      data: { [LANGUAGE_METADATA_KEY]: language },
    });
    if (error) logger.error("SAVE_LANGUAGE_SETTING_FAILED", error);
  });
});

// Set when the toggle is changed to match the server, not by the user
let isApplyingTeamMembership = false;

when(() => metadata.isPersistLoaded.get()).then(() => {
  settings$.isCollaborativeTeam.onChange(async ({ value }) => {
    // Already matches the server, e.g. the team that just loaded on login
    if (isApplyingTeamMembership || value === team$.inTeam.peek()) return;
    setTimeout(() => {
      if (value) {
        teamActions.fetchTeam().then(res => {
          if (res === false) {
            logger.info("TOGGLED_CREATE_TEAM");
            teamActions.createTeam(i18n.t("team.defaultTitle"))
            router.navigate(`/team`);
          }
        })

      }
    }, 500);
  });

  // The toggle is saved on the device, so it goes stale when the team changes
  // elsewhere (the host deleted it, or another account was used). The
  // server's answer wins.
  observe(() => {
    const inTeam = team$.inTeam.get();
    if (inTeam === null || inTeam === settings$.isCollaborativeTeam.peek()) {
      return;
    }
    isApplyingTeamMembership = true;
    settings$.isCollaborativeTeam.set(inTeam);
    isApplyingTeamMembership = false;
  });
});

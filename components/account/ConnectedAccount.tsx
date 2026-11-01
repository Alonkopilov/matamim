import { useBottomTabBarHeight } from "expo-router/js-tabs";
import { colors } from "@/constants/theme";
import { updateNameSchema } from "@/schemas/registerSchema";
import { showAlert } from "@/stores/alertStore";
import { refreshSession } from "@/stores/authStore";
import { premium$ } from "@/stores/premiumStore";
import { currentUserName, refreshProfile } from "@/stores/profileStore";
import { countUnsyncedRecipes, getOwnRecipes } from "@/stores/recipeStore";
import { settings$ } from "@/stores/settingsStore";
import { team$ } from "@/stores/teamStore";
import { showToast } from "@/stores/toastStore";
import { Account, AccountMode, EMPTY_ACCOUNT } from "@/types/account";
import { SCREEN_LEFT_SELF } from "@/utils/layoutDirection";
import { PendingNotice } from "@/utils/persistStorage";
import * as userManagement from "@/utils/userManagement";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Observable } from "@legendapp/state";
import { Computed } from "@legendapp/state/react";
import { $Text } from "@legendapp/state/react-native";
import { router } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import MenuActionItem from "./MenuActionItem";
import MenuSettingsItem from "./MenuSettingsItem";
import SettingsGroup from "./SettingsGroup";
import UpdateModal from "./UpdateModal";
import VerifiedChangeModal from "./VerifiedChangeModal";

type Props = {
  account: Observable<Account>;
  mode: Observable<AccountMode>;
};

// iOS Settings' system colors, one per kind of setting
const TILE_COLORS = {
  orange: "#FF9F0A",
  blue: "#0A84FF",
  green: "#30D158",
  purple: "#5E5CE6",
  gray: "#8E8E93",
  red: "#FF453A",
};

type ModalType = "name" | "email" | "password" | null;

export default function ConnectedView({ account, mode }: Props) {
  const tabBarHeight = useBottomTabBarHeight();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [modalShown, setModalShown] = useState<ModalType>(null);
  const { t } = useTranslation();

  const modalConfigs = {
    name: {
      title: t("account.updateModals.name.title"),
      placeholder: t("account.updateModals.name.placeholder"),
      secureTextEntry: false,
      onSave: async (value: string) => {
        const result = updateNameSchema.safeParse({ fullName: value });
        if (!result.success) {
          throw new Error(result.error.issues[0].message);
        }

        // Validated without surrounding spaces, so saved without them too
        const name = result.data.fullName;
        const changed = await userManagement.changeUsername(name);
        if (!changed.success) {
          throw new Error(changed.error);
        }
        await refreshSession();
        // The rename reaches the profile through a trigger, read it back
        await refreshProfile();
        showToast(t("account.toasts.nameUpdated"), "success");
      },
    },
  };

  const handleDeleteAccount = async () => {
    showAlert(
      t("account.deleteAccount.title"),
      t("account.deleteAccount.message"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("account.deleteAccount.confirm"),
          style: "destructive",
          onPress: async () => {
            const result = await userManagement.deleteUser();
            if (!result.success) {
              showAlert(
                t("account.deleteAccount.failedTitle"),
                t("account.deleteAccount.failedMessage", {
                  error: result.error,
                }),
              );
            } else {
              await logout({
                titleKey: "account.deleteAccount.successTitle",
                messageKey: "account.deleteAccount.successMessage",
              });
            }
          },
        },
      ],
    );
  };

  const handleCollaborativeTeamToggle = (value: boolean) => {
    // Team members read the host's recipes from the cloud, so a team can't exist without cloud sync
    if (value && !settings$.isSyncingToCloud.peek()) {
      showAlert(
        t("account.cloudSync.requiredForTeamTitle"),
        t("account.cloudSync.requiredForTeamMessage"),
      );
      return;
    }
    settings$.isCollaborativeTeam.set(value);
  };

  const handleCloudSyncToggle = (value: boolean) => {
    if (value && !premium$.isPremium.peek()) {
      showAlert(
        t("account.cloudSync.premiumTitle"),
        t("account.cloudSync.premiumMessage"),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("account.cloudSync.upgrade"),
            onPress: () => router.navigate("/premium"),
          },
        ],
      );
      return;
    }

    if (value) {
      settings$.isSyncingToCloud.set(true);
      return;
    }
    // The cloud copy is deleted 30 days after it's turned off
    showAlert(
      t("account.cloudSync.disableTitle"),
      team$.id.peek() !== null
        ? t("account.cloudSync.disableTeamMessage")
        : t("account.cloudSync.disableMessage"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("account.cloudSync.disableConfirm"),
          style: "destructive",
          onPress: () => settings$.isSyncingToCloud.set(false),
        },
      ],
    );
  };

  // Logging out clears the device, so warn about what isn't in the cloud
  const handleLogout = () => {
    let message: string | undefined;
    if (!settings$.isSyncingToCloud.peek()) {
      if (getOwnRecipes().length > 0) {
        message = t("account.logout.deviceOnlyMessage");
      }
    } else if (countUnsyncedRecipes() > 0) {
      message = t("account.logout.unsyncedMessage");
    }

    if (!message) {
      logout();
      return;
    }
    showAlert(t("account.logout.title"), message, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("account.logout.confirm"),
        style: "destructive",
        onPress: logout,
      },
    ]);
  };

  const logout = async (notice?: PendingNotice) => {
    setIsLoading(true);
    const result = await userManagement.logoutUser(notice);
    if (!result.success) {
      setIsLoading(false);
      showToast(result.error ?? t("auth.errors.unknown"), "error");
      return;
    }
    team$.assign({
      id: null,
      inTeam: null,
      title: null,
      host_id: null,
      host_profile: null,
      isLoading: false,
      error: null,
      members: [],
    });
    account.set(EMPTY_ACCOUNT());
    settings$.isCollaborativeTeam.set(false);
    setIsLoading(false);
    mode.set("login");
  };

  if (isLoading)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" color={colors.text} />
      </View>
    );

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: tabBarHeight }]}
        style={{ width: "85%" }}
      >
        <Pressable
          testID="join-team"
          onPress={() => router.navigate(`/account/join`)}
          style={styles.joinTeam}
        >
          <MaterialCommunityIcons
            name="account-multiple-plus-outline"
            size={20}
            color={colors.textDisabled}
          />
        </Pressable>
        <View style={styles.profile}>
          <MaterialCommunityIcons
            name="chef-hat"
            size={40}
            color={colors.textDisabled}
          />
        </View>
        <$Text style={styles.name}>{() => currentUserName()}</$Text>
        <$Text style={styles.email}>{() => account.email.get() || ""}</$Text>

        <SettingsGroup title={t("account.sections.settings")}>
          <MenuSettingsItem
            icon="white-balance-sunny"
            tileColor={TILE_COLORS.orange}
            title={t("settings.keepScreenAwake.title")}
            description={t("settings.keepScreenAwake.description")}
            isPremium={false}
            setting$={settings$.isKeepScreenAwake}
            disabled={false}
            testID="setting-keepScreenAwake"
          />
          <MenuSettingsItem
            icon="cloud-sync-outline"
            tileColor={TILE_COLORS.blue}
            title={t("settings.cloudSync.title")}
            description={t("settings.cloudSync.description")}
            isPremium={true}
            setting$={settings$.isSyncingToCloud}
            disabled={false}
            onValueChange={handleCloudSyncToggle}
            testID="setting-cloudSync"
          />
          <Computed>
            {() => (
              <MenuSettingsItem
                icon="account-group-outline"
                tileColor={TILE_COLORS.green}
                title={t("settings.collaborativeTeam.title")}
                description={t("settings.collaborativeTeam.description")}
                isPremium={true}
                setting$={settings$.isCollaborativeTeam}
                disabled={team$.id.get() !== null}
                onValueChange={handleCollaborativeTeamToggle}
                testID="setting-collaborativeTeam"
              />
            )}
          </Computed>
        </SettingsGroup>

        <SettingsGroup title={t("account.sections.actions")}>
          <MenuActionItem
            materialIcon="account-tag-outline"
            tileColor={TILE_COLORS.purple}
            title={t("account.actions.changeUsername")}
            onPress={() => setModalShown("name")}
            isDanger={false}
          />
          <MenuActionItem
            materialIcon="email-outline"
            tileColor={TILE_COLORS.blue}
            title={t("account.actions.changeEmail")}
            onPress={() => setModalShown("email")}
            isDanger={false}
          />
          <MenuActionItem
            materialIcon="lock-outline"
            tileColor={TILE_COLORS.gray}
            title={t("account.actions.changePassword")}
            onPress={() => setModalShown("password")}
            isDanger={false}
          />
        </SettingsGroup>

        <View style={styles.dangerGroup}>
          <SettingsGroup title={t("account.sections.danger")}>
            <MenuActionItem
              materialIcon="logout"
              tileColor={TILE_COLORS.red}
              title={t("account.actions.logout")}
              onPress={handleLogout}
              isDanger={true}
            />
            <MenuActionItem
              materialIcon="delete-alert-outline"
              tileColor={TILE_COLORS.red}
              title={t("account.actions.deleteAccount")}
              onPress={handleDeleteAccount}
              isDanger={true}
            />
          </SettingsGroup>
        </View>
      </ScrollView>
      {modalShown === "name" && (
        <UpdateModal
          visible={true}
          title={modalConfigs.name.title}
          placeholder={modalConfigs.name.placeholder}
          secureTextEntry={modalConfigs.name.secureTextEntry}
          onClose={() => setModalShown(null)}
          onSave={modalConfigs.name.onSave}
        />
      )}
      {(modalShown === "email" || modalShown === "password") && (
        <VerifiedChangeModal
          kind={modalShown}
          currentEmail={account.email.peek() || ""}
          onClose={() => setModalShown(null)}
          onEmailChanged={(email) => account.email.set(email)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    display: "flex",
    flex: 1,
    paddingTop: 50,
  },
  profile: {
    height: 100,
    width: 100,
    backgroundColor: "#313131",
    borderRadius: 100,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  joinTeam: {
    height: 40,
    width: 40,
    borderColor: colors.textDisabled,
    borderWidth: 1,
    borderRadius: 100,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: SCREEN_LEFT_SELF,
  },
  name: {
    color: colors.accent,
    fontFamily: "DefaultBold",
    fontSize: 25,
    marginTop: 10,
  },
  email: {
    color: colors.textMuted,
    paddingTop: 0,
    fontFamily: "Default",
    fontSize: 16,
    marginTop: 2,
  },

  dangerGroup: {
    width: "100%",
    marginBottom: 40,
  },
  scroll: {
    marginTop: 20,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
});

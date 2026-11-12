import { useBottomTabBarHeight } from "expo-router/js-tabs";
import { Text, TextInput } from "@/components/ui/Text";
import { colors } from "@/constants/theme";
import InviteModal from "@/components/team/InviteModal";
import LocalOnlyNotice from "@/components/team/LocalOnlyNotice";
import Member from "@/components/team/Member";
import { RefreshButton } from "@/components/team/RefreshButton";
import { showAlert } from "@/stores/alertStore";
import { getCurrentUserId } from "@/stores/authStore";
import { displayName } from "@/stores/profileStore";
import { isHiddenFromTeam } from "@/stores/recipeStore";
import { settings$ } from "@/stores/settingsStore";
import { team$ } from "@/stores/teamStore";
import { showToast } from "@/stores/toastStore";
import { teamActions } from "@/utils/teamManagement";
import { INPUT_START_ALIGN, RIGHT_TO_LEFT_ROW } from "@/utils/layoutDirection";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  observer,
  Show,
  useObservable,
  useObserve,
} from "@legendapp/state/react";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

export default observer(function TeamScreen() {
  const tabBarHeight = useBottomTabBarHeight();
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState("");
  const ui$ = useObservable({
    showModal: false,
    editMode: false,
  });

  const isLoading = team$.isLoading.get();
  const teamId = team$.id.get();
  const title = team$.title.get();
  const hostId = team$.host_id.get();
  const host = team$.host_profile.get();
  const members = team$.members.get();
  const premiumUserIds = team$.premiumUserIds.get();
  const currentUserId = getCurrentUserId();

  useObserve(team$.title, (val) => {
    setInputValue(val.value || "");
  });

  // The team was deleted by its host while this screen was open
  useObserve(team$.id, ({ value, previous }) => {
    if (previous && !value) router.navigate("/account");
  });

  const handleEditMode = () => {
    const isEditMode = ui$.editMode.peek();

    if (!isEditMode || title === inputValue) {
      ui$.editMode.toggle();
      return;
    }
    if (!teamId) return;

    teamActions.editTeam(teamId, inputValue).then((res) => {
      if (res?.success) {
        ui$.editMode.toggle();
        showToast(t("team.renamed"), "success");
      }
    });
  };

  const handleLeave = async () => {
    const isHost = currentUserId == team$.host_id.peek();
    // A host leaving hands the team to a Premium member, if there is one
    const premiumIds = team$.premiumUserIds.peek();
    const willTransfer =
      isHost &&
      team$.members.peek().some((m) => premiumIds.includes(m.user_id));
    const deletes = isHost && !willTransfer;

    showAlert(
      deletes ? t("team.leave.deleteTitle") : t("team.leave.leaveTitle"),
      deletes
        ? t("team.leave.deleteMessage")
        : willTransfer
          ? t("team.leave.transferMessage")
          : t("team.leave.leaveMessage"),
      [
        {
          text: t("common.confirm"),
          style: "destructive",
          onPress: async () => {
            if (!teamId) return;
            teamActions.leaveTeam(teamId).then((res) => {
              if (res.success) {
                settings$.isCollaborativeTeam.set(false);
                router.navigate("/account");
                if (res.outcome) {
                  showToast(t(`team.leftOutcomes.${res.outcome}`), "success");
                }
              }
            });
          },
        },
        { text: t("common.cancel"), style: "cancel" },
      ],
    );
  };

  const handleRemoveMember = (userId: string, name: string) => {
    showAlert(
      t("team.members.removeTitle"),
      t("team.members.removeMessage", { name }),
      [
        {
          text: t("common.confirm"),
          style: "destructive",
          onPress: async () => {
            const res = await teamActions.removeMember(userId);
            if (res.success) {
              showToast(t("team.members.removed", { name }), "success");
            }
          },
        },
        { text: t("common.cancel"), style: "cancel" },
      ],
    );
  };

  const handleRefresh = () => {
    if (team$.isLoading.get()) return;
    teamActions.fetchTeam();
  };

  if (isLoading || !host || !title)
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
        contentContainerStyle={{ paddingBottom: tabBarHeight }}
      >
        <LinearGradient
          style={styles.header}
          colors={["#997F25", colors.accent]}
          start={{ x: 0, y: 1 }}
          end={{ x: 1, y: 0 }}
        >
          <View style={styles.headerIcons}>
            <FontAwesome6 name="angle-right" size={26} color={colors.text} />

            <View style={styles.headerIconsLeft}>
              {hostId === currentUserId && (
                <Pressable
                  testID="team-edit"
                  hitSlop={10}
                  onPress={handleEditMode}
                >
                  {team$.isLoading.get() ? (
                    <ActivityIndicator size="small" color={colors.text} />
                  ) : (
                    <MaterialCommunityIcons
                      name={ui$.editMode.get() ? "content-save" : "pencil"}
                      size={26}
                      color={colors.text}
                    />
                  )}
                </Pressable>
              )}
              <Pressable testID="team-leave" hitSlop={10} onPress={handleLeave}>
                <MaterialCommunityIcons
                  name={
                    hostId == currentUserId
                      ? "trash-can-outline"
                      : "location-exit"
                  }
                  size={26}
                  color={colors.text}
                />
              </Pressable>
            </View>
          </View>
          <View>
            <Text style={styles.team}>{t("team.header.label")}</Text>
            <View
              style={[
                styles.editBorder,
                ui$.editMode.get() && { borderWidth: 1 },
              ]}
            >
              <TextInput
                testID="team-title"
                placeholderTextColor={"#ffffff7e"}
                placeholder={t("team.header.titlePlaceholder")}
                editable={ui$.editMode.get()}
                style={styles.title}
                value={inputValue || ""}
                onChangeText={setInputValue}
                maxLength={22}
              />
            </View>
          </View>
          <View style={styles.headerBottom}>
            <Text style={styles.amount}>
              {t("team.header.memberCount", { amount: 1 + members.length })}
            </Text>
            {hostId == currentUserId && (
              <Pressable
                testID="team-invite"
                onPress={ui$.showModal.toggle}
                style={styles.addMembers}
              >
                <MaterialIcons name="group-add" size={16} color="black" />
              </Pressable>
            )}
          </View>
        </LinearGradient>
        {isHiddenFromTeam() && (
          <View style={styles.localOnlyNotice}>
            <LocalOnlyNotice message={t("team.localOnly.message")} />
          </View>
        )}
        <View style={styles.members}>
          <Text style={styles.membersText}>{t("team.members.title")}</Text>
          <Member
            key={hostId}
            name={displayName(host.username)}
            mail={host.email}
            isCurrentUser={hostId == currentUserId}
            isPremium={!!hostId && premiumUserIds.includes(hostId)}
            isHost={true}
            showRemoveMember={false}
          />
          {members.map((value, index) => (
            <Member
              key={value.user_id}
              name={displayName(value.member_profile.username)}
              mail={value.member_profile.email}
              isCurrentUser={value.user_id === currentUserId}
              isPremium={premiumUserIds.includes(value.user_id)}
              isHost={false}
              showRemoveMember={currentUserId == hostId}
              onRemove={() =>
                handleRemoveMember(
                  value.user_id,
                  displayName(value.member_profile.username),
                )
              }
            />
          ))}
        </View>
      </ScrollView>
      <Show if={ui$.showModal}>
        <InviteModal
          visible={ui$.showModal !== null}
          onClose={ui$.showModal.toggle}
        />
      </Show>
      <RefreshButton onRefresh={handleRefresh} />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    height: 280,
    width: "90%",
    alignSelf: "center",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  headerIcons: {
    padding: 20,
    paddingTop: 60,
    display: "flex",
    flexDirection: RIGHT_TO_LEFT_ROW,
    justifyContent: "space-between",
  },
  headerIconsLeft: {
    display: "flex",
    flexDirection: RIGHT_TO_LEFT_ROW,
    gap: 30,
  },
  team: {
    textAlign: "left",
    fontSize: 16,
    color: colors.text,
    fontFamily: "Default",
    paddingStart: 20,
  },
  title: {
    textAlign: INPUT_START_ALIGN,
    fontSize: 28,
    color: colors.text,
    fontFamily: "DefaultBold",
    paddingStart: 5,

    width: "90%",
  },
  headerBottom: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 20,
    alignItems: "center",
  },
  amount: {
    textAlign: "left",
    fontSize: 13,
    color: colors.text,
    fontFamily: "Default",
  },
  addMembers: {
    width: 70,
    height: 25,
    backgroundColor: colors.text,
    borderRadius: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  membersText: {
    textAlign: "left",
    fontSize: 22,
    color: colors.text,
    fontFamily: "DefaultBold",
  },
  members: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
    marginTop: 40,
    paddingStart: 20,
  },
  localOnlyNotice: {
    width: "90%",
    alignSelf: "center",
    marginTop: 20,
  },
  editBorder: {
    marginTop: 2,
    borderWidth: 0,
    borderColor: "white",
    borderRadius: 50,
    width: "90%",
    marginStart: 10,
    paddingStart: 5,
  },
});

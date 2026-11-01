import { colors } from "@/constants/theme";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  name: string;
  // Only the host gets teammates' emails
  mail?: string;
  isCurrentUser: boolean;
  isPremium: boolean;
  isHost: boolean;
  showRemoveMember: boolean;
  onRemove?: () => void;
};

export default function Member({
  name,
  mail,
  isCurrentUser,
  isPremium,
  isHost,
  showRemoveMember,
  onRemove,
}: Props) {
  const { t } = useTranslation();
  // One node for the whole row (React Native flattens it on Android), so a
  // test can tell which member a badge belongs to
  const label = [
    name,
    mail,
    isPremium && t("common.premium"),
    isHost && t("team.members.host"),
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <View
      testID="team-member"
      accessible
      accessibilityLabel={label}
      style={styles.container}
    >
      <View style={styles.memberContent}>
        <View
          style={[
            styles.profile,
            isCurrentUser && { borderColor: "#FACF3B", borderWidth: 1 },
          ]}
        >
          <MaterialCommunityIcons
            name="chef-hat"
            size={23}
            color={colors.textDisabled}
          />
        </View>
        <View style={styles.leftContent}>
          {(isPremium || isHost) && (
            <View style={styles.badges}>
              {isPremium && (
                <View style={styles.premiumContainer}>
                  <MaterialCommunityIcons
                    name="crown"
                    size={12}
                    color={colors.accentDeep}
                  />
                  <Text style={styles.premiumText}>{t("common.premium")}</Text>
                </View>
              )}
              {isHost && (
                <View style={styles.hostContainer}>
                  <MaterialCommunityIcons
                    name="account-tie-hat"
                    size={12}
                    color="#FFB8B9"
                  />
                  <Text style={styles.hostText}>{t("team.members.host")}</Text>
                </View>
              )}
            </View>
          )}
          <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
            {name}
          </Text>
          {mail && <Text style={styles.mail}>{mail}</Text>}
        </View>
      </View>
      {showRemoveMember && (
        <Pressable
          testID="team-member-remove"
          style={styles.options}
          onPress={onRemove}
          hitSlop={10}
        >
          <MaterialCommunityIcons
            name="account-remove"
            size={24}
            color="#cecece"
          />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    display: "flex",
    flexDirection: "row",
    alignContent: "center",
    justifyContent: "space-between",
    width: "92%",
  },
  memberContent: {
    display: "flex",
    flexDirection: "row",
    alignContent: "center",
    gap: 10,
    flex: 1,
    marginEnd: 10,
  },
  options: { alignSelf: "center" },
  leftContent: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignContent: "center",
    justifyContent: "center",
    gap: 2,
  },
  badges: {
    display: "flex",
    gap: 7,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
  },
  mail: {
    fontSize: 14,
    color: colors.textMuted,
    fontFamily: "Default",
    textAlign: "left",
  },
  name: {
    fontSize: 18,
    color: colors.text,
    fontFamily: "DefaultBold",
    textAlign: "left",
  },
  profile: {
    height: 55,
    width: 55,
    backgroundColor: "#313131",
    borderRadius: 100,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  premiumContainer: {
    flexShrink: 0,
    display: "flex",
    flexDirection: "row",
    gap: 5,
    backgroundColor: colors.accent,
    paddingHorizontal: 6,
    borderRadius: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  premiumText: {
    fontSize: 12,
    fontFamily: "DefaultBold",
    color: colors.accentDeep,
  },
  hostContainer: {
    flexShrink: 0,
    display: "flex",
    flexDirection: "row",
    gap: 5,
    backgroundColor: "#B03A3A",
    paddingHorizontal: 6,
    borderRadius: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  hostText: {
    fontSize: 12,
    fontFamily: "DefaultBold",
    color: "#FFB8B9",
  },
});

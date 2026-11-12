import { Text } from "@/components/ui/Text";
import { colors } from "@/constants/theme";
import { premium$ } from "@/stores/premiumStore";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { observer } from "@legendapp/state/react";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, View } from "react-native";

type Props = {
  message: string;
};

// Tells a team member their recipes stay on this device, with the way out:
// upgrading, or turning cloud sync back on if they already have premium
export default observer(function LocalOnlyNotice({ message }: Props) {
  const { t } = useTranslation();
  const isPremium = premium$.isPremium.get();

  return (
    <View style={styles.container}>
      <MaterialCommunityIcons
        name="cellphone-lock"
        size={22}
        color={colors.accent}
      />
      <View style={styles.content}>
        <Text style={styles.message}>{message}</Text>
        <Pressable
          hitSlop={10}
          onPress={() => router.navigate(isPremium ? "/account" : "/premium")}
        >
          <Text style={styles.action}>
            {isPremium
              ? t("team.localOnly.enableCloudSync")
              : t("team.localOnly.upgrade")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    display: "flex",
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    backgroundColor: "#ffd23d17",
    borderColor: "#ad8e2a95",
    borderWidth: 1,
    borderRadius: 20,
    padding: 15,
  },
  content: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  message: {
    color: colors.text,
    fontSize: 14,
    fontFamily: "Default",
    textAlign: "left",
  },
  action: {
    color: colors.accent,
    fontSize: 14,
    fontFamily: "DefaultBold",
    textAlign: "left",
  },
});

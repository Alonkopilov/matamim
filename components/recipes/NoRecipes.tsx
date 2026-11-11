import { Text } from "@/components/ui/Text";
import { colors } from "@/constants/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import PressableScale from "@/components/ui/PressableScale";
import { StyleSheet, View } from "react-native";
export default function NoRecipes() {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t("recipes.empty.title")}</Text>
      <PressableScale
        style={styles.button}
        onPress={() => router.navigate(`/new`)}
      >
        <Ionicons name="add-circle" size={22} color={colors.onAccent} />
        <Text style={styles.buttonText}>{t("recipes.empty.createFirst")}</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 80,
  },
  title: {
    fontSize: 18,
    fontFamily: "Default",
    textAlign: "center",
    color: colors.text,
  },
  button: {
    display: "flex",
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 15,
    width: 300,
    backgroundColor: colors.accent,
    borderRadius: 25,
    paddingVertical: 14,
    paddingHorizontal: 20,

    shadowColor: colors.accent,
    shadowOffset: { width: 2, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 4,
  },
  buttonText: {
    fontSize: 18,
    fontFamily: "DefaultBold",
    textAlign: "center",
    color: colors.onAccent,
  },
});

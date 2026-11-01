import { colors } from "@/constants/theme";
import { LANGUAGE_NAMES, LanguagePreference, LANGUAGES } from "@/i18n";
import { showAlert } from "@/stores/alertStore";
import { settings$ } from "@/stores/settingsStore";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useTranslation } from "react-i18next";
import { Pressable, StyleProp, StyleSheet, ViewStyle } from "react-native";

type Props = {
  style?: StyleProp<ViewStyle>;
};

export default function LanguageButton({ style }: Props) {
  const { t } = useTranslation();

  const handlePress = () => {
    const choose = (language: LanguagePreference) => () => {
      if (language !== settings$.language.peek()) {
        settings$.language.set(language);
      }
    };

    showAlert(
      t("settings.language.title"),
      t("settings.language.restartNotice"),
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("settings.language.system"), onPress: choose("system") },
        ...LANGUAGES.map((language) => ({
          text: LANGUAGE_NAMES[language],
          onPress: choose(language),
        })),
      ],
    );
  };

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={t("settings.language.title")}
      style={[styles.button, style]}
    >
      <MaterialCommunityIcons
        name="translate"
        size={20}
        color={colors.textDisabled}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 40,
    width: 40,
    borderColor: colors.textDisabled,
    borderWidth: 1,
    borderRadius: 100,
    justifyContent: "center",
    alignItems: "center",
  },
});

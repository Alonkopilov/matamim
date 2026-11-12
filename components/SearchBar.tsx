import { MAX_FONT_SCALE } from "@/components/ui/Text";
import { colors, fonts, spacing } from "@/constants/theme";
import { INPUT_START_ALIGN } from "@/utils/layoutDirection";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Observable } from "@legendapp/state";
import { Show } from "@legendapp/state/react";
import { $TextInput } from "@legendapp/state/react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, View } from "react-native";

const BAR_HEIGHT = 52;

type Props = {
  query$: Observable<string>;
};

export default function SearchBar({ query$ }: Props) {
  const { t } = useTranslation();
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={[styles.barContainer, isFocused && styles.barFocused]}>
      <Ionicons
        name="search"
        size={20}
        color={isFocused ? colors.accent : colors.textSecondary}
      />
      <$TextInput
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        testID="recipe-search"
        placeholderTextColor={colors.textDisabled}
        placeholder={t("recipes.searchPlaceholder")}
        style={styles.searchBar}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        returnKeyType="search"
        $value={query$}
      />
      <Show if={() => query$.get() !== ""}>
        <Pressable
          onPress={() => query$.set("")}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t("common.clear")}
        >
          <Ionicons
            name="close-circle"
            size={20}
            color={colors.textSecondary}
          />
        </Pressable>
      </Show>
    </View>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    flex: 1,
    textAlign: INPUT_START_ALIGN,
    color: colors.text,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    fontFamily: fonts.bold,
    paddingVertical: 0,
  },
  barContainer: {
    height: BAR_HEIGHT,
    marginTop: spacing.xl,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg + 2,
    borderRadius: BAR_HEIGHT / 2,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: colors.surfaceRaised,
  },
  barFocused: {
    borderColor: colors.accent,
  },
});

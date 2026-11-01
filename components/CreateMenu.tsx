import PressableScale from "@/components/ui/PressableScale";
import Sheet, { type SheetHandle, sheetStyles } from "@/components/ui/Sheet";
import { colors, fonts, radius, spacing } from "@/constants/theme";
import { pendingShare$ } from "@/stores/shareStore";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { type ComponentProps, useRef } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];
type Choice = "new" | "link" | "photo";

const CHOICES: { key: Choice; icon: IconName }[] = [
  { key: "new", icon: "pencil-outline" },
  { key: "link", icon: "link-variant" },
  { key: "photo", icon: "camera-outline" },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  // Opens the new recipe screen
  onOpenNewRecipe: () => void;
};

// What the create button offers: a blank recipe or one of the imports
export default function CreateMenu({
  visible,
  onClose,
  onOpenNewRecipe,
}: Props) {
  const { t } = useTranslation();
  const sheet = useRef<SheetHandle>(null);
  const chosen = useRef<Choice | null>(null);

  // Acts once the sheet is gone, so the import sheet doesn't open under it
  const handleClose = () => {
    const choice = chosen.current;
    chosen.current = null;
    onClose();
    if (!choice) return;

    // An empty share opens the recipe screen's import in that mode, through
    // the same checks as a real share
    if (choice === "link") pendingShare$.set({ kind: "link", url: "" });
    if (choice === "photo") {
      pendingShare$.set({ kind: "photos", photos: [], skipped: 0 });
    }
    onOpenNewRecipe();
  };

  const choose = (choice: Choice) => {
    chosen.current = choice;
    sheet.current?.dismiss();
  };

  return (
    <Sheet ref={sheet} visible={visible} onClose={handleClose}>
      <Text style={sheetStyles.title}>{t("tabs.createMenu.title")}</Text>
      <View style={styles.choices}>
        {CHOICES.map(({ key, icon }) => (
          <PressableScale
            key={key}
            onPress={() => choose(key)}
            accessibilityRole="button"
            style={styles.choice}
          >
            <View style={styles.iconTile}>
              <MaterialCommunityIcons
                name={icon}
                size={24}
                color={colors.accent}
              />
            </View>
            <View style={styles.choiceText}>
              <Text style={styles.choiceTitle}>
                {t(`tabs.createMenu.${key}.title`)}
              </Text>
              <Text style={styles.choiceHint}>
                {t(`tabs.createMenu.${key}.hint`)}
              </Text>
            </View>
          </PressableScale>
        ))}
      </View>
    </Sheet>
  );
}

const ICON_TILE_SIZE = 48;

const styles = StyleSheet.create({
  choices: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceRaised,
  },
  iconTile: {
    width: ICON_TILE_SIZE,
    height: ICON_TILE_SIZE,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 211, 61, 0.14)",
  },
  choiceText: {
    flex: 1,
    gap: 2,
  },
  choiceTitle: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: colors.text,
    textAlign: "left",
  },
  choiceHint: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    textAlign: "left",
  },
});

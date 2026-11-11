import { Text } from "@/components/ui/Text";
import { colors, fonts, spacing } from "@/constants/theme";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { I18nManager, Pressable, StyleSheet } from "react-native";
import IconTile, { type IconName, ROW_PADDING } from "./IconTile";

type Props = {
  materialIcon: IconName;
  // The icon tile's color, red for dangerous actions
  tileColor: string;
  title: string;
  onPress: () => void;
  isDanger: boolean;
};

export default function MenuActionItem({
  materialIcon,
  tileColor,
  title,
  onPress,
  isDanger,
}: Props) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        // Not "", which Android ignores, keeping the pressed color
        { backgroundColor: pressed ? colors.surfaceRaised : "transparent" },
      ]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <IconTile icon={materialIcon} color={tileColor} />
      <Text style={[styles.label, isDanger && styles.danger]}>{title}</Text>
      <MaterialCommunityIcons
        // Points to the end of the row, where the item leads
        name={I18nManager.isRTL ? "chevron-left" : "chevron-right"}
        size={22}
        color={colors.textMuted}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: ROW_PADDING,
  },
  label: {
    flex: 1,
    fontSize: 16,
    fontFamily: fonts.regular,
    color: colors.text,
    textAlign: "left",
  },
  danger: {
    color: colors.danger,
  },
});

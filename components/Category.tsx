import PressableScale from "@/components/ui/PressableScale";
import { colors, fonts, spacing } from "@/constants/theme";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ComponentProps } from "react";
import { StyleSheet, Text } from "react-native";

const CHIP_HEIGHT = 40;

type Props = {
  name: string;
  materialIcon: ComponentProps<typeof MaterialIcons>["name"];
  isSelected: boolean;
  onSelect: () => void;
};

export default function Category({
  name,
  materialIcon,
  isSelected,
  onSelect,
}: Props) {
  const color = isSelected ? colors.onAccent : colors.textSecondary;

  return (
    <PressableScale
      onPress={onSelect}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      style={[styles.chip, isSelected && styles.chipSelected]}
    >
      <MaterialIcons name={materialIcon} size={18} color={color} />
      <Text style={[styles.text, { color }]}>{name}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: CHIP_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.lg,
    borderRadius: CHIP_HEIGHT / 2,
    backgroundColor: colors.surfaceRaised,
  },
  chipSelected: {
    backgroundColor: colors.accent,
  },
  text: {
    fontSize: 14,
    fontFamily: fonts.bold,
  },
});

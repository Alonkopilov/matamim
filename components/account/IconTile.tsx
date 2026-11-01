import { spacing } from "@/constants/theme";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { type ComponentProps } from "react";
import { StyleSheet, View } from "react-native";

export const ICON_TILE_SIZE = 32;
// A settings row's side padding, the separators line up with it
export const ROW_PADDING = spacing.lg;

export type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

type Props = {
  icon: IconName;
  color: string;
};

// The colored rounded square at the start of a settings row
export default function IconTile({ icon, color }: Props) {
  return (
    <View style={[styles.tile, { backgroundColor: color }]}>
      <MaterialCommunityIcons name={icon} size={20} color="white" />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: ICON_TILE_SIZE,
    height: ICON_TILE_SIZE,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
});

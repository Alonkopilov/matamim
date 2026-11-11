import { Text } from "@/components/ui/Text";
import { colors, fonts, radius, spacing } from "@/constants/theme";
import { Children, Fragment, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { ICON_TILE_SIZE, ROW_PADDING } from "./IconTile";

type Props = {
  title: string;
  children: ReactNode;
};

// A titled rounded card of rows, with separators between them that start
// after the icon tiles, like iOS Settings
export default function SettingsGroup({ title, children }: Props) {
  const rows = Children.toArray(children).filter(Boolean);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.card}>
        {rows.map((row, index) => (
          <Fragment key={index}>
            {index > 0 && <View style={styles.separator} />}
            {row}
          </Fragment>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    marginTop: spacing.xl,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "left",
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginStart: ROW_PADDING + ICON_TILE_SIZE + spacing.md,
  },
});

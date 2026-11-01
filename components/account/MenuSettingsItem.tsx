import { colors, fonts, spacing } from "@/constants/theme";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Observable } from "@legendapp/state";
import { Computed } from "@legendapp/state/react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Switch, Text, View } from "react-native";
import IconTile, { type IconName, ROW_PADDING } from "./IconTile";

type Props = {
  icon: IconName;
  tileColor: string;
  title: string;
  description: string;
  isPremium: boolean;
  setting$: Observable<boolean>;
  disabled: boolean;
  onValueChange?: (value: boolean) => void;
  testID?: string;
};

export default function MenuSettingsItem({
  icon,
  tileColor,
  title,
  description,
  isPremium,
  setting$,
  disabled,
  onValueChange,
  testID,
}: Props) {
  const { t } = useTranslation();

  return (
    <View style={styles.row}>
      <IconTile icon={icon} color={tileColor} />
      <View style={styles.info}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{title}</Text>
          {isPremium && (
            <View style={styles.premiumBadge}>
              <MaterialCommunityIcons
                name="crown"
                size={11}
                color={colors.accentDeep}
              />
              <Text style={styles.premiumText}>{t("common.premium")}</Text>
            </View>
          )}
        </View>
        <Text style={styles.description}>{description}</Text>
      </View>
      <Computed>
        {() => (
          <Switch
            testID={testID}
            disabled={disabled}
            trackColor={{ false: "#767577", true: colors.accent }}
            thumbColor="#f4f3f4"
            onValueChange={onValueChange ?? setting$.toggle}
            value={setting$.get()}
          />
        )}
      </Computed>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: ROW_PADDING,
    paddingVertical: spacing.md,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontFamily: fonts.bold,
    textAlign: "left",
  },
  description: {
    color: colors.textSecondary,
    fontSize: 13,
    fontFamily: fonts.regular,
    textAlign: "left",
  },
  premiumBadge: {
    flexDirection: "row",
    gap: 3,
    backgroundColor: colors.accent,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 100,
    alignItems: "center",
  },
  premiumText: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: colors.accentDeep,
  },
});

import PressableScale from "@/components/ui/PressableScale";
import { Text } from "@/components/ui/Text";
import { colors, fonts, radius, spacing } from "@/constants/theme";
import { Observable } from "@legendapp/state";
import { observer } from "@legendapp/state/react";
import * as Haptics from "expo-haptics";
import { StyleSheet, View } from "react-native";

type Props = {
  id: string;
  title: string;
  // Localized by the store, e.g. "₪2.00"
  price: string;
  period: string;
  // Shown on the plan we lead with, e.g. "Best value"
  badge?: string;
  selected$: Observable<string>;
  // For e2e tests, the badge gets `${testID}-badge`
  testID?: string;
};

export default observer(function PaymentOption({
  id,
  title,
  price,
  period,
  badge,
  selected$,
  testID,
}: Props) {
  const isSelected = selected$.get() === id;

  return (
    <View>
      <PressableScale
        testID={testID}
        accessibilityRole="radio"
        accessibilityState={{ selected: isSelected }}
        // Colors change but are always set, Android drops the border radius
        // of a background added after mount
        style={[
          styles.card,
          isSelected ? styles.selectedCard : styles.unselectedCard,
        ]}
        onPress={() => {
          if (isSelected) return;
          Haptics.selectionAsync();
          selected$.set(id);
        }}
      >
        <View
          style={[
            styles.radio,
            { borderColor: isSelected ? colors.accent : colors.textMuted },
          ]}
        >
          <View style={[styles.radioDot, { opacity: isSelected ? 1 : 0 }]} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.price}>
          {price}
          {period !== "" && <Text style={styles.period}> / {period}</Text>}
        </Text>
      </PressableScale>
      {badge && (
        <View
          style={styles.badge}
          pointerEvents="none"
          testID={testID && `${testID}-badge`}
        >
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 68,
    paddingHorizontal: spacing.lg,
    borderWidth: 2,
    borderRadius: radius.lg,
  },
  selectedCard: {
    borderColor: colors.accent,
    backgroundColor: "rgba(255, 211, 61, 0.1)",
  },
  unselectedCard: {
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  radio: {
    height: 22,
    width: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: {
    height: 12,
    width: 12,
    borderRadius: 6,
    backgroundColor: colors.accent,
  },
  title: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    fontFamily: fonts.bold,
    textAlign: "left",
  },
  price: {
    fontSize: 16,
    color: colors.text,
    fontFamily: fonts.bold,
  },
  period: {
    fontSize: 14,
    color: colors.textSecondary,
    fontFamily: fonts.regular,
  },
  // Sits on the card's top border, at its end
  badge: {
    position: "absolute",
    top: -10,
    end: spacing.lg,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  badgeText: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: colors.onAccent,
  },
});

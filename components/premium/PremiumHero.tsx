import { colors, fonts, radius, spacing } from "@/constants/theme";
import { onScreenLeft } from "@/utils/layoutDirection";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { LinearGradient } from "expo-linear-gradient";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

// How long the gradient takes to cross the card once
const DRIFT_DURATION = 5000;
// Starts and ends on the same color, so copies of it tile without a seam
const GRADIENT_COLORS = [
  colors.accent,
  "#FFB020",
  "#ffd733",
  colors.accent,
] as const;

type Props = {
  title: ReactNode;
  description: string;
};

// The Premium screen's header card, on a yellow-to-amber gradient that keeps
// moving across it in one direction
export default function PremiumHero({ title, description }: Props) {
  const { t } = useTranslation();
  const progress = useSharedValue(0);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    progress.set(
      withRepeat(
        withTiming(1, { duration: DRIFT_DURATION, easing: Easing.linear }),
        -1,
        false,
      ),
    );
  }, [progress]);

  // Two copies side by side slide one card width, then jump back to the
  // start, where the second copy looks the same as the first did
  const gradientStyle = useAnimatedStyle(() => ({
    width: width * 2,
    transform: [{ translateX: -progress.value * width }],
  }));

  return (
    <View
      style={styles.card}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <Animated.View style={[styles.gradient, gradientStyle]}>
        {/* Horizontal, a diagonal one wouldn't line up where they meet */}
        {[0, 1].map((copy) => (
          <LinearGradient
            key={copy}
            colors={GRADIENT_COLORS}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.gradientCopy}
          />
        ))}
      </Animated.View>
      <View style={styles.badge}>
        <MaterialCommunityIcons name="crown" size={16} color={colors.accent} />
        <Text style={styles.badgeText}>{t("common.premium")}</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    overflow: "hidden",
    padding: spacing.xl,
    gap: spacing.sm,
    backgroundColor: colors.accent,
  },
  gradient: {
    position: "absolute",
    top: 0,
    bottom: 0,
    // The screen's left, the drift is a transform, which doesn't mirror
    ...onScreenLeft(0),
    // Copies stay in screen order, a transform doesn't mirror either
    flexDirection: "row",
    direction: "ltr",
  },
  gradientCopy: {
    flex: 1,
  },
  badge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.onAccent,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  badgeText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.accent,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 28,
    color: colors.onAccent,
    textAlign: "left",
  },
  description: {
    fontFamily: fonts.regular,
    fontSize: 16,
    color: "rgba(0, 0, 0, 0.7)",
    textAlign: "left",
  },
});

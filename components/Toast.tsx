import { colors, fonts, shadows, spacing } from "@/constants/theme";
import { toast$ } from "@/stores/toastStore";
import Ionicons from "@expo/vector-icons/Ionicons";
import { observer } from "@legendapp/state/react";
import { type ComponentProps, useEffect } from "react";
import { StyleSheet, Text } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const HIDDEN_OFFSET = -160;
const SPRING = { damping: 48, stiffness: 520 };
// How far up it's swiped before letting go dismisses it
const DISMISS_DISTANCE = 24;

type IconName = ComponentProps<typeof Ionicons>["name"];
const ICONS: Record<"success" | "error" | "info", [IconName, string]> = {
  success: ["checkmark-circle", "#4CAF50"],
  error: ["alert-circle", colors.danger],
  info: ["information-circle", colors.accent],
};

const hide = () => toast$.visible.set(false);

// Slides down from the top, clear of the tab bar and any open sheet
export const Toast = observer(() => {
  const visible = toast$.visible.get();
  const message = toast$.message.get();
  const type = toast$.type.get();
  const insets = useSafeAreaInsets();

  const offset = useSharedValue(HIDDEN_OFFSET);
  useEffect(() => {
    offset.set(withSpring(visible ? 0 : HIDDEN_OFFSET, SPRING));
  }, [visible, offset]);

  const swipeUp = Gesture.Pan()
    .runOnJS(true)
    .onUpdate((e) => offset.set(Math.min(0, e.translationY)))
    .onEnd((e) => {
      if (e.translationY < -DISMISS_DISTANCE) {
        offset.set(withTiming(HIDDEN_OFFSET, { duration: 150 }));
        hide();
      } else {
        offset.set(withSpring(0, SPRING));
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }],
  }));

  const [icon, iconColor] = ICONS[type];

  return (
    <GestureDetector gesture={swipeUp}>
      <Animated.View
        pointerEvents={visible ? "auto" : "none"}
        accessibilityLiveRegion="polite"
        style={[
          styles.toast,
          { top: insets.top + spacing.sm },
          animatedStyle,
        ]}
      >
        <Ionicons name={icon} size={22} color={iconColor} />
        <Text style={styles.text} numberOfLines={3}>
          {message}
        </Text>
      </Animated.View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    start: spacing.lg,
    end: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadows.floating,
    zIndex: 9999,
  },
  text: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 20,
    textAlign: "left",
  },
});

import Button from "@/components/ui/Button";
import PressableScale from "@/components/ui/PressableScale";
import { MAX_FONT_SCALE, Text } from "@/components/ui/Text";
import { colors, fonts, radius, spacing } from "@/constants/theme";
import { directionStyle } from "@/utils/textDirection";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import * as Haptics from "expo-haptics";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type GestureResponderEvent,
  I18nManager,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Its own tag, so the recipe screen's setting doesn't turn it off
const KEEP_AWAKE_TAG = "cook-mode";

// A finger that moved further than this was dragging, not tapping
const TAP_SLOP = 10;

type Props = {
  visible: boolean;
  onClose: () => void;
  steps: string[];
  // Direction of the recipe's content, null keeps the app's
  isContentRTL: boolean | null;
};

// The steps one at a time in large text, with the screen kept on
export default function CookMode({
  visible,
  onClose,
  steps,
  isContentRTL,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const pressStart = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!visible) return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG);
    };
  }, [visible]);

  // Starts over from the first step next time
  const close = () => {
    onClose();
    setIndex(0);
  };

  const isLast = index >= steps.length - 1;
  const goTo = (next: number) => {
    Haptics.selectionAsync();
    setIndex(next);
  };

  // Like a story: the screen's outer thirds turn the page, forward on the side
  // the Next button is on. The middle is left for resting a finger, and the
  // last step only closes with Done.
  const onTapStep = ({ nativeEvent }: GestureResponderEvent) => {
    // A short step can't scroll, so on Android a drag isn't taken from the tap
    const moved = Math.hypot(
      nativeEvent.pageX - pressStart.current.x,
      nativeEvent.pageY - pressStart.current.y,
    );
    if (moved > TAP_SLOP) return;
    const isOnLeft = nativeEvent.pageX < width / 3;
    const isOnRight = nativeEvent.pageX > (width * 2) / 3;
    if (!isOnLeft && !isOnRight) return;
    const isForward = I18nManager.isRTL ? isOnLeft : isOnRight;
    if (isForward && !isLast) goTo(index + 1);
    else if (!isForward && index > 0) goTo(index - 1);
  };

  return (
    <Modal
      visible={visible}
      onRequestClose={close}
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View
        style={[
          styles.container,
          {
            paddingTop: insets.top + spacing.md,
            paddingBottom: insets.bottom + spacing.lg,
          },
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.counter}>
            {t("recipe.cookMode.stepOf", {
              current: index + 1,
              total: steps.length,
            })}
          </Text>
          <PressableScale
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel={t("recipe.cookMode.close")}
            hitSlop={12}
            style={styles.close}
          >
            <FontAwesome6 name="xmark" size={18} color={colors.text} />
          </PressableScale>
        </View>

        <View style={styles.progress}>
          {steps.map((_, i) => (
            // Every segment has its background from the first render and
            // only its color changes, so Android keeps the rounded corners
            <View
              key={i}
              style={[
                styles.segment,
                { backgroundColor: i <= index ? colors.accent : colors.border },
              ]}
            />
          ))}
        </View>

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Screen readers use the buttons, the text is read as it is.
              Without focusable={false} Android still offers it as a button. */}
          <Pressable
            testID="cook-mode-step"
            onPressIn={({ nativeEvent }) => {
              pressStart.current = {
                x: nativeEvent.pageX,
                y: nativeEvent.pageY,
              };
            }}
            onPress={onTapStep}
            accessible={false}
            focusable={false}
            style={styles.stepArea}
          >
            <Animated.Text
              maxFontSizeMultiplier={MAX_FONT_SCALE}
              key={index}
              entering={FadeIn.duration(250)}
              style={[styles.step, directionStyle(isContentRTL)]}
            >
              {steps[index]}
            </Animated.Text>
          </Pressable>
        </ScrollView>

        <View style={styles.actions}>
          <Button
            title={t("recipe.cookMode.previous")}
            variant="secondary"
            onPress={() => goTo(index - 1)}
            disabled={index === 0}
            style={styles.action}
          />
          <Button
            title={
              isLast ? t("recipe.cookMode.done") : t("recipe.cookMode.next")
            }
            onPress={() => {
              if (!isLast) return goTo(index + 1);
              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success,
              );
              close();
            }}
            style={styles.action}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  counter: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.textSecondary,
  },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceRaised,
  },
  progress: {
    flexDirection: "row",
    gap: spacing.xs,
    marginTop: spacing.lg,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: radius.full,
  },
  // Out to the screen's edges, where a story is tapped
  body: {
    flex: 1,
    marginHorizontal: -spacing.xl,
  },
  bodyContent: {
    flexGrow: 1,
  },
  // Fills the body, so a tap anywhere around a short step counts
  stepArea: {
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  step: {
    fontFamily: fonts.bold,
    fontSize: 28,
    lineHeight: 42,
    color: colors.text,
    textAlign: "left",
  },
  actions: {
    flexDirection: "row",
    gap: spacing.md,
  },
  action: {
    flex: 1,
  },
});

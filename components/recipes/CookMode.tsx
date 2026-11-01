import Button from "@/components/ui/Button";
import PressableScale from "@/components/ui/PressableScale";
import { colors, fonts, radius, spacing } from "@/constants/theme";
import { directionStyle } from "@/utils/textDirection";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import * as Haptics from "expo-haptics";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Its own tag, so the recipe screen's setting doesn't turn it off
const KEEP_AWAKE_TAG = "cook-mode";

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
  const [index, setIndex] = useState(0);

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
          <Animated.Text
            key={index}
            entering={FadeIn.duration(250)}
            style={[styles.step, directionStyle(isContentRTL)]}
          >
            {steps[index]}
          </Animated.Text>
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
  body: {
    flex: 1,
  },
  bodyContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: spacing.xxl,
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

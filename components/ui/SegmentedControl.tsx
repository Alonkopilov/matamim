import { colors, fonts, spacing } from "@/constants/theme";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { I18nManager, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  Easing,
  withTiming,
} from "react-native-reanimated";

const HEIGHT = 40;
const PADDING = 3;
const SLIDE = { duration: 180, easing: Easing.out(Easing.cubic) };

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
};

// A row of options with a thumb that slides to the selected one
export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: Props<T>) {
  const [segmentWidth, setSegmentWidth] = useState(0);
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  // Transforms don't mirror, so the thumb moves left in right to left
  const offset = useSharedValue(0);
  useEffect(() => {
    const target = index * segmentWidth * (I18nManager.isRTL ? -1 : 1);
    // Jumps into place on the first layout, slides after that
    offset.set(segmentWidth ? withTiming(target, SLIDE) : target);
  }, [index, segmentWidth, offset]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));

  return (
    <View
      accessibilityRole="tablist"
      style={styles.track}
      onLayout={(e) =>
        setSegmentWidth(
          (e.nativeEvent.layout.width - PADDING * 2) / options.length,
        )
      }
    >
      {/* Has its background from the first render, Android drops the border
          radius of a background added after mount */}
      <Animated.View
        style={[
          styles.thumb,
          { width: segmentWidth, opacity: segmentWidth ? 1 : 0 },
          thumbStyle,
        ]}
      />
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => {
              if (selected) return;
              Haptics.selectionAsync();
              onChange(option.value);
            }}
            style={styles.segment}
          >
            <Text
              style={[styles.label, selected && styles.selectedLabel]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: HEIGHT,
    flexDirection: "row",
    padding: PADDING,
    borderRadius: HEIGHT / 2,
    backgroundColor: colors.surface,
  },
  thumb: {
    position: "absolute",
    top: PADDING,
    bottom: PADDING,
    start: PADDING,
    borderRadius: (HEIGHT - PADDING * 2) / 2,
    backgroundColor: colors.surfaceRaised,
  },
  segment: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  label: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.textSecondary,
  },
  selectedLabel: {
    color: colors.text,
  },
});

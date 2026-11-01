import CreateMenu from "@/components/CreateMenu";
import { colors, fonts, spacing } from "@/constants/theme";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import {
  BottomTabBarHeightCallbackContext,
  type BottomTabBarProps,
} from "expo-router/js-tabs";
import { type RefObject, useContext, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BAR_HEIGHT = 68;
const CREATE_SIZE = 52;
const PILL_HEIGHT = 56;
// Rendered as a round accent button instead of a regular tab
const CREATE_ROUTE = "[id]";

type Props = BottomTabBarProps & {
  // What the bar blurs behind it on Android, a BlurTargetView around the tabs
  // Undefined until it's ready, when the bar is only tinted
  blurTarget?: RefObject<View | null>;
};

// Floats over the screens, so scrollable content needs bottom padding of
// useBottomTabBarHeight() to clear it
export default function FloatingTabBar({
  state,
  descriptors,
  navigation,
  blurTarget,
}: Props) {
  const insets = useSafeAreaInsets();
  // A custom bar has to report its height for useBottomTabBarHeight()
  const setTabBarHeight = useContext(BottomTabBarHeightCallbackContext);
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);

  return (
    <View
      pointerEvents="box-none"
      onLayout={(e) => setTabBarHeight?.(e.nativeEvent.layout.height)}
      style={[
        styles.wrapper,
        { paddingBottom: Math.max(insets.bottom, spacing.md) },
      ]}
    >
      <View style={styles.bar}>
        <BlurView
          blurTarget={blurTarget}
          blurMethod={blurTarget ? "dimezisBlurViewSdk31Plus" : "none"}
          tint="dark"
          intensity={60}
          style={styles.blur}
        />
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const itemStyle = StyleSheet.flatten(options.tabBarItemStyle);
          // expo-router hides `href: null` tabs this way
          if (itemStyle?.display === "none") return null;

          const focused = state.index === index;
          const label =
            typeof options.title === "string" ? options.title : route.name;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (event.defaultPrevented) {
              // A locked tab explains itself, the buzz says it didn't open
              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Warning,
              );
            } else if (!focused) {
              Haptics.selectionAsync();
              navigation.navigate(route.name, route.params);
            }
          };
          const onLongPress = () =>
            navigation.emit({ type: "tabLongPress", target: route.key });

          if (route.name === CREATE_ROUTE) {
            return (
              <View key={route.key} style={styles.slot}>
                <Pressable
                  testID="tab-create"
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setIsCreateMenuOpen(true);
                  }}
                  onLongPress={onLongPress}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  style={({ pressed }) => [
                    styles.createButton,
                    pressed && styles.pressed,
                  ]}
                >
                  {options.tabBarIcon?.({
                    focused: true,
                    color: colors.onAccent,
                    size: 28,
                  })}
                </Pressable>
              </View>
            );
          }

          const color = focused ? colors.accent : colors.textSecondary;
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              onLongPress={onLongPress}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              style={({ pressed }) => [
                styles.slot,
                itemStyle,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.pill}>
                {/* Always mounted and only faded in, Android drops the border
                    radius of a background added after mount */}
                <View
                  style={[styles.pillHighlight, { opacity: focused ? 1 : 0 }]}
                />
                {options.tabBarIcon?.({ focused, color, size: 22 })}
                <Text style={[styles.label, { color }]} numberOfLines={1}>
                  {label}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <CreateMenu
        visible={isCreateMenuOpen}
        onClose={() => setIsCreateMenuOpen(false)}
        onOpenNewRecipe={() => navigation.navigate(CREATE_ROUTE, { id: "new" })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    start: 0,
    end: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
  },
  // No shadow: Android draws an elevation shadow through a see-through
  // background, so the border sets it apart instead
  bar: {
    height: BAR_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.xs,
    borderRadius: BAR_HEIGHT / 2,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  // Tinted, so labels stay readable over a busy photo, and the bar still
  // looks solid where blur isn't supported (Android 11 and below)
  blur: {
    position: "absolute",
    top: 0,
    bottom: 0,
    start: 0,
    end: 0,
    backgroundColor: "rgba(30, 31, 34, 0.72)",
  },
  slot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pill: {
    height: PILL_HEIGHT,
    minWidth: 60,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  pillHighlight: {
    position: "absolute",
    top: 0,
    bottom: 0,
    start: 0,
    end: 0,
    borderRadius: PILL_HEIGHT / 2,
    backgroundColor: "rgba(255, 211, 61, 0.16)",
  },
  label: {
    fontFamily: fonts.regular,
    fontSize: 11,
  },
  createButton: {
    width: CREATE_SIZE,
    height: CREATE_SIZE,
    borderRadius: CREATE_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.95 }],
  },
});

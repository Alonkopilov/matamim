import PressableScale from "@/components/ui/PressableScale";
import { BlurView } from "expo-blur";
import { type ReactNode, type RefObject } from "react";
import {
  type StyleProp,
  StyleSheet,
  type ViewInstance,
  type ViewStyle,
} from "react-native";

const SIZE = 40;

type Props = {
  onPress: () => void;
  accessibilityLabel: string;
  children: ReactNode;
  // What it blurs on Android, a BlurTargetView it doesn't sit inside.
  // Undefined until it's laid out, when the button is only tinted
  blurTarget?: RefObject<ViewInstance | null>;
  tint?: "dark" | "danger";
  style?: StyleProp<ViewStyle>;
};

// A round frosted button for floating over photos
export default function GlassButton({
  onPress,
  accessibilityLabel,
  children,
  blurTarget,
  tint = "dark",
  style,
}: Props) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={12}
      scaleTo={0.9}
      style={[styles.button, style]}
    >
      <BlurView
        blurTarget={blurTarget}
        blurMethod={blurTarget ? "dimezisBlurViewSdk31Plus" : "none"}
        tint="dark"
        intensity={40}
        style={[styles.fill, tint === "danger" ? styles.danger : styles.dark]}
      />
      {children}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  fill: {
    position: "absolute",
    top: 0,
    bottom: 0,
    start: 0,
    end: 0,
  },
  // Tinted, so the icon stays readable over a bright photo, and the button
  // still shows where blur isn't supported (Android 11 and below)
  dark: {
    backgroundColor: "rgba(20, 21, 23, 0.45)",
  },
  danger: {
    backgroundColor: "rgba(255, 74, 74, 0.55)",
  },
});

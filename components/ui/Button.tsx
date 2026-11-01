import PressableScale from "@/components/ui/PressableScale";
import { colors, fonts, spacing } from "@/constants/theme";
import {
  ActivityIndicator,
  type StyleProp,
  StyleSheet,
  Text,
  type ViewStyle,
} from "react-native";

const HEIGHT = 48;

type Variant = "primary" | "secondary" | "destructive";

const TEXT_COLORS: Record<Variant, string> = {
  primary: colors.onAccent,
  secondary: colors.text,
  destructive: colors.text,
};

type Props = {
  title: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export default function Button({
  title,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  style,
  testID,
}: Props) {
  const color = TEXT_COLORS[variant];

  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      style={[
        styles.button,
        styles[variant],
        disabled && !loading && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <Text style={[styles.text, { color }]} numberOfLines={1}>
          {title}
        </Text>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    height: HEIGHT,
    borderRadius: HEIGHT / 2,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: {
    backgroundColor: colors.accent,
  },
  secondary: {
    backgroundColor: colors.surfaceRaised,
  },
  destructive: {
    backgroundColor: colors.dangerStrong,
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontSize: 16,
    fontFamily: fonts.bold,
  },
});

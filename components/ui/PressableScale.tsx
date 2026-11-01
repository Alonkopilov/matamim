import { type ComponentProps } from "react";
import { Pressable, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  Easing,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<ComponentProps<typeof Pressable>, "style"> & {
  style?: StyleProp<ViewStyle>;
  // How far it shrinks while held
  scaleTo?: number;
};

// Quick and without a bounce, a slow spring back reads as lag
const PRESS = { duration: 90, easing: Easing.out(Easing.quad) };

// The app's press feedback, a quick shrink and back
export default function PressableScale({
  style,
  scaleTo = 0.96,
  onPressIn,
  onPressOut,
  ...props
}: Props) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      {...props}
      onPressIn={(e) => {
        scale.set(withTiming(scaleTo, PRESS));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.set(withTiming(1, PRESS));
        onPressOut?.(e);
      }}
      style={[style, animatedStyle]}
    />
  );
}

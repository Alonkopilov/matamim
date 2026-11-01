import { useBottomTabBarHeight } from "expo-router/js-tabs";
import { colors } from "@/constants/theme";
import { onScreenRight } from "@/utils/layoutDirection";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import React, { useState } from "react";
import PressableScale from "@/components/ui/PressableScale";
import { Animated, Easing, StyleSheet } from "react-native";

interface RefreshButtonProps {
  onRefresh?: () => void;
}

export function RefreshButton({ onRefresh }: RefreshButtonProps) {
  const tabBarHeight = useBottomTabBarHeight();
  const [spinValue] = useState(() => new Animated.Value(0));
  const [isDisabled, setIsDisabled] = useState(false);

  const handlePress = () => {
    if (isDisabled) return;

    setIsDisabled(true);
    if (onRefresh) onRefresh();

    spinValue.setValue(0);
    Animated.timing(spinValue, {
      toValue: 1,
      duration: 600,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: true,
    }).start();

    setTimeout(() => {
      setIsDisabled(false);
    }, 2000);
  };

  const spinInterpolation = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <PressableScale
      testID="team-refresh"
      onPress={handlePress}
      disabled={isDisabled}
      style={[
        styles.floatingButton,
        { bottom: tabBarHeight + 16 },
        isDisabled && styles.buttonDisabled,
      ]}
    >
      <Animated.View style={{ transform: [{ rotate: spinInterpolation }] }}>
        <MaterialCommunityIcons
          name="refresh"
          size={26}
          color={isDisabled ? colors.textDisabled : colors.background}
        />
      </Animated.View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  floatingButton: {
    position: "absolute",
    ...onScreenRight(24),
    backgroundColor: colors.accent, // Active gold color
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  buttonDisabled: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderWidth: 1,
    opacity: 0.6,
    elevation: 0, // Remove shadow depth when disabled
    shadowOpacity: 0,
  },
});

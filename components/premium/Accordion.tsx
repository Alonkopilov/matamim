import { Text } from "@/components/ui/Text";
import { colors } from "@/constants/theme";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React from "react";
import { Pressable, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

type AccordionProps = {
  title: string;
  expandedText: string;
};

export default function Accordion({ title, expandedText }: AccordionProps) {
  const isExpanded = useSharedValue(false);

  const toggleAccordion = () => {
    isExpanded.value = !isExpanded.value;
  };

  const arrowAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ rotate: withTiming(isExpanded.value ? "180deg" : "0deg") }],
    };
  });

  const contentAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: isExpanded.value
        ? withTiming(1, { duration: 200 })
        : withTiming(0, { duration: 150 }),
      display: isExpanded.value ? "flex" : "none",
    };
  });

  return (
    <Animated.View style={styles.cardContainer}>
      <Pressable onPress={toggleAccordion} style={styles.headerRow}>
        <Text style={styles.titleText}>{title}</Text>
        <Animated.View style={arrowAnimatedStyle}>
          <MaterialIcons
            name="keyboard-arrow-down"
            size={24}
            color={colors.text}
          />
        </Animated.View>
      </Pressable>

      <Animated.View style={[styles.contentWrapper, contentAnimatedStyle]}>
        <Text style={styles.bodyText}>{expandedText}</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    marginTop: 15,
    backgroundColor: "#ffd23d29",
    borderRadius: 16,
    marginVertical: 6,
    overflow: "hidden",
    padding: 16,
  },
  headerRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  titleText: {
    color: "#f7f7f7",
    fontFamily: "Default",
    fontSize: 14,
    flex: 1,
    textAlign: "left",
    marginLeft: 12,
  },
  contentWrapper: {
    marginTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
    paddingTop: 12,
  },
  bodyText: {
    color: "#b0aebd",
    fontSize: 14,
    lineHeight: 20,
    fontFamily: "Default",
    textAlign: "left",
  },
});

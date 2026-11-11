import { Text } from "@/components/ui/Text";
import { colors } from "@/constants/theme";
import Octicons from "@expo/vector-icons/Octicons";
import { ComponentProps } from "react";
import { StyleSheet, View } from "react-native";

type Props = {
  icon: ComponentProps<typeof Octicons>["name"];
  title: string;
  description: string;
};

export default function Feature({ icon, title, description }: Props) {
  return (
    <View style={styles.feature}>
      <Octicons name={icon} color={colors.accent} size={24} />
      <View style={styles.featureTextContainer}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDescription}>{description}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  feature: {
    width: "80%",
    marginTop: 20,
    display: "flex",
    flexDirection: "row",
    gap: 15,
    alignItems: "center",
  },
  featureTitle: {
    textAlign: "left",
    fontSize: 16,
    color: colors.text,
    fontFamily: "DefaultBold",
  },
  featureDescription: {
    textAlign: "left",
    fontSize: 14,
    color: colors.textSecondary,
    fontFamily: "Default",
  },
  featureTextContainer: {
    gap: 3,
  },
});

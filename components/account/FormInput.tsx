import { colors } from "@/constants/theme";
import { INPUT_START_ALIGN } from "@/utils/layoutDirection";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Observable } from "@legendapp/state";
import { $TextInput, $View } from "@legendapp/state/react-native";
import { ComponentProps } from "react";
import { StyleSheet, TextInputProps } from "react-native";

type Props = {
  placeholder: string;
  hasProblem: Observable<boolean>;
  value: Observable<string | undefined>;
  icon: ComponentProps<typeof Ionicons>["name"];
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address" | "number-pad";
  autoComplete?: TextInputProps["autoComplete"];
  // For e2e tests, on the text input
  testID?: string;
};

export default function FormInput({
  placeholder,
  hasProblem,
  value,
  icon,
  secureTextEntry,
  keyboardType,
  autoComplete,
  testID,
}: Props) {
  return (
    <$View
      $style={() => [
        styles.barContainer,
        hasProblem.get()
          ? {
              borderColor: "#b03737",
              borderWidth: 2,
            }
          : { border: "none" },
      ]}
    >
      <Ionicons name={icon} size={24} style={styles.searchIcon} />
      <$TextInput
        testID={testID}
        placeholder={placeholder}
        placeholderTextColor={"#727272"}
        style={styles.accountField}
        $value={value}
        keyboardType={keyboardType}
        autoComplete={autoComplete}
        secureTextEntry={secureTextEntry}
        autoCapitalize="none"
      />
    </$View>
  );
}

const styles = StyleSheet.create({
  accountField: {
    textAlign: INPUT_START_ALIGN,
    height: 60,
    paddingVertical: 0,
    textAlignVertical: "center",
    width: "80%",
    color: colors.text,
    paddingHorizontal: 15,
    fontFamily: "DefaultBold",
    fontSize: 16,
  },
  searchIcon: {
    paddingStart: 15,
    color: "#8f9092",
  },

  barContainer: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 25,
    backgroundColor: colors.surfaceRaised,
  },
});

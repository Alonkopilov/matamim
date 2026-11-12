import { MAX_FONT_SCALE, TextInput } from "@/components/ui/Text";
import { type Instruction } from "@/types/recipe";
import { contentRow, directionStyle } from "@/utils/textDirection";
import { INPUT_START_ALIGN } from "@/utils/layoutDirection";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { Observable } from "@legendapp/state";
import { Computed } from "@legendapp/state/react";
import { $Text } from "@legendapp/state/react-native";
import {
  Pressable,
  StyleSheet,
  type TextInputInstance,
  View,
} from "react-native";

type Props = {
  step$: Observable<Instruction>;
  isEditMode$: Observable<boolean>;
  instructionsRef: React.RefObject<TextInputInstance[]>;
  currentIndex: number;
  currentFocus$: Observable<string>;
  // Direction of the recipe's content, null keeps the app's
  isContentRTL: boolean | null;
};

export default function Instruction({
  step$,
  isEditMode$,
  currentFocus$,
  instructionsRef,
  currentIndex,
  isContentRTL,
}: Props) {
  const onDelete = () => {
    instructionsRef.current.splice(currentIndex, 1);
    step$.delete();
  };

  // if (!instructionsRef.current[currentIndex]) {
  //   instructionsRef.current[currentIndex] = null;
  // }

  return (
    <View style={[styles.stepContainer, contentRow(isContentRTL)]}>
      <View style={styles.stepNumber}>
        <$Text
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={styles.stepNumberText}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {currentIndex + 1}
        </$Text>
      </View>
      <Computed>
        {() =>
          isEditMode$.get() ? (
            <View style={styles.editStepContainer}>
              <TextInput
                ref={(el) => {
                  if (el) {
                    instructionsRef.current[currentIndex] = el;
                  }
                }}
                testID={`step-${currentIndex}`}
                onFocus={() => currentFocus$.set(`instruction|${currentIndex}`)}
                style={[styles.stepText, styles.editStep]}
                value={step$.text.get()}
                onChangeText={step$.text.set}
                multiline={true}
              />
              <Pressable onPress={onDelete}>
                <View style={styles.delete}>
                  <FontAwesome6 name="xmark" size={12} color="black" />
                </View>
              </Pressable>
            </View>
          ) : (
            <$Text
              maxFontSizeMultiplier={MAX_FONT_SCALE}
              style={[
                styles.stepText,
                // Fills the row, so short steps line up with long ones
                { flex: 1 },
                directionStyle(isContentRTL),
              ]}
            >
              {step$.text.get()}
            </$Text>
          )
        }
      </Computed>
    </View>
  );
}

const styles = StyleSheet.create({
  stepContainer: {
    display: "flex",
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  editStepContainer: {
    display: "flex",
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-start",
    alignItems: "center",
    width: "100%",
  },
  delete: {
    height: 20,
    width: 20,
    borderRadius: 100,
    backgroundColor: "#a32121",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  editStep: {
    borderWidth: 1,
    padding: 5,
    borderRadius: 10,
    borderColor: "#333",
    textAlign: INPUT_START_ALIGN,
    width: "100%",
    height: 50,
  },
  stepNumber: {
    width: 15,
    height: 50,
    backgroundColor: "#7e6616",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 100,
  },
  stepNumberText: {
    fontSize: 18,
    fontFamily: "DefaultBold",
    color: "#fff",
    textAlign: "left",
  },
  stepText: {
    fontSize: 14,
    fontFamily: "DefaultBold",
    color: "#fff",
    textAlign: "left",
  },
});

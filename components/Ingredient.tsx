import { IngredientRowRefs, type Ingredient } from "@/types/recipe";
import { contentRow, directionStyle } from "@/utils/textDirection";
import { INPUT_START_ALIGN } from "@/utils/layoutDirection";
import { colors } from "@/constants/theme";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { Observable } from "@legendapp/state";
import { Computed } from "@legendapp/state/react";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

type Props = {
  currentIndex: number;
  currentFocus$: Observable<string>;
  ingredientRefs: React.RefObject<IngredientRowRefs[]>;
  ingredient$: Observable<Ingredient>;
  isEditMode$: Observable<boolean>;
  // Direction of the recipe's content, null keeps the app's
  isContentRTL: boolean | null;
  // Ticked off while cooking, outside edit mode
  checked$: Observable<boolean | undefined>;
};

export default function Ingredient({
  currentIndex,
  currentFocus$,
  ingredientRefs,
  ingredient$,
  isEditMode$,
  isContentRTL,
  checked$,
}: Props) {
  const { t } = useTranslation();
  const onDelete = () => {
    ingredientRefs.current.splice(currentIndex, 1);
    ingredient$.delete();
  };

  // Kept in the parent so the next input can be focused on submit
  const setInputRef =
    (field: keyof IngredientRowRefs) => (el: TextInput | null) => {
      const rows = ingredientRefs.current;
      rows[currentIndex] ??= { amount: null, unit: null, item: null };
      rows[currentIndex][field] = el;
    };

  const onToggle = () => {
    if (isEditMode$.peek()) return;
    Haptics.selectionAsync();
    checked$.set(!checked$.peek());
  };

  return (
    <Pressable
      onPress={onToggle}
      style={[styles.ingredientContainer, contentRow(isContentRTL)]}
    >
      <Computed>
        {() =>
          isEditMode$.get() ? (
            <View style={styles.dot} />
          ) : (
            <View
              accessibilityRole="checkbox"
              accessibilityState={{ checked: !!checked$.get() }}
              style={styles.check}
            >
              {/* Always mounted and only faded in, Android drops the border
                  radius of a background added after mount */}
              <View
                style={[styles.checkFill, { opacity: checked$.get() ? 1 : 0 }]}
              >
                <FontAwesome6 name="check" size={11} color={colors.onAccent} />
              </View>
            </View>
          )
        }
      </Computed>
      <Computed>
        {() =>
          isEditMode$.get() ? (
            <View style={{ display: "flex", flexDirection: "row", gap: 10 }}>
              <TextInput
                ref={setInputRef("amount")}
                testID={`ingredient-${currentIndex}-amount`}
                onFocus={() =>
                  currentFocus$.set(`ingredient|amount|${currentIndex}`)
                }
                style={[styles.ingredient, styles.editAmount]}
                placeholder={t("recipe.ingredients.amountPlaceholder")}
                keyboardType="numeric"
                value={ingredient$.amount.get()}
                onChangeText={ingredient$.amount.set}
                placeholderTextColor={"#8c8c8c"}
              />
              <TextInput
                ref={setInputRef("unit")}
                testID={`ingredient-${currentIndex}-unit`}
                onFocus={() =>
                  currentFocus$.set(`ingredient|unit|${currentIndex}`)
                }
                style={[styles.ingredient, styles.editUnit]}
                placeholder={t("recipe.ingredients.unitPlaceholder")}
                value={ingredient$.unit.get()}
                onChangeText={ingredient$.unit.set}
                placeholderTextColor={"#8c8c8c"}
              />
              <TextInput
                ref={setInputRef("item")}
                testID={`ingredient-${currentIndex}-item`}
                onFocus={() =>
                  currentFocus$.set(`ingredient|item|${currentIndex}`)
                }
                style={[styles.ingredient, styles.editItem]}
                placeholder={t("recipe.ingredients.itemPlaceholder")}
                value={ingredient$.item.get()}
                onChangeText={ingredient$.item.set}
                placeholderTextColor={"#8c8c8c"}
              />
              <Pressable onPress={onDelete}>
                <View style={styles.delete}>
                  <FontAwesome6 name="xmark" size={12} color="black" />
                </View>
              </Pressable>
            </View>
          ) : (
            <Text
              style={[
                styles.ingredient,
                { flex: 1 },
                directionStyle(isContentRTL),
                checked$.get() && styles.checked,
              ]}
            >
              {ingredient$.amount.get()}{" "}
              <Text style={styles.ingredient}>{ingredient$.unit.get()}</Text>{" "}
              <Text style={[styles.ingredient, { color: "#909090" }]}>
                {ingredient$.item.get()}
              </Text>
            </Text>
          )
        }
      </Computed>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ingredient: {
    fontSize: 16,
    color: "#fff",
    textAlign: "left",
    fontFamily: "DefaultBold",
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
  editAmount: {
    borderWidth: 1,
    width: 60,
    padding: 2,
    paddingStart: 10,
    paddingEnd: 10,
    borderRadius: 20,
    borderColor: "#333",
    textAlign: INPUT_START_ALIGN,
  },
  editUnit: {
    borderWidth: 1,
    width: 70,
    padding: 2,
    paddingStart: 10,
    paddingEnd: 10,
    borderRadius: 20,
    borderColor: "#333",
    textAlign: INPUT_START_ALIGN,
  },
  editItem: {
    borderWidth: 1,
    width: 130,
    padding: 2,
    paddingStart: 10,
    paddingEnd: 10,
    borderRadius: 20,
    borderColor: "#333",
    textAlign: INPUT_START_ALIGN,
    minWidth: 100,
  },
  ingredientContainer: {
    // Spans the list, so content in the other direction can start at its end
    alignSelf: "stretch",
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
  },
  check: {
    height: 22,
    width: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#7e6616",
    overflow: "hidden",
  },
  checkFill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  checked: {
    textDecorationLine: "line-through",
    opacity: 0.45,
  },
  dot: {
    height: 10,
    width: 10,
    borderRadius: 100,
    backgroundColor: "#7e6616",
  },
});

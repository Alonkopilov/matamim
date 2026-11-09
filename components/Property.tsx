import { colors } from "@/constants/theme";
import PressableScale from "@/components/ui/PressableScale";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { Observable } from "@legendapp/state";
import { Computed, useSelector } from "@legendapp/state/react";
import { $Text } from "@legendapp/state/react-native";
import { ComponentProps, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Keyboard,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  View,
} from "react-native";

// "wheel" scrolls through numbers, "options" shows a short list of choices
export type PropertyPicker =
  | { type: "wheel"; values: number[]; defaultValue: number }
  | { type: "options"; options: { value: string; label: string }[] };

type Props = {
  name: string;
  value: Observable<string | undefined>;
  icon: ComponentProps<typeof FontAwesome6>["name"];
  isEditMode: Observable<boolean>;
  editModePlaceholder?: string;
  picker: PropertyPicker;
  // Turns the saved value into the text shown, e.g. a key into its label
  formatValue?: (value: string | undefined) => string;
  // For e2e tests, on the button that opens the picker, and with "-value" on
  // the value shown outside edit mode
  testID?: string;
};

export default function Property({
  name,
  value,
  icon,
  isEditMode,
  editModePlaceholder,
  picker,
  formatValue = (value) => value ?? "",
  testID,
}: Props) {
  const { t } = useTranslation();
  const [isPickerOpen, setPickerOpen] = useState(false);
  // The edit button is taller than the plain value, so the card grows with it
  const isEditing = useSelector(isEditMode);

  const openPicker = () => {
    // The pickers aren't text inputs, so drop the keyboard and its next bar
    Keyboard.dismiss();
    setPickerOpen(true);
  };

  const onSelect = (selected: string) => {
    value.set(selected);
    setPickerOpen(false);
  };

  return (
    <View style={[styles.propertyBg, { height: isEditing ? 150 : 140 }]}>
      <View style={styles.propertyIconBg}>
        <FontAwesome6 name={icon} size={24} color="white" />
      </View>
      <Computed>
        {() =>
          isEditMode.get() ? (
            <Pressable
              testID={testID}
              onPress={openPicker}
              hitSlop={10}
              style={[styles.editProperty, styles.editPropertyButton]}
            >
              <Text
                style={[
                  styles.propertyValue,
                  !value.get() && styles.placeholder,
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {formatValue(value.get()) ||
                  editModePlaceholder ||
                  t("recipe.properties.placeholder")}
              </Text>
            </Pressable>
          ) : (
            <$Text
              testID={testID && `${testID}-value`}
              style={[styles.propertyValue, styles.viewPropertyValue]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {formatValue(value.get())}
            </$Text>
          )
        }
      </Computed>

      <Text style={styles.propertyName}>{name}</Text>

      <Modal
        visible={isPickerOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setPickerOpen(false)}>
          {/* Swallows taps so pressing the card doesn't close it */}
          <Pressable style={styles.modalContainer}>
            <Text style={styles.modalTitle}>{name}</Text>
            {picker.type === "wheel" ? (
              <NumberWheel
                values={picker.values}
                initialValue={value.peek()}
                defaultValue={picker.defaultValue}
                onConfirm={(selected) => onSelect(String(selected))}
              />
            ) : (
              <View style={styles.options}>
                {picker.options.map((option) => {
                  const isSelected = option.value === value.peek();
                  return (
                    <PressableScale
                      key={option.value}
                      onPress={() => onSelect(option.value)}
                      style={[
                        styles.option,
                        isSelected && styles.optionSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.optionText,
                          isSelected && styles.optionTextSelected,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </PressableScale>
                  );
                })}
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const WHEEL_ITEM_HEIGHT = 44;
const WHEEL_VISIBLE_ITEMS = 5;
const WHEEL_PADDING = WHEEL_ITEM_HEIGHT * Math.floor(WHEEL_VISIBLE_ITEMS / 2);

type NumberWheelProps = {
  values: number[];
  initialValue: string | undefined;
  defaultValue: number;
  onConfirm: (value: number) => void;
};

function NumberWheel({
  values,
  initialValue,
  defaultValue,
  onConfirm,
}: NumberWheelProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const [index, setIndex] = useState(() =>
    closestIndex(values, Number.parseInt(initialValue ?? "", 10), defaultValue),
  );

  const indexFromEvent = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const raw = Math.round(
      event.nativeEvent.contentOffset.y / WHEEL_ITEM_HEIGHT,
    );
    return Math.min(values.length - 1, Math.max(0, raw));
  };

  return (
    <>
      <View style={styles.wheel}>
        <View pointerEvents="none" style={styles.wheelHighlight} />
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          snapToInterval={WHEEL_ITEM_HEIGHT}
          decelerationRate="fast"
          scrollEventThrottle={16}
          nestedScrollEnabled
          contentContainerStyle={{ paddingVertical: WHEEL_PADDING }}
          onLayout={() =>
            scrollRef.current?.scrollTo({
              y: index * WHEEL_ITEM_HEIGHT,
              animated: false,
            })
          }
          onScroll={(event) => setIndex(indexFromEvent(event))}
          onMomentumScrollEnd={(event) => setIndex(indexFromEvent(event))}
        >
          {values.map((item, i) => (
            <Pressable
              key={item}
              style={styles.wheelItem}
              onPress={() =>
                scrollRef.current?.scrollTo({ y: i * WHEEL_ITEM_HEIGHT })
              }
            >
              <Text
                style={[
                  styles.wheelItemText,
                  i === index && styles.wheelItemTextSelected,
                ]}
              >
                {item}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <PressableScale
        onPress={() => onConfirm(values[index])}
        style={styles.confirmButton}
      >
        <Text style={styles.confirmButtonText}>{t("common.confirm")}</Text>
      </PressableScale>
    </>
  );
}

// Old recipes may hold values that aren't on the wheel, start from the nearest
function closestIndex(values: number[], target: number, fallback: number) {
  const goal = Number.isNaN(target) ? fallback : target;
  let best = 0;
  values.forEach((value, i) => {
    if (Math.abs(value - goal) < Math.abs(values[best] - goal)) best = i;
  });
  return best;
}

const styles = StyleSheet.create({
  propertyBg: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 5,
    width: 80,
    borderRadius: 50,
    backgroundColor: "#5f6065",
  },
  propertyIconBg: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#232428",
    marginTop: 5,
    height: 65,
    width: 65,
    borderRadius: 100,
  },
  propertyName: {
    fontSize: 13,
    color: "#fff",
    fontFamily: "Default",
    textAlign: "center",
  },
  propertyValue: {
    fontSize: 18,
    fontFamily: "DefaultBold",
    color: "#fff",
    textAlign: "center",
  },
  // A long value like "Breakfast" shrinks to fit, and would reach the card's
  // rounded edges without room on the sides
  viewPropertyValue: {
    paddingVertical: 0,
    paddingHorizontal: 8,
  },
  placeholder: {
    color: "#8c8c8c",
  },
  editProperty: {
    padding: 5,
    borderWidth: 1,
    borderRadius: 20,
    borderColor: "#333",
    textAlign: "center",
  },
  editPropertyButton: {
    width: 70,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContainer: {
    width: "80%",
    backgroundColor: "#1f2023",
    borderRadius: 30,
    padding: 20,
    gap: 15,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: "DefaultBold",
    color: "#fff",
    textAlign: "center",
  },
  options: {
    gap: 10,
  },
  option: {
    paddingVertical: 12,
    borderRadius: 100,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
  },
  optionSelected: {
    backgroundColor: colors.accent,
  },
  optionText: {
    fontSize: 16,
    fontFamily: "DefaultBold",
    color: "#eeeeee",
  },
  optionTextSelected: {
    color: "black",
  },
  wheel: {
    height: WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_ITEMS,
    overflow: "hidden",
  },
  wheelHighlight: {
    position: "absolute",
    top: WHEEL_PADDING,
    left: 0,
    right: 0,
    height: WHEEL_ITEM_HEIGHT,
    borderRadius: 100,
    backgroundColor: colors.surfaceRaised,
  },
  wheelItem: {
    height: WHEEL_ITEM_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
  },
  wheelItemText: {
    fontSize: 18,
    fontFamily: "Default",
    color: "#6b6c70",
  },
  wheelItemTextSelected: {
    fontSize: 22,
    fontFamily: "DefaultBold",
    color: "#fff",
  },
  confirmButton: {
    paddingVertical: 10,
    borderRadius: 100,
    backgroundColor: colors.accent,
    alignItems: "center",
  },
  confirmButtonText: {
    fontSize: 16,
    fontFamily: "Default",
    color: "black",
  },
});

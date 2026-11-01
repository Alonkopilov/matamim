import Button from "@/components/ui/Button";
import Sheet, { type SheetHandle, sheetStyles } from "@/components/ui/Sheet";
import { spacing } from "@/constants/theme";
import { AlertButton, alerts$, dismissAlert } from "@/stores/alertStore";
import { observer } from "@legendapp/state/react";
import { useRef } from "react";
import { StyleSheet, Text, View } from "react-native";

const VARIANTS = {
  default: "primary",
  cancel: "secondary",
  destructive: "destructive",
} as const;

// App-styled replacement for Alert.alert, shown as a bottom sheet
export const AlertModal = observer(() => {
  const alert = alerts$[0].get();
  if (!alert) return null;

  // A sheet per alert, so the next one waits for this one to slide away
  return <AlertSheet key={alert.id} {...alert} />;
});

type AlertSheetProps = {
  title: string;
  message?: string;
  buttons: AlertButton[];
};

function AlertSheet({ title, message, buttons }: AlertSheetProps) {
  const sheet = useRef<SheetHandle>(null);
  const pressed = useRef<AlertButton | null>(null);

  // Swiping it away acts like the cancel button, if there is one
  const cancel =
    buttons.find((button) => button.style === "cancel") ??
    (buttons.length === 1 ? buttons[0] : undefined);

  const handlePress = (button: AlertButton) => {
    pressed.current = button;
    sheet.current?.dismiss();
  };

  // Runs once the sheet is gone, so a follow-up alert doesn't overlap it
  const handleClose = () => {
    dismissAlert();
    (pressed.current ?? cancel)?.onPress?.();
  };

  const isRow = buttons.length <= 2;

  return (
    <Sheet
      ref={sheet}
      visible
      onClose={handleClose}
      dismissible={cancel !== undefined}
    >
      <Text style={sheetStyles.title}>{title}</Text>
      {!!message && <Text style={sheetStyles.description}>{message}</Text>}

      <View style={[sheetStyles.buttons, !isRow && styles.column]}>
        {buttons.map((button, index) => (
          <Button
            key={index}
            title={button.text}
            variant={VARIANTS[button.style ?? "default"]}
            onPress={() => handlePress(button)}
            style={isRow && styles.rowButton}
            testID={`alert-${button.style ?? "default"}`}
          />
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  column: {
    flexDirection: "column",
    gap: spacing.sm,
  },
  rowButton: {
    flex: 1,
  },
});

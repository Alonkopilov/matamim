import i18n from "@/i18n";
import { observable } from "@legendapp/state";

export interface AlertButton {
  text: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
}

interface AlertItem {
  // Tells apart two alerts with the same text, so each gets its own sheet
  id: number;
  title: string;
  message?: string;
  buttons: AlertButton[];
}

// Alerts raised while one is open wait their turn instead of replacing it
export const alerts$ = observable<AlertItem[]>([]);
let nextAlertId = 0;

/**
 * Same arguments as React Native's Alert.alert, rendered by AlertModal in the
 * app's style.
 */
export const showAlert = (
  title: string,
  message?: string,
  buttons: AlertButton[] = [{ text: i18n.t("common.gotIt"), style: "cancel" }],
) => {
  alerts$.push({ id: nextAlertId++, title, message, buttons });
};

export const dismissAlert = () => {
  alerts$.set((current) => current.slice(1));
};

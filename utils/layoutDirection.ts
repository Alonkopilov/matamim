import { FlexStyle, I18nManager, TextStyle } from "react-native";

// The layout mirrors between Hebrew and English: rows, "left"/"right" styles
// and text alignment all follow the direction. These are for the few places
// that don't mirror on their own, or that shouldn't.

// A TextInput's textAlign is a side of the screen, unlike Text's
export const INPUT_START_ALIGN: TextStyle["textAlign"] = I18nManager.isRTL
  ? "right"
  : "left";

// Buttons like the toolbar icons stay where the (right to left) design puts
// them, whatever the language, so they don't jump sides on a language switch.

// Lays children out from right to left in both directions
export const RIGHT_TO_LEFT_ROW: FlexStyle["flexDirection"] = I18nManager.isRTL
  ? "row"
  : "row-reverse";

// RTL swaps "left" and "right", these always mean the side of the screen
export const onScreenLeft = (offset: number): FlexStyle =>
  I18nManager.isRTL ? { right: offset } : { left: offset };

export const onScreenRight = (offset: number): FlexStyle =>
  I18nManager.isRTL ? { left: offset } : { right: offset };

// alignSelf for the screen's left edge of a column
export const SCREEN_LEFT_SELF: FlexStyle["alignSelf"] = I18nManager.isRTL
  ? "flex-end"
  : "flex-start";

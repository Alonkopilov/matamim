import { FlexStyle, I18nManager, TextStyle } from "react-native";

// Letters that have a direction. The first one decides a text's direction,
// the way the platforms pick the direction of a paragraph.
const STRONG_CHAR =
  /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u0590-\u05FF\u0600-\u06FF]/;
const STRONG_CHARS = new RegExp(STRONG_CHAR.source, "g");
const RTL_CHAR = /[\u0590-\u05FF\u0600-\u06FF]/;

export const isRTLText = (text: string | undefined) => {
  const first = text?.match(STRONG_CHAR)?.[0];
  return first !== undefined && RTL_CHAR.test(first);
};

/**
 * Whether most of the letters across these texts are right to left. Decides
 * one direction for a whole list, so a step that happens to start with an
 * English word doesn't flip on its own. Null when there are no letters.
 */
export const isMostlyRTL = (texts: (string | undefined)[]) => {
  let rtl = 0;
  let total = 0;
  for (const char of texts.join(" ").match(STRONG_CHARS) ?? []) {
    total++;
    if (RTL_CHAR.test(char)) rtl++;
  }
  return total === 0 ? null : rtl > total / 2;
};

/** Aligns user content written right to left (or not) to its own start */
export const directionStyle = (isRTL: boolean | null): TextStyle => {
  if (isRTL === null) return {};
  return {
    // "left" and "right" are the start and end of the app's layout direction
    textAlign: isRTL === I18nManager.isRTL ? "left" : "right",
    writingDirection: isRTL ? "rtl" : "ltr",
  };
};

/**
 * Aligns user content to its own language, so a Hebrew recipe in the English
 * app starts on the right and vice versa. Text with no letters keeps the
 * app's direction.
 */
export const contentDirection = (text: string | undefined): TextStyle =>
  directionStyle(text && STRONG_CHAR.test(text) ? isRTLText(text) : null);

/** Moves a narrower block to the side content in that direction starts on */
export const contentStartSelf = (isRTL: boolean | null): FlexStyle =>
  isRTL === null || isRTL === I18nManager.isRTL
    ? {}
    : { alignSelf: "flex-end" };

/** A row that starts on the side content in that direction starts on */
export const contentRow = (isRTL: boolean | null): FlexStyle => ({
  flexDirection:
    isRTL === null || isRTL === I18nManager.isRTL ? "row" : "row-reverse",
});

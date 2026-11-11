import { type ComponentPropsWithRef } from "react";
import {
  // eslint-disable-next-line no-restricted-imports -- the one place that wraps them
  Text as RNText,
  // eslint-disable-next-line no-restricted-imports -- the one place that wraps them
  TextInput as RNTextInput,
} from "react-native";

// How far the phone's font size setting can grow the app's text. Some phones
// ship with it high, and past this the layouts break.
// Text the wrappers below don't cover ($Text, BottomSheetTextInput,
// Animated.Text) takes it as a prop, eslint checks for it.
export const MAX_FONT_SCALE = 1.2;

// Use these instead of react-native's, eslint enforces it
export function Text(props: ComponentPropsWithRef<typeof RNText>) {
  return <RNText maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} />;
}

export function TextInput(props: ComponentPropsWithRef<typeof RNTextInput>) {
  return <RNTextInput maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} />;
}

import { colors, fonts, radius, spacing } from "@/constants/theme";
import { INPUT_START_ALIGN } from "@/utils/layoutDirection";
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import {
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { BackHandler, Keyboard, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type SheetHandle = {
  // Slides the sheet away, then calls onClose
  dismiss: () => void;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  // False blocks swiping, the backdrop and Android back, e.g. mid-request
  dismissible?: boolean;
  children: ReactNode;
  ref?: Ref<SheetHandle>;
};

// The app's bottom sheet, replaces centered modals. Callers that unmount it
// on close should close through the ref, so it can animate out first.
export default function Sheet({
  visible,
  onClose,
  dismissible = true,
  children,
  ref,
}: Props) {
  const modal = useRef<BottomSheetModal>(null);
  const insets = useSafeAreaInsets();
  // onDismiss also fires when the parent hides it, which mustn't close twice
  const isOpen = useRef(false);

  useImperativeHandle(ref, () => ({
    dismiss: () => {
      // A focused input would keep the keyboard up after the sheet is gone
      Keyboard.dismiss();
      modal.current?.dismiss();
    },
  }));

  useEffect(() => {
    if (visible) {
      isOpen.current = true;
      modal.current?.present();
    } else if (isOpen.current) {
      // Dismissing one that never opened stops it from presenting later
      isOpen.current = false;
      modal.current?.dismiss();
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (dismissible) modal.current?.dismiss();
        return true;
      },
    );
    return () => subscription.remove();
  }, [visible, dismissible]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.6}
        pressBehavior={dismissible ? "close" : "none"}
      />
    ),
    [dismissible],
  );

  return (
    <BottomSheetModal
      ref={modal}
      onDismiss={() => {
        Keyboard.dismiss();
        if (!isOpen.current) return;
        isOpen.current = false;
        onClose();
      }}
      enableDynamicSizing
      enablePanDownToClose={dismissible}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handle}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      // With edge-to-edge, "adjustResize" leaves the sheet under the keyboard
      android_keyboardInputMode="adjustPan"
    >
      <BottomSheetView
        style={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
      >
        {children}
      </BottomSheetView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  background: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  handle: {
    width: 40,
    backgroundColor: colors.border,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
});

// Shared by the sheets' contents
export const sheetStyles = StyleSheet.create({
  title: {
    fontSize: 22,
    color: colors.text,
    fontFamily: fonts.bold,
    textAlign: "left",
  },
  description: {
    marginTop: spacing.sm,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    textAlign: "left",
  },
  input: {
    marginTop: spacing.lg,
    height: 52,
    backgroundColor: colors.background,
    color: colors.text,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    fontFamily: fonts.regular,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
    textAlign: INPUT_START_ALIGN,
  },
  inputError: {
    borderColor: colors.danger,
  },
  error: {
    marginTop: spacing.sm,
    color: colors.danger,
    fontSize: 14,
    fontFamily: fonts.regular,
    textAlign: "left",
  },
  buttons: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.xl,
  },
});

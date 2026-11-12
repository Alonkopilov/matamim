import Button from "@/components/ui/Button";
import Sheet, { type SheetHandle, sheetStyles } from "@/components/ui/Sheet";
import { MAX_FONT_SCALE, Text } from "@/components/ui/Text";
import { colors } from "@/constants/theme";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";

interface UpdateModalProps {
  visible: boolean;
  title: string;
  placeholder: string;
  secureTextEntry?: boolean;
  onClose: () => void;
  onSave: (value: string) => Promise<void>;
}

export default function UpdateModal({
  visible,
  title,
  placeholder,
  secureTextEntry = false,
  onClose,
  onSave,
}: UpdateModalProps) {
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();
  const sheet = useRef<SheetHandle>(null);

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    try {
      await onSave(inputValue);
      sheet.current?.dismiss();
    } catch (err: any) {
      setError(err.message || t("errors.UNKNOWN"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet
      ref={sheet}
      visible={visible}
      onClose={onClose}
      dismissible={!loading}
    >
      <Text style={sheetStyles.title}>{title}</Text>

      <BottomSheetTextInput
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        style={[sheetStyles.input, error ? sheetStyles.inputError : null]}
        placeholder={placeholder}
        placeholderTextColor={colors.textDisabled}
        secureTextEntry={secureTextEntry}
        value={inputValue}
        onChangeText={setInputValue}
        editable={!loading}
        autoCapitalize="none"
        autoFocus
        testID="update-input"
      />

      {error && <Text style={sheetStyles.error}>{error}</Text>}

      <View style={sheetStyles.buttons}>
        <Button
          title={t("common.cancel")}
          variant="secondary"
          onPress={() => sheet.current?.dismiss()}
          disabled={loading}
          style={styles.button}
        />
        <Button
          title={t("common.save")}
          onPress={handleSave}
          loading={loading}
          style={styles.button}
          testID="update-save"
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  button: {
    flex: 1,
  },
});

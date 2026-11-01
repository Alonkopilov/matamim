import { colors } from "@/constants/theme";
import { updateMailSchema } from "@/schemas/registerSchema";
import {
  codeField,
  newPasswordSchema,
  resetPasswordSchema,
} from "@/schemas/resetPasswordSchema";
import { showToast } from "@/stores/toastStore";
import * as userManagement from "@/utils/userManagement";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Button from "@/components/ui/Button";
import Sheet, { type SheetHandle, sheetStyles } from "@/components/ui/Sheet";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInputProps,
  View,
} from "react-native";
import { ZodType } from "zod";

type Props = {
  kind: "email" | "password";
  currentEmail: string;
  onClose: () => void;
  onEmailChanged: (email: string) => void;
};

// "request" asks for the new email, "identity" for the code sent to the
// current email (and the new password), "newEmail" for the code sent there.
// An email change sends both codes at once, and the server only changes the
// email once both are entered (double_confirm_changes).
type Step = "request" | "identity" | "newEmail";

const CODE_INPUT: TextInputProps = {
  keyboardType: "number-pad",
  autoComplete: "one-time-code",
  textContentType: "oneTimeCode",
};

/** Changes the email or password only after a code sent to the user's email is entered */
export default function VerifiedChangeModal({
  kind,
  currentEmail,
  onClose,
  onEmailChanged,
}: Props) {
  const sheet = useRef<SheetHandle>(null);
  const [step, setStep] = useState<Step>("request");
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  // A code only works once, so once it's checked it isn't asked for again
  const [isVerified, setIsVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  const isEmail = kind === "email";
  const targetEmail = newEmail.trim();

  const parse = (schema: ZodType, value: unknown) => {
    const result = schema.safeParse(value);
    if (!result.success) setError(result.error.issues[0].message);
    return result.success;
  };

  const succeeded = (result: { success: boolean; error?: string }) => {
    if (!result.success) setError(result.error || t("auth.errors.unknown"));
    return result.success;
  };

  const run = async (action: () => Promise<void>) => {
    setLoading(true);
    setError(null);
    try {
      await action();
    } finally {
      setLoading(false);
    }
  };

  const goTo = (next: Step) => {
    setCode("");
    setStep(next);
  };

  const sendIdentityCode = async () => {
    if (!succeeded(await userManagement.sendVerificationCode(currentEmail))) {
      return;
    }
    goTo("identity");
    showToast(t("auth.reset.codeSent"), "success");
  };

  // Sending again replaces both codes, so the current one is asked for again
  const sendEmailChangeCodes = async () => {
    if (!succeeded(await userManagement.requestEmailChange(targetEmail))) {
      // Most likely the new address is taken, so let the user change it
      setStep("request");
      return;
    }
    setIsVerified(false);
    goTo("identity");
    showToast(t("auth.reset.codeSent"), "success");
  };

  const submitRequest = async () => {
    if (isEmail) {
      if (!parse(updateMailSchema, { email: newEmail })) return;
      if (targetEmail.toLowerCase() === currentEmail.toLowerCase()) {
        setError(t("account.updateModals.email.sameEmail"));
        return;
      }
    }
    if (isEmail) await sendEmailChangeCodes();
    else await sendIdentityCode();
  };

  const submitIdentity = async () => {
    if (isEmail) {
      if (!parse(codeField, code)) return;
      const result = await userManagement.confirmEmailChange(
        currentEmail,
        code.trim(),
      );
      if (!succeeded(result)) return;
      setIsVerified(true);
      goTo("newEmail");
      return;
    }

    const isValid = isVerified
      ? parse(newPasswordSchema, { password, confirmPassword })
      : parse(resetPasswordSchema, { code, password, confirmPassword });
    if (!isValid) return;

    if (!isVerified) {
      const result = await userManagement.verifyCode(currentEmail, code.trim());
      if (!succeeded(result)) return;
      setIsVerified(true);
    }

    if (succeeded(await userManagement.changePassword(password))) {
      sheet.current?.dismiss();
    }
  };

  const submitNewEmail = async () => {
    if (!parse(codeField, code)) return;

    const result = await userManagement.confirmEmailChange(
      targetEmail,
      code.trim(),
    );
    if (!succeeded(result)) return;
    showToast(t("account.toasts.emailChanged"), "success");
    onEmailChanged(targetEmail);
    sheet.current?.dismiss();
  };

  const SUBMIT = {
    request: submitRequest,
    identity: submitIdentity,
    newEmail: submitNewEmail,
  };

  const resend = () => run(isEmail ? sendEmailChangeCodes : sendIdentityCode);

  const DESCRIPTIONS = {
    request: isEmail
      ? t("account.updateModals.email.requestDescription", {
          email: currentEmail,
        })
      : t("account.updateModals.identityDescription", { email: currentEmail }),
    identity: isEmail
      ? t("account.updateModals.identityCodeDescription", {
          email: currentEmail,
        })
      : isVerified
        ? null
        : t("account.updateModals.password.codeDescription", {
            email: currentEmail,
          }),
    newEmail: t("account.updateModals.email.newCodeDescription", {
      email: targetEmail,
    }),
  };
  const description = DESCRIPTIONS[step];

  const input = (
    testID: string,
    value: string,
    onChangeText: (text: string) => void,
    placeholder: string,
    props?: TextInputProps,
  ) => (
    <BottomSheetTextInput
      testID={testID}
      style={[sheetStyles.input, error ? sheetStyles.inputError : null]}
      placeholder={placeholder}
      placeholderTextColor={colors.textDisabled}
      value={value}
      onChangeText={onChangeText}
      editable={!loading}
      autoCapitalize="none"
      {...props}
    />
  );

  const showsCode =
    step === "newEmail" || (step === "identity" && (isEmail || !isVerified));
  const isFinalStep = step === "newEmail" || (step === "identity" && !isEmail);

  return (
    <Sheet ref={sheet} visible onClose={onClose} dismissible={!loading}>
      <Text style={sheetStyles.title}>
        {t(`account.updateModals.${kind}.title`)}
      </Text>
      {description && (
        <Text style={sheetStyles.description}>{description}</Text>
      )}

      {step === "request" &&
        isEmail &&
        input(
          "change-email",
          newEmail,
          setNewEmail,
          t("account.updateModals.email.placeholder"),
          { keyboardType: "email-address" },
        )}

      {showsCode &&
        input("change-code", code, setCode, t("auth.reset.code"), CODE_INPUT)}

      {step === "identity" && !isEmail && (
        <>
          {input(
            "change-password",
            password,
            setPassword,
            t("account.updateModals.password.placeholder"),
            { secureTextEntry: true },
          )}
          {input(
            "change-confirmPassword",
            confirmPassword,
            setConfirmPassword,
            t("auth.form.confirmPassword"),
            { secureTextEntry: true },
          )}
        </>
      )}

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
          title={
            isFinalStep
              ? t("common.save")
              : step === "request"
                ? t("auth.reset.sendCode")
                : t("common.continue")
          }
          onPress={() => run(SUBMIT[step])}
          loading={loading}
          style={styles.button}
          testID="change-submit"
        />
      </View>

      {showsCode && (
        <Pressable onPress={resend} disabled={loading}>
          <Text style={styles.resend}>{t("auth.reset.resend")}</Text>
        </Pressable>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  button: {
    flex: 1,
  },
  resend: {
    color: colors.accent,
    fontSize: 15,
    fontFamily: "DefaultBold",
    marginTop: 16,
    textAlign: "center",
  },
});

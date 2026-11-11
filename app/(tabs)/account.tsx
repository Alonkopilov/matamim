import { useBottomTabBarHeight } from "expo-router/js-tabs";
import { Text } from "@/components/ui/Text";
import { colors } from "@/constants/theme";
import ConnectedView from "@/components/account/ConnectedAccount";
import FormInput from "@/components/account/FormInput";
import { loginSchema } from "@/schemas/loginSchema";
import { registerSchema } from "@/schemas/registerSchema";
import {
  confirmSignUpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "@/schemas/resetPasswordSchema";
import { auth$ } from "@/stores/authStore";
import { settings$ } from "@/stores/settingsStore";
import { showToast } from "@/stores/toastStore";
import {
  Account,
  AccountMode,
  AccountValidity,
  EMPTY_ACCOUNT,
  PERFECT_ACCOUNT,
} from "@/types/account";
import * as userManagement from "@/utils/userManagement";
import { observer, useObservable } from "@legendapp/state/react";
import { User } from "@supabase/supabase-js";
import { useEffect } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

export default observer(function AccountScreen() {
  const tabBarHeight = useBottomTabBarHeight();
  const ui$ = useObservable({
    mode: "login" as AccountMode,
    account: EMPTY_ACCOUNT() as Account,
    problemFields: PERFECT_ACCOUNT() as AccountValidity,
    problems: "",
    isLoading: false,
  });
  const { t } = useTranslation();

  useEffect(() => {
    if (Object.keys(auth$.session).length > 0) {
      ui$.mode.set("connected");
      // The connected view shows the name from the profile store
      ui$.account.set({
        fullName: "",
        email: auth$.session.user.email.get() || "",
        password: "",
        confirmPassword: "",
      });
    }
  }, []);

  const clearProblems = () => {
    ui$.problems.set("");
    ui$.problemFields.set(PERFECT_ACCOUNT());
  };

  const switchMode = (mode: AccountMode) => {
    // The email carries over, so it doesn't have to be typed again
    const email = ui$.account.email.peek();
    ui$.account.set({ ...EMPTY_ACCOUNT(), email });
    clearProblems();
    ui$.mode.set(mode);
  };

  const toggleMode = () =>
    switchMode(ui$.mode.peek() === "register" ? "login" : "register");

  const SCHEMAS = {
    login: loginSchema,
    register: registerSchema,
    confirm: confirmSignUpSchema,
    forgot: forgotPasswordSchema,
    reset: resetPasswordSchema,
  };

  const checkFormInput = () => {
    const mode = ui$.mode.peek();
    if (mode === "connected") return false;
    const result = SCHEMAS[mode].safeParse(ui$.account.peek());

    clearProblems();

    if (!result.success) {
      const formattedErrors: Partial<Record<keyof Account, string>> = {};

      result.error.issues.forEach((issue) => {
        const field = issue.path[0] as keyof Account;
        if (!formattedErrors[field]) {
          formattedErrors[field] = issue.message;
          ui$.problemFields[field].set(true);
        }
      });

      ui$.problems.set(
        Object.values(formattedErrors).filter(Boolean).join("\n"),
      );
      return false;
    }
    return true;
  };

  const finishLogin = async (user: User | undefined) => {
    ui$.account.set({
      ...EMPTY_ACCOUNT(),
      email: user?.email || "",
    });
    // The team loads on its own once the session changes, and the team toggle
    // follows it (settingsStore)
    ui$.mode.set("connected");
  };

  const sendResetCode = async () => {
    const email = ui$.account.email.peek()?.trim();
    if (!email) return;

    ui$.isLoading.set(true);
    try {
      const result = await userManagement.requestPasswordReset(email);
      if (result.success) {
        showToast(t("auth.reset.codeSent"), "success");
        if (ui$.mode.peek() === "forgot") switchMode("reset");
      } else {
        ui$.problems.set(result.error || t("auth.errors.unknown"));
      }
    } finally {
      ui$.isLoading.set(false);
    }
  };

  const submitNewPassword = async () => {
    const { email, code, password } = ui$.account.peek();
    if (!email || !code || !password) return;

    ui$.isLoading.set(true);
    try {
      const result = await userManagement.resetPassword(
        email.trim(),
        code.trim(),
        password,
      );
      if (result.success) await finishLogin(result.user);
      else ui$.problems.set(result.error || t("auth.errors.unknown"));
    } finally {
      ui$.isLoading.set(false);
    }
  };

  const sendSignUpCode = async () => {
    const email = ui$.account.email.peek()?.trim();
    if (!email) return;

    ui$.isLoading.set(true);
    try {
      const result = await userManagement.resendSignUpCode(email);
      if (result.success) showToast(t("auth.confirm.codeSent"), "success");
      else ui$.problems.set(result.error || t("auth.errors.unknown"));
    } finally {
      ui$.isLoading.set(false);
    }
  };

  const submitSignUpCode = async () => {
    const { email, code } = ui$.account.peek();
    if (!email || !code) return;

    ui$.isLoading.set(true);
    try {
      const result = await userManagement.confirmSignUp(
        email.trim(),
        code.trim(),
      );
      if (result.success) await finishLogin(result.user);
      else {
        ui$.problems.set(result.error || t("auth.errors.unknown"));
        ui$.problemFields.code.set(true);
      }
    } finally {
      ui$.isLoading.set(false);
    }
  };

  const handleSubmit = async () => {
    const mode = ui$.mode.peek();
    const isRegister = mode === "register";
    const account = ui$.account.peek();

    if (!checkFormInput()) return;
    if (mode === "forgot") return sendResetCode();
    if (mode === "reset") return submitNewPassword();
    if (mode === "confirm") return submitSignUpCode();
    // Validation ignores surrounding spaces, Auth doesn't, and keyboards often
    // add one after a suggested email
    const email = account.email?.trim();
    const fullName = account.fullName?.trim();
    if (!email || !account.password) return;
    if (isRegister && !fullName) return;

    ui$.isLoading.set(true);
    try {
      if (isRegister && fullName) {
        settings$.isSyncingToCloud.set(false);
        const result = await userManagement.registerUser(
          email,
          account.password,
          fullName,
        );
        if (result.success) switchMode("confirm");
        else ui$.problems.set(result.error || t("auth.errors.registerFailed"));
      } else {
        const result = await userManagement.loginUser(email, account.password);
        if (result.success) {
          await finishLogin(result.user);
        } else if (result.isUnconfirmed) {
          // Signed up but never entered the code, so send a new one
          switchMode("confirm");
          await sendSignUpCode();
        } else {
          ui$.problems.set(result.error || t("auth.errors.loginFailed"));
        }
      }
    } finally {
      ui$.isLoading.set(false);
    }
  };

  if (auth$.isLoading.get() || ui$.isLoading.get()) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" color={colors.text} />
      </View>
    );
  }

  const mode = ui$.mode.get();
  if (mode === "connected") {
    return <ConnectedView account={ui$.account} mode={ui$.mode} />;
  }

  const isPasswordReset = mode === "forgot" || mode === "reset";
  const SUBMIT_LABELS = {
    login: t("auth.form.login"),
    register: t("auth.form.register"),
    confirm: t("auth.confirm.submit"),
    forgot: t("auth.reset.sendCode"),
    reset: t("auth.reset.submit"),
  };

  return (
    <ScrollView
      style={{ flexGrow: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: tabBarHeight }}
    >
      <Pressable
        style={[styles.container, { paddingTop: TOP_PADDING[mode] }]}
        onPress={Keyboard.dismiss}
        accessible={false}
      >
        {isPasswordReset ? (
          <>
            <Text style={styles.title}>{t("auth.reset.title")}</Text>
            <Text style={styles.description}>
              {mode === "forgot"
                ? t("auth.reset.description")
                : t("auth.reset.codeDescription", {
                    email: ui$.account.email.get()?.trim(),
                  })}
            </Text>
          </>
        ) : mode === "confirm" ? (
          <>
            <Text style={styles.title}>{t("auth.confirm.title")}</Text>
            <Text style={styles.description}>
              {t("auth.confirm.description", {
                email: ui$.account.email.get()?.trim(),
              })}
            </Text>
          </>
        ) : (
          <Text style={styles.title}>
            <Trans
              i18nKey="auth.form.title"
              components={{ highlight: <Text style={styles.highlight} /> }}
            />
          </Text>
        )}
        <View style={styles.fields}>
          {mode === "register" && (
            <FormInput
              testID="account-fullName"
              placeholder={t("auth.form.fullName")}
              hasProblem={ui$.problemFields.fullName}
              value={ui$.account.fullName}
              icon="person"
            />
          )}
          {mode !== "reset" && mode !== "confirm" && (
            <FormInput
              testID="account-email"
              placeholder={t("auth.form.email")}
              hasProblem={ui$.problemFields.email}
              value={ui$.account.email}
              icon="mail"
              keyboardType="email-address"
            />
          )}
          {(mode === "reset" || mode === "confirm") && (
            <FormInput
              placeholder={
                mode === "confirm"
                  ? t("auth.confirm.code")
                  : t("auth.reset.code")
              }
              testID="account-code"
              hasProblem={ui$.problemFields.code}
              value={ui$.account.code}
              icon="keypad"
              keyboardType="number-pad"
              autoComplete="one-time-code"
            />
          )}
          {mode !== "forgot" && mode !== "confirm" && (
            <FormInput
              placeholder={
                mode === "login"
                  ? t("auth.form.password")
                  : mode === "reset"
                    ? t("auth.reset.newPassword")
                    : t("auth.form.createPassword")
              }
              testID="account-password"
              hasProblem={ui$.problemFields.password}
              value={ui$.account.password}
              icon="lock-closed"
              secureTextEntry={true}
            />
          )}
          {(mode === "register" || mode === "reset") && (
            <FormInput
              placeholder={t("auth.form.confirmPassword")}
              testID="account-confirmPassword"
              hasProblem={ui$.problemFields.confirmPassword}
              value={ui$.account.confirmPassword}
              icon="lock-closed"
              secureTextEntry={true}
            />
          )}
        </View>
        {ui$.problems.get() && (
          <View style={styles.invalidContainer}>
            <Text style={styles.invalidText}>{ui$.problems.get()}</Text>
          </View>
        )}
        <Pressable
          testID="account-submit"
          style={styles.signup}
          onPress={handleSubmit}
        >
          {ui$.isLoading.get() ? (
            <ActivityIndicator size="small" color="black" />
          ) : (
            <Text style={styles.text}>{SUBMIT_LABELS[mode]}</Text>
          )}
        </Pressable>
        {mode === "login" && (
          <Pressable onPress={() => switchMode("forgot")}>
            <Text style={styles.forgotPassword}>
              {t("auth.form.forgotPassword")}
            </Text>
          </Pressable>
        )}
        {mode === "confirm" ? (
          <View style={[styles.hasAccountContainer, { gap: 25 }]}>
            <Pressable onPress={sendSignUpCode}>
              <Text style={styles.hasAccountHighlight}>
                {t("auth.confirm.resend")}
              </Text>
            </Pressable>
            <Pressable onPress={() => switchMode("register")}>
              <Text style={styles.hasAccountHighlight}>
                {t("auth.confirm.backToRegister")}
              </Text>
            </Pressable>
          </View>
        ) : isPasswordReset ? (
          <View style={[styles.hasAccountContainer, { gap: 25 }]}>
            {mode === "reset" && (
              <Pressable onPress={sendResetCode}>
                <Text style={styles.hasAccountHighlight}>
                  {t("auth.reset.resend")}
                </Text>
              </Pressable>
            )}
            <Pressable onPress={() => switchMode("login")}>
              <Text style={styles.hasAccountHighlight}>
                {t("auth.reset.backToLogin")}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.hasAccountContainer}>
            <Text style={styles.hasaccount}>
              {ui$.mode.get() === "register"
                ? t("auth.form.hasAccount")
                : t("auth.form.noAccount")}
            </Text>
            <Pressable onPress={toggleMode}>
              <Text style={styles.hasAccountHighlight}>
                {ui$.mode.get() === "register"
                  ? t("auth.form.loginHere")
                  : t("auth.form.registerHere")}
              </Text>
            </Pressable>
          </View>
        )}
      </Pressable>
    </ScrollView>
  );
});

// Fewer fields start lower, so the form sits near the middle of the screen
const TOP_PADDING: Record<Exclude<AccountMode, "connected">, number> = {
  login: 270,
  confirm: 270,
  forgot: 270,
  reset: 200,
  register: 165,
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
  },

  scrollContainer: { flex: 1 },
  fieldBox: {
    backgroundColor: "#343537",
    borderRadius: 100,
    width: "80%",
    height: 60,
    display: "flex",
    flexDirection: "row",
  },
  title: {
    color: "white",
    fontSize: 24,
    fontFamily: "DefaultBold",
    marginTop: 15,
    textAlign: "center",
    width: "90%",
  },
  description: {
    color: "#c7c8ca",
    fontSize: 16,
    fontFamily: "Default",
    marginTop: 10,
    paddingHorizontal: 40,
    textAlign: "center",
  },
  forgotPassword: {
    color: "#c7c8ca",
    fontFamily: "Default",
    fontSize: 15,
    marginTop: 15,
  },
  highlight: {
    color: colors.accent,
    fontFamily: "DefaultBold",
  },
  hasAccountHighlight: {
    color: colors.accent,
    fontFamily: "DefaultBold",
    fontSize: 16,
  },
  fields: {
    marginTop: 45,
    display: "flex",
    flexDirection: "column",
    gap: 15,
  },
  signup: {
    marginTop: 25,
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 100,
    width: "80%",
    backgroundColor: colors.accent,
  },
  text: {
    fontSize: 18,
    fontFamily: "DefaultBold",
    textAlign: "center",
    color: colors.background,
  },
  hasaccount: {
    color: "white",
    fontFamily: "Default",
    fontSize: 16,
  },
  hasAccountContainer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 4,
    marginVertical: 20,
  },

  profileBox: {
    marginTop: 30,
    backgroundColor: colors.surfaceRaised,
    padding: 20,
    borderRadius: 15,
    width: "80%",
    alignItems: "center",
  },
  profileText: {
    color: "white",
    fontSize: 18,
    fontFamily: "DefaultBold",
  },
  logoutBtn: {
    backgroundColor: "#ff4d4d",
    marginTop: 40,
  },
  invalidContainer: {
    backgroundColor: "#ffa2a2",
    padding: 10,
    borderRadius: 20,
    width: "90%",
    marginTop: 20,
  },
  invalidText: {
    textAlign: "left",
    paddingStart: 5,
    color: "#b03737",
    fontFamily: "DefaultBold",
  },
});

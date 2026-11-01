import i18n from "@/i18n";
import { showAlert } from "@/stores/alertStore";
import {
  clearLocalRecipes,
  hasPendingChanges,
  markLocalRecipesForClearing,
  unmarkLocalRecipesForClearing,
} from "@/stores/recipeStore";
import { displayName, fetchUsername } from "@/stores/profileStore";
import { showToast } from "@/stores/toastStore";
import { PendingNotice, savePendingNotice } from "@/utils/persistStorage";
import { User } from "@supabase/supabase-js";
import { reloadAppAsync } from "expo";
import { logger } from "./logger";
import { toServerError } from "./serverErrors";
import { supabase } from "./supabase";

const SUPABASE_ERROR_KEYS = {
  // Authentication Errors
  "Invalid login credentials": "invalidCredentials",
  "Email not confirmed": "emailNotConfirmed",
  "User not found": "userNotFound",
  "Invalid email structure": "invalidEmailStructure",

  // Registration Errors
  "User already registered": "emailAlreadyRegistered",
  "Email address already exists": "emailAlreadyRegistered",
  "Signup is disabled": "signupDisabled",

  // Rate Limiting / Security
  "Email link is invalid or has expired": "linkExpired",
  "Token has expired": "tokenExpired",
  Over_request_rate_limit: "tooManyRequests",
  "Too many requests": "tooManyRequests",

  "TypeError: Network request failed": "network",

  // General fallback identifier
  unknown: "unknown",
} as const;

// Supabase Auth error codes, checked before the messages above
const SUPABASE_ERROR_CODE_KEYS = {
  invalid_credentials: "invalidCredentials",
  email_not_confirmed: "emailNotConfirmed",
  user_already_exists: "emailAlreadyRegistered",
  email_exists: "emailAlreadyRegistered",
  email_address_invalid: "invalidEmailStructure",
  signup_disabled: "signupDisabled",
  otp_expired: "codeInvalid",
  over_email_send_rate_limit: "tooManyRequests",
  over_request_rate_limit: "tooManyRequests",
  same_password: "samePassword",
  weak_password: "weakPassword",
} as const;

const translateError = (err: { code?: string; message?: string }) => {
  const key =
    SUPABASE_ERROR_CODE_KEYS[
      err.code as keyof typeof SUPABASE_ERROR_CODE_KEYS
    ] ??
    SUPABASE_ERROR_KEYS[err.message as keyof typeof SUPABASE_ERROR_KEYS] ??
    SUPABASE_ERROR_KEYS.unknown;
  return i18n.t(`auth.errors.${key}`);
};

export const getUser = async () => {
  const { data, error } = await supabase.auth.getUser();
  const email = data.user?.email;
  const userId = data.user?.id;

  const user = {
    userId: userId ? userId : "guest",
    email: email ? email : "guest",
  };

  return user;
};

/**
 * Emails a code to confirm the address. The account is only usable, and only
 * gets a profile, once the code is entered with confirmSignUp.
 */
export const registerUser = async (
  email: string,
  password: string,
  fullName: string,
) => {
  try {
    logger.info("USER_REGISTER_REQUEST");
    const { error } = await supabase.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          full_name: fullName,
          display_name: fullName,
          // The code email is written in the app's language
          language: i18n.language,
        },
      },
    });

    if (error) throw error;
    logger.info("USER_REGISTER_CODE_SENT");
    return { success: true };
  } catch (error: any) {
    logger.error("USER_REGISTER_FAILED", error);
    return { success: false, error: translateError(error) };
  }
};

/** Checks the code from registerUser, which logs the new user in */
export const confirmSignUp = async (email: string, code: string) => {
  try {
    logger.info("USER_REGISTER_VERIFY");
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "email",
    });

    if (error) throw error;
    logger.info("USER_REGISTER_SUCCESS", { userId: data.user?.id });
    showToast(i18n.t("auth.toasts.registerSuccess"), "success");
    return { success: true, user: data.user ?? undefined };
  } catch (error: any) {
    logger.error("USER_REGISTER_VERIFY_FAILED", error);
    return { success: false, error: translateError(error) };
  }
};

/** Emails a new sign-up code, for accounts whose email isn't confirmed yet */
export const resendSignUpCode = async (email: string) => {
  try {
    logger.info("USER_REGISTER_RESEND");
    const { error } = await supabase.auth.resend({ type: "signup", email });

    if (error) throw error;
    logger.info("USER_REGISTER_CODE_SENT");
    return { success: true };
  } catch (error: any) {
    logger.error("USER_REGISTER_RESEND_FAILED", error);
    return { success: false, error: translateError(error) };
  }
};

export const loginUser = async (email: string, password: string) => {
  try {
    logger.info("USER_LOGIN_REQUEST");
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) throw error;
    logger.info("USER_LOGIN_SUCCESS", { userId: data.session.user.id });

    const username = await fetchUsername(data.session.user.id);
    showToast(
      i18n.t("auth.toasts.loginWelcome", {
        // The auth metadata's copy when the profile can't be read
        name: displayName(
          username ?? data.session.user.user_metadata?.display_name,
        ),
      }),
      "success",
    );
    return { success: true, user: data.user, session: data.session };
  } catch (error: any) {
    logger.error("USER_LOGIN_FAILED", error);
    return {
      success: false,
      error: translateError(error),
      isUnconfirmed: error?.code === "email_not_confirmed",
    };
  }
};

/** Emails a code that logs the user in so they can choose a new password */
export const requestPasswordReset = async (email: string) => {
  try {
    logger.info("PASSWORD_RESET_REQUEST");
    // Succeeds for unknown addresses too, so it doesn't reveal who has an account
    const { error } = await supabase.auth.resetPasswordForEmail(email);

    if (error) throw error;
    logger.info("PASSWORD_RESET_CODE_SENT");
    return { success: true };
  } catch (error: any) {
    logger.error("PASSWORD_RESET_REQUEST_FAILED", error);
    return { success: false, error: translateError(error) };
  }
};

export const resetPassword = async (
  email: string,
  code: string,
  password: string,
) => {
  let verifiedUser: User | undefined;
  try {
    logger.info("PASSWORD_RESET_VERIFY");
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "recovery",
    });

    if (error) throw error;
    verifiedUser = data.user ?? undefined;
    logger.info("PASSWORD_RESET_VERIFIED", { userId: verifiedUser?.id });
  } catch (error: any) {
    logger.error("PASSWORD_RESET_VERIFY_FAILED", error);
    return { success: false, error: translateError(error) };
  }

  // The code already logged the user in, so a failure here doesn't undo that
  const { data, error } = await supabase.auth.updateUser({ password });
  if (error?.code === "same_password") {
    logger.info("PASSWORD_RESET_SAME_PASSWORD", { userId: verifiedUser?.id });
    showToast(i18n.t("auth.reset.samePassword"), "info");
  } else if (error) {
    logger.error("PASSWORD_RESET_UPDATE_FAILED", error, {
      userId: verifiedUser?.id,
    });
    showToast(i18n.t("auth.reset.passwordNotChanged"), "error");
  } else {
    logger.info("PASSWORD_RESET_SUCCESS", { userId: data.user.id });
    showToast(i18n.t("auth.reset.success"), "success");
  }
  // On failure updateUser returns no user, so fall back to the verified one
  return { success: true, user: data.user ?? verifiedUser };
};

/**
 * The notice is an alert shown once the user is logged out, also when that
 * restarts the app.
 */
export const logoutUser = async (notice?: PendingNotice) => {
  const user = await getUser();

  try {
    logger.info("USER_LOGOUT", { userId: user.userId });
    await markLocalRecipesForClearing();
    const { error } = await supabase.auth.signOut();

    if (error) {
      await unmarkLocalRecipesForClearing();
      throw error;
    }

    // Read before clearing, which drops them
    const hadPendingChanges = hasPendingChanges();
    // Logged out first, so nothing syncs while the store is cleared. On
    // failure the mark stays and the next launch clears instead.
    await clearLocalRecipes().catch((clearError) =>
      logger.error("LOCAL_RECIPES_CLEAR_FAILED", clearError),
    );
    logger.info("USER_LOGOUT_SUCCESS", {
      userId: user.userId,
    });

    // Their uploads may still be waiting for cloud sync, and would run for
    // the next account to turn it on. Restarting is the only way to drop them.
    if (hadPendingChanges) {
      logger.info("APP_RELOAD_AFTER_LOGOUT");
      // The restart drops alerts, so it's shown on the next launch instead
      if (notice) savePendingNotice(notice);
      reloadAppAsync();
      return { success: true };
    }

    showToast(i18n.t("auth.toasts.logoutSuccess"), "success");
    if (notice) {
      showAlert(i18n.t(notice.titleKey), i18n.t(notice.messageKey));
    }

    return { success: true };
  } catch (error: any) {
    logger.error("USER_LOGOUT_FAILED", error, {
      userId: user.userId,
      email: user.email,
    });
    return { success: false, error: translateError(error) };
  }
};

/** Emails the user a code to confirm it's them before changing the password */
export const sendVerificationCode = async (email: string) => {
  try {
    logger.info("VERIFICATION_CODE_REQUEST");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });

    if (error) throw error;
    logger.info("VERIFICATION_CODE_SENT");
    return { success: true };
  } catch (error: any) {
    logger.error("VERIFICATION_CODE_REQUEST_FAILED", error);
    return { success: false, error: translateError(error) };
  }
};

/**
 * Checks the code from sendVerificationCode. It logs the user in again, and
 * that fresh session is what lets the password change right after it
 * (secure_password_change only accepts recent sessions without a nonce).
 */
export const verifyCode = async (email: string, code: string) => {
  try {
    logger.info("VERIFICATION_CODE_VERIFY");
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "email",
    });

    if (error) throw error;
    logger.info("VERIFICATION_CODE_VERIFIED");
    return { success: true };
  } catch (error: any) {
    logger.error("VERIFICATION_CODE_VERIFY_FAILED", error);
    return { success: false, error: translateError(error) };
  }
};

/**
 * Emails a code to the current address and one to the new address, the email
 * changes once both are entered with confirmEmailChange
 */
export const requestEmailChange = async (email: string) => {
  const user = await getUser();

  try {
    logger.info("CHANGE_EMAIL_REQUEST", {
      userId: user.userId,
    });
    const { error } = await supabase.auth.updateUser({ email });

    if (error) throw error;
    logger.info("CHANGE_EMAIL_CODE_SENT", { userId: user.userId });
    return { success: true };
  } catch (error: any) {
    logger.error("CHANGE_EMAIL_REQUEST_FAILED", error, {
      userId: user.userId,
    });
    return { success: false, error: translateError(error) };
  }
};

/**
 * Checks one of the two codes requestEmailChange sends, the one sent to the
 * current address or the one sent to the new address. The email changes once
 * both are checked.
 */
export const confirmEmailChange = async (email: string, code: string) => {
  const user = await getUser();

  try {
    logger.info("CHANGE_EMAIL_VERIFY", { userId: user.userId });
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "email_change",
    });

    if (error) throw error;
    logger.info("CHANGE_EMAIL_CODE_VERIFIED", { userId: user.userId });
    return { success: true };
  } catch (error: any) {
    logger.error("CHANGE_EMAIL_FAILED", error, { userId: user.userId });
    return { success: false, error: translateError(error) };
  }
};

export const changePassword = async (password: string) => {
  const user = await getUser();

  try {
    logger.info("CHANGE_PASSWORD_REQUEST", { userId: user.userId });
    const { error } = await supabase.auth.updateUser({ password });

    if (error) throw error;
    logger.info("CHANGE_PASSWORD_SUCCESS", { userId: user.userId });
    showToast(i18n.t("account.toasts.passwordChanged"), "success");
    return { success: true };
  } catch (error: any) {
    logger.error("CHANGE_PASSWORD_FAILED", error, { userId: user.userId });
    return { success: false, error: translateError(error) };
  }
};

export const changeUsername = async (name: string) => {
  const user = await getUser();

  try {
    logger.info("CHANGE_USERNAME_REQUEST", {
      userId: user.userId,
    });
    const { data: data, error: error } = await supabase.auth.updateUser({
      data: { display_name: name },
    });

    if (error) throw error;
    logger.info("CHANGE_USERNAME_SUCCESS", {
      userId: user.userId,
    });

    return { success: true };
  } catch (error: any) {
    logger.error("CHANGE_USERNAME_FAILED", error, { userId: user.userId });
    return { success: false, error: error.message };
  }
};

export const deleteUser = async () => {
  const user = await getUser();

  try {
    logger.info("ACCOUNT_DELETION_REQUEST", { userId: user.userId });
    // The edge function also removes the user's images from Storage
    const { error } = await supabase.functions.invoke("delete-account");
    if (error) throw await toServerError(error);

    logger.info("ACCOUNT_DELETION_SUCCESS", {
      userId: user.userId,
    });

    return { success: true };
  } catch (error: any) {
    logger.error("ACCOUNT_DELETION_FAILED", error, { userId: user.userId });
    return { success: false, error: error.message };
  }
};

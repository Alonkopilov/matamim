import i18n from "@/i18n";
import { z } from "zod";
import { passwordsMatch, registerFields } from "./registerSchema";

export const forgotPasswordSchema = registerFields.pick({ email: true });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const codeField = z
  .string()
  .trim()
  .min(1, { error: () => i18n.t("auth.validation.codeRequired") })
  // The length is set in the Supabase Auth settings, 6 by default
  .regex(/^\d{6,10}$/, {
    error: () => i18n.t("auth.validation.codeInvalid"),
  });

export const confirmSignUpSchema = z.object({ code: codeField });
export type ConfirmSignUpInput = z.infer<typeof confirmSignUpSchema>;

const newPasswordFields = registerFields.pick({
  password: true,
  confirmPassword: true,
});

export const newPasswordSchema = newPasswordFields.refine(
  passwordsMatch.check,
  passwordsMatch.params,
);

export const resetPasswordSchema = newPasswordFields
  .extend({ code: codeField })
  .refine(passwordsMatch.check, passwordsMatch.params);

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

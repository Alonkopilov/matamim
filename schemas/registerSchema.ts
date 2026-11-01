import i18n from "@/i18n";
import { z } from "zod";

export const registerFields = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, { error: () => i18n.t("auth.validation.fullNameRequired") })
    .min(2, { error: () => i18n.t("auth.validation.fullNameTooShort") })
    .max(30, { error: () => i18n.t("auth.validation.fullNameTooLong") })
    .regex(/^[a-zA-Z\u05D0-\u05EA\s]+$/, {
      error: () => i18n.t("auth.validation.fullNameInvalidChars"),
    }),

  email: z
    .string()
    .trim()
    .min(1, { error: () => i18n.t("auth.validation.emailRequired") })
    .email({ error: () => i18n.t("auth.validation.emailInvalid") }),

  password: z
    .string()
    .min(1, { error: () => i18n.t("auth.validation.passwordRequired") })
    .min(8, { error: () => i18n.t("auth.validation.passwordTooShort") })
    .regex(/^[A-Za-z0-9!"#$%&'()*+,-./:;<=>?@[\\\]^_`{|}~]+$/, {
      error: () => i18n.t("auth.validation.passwordEnglishOnly"),
    }),

  confirmPassword: z.string().min(1, {
    error: () => i18n.t("auth.validation.confirmPasswordRequired"),
  }),
});

export const passwordsMatch = {
  check: (data: { password: string; confirmPassword: string }) =>
    data.password === data.confirmPassword,
  params: {
    error: () => i18n.t("auth.validation.passwordsMismatch"),
    path: ["confirmPassword"],
  },
};

export const registerSchema = registerFields.refine(
  passwordsMatch.check,
  passwordsMatch.params,
);

export type RegisterInput = z.infer<typeof registerSchema>;

export const updateNameSchema = registerFields.pick({ fullName: true });
export type UpdateNameInput = z.infer<typeof updateNameSchema>;

export const updateMailSchema = registerFields.pick({ email: true });
export type UpdateMailInput = z.infer<typeof updateMailSchema>;

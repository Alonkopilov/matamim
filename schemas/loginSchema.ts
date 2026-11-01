import i18n from "@/i18n";
import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, { error: () => i18n.t("auth.validation.emailRequired") }),

  password: z
    .string()
    .min(1, { error: () => i18n.t("auth.validation.passwordRequired") }),
});

export type LoginInput = z.infer<typeof loginSchema>;

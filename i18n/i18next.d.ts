import "i18next";
import he from "./locales/he";

// Hebrew is the source of truth for the keys, so t() only accepts keys it has
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: typeof he };
  }
}

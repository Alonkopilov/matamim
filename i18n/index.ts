import { IS_E2E } from "@/utils/e2e";
import { logger } from "@/utils/logger";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { reloadAppAsync } from "expo";
import { getCalendars, getLocales } from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { I18nManager, Platform } from "react-native";
import en from "./locales/en";
import he from "./locales/he";

export const LANGUAGES = ["he", "en"] as const;
export type Language = (typeof LANGUAGES)[number];
export type LanguagePreference = Language | "system";

// Shown in the picker in their own language, whatever the current one is
export const LANGUAGE_NAMES: Record<Language, string> = {
  he: "עברית",
  en: "English",
};

// Both files must have the same keys, a missing one fails type checking
const resources = {
  he: { translation: he satisfies typeof en },
  en: { translation: en satisfies typeof he },
};

// The store account's country, saved by the premium store once RevenueCat
// reports it. Read once per launch, so a newly saved one applies from the next
// launch and the language never flips mid-session.
const STORE_COUNTRY_KEY = "store_country";
let storeCountry: string | null = null;
let isStoreCountryLoaded = false;

export const saveStoreCountry = (countryCode: string) =>
  AsyncStorage.setItem(STORE_COUNTRY_KEY, countryCode);

// The App Store reports ISO alpha-3 codes, Google Play alpha-2
const ISRAEL_COUNTRY_CODES = ["IL", "ISR"];
const ISRAEL_TIME_ZONES = ["Asia/Jerusalem", "Asia/Tel_Aviv", "Israel"];

const isInIsrael = () =>
  ISRAEL_COUNTRY_CODES.includes(storeCountry?.toUpperCase() ?? "") ||
  // The region setting, which an English phone often leaves on US
  getLocales()[0]?.regionCode === "IL" ||
  // Set by the network, so it's where the device is
  ISRAEL_TIME_ZONES.includes(getCalendars()[0]?.timeZone ?? "");

// The "system" language goes by country, not the phone's language: Hebrew in
// Israel, English anywhere else
const getDefaultLanguage = (): Language => {
  // Flows assert on English text, and the emulator takes the host's time zone
  if (IS_E2E) return "en";
  return isInIsrael() ? "he" : "en";
};

export const resolveLanguage = (preference: LanguagePreference): Language =>
  preference === "system" ? getDefaultLanguage() : preference;

i18n.use(initReactI18next).init({
  resources,
  // Without the store country yet, applyLanguage corrects it before the first
  // render
  lng: getDefaultLanguage(),
  fallbackLng: "he",
  interpolation: {
    // React already escapes rendered values
    escapeValue: false,
  },
});

// Holds the language a direction reload was attempted for
const DIRECTION_RELOAD_KEY = "layout_direction_reload";

/**
 * The layout direction only changes on a restart, so this reloads the app when
 * it doesn't match the language. Returns true when a reload is on the way.
 */
const syncLayoutDirection = async (language: Language) => {
  if (Platform.OS === "web") return false;

  const isRTL = i18n.dir(language) === "rtl";
  const attempted = await AsyncStorage.getItem(DIRECTION_RELOAD_KEY);

  if (I18nManager.isRTL === isRTL) {
    if (attempted) await AsyncStorage.removeItem(DIRECTION_RELOAD_KEY);
    return false;
  }

  // Already reloaded for this language and the direction didn't take, don't
  // loop. Happens in Expo Go, which ignores forceRTL.
  if (attempted === language) {
    logger.error("LAYOUT_DIRECTION_NOT_APPLIED", null, { language });
    return false;
  }

  logger.info("APP_RELOAD_FOR_LAYOUT_DIRECTION", { language });
  await AsyncStorage.setItem(DIRECTION_RELOAD_KEY, language);
  I18nManager.allowRTL(isRTL);
  I18nManager.forceRTL(isRTL);
  reloadAppAsync();
  return true;
};

/** Returns true when the app is about to reload to flip the layout direction */
export const applyLanguage = async (preference: LanguagePreference) => {
  if (!isStoreCountryLoaded) {
    storeCountry = await AsyncStorage.getItem(STORE_COUNTRY_KEY);
    isStoreCountryLoaded = true;
  }
  const language = resolveLanguage(preference);
  if (i18n.language !== language) await i18n.changeLanguage(language);
  return syncLayoutDirection(language);
};

export default i18n;

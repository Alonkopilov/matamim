import i18n, { saveStoreCountry } from "@/i18n";
import { IS_E2E } from "@/utils/e2e";
import { logger } from "@/utils/logger";
import { supabase } from "@/utils/supabase";
import { observable, observe } from "@legendapp/state";
import { Platform } from "react-native";
import Purchases, { CustomerInfo } from "react-native-purchases";
import { auth$ } from "./authStore";
import { settings$ } from "./settingsStore";
import { showToast } from "./toastStore";

// Must match the entitlement identifier in the RevenueCat dashboard
export const PREMIUM_ENTITLEMENT_ID = "Matamim Premium";

interface Premium {
  isPremium: boolean;
  // True once the logged-in user's status is known, so a guest or a slow
  // launch isn't mistaken for a lapsed subscription
  isLoaded: boolean;
  // True once the server has re-read the logged-in user's entitlement. The
  // upload policies read the server's copy, which can be out of date until
  // then (a renewal the webhook hasn't reported yet).
  isServerSynced: boolean;
  // AI imports a free user can still try, null for premium, a guest, or
  // while unknown (the server still decides)
  freeImportsLeft: number | null;
}

export const premium$ = observable<Premium>({
  isPremium: false,
  isLoaded: false,
  isServerSynced: false,
  freeImportsLeft: null,
});

// Dev and e2e builds use RevenueCat's Test Store, release builds the real
// stores
const API_KEY = __DEV__ || IS_E2E
  ? process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY
  : Platform.select({
    ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
    android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  });

/**
 * Asks the server to re-read the user's entitlement from RevenueCat, so the
 * upload policies see a purchase right away instead of waiting for the
 * webhook.
 */
export const syncPremiumToServer = async () => {
  const { error } = await supabase.functions.invoke("sync-premium");
  if (error) logger.error("SYNC_PREMIUM_FAILED", error);
};

export const refreshFreeImportsLeft = async () => {
  const { data, error } = await supabase.rpc("my_free_ai_imports_left");
  if (error) {
    logger.error("FREE_IMPORTS_LEFT_FAILED", error);
    return;
  }
  premium$.freeImportsLeft.set(data);
};

// RevenueCat's customer id for the logged-in user, undefined while logging in
let loggedInUserId: string | undefined;

// Also called with the result of a purchase or restore, since the update
// listener doesn't always fire for those
export const applyCustomerInfo = (info: CustomerInfo) => {
  const isPremium = PREMIUM_ENTITLEMENT_ID in info.entitlements.active;
  const { isPremium: wasPremium, isLoaded: wasLoaded } = premium$.peek();
  premium$.assign({ isPremium, isLoaded: true });

  if (wasLoaded && isPremium !== wasPremium) {
    logger.info("PREMIUM_STATUS_CHANGED", { isPremium });
    syncPremiumToServer();
  }
};

const onUserChanged = async (userId: string | undefined) => {
  loggedInUserId = undefined;
  premium$.assign({
    isPremium: false,
    isLoaded: false,
    isServerSynced: false,
    freeImportsLeft: null,
  });

  try {
    if (userId) {
      // The Supabase user id is RevenueCat's customer id, which is how the
      // server finds the user's purchases
      const { customerInfo } = await Purchases.logIn(userId);
      loggedInUserId = userId;
      applyCustomerInfo(customerInfo);
      // A free user has nothing to upload, and the webhook reports an ended
      // subscription, so only a premium user needs the server's copy fresh
      if (premium$.isPremium.peek()) await syncPremiumToServer();
      else refreshFreeImportsLeft();
    } else if (!(await Purchases.isAnonymous())) {
      await Purchases.logOut();
    }
  } catch (error) {
    logger.error("PURCHASES_USER_CHANGE_FAILED", error, { userId });
  } finally {
    // Also after a failure, so uploads still get their own try
    premium$.isServerSynced.set(true);
  }
};

export function initPurchases() {
  if (Platform.OS === "web") {
    premium$.isServerSynced.set(true);
    return;
  }
  if (!API_KEY) {
    logger.error("REVENUECAT_API_KEY_MISSING", new Error("No RevenueCat key"));
    premium$.isServerSynced.set(true);
    return;
  }

  Purchases.configure({ apiKey: API_KEY });

  // The default language goes by the store account's country, from the next
  // launch. Null without a store account.
  Purchases.getStorefront()
    .then((storefront) => {
      if (storefront) return saveStoreCountry(storefront.countryCode);
    })
    .catch((error) =>
      logger.warn("GET_STOREFRONT_FAILED", { errorMessage: String(error) }),
    );

  // Renewals, expirations and purchases on other devices. Ignored while
  // logging in, when the info still belongs to the anonymous customer.
  Purchases.addCustomerInfoUpdateListener((info) => {
    if (loggedInUserId) applyCustomerInfo(info);
  });

  let currentUserId: string | undefined;
  let isFirstRun = true;
  observe(() => {
    if (auth$.isLoading.get()) return;
    const userId = auth$.session.get()?.user.id;
    if (!isFirstRun && userId === currentUserId) return;
    isFirstRun = false;
    currentUserId = userId;
    onUserChanged(userId);
  });

  // The server rejects uploads without premium, so stop syncing once it ends
  observe(() => {
    const isSyncing = settings$.isSyncingToCloud.get();
    if (!premium$.isLoaded.get() || premium$.isPremium.get()) return;
    if (!isSyncing) return;

    logger.info("CLOUD_SYNC_DISABLED_NO_PREMIUM");
    showToast(i18n.t("premium.cloudSyncDisabled"), "error");
    settings$.isSyncingToCloud.set(false);
  });
}

import { useBottomTabBarHeight } from "expo-router/js-tabs";
import { colors } from "@/constants/theme";
import Accordion from "@/components/premium/Accordion";
import Feature from "@/components/premium/Feature";
import PaymentOption from "@/components/premium/PaymentOption";
import PremiumHero from "@/components/premium/PremiumHero";
import Button from "@/components/ui/Button";
import { showAlert } from "@/stores/alertStore";
import { getCurrentUserId } from "@/stores/authStore";
import {
  applyCustomerInfo,
  PREMIUM_ENTITLEMENT_ID,
  premium$,
} from "@/stores/premiumStore";
import { showToast } from "@/stores/toastStore";
import { openLegalPage } from "@/utils/legalLinks";
import { logger } from "@/utils/logger";
import { observer, useObservable } from "@legendapp/state/react";
import { router } from "expo-router";
import { useEffect } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Purchases, {
  PACKAGE_TYPE,
  PurchasesPackage,
} from "react-native-purchases";

const RESTORE_TIMEOUT_MS = 30000;

const PACKAGE_LABELS: Partial<
  Record<PACKAGE_TYPE, "monthly" | "annual" | "lifetime">
> = {
  [PACKAGE_TYPE.MONTHLY]: "monthly",
  [PACKAGE_TYPE.ANNUAL]: "annual",
  [PACKAGE_TYPE.LIFETIME]: "lifetime",
};

export default observer(function PremiumScreen() {
  const tabBarHeight = useBottomTabBarHeight();
  const { t } = useTranslation();
  const ui$ = useObservable({
    packages: [] as PurchasesPackage[],
    selectedId: "",
    isLoadingOfferings: true,
    isPurchasing: false,
    isRestoring: false,
  });

  const getLabel = (pkg: PurchasesPackage) => {
    const label = PACKAGE_LABELS[pkg.packageType];
    if (!label) return { title: pkg.product.title, period: "" };
    return {
      title: t(`premium.packages.${label}.title`),
      period: t(`premium.packages.${label}.period`),
    };
  };

  useEffect(() => {
    Purchases.getOfferings()
      .then((offerings) => {
        const packages = offerings.current?.availablePackages ?? [];
        ui$.packages.set(packages);
        // Yearly is the plan we lead with, so it starts selected
        const initial =
          packages.find((pkg) => pkg.packageType === PACKAGE_TYPE.ANNUAL) ??
          packages[0];
        ui$.selectedId.set(initial?.identifier ?? "");
      })
      .catch((error) => logger.error("GET_OFFERINGS_FAILED", error))
      .finally(() => ui$.isLoadingOfferings.set(false));
  }, []);

  // Purchases are tied to the Supabase account, so a guest has to log in first
  const ensureLoggedIn = () => {
    if (getCurrentUserId() !== "guest") return true;
    showAlert(
      t("premium.loginRequired.title"),
      t("premium.loginRequired.message"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("premium.loginRequired.login"),
          onPress: () => router.navigate("/account"),
        },
      ],
    );
    return false;
  };

  const purchase = async () => {
    const pkg = ui$.packages
      .peek()
      .find((item) => item.identifier === ui$.selectedId.peek());
    if (!pkg || !ensureLoggedIn()) return;

    ui$.isPurchasing.set(true);
    try {
      logger.info("PURCHASE_STARTED", { package: pkg.identifier });
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      applyCustomerInfo(customerInfo);
      if (PREMIUM_ENTITLEMENT_ID in customerInfo.entitlements.active) {
        logger.info("PURCHASE_SUCCESS", { package: pkg.identifier });
        showToast(t("premium.purchase.success"), "success");
      }
    } catch (error: any) {
      if (!error.userCancelled) {
        logger.error("PURCHASE_FAILED", error, { package: pkg.identifier });
        showAlert(t("premium.purchase.failedTitle"), error.message);
      }
    } finally {
      ui$.isPurchasing.set(false);
    }
  };

  const restore = async () => {
    if (ui$.isRestoring.peek() || !ensureLoggedIn()) return;

    ui$.isRestoring.set(true);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // The store can leave a restore without an answer, so it can't wait forever
      const customerInfo = await Promise.race([
        Purchases.restorePurchases(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(t("premium.restore.timeout"))),
            RESTORE_TIMEOUT_MS,
          );
        }),
      ]);
      applyCustomerInfo(customerInfo);
      if (PREMIUM_ENTITLEMENT_ID in customerInfo.entitlements.active) {
        showToast(t("premium.restore.success"), "success");
      } else {
        showToast(t("premium.restore.notFound"), "error");
      }
    } catch (error: any) {
      logger.error("RESTORE_PURCHASES_FAILED", error);
      showAlert(t("premium.restore.failedTitle"), error.message);
    } finally {
      clearTimeout(timer);
      ui$.isRestoring.set(false);
    }
  };

  const packages = ui$.packages.get();
  const selected = packages.find(
    (pkg) => pkg.identifier === ui$.selectedId.get(),
  );
  const selectedLabel = selected && PACKAGE_LABELS[selected.packageType];
  const isPremium = premium$.isPremium.get();
  const isPurchasing = ui$.isPurchasing.get();

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: tabBarHeight }}
      >
        <PremiumHero
          title={
            <Trans
              i18nKey="premium.title"
              components={{ highlight: <Text /> }}
            />
          }
          description={t("premium.description")}
        />
        <Feature
          icon="people"
          title={t("premium.features.familySharing.title")}
          description={t("premium.features.familySharing.description")}
        />
        <Feature
          icon="cloud"
          title={t("premium.features.cloudSync.title")}
          description={t("premium.features.cloudSync.description")}
        />
        <Feature
          icon="link"
          title={t("premium.features.urlImport.title")}
          description={t("premium.features.urlImport.description")}
        />

        <View style={styles.paymentOptions}>
          {ui$.isLoadingOfferings.get() ? (
            <ActivityIndicator size="large" color={colors.text} />
          ) : packages.length === 0 ? (
            <Text style={styles.cancelAnytime}>
              {t("premium.offeringsUnavailable")}
            </Text>
          ) : (
            packages.map((pkg) => (
              <PaymentOption
                key={pkg.identifier}
                id={pkg.identifier}
                testID={`payment-option-${PACKAGE_LABELS[pkg.packageType] ?? pkg.identifier}`}
                title={getLabel(pkg).title}
                price={pkg.product.priceString}
                period={getLabel(pkg).period}
                badge={
                  pkg.packageType === PACKAGE_TYPE.ANNUAL
                    ? t("premium.bestValue")
                    : undefined
                }
                selected$={ui$.selectedId}
              />
            ))
          )}
        </View>
        <Accordion
          title={t("premium.whereMoneyGoes.title")}
          expandedText={t("premium.whereMoneyGoes.body")}
        />
        {selected && selectedLabel === "lifetime" && (
          <Text style={styles.cancelAnytime}>{t("premium.oneTimeNotice")}</Text>
        )}
        {selected &&
          (selectedLabel === "monthly" || selectedLabel === "annual") && (
            <Text style={styles.cancelAnytime}>
              {t("premium.autoRenewNotice", {
                price: selected.product.priceString,
                period: t(`premium.packages.${selectedLabel}.period`),
              })}
            </Text>
          )}
        <Button
          title={
            isPremium
              ? t("premium.purchase.active")
              : t("premium.purchase.button")
          }
          onPress={purchase}
          loading={isPurchasing}
          disabled={isPremium || packages.length === 0}
          style={styles.pay}
        />

        <View style={styles.legal}>
          <Pressable onPress={() => openLegalPage("terms")}>
            <Text style={styles.legalText}>{t("premium.legal.terms")}</Text>
          </Pressable>
          <Pressable onPress={() => openLegalPage("privacy")}>
            <Text style={styles.legalText}>{t("premium.legal.privacy")}</Text>
          </Pressable>
          <Pressable onPress={restore}>
            <View style={styles.restore}>
              <Text style={styles.legalText}>
                {t("premium.restore.button")}
              </Text>
              {ui$.isRestoring.get() && (
                <ActivityIndicator color={styles.legalText.color} />
              )}
            </View>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: colors.background,
    paddingTop: 50,
  },
  cancelAnytime: {
    marginTop: 20,
    alignSelf: "center",
    textAlign: "center",
    fontSize: 16,
    color: "#858585",
    fontFamily: "Default",
  },
  pay: {
    marginTop: 20,
  },
  legal: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-evenly",
    width: "100%",
    marginTop: 30,
  },
  restore: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  legalText: {
    textDecorationLine: "underline",
    textAlign: "center",
    fontSize: 16,
    fontFamily: "Default",
    color: "#858585",
  },
  paymentOptions: {
    display: "flex",
    flexDirection: "column",
    gap: 18,
    marginTop: 30,
  },
});

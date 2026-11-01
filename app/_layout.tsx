import { colors } from "@/constants/theme";
import { AlertModal } from "@/components/AlertModal";
import i18n from "@/i18n";
import { SharedImportHandler } from "@/components/recipes/SharedImportHandler";
import { Toast } from "@/components/Toast";
import { showAlert } from "@/stores/alertStore";
import { initPurchases } from "@/stores/premiumStore";
import { isLanguageReady$ } from "@/stores/settingsStore";
import { IS_E2E } from "@/utils/e2e";
import { logger } from "@/utils/logger";
import { isStorageMigrated$, takePendingNotice } from "@/utils/persistStorage";
// Imported per weight, the package roots would bundle every weight
import { JetBrainsMono_400Regular } from "@expo-google-fonts/jetbrains-mono/400Regular";
import { JetBrainsMono_700Bold } from "@expo-google-fonts/jetbrains-mono/700Bold";
import { Rubik_400Regular } from "@expo-google-fonts/rubik/400Regular";
import { Rubik_700Bold } from "@expo-google-fonts/rubik/700Bold";
import { useSelector } from "@legendapp/state/react";
import * as Sentry from "@sentry/react-native";
import {
  ErrorBoundaryProps,
  Stack,
  usePathname,
  useSegments,
} from "expo-router";
import { useFonts } from "expo-font";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ShareIntentProvider } from "expo-share-intent";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

// Dev builds only report with EXPO_PUBLIC_SENTRY_IN_DEV=1, to test the setup
const reportsInDev = process.env.EXPO_PUBLIC_SENTRY_IN_DEV === "1";

Sentry.init({
  dsn: SENTRY_DSN,
  // E2E runs would flood the production project with test noise
  enabled: !!SENTRY_DSN && !IS_E2E && (!__DEV__ || reportsInDev),
  environment: __DEV__ ? "development" : "production",
  sendDefaultPii: false,
  // A sample of app starts and screen loads, for performance
  tracesSampleRate: __DEV__ ? 1.0 : 0.2,
  // Release builds log through utils/logger, which adds its own breadcrumbs
  beforeBreadcrumb: (breadcrumb) =>
    breadcrumb.category === "console" ? null : breadcrumb,
});

SplashScreen.preventAutoHideAsync();
initPurchases();

// Shown instead of the app when a screen throws while rendering. Expo Router
// catches the error before Sentry.wrap does, so it's reported here.
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const { t } = useTranslation();

  useEffect(() => {
    // logger.error would report the crash a second time
    logger.info("APP_CRASHED", { errorMessage: error.message });
    Sentry.captureException(error);
    // A crash before the fonts load would leave the splash screen up
    SplashScreen.hideAsync();
  }, [error]);

  return (
    <View style={styles.crashContainer}>
      <Text style={styles.crashTitle}>{t("common.crash.title")}</Text>
      <Text style={styles.crashDescription}>
        {t("common.crash.description")}
      </Text>
      <Pressable style={styles.crashButton} onPress={retry}>
        <Text style={styles.crashButtonText}>{t("common.crash.retry")}</Text>
      </Pressable>
    </View>
  );
}

function RootLayout() {
  const pathname = usePathname();
  const segments = useSegments();
  const isLanguageReady = useSelector(isLanguageReady$);
  // The screens read the recipe stores, which load from MMKV on first read
  const isStorageMigrated = useSelector(isStorageMigrated$);

  const [loaded, error] = useFonts({
    // Rubik covers both Hebrew and Latin
    Default: Rubik_400Regular,
    DefaultBold: Rubik_700Bold,
    Code: JetBrainsMono_400Regular,
    CodeBold: JetBrainsMono_700Bold,
  });

  const isReady = (loaded || !!error) && isLanguageReady && isStorageMigrated;

  useEffect(() => {
    if (isReady) {
      SplashScreen.hideAsync();
    }
  }, [isReady]);

  // An alert the last run left for this one, such as one a restart dropped
  useEffect(() => {
    if (!isReady) return;
    const notice = takePendingNotice();
    if (notice) {
      showAlert(i18n.t(notice.titleKey), i18n.t(notice.messageKey));
    }
  }, [isReady]);

  useEffect(() => {
    const screenName = segments.length > 0 ? segments.join("/") : "index";

    logger.info("VIEW_SCREEN", { screen: screenName, urlPath: pathname });
  }, [pathname, segments]);

  if (!isReady) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ShareIntentProvider>
        <BottomSheetModalProvider>
          <Stack
            screenOptions={{
              contentStyle: { backgroundColor: colors.background },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="account/join"
              options={{ headerShown: false }}
            />
          </Stack>
          <SharedImportHandler />
          <AlertModal />
        </BottomSheetModalProvider>
        {/* After the sheets, so a toast shows above an open one */}
        <Toast />
      </ShareIntentProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(RootLayout);

const styles = StyleSheet.create({
  crashContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    paddingHorizontal: 40,
  },
  crashTitle: {
    color: "white",
    fontSize: 24,
    fontFamily: "DefaultBold",
    textAlign: "center",
  },
  crashDescription: {
    color: "#c7c8ca",
    fontSize: 16,
    fontFamily: "Default",
    marginTop: 10,
    textAlign: "center",
  },
  crashButton: {
    marginTop: 25,
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 100,
    width: "80%",
    backgroundColor: colors.accent,
  },
  crashButtonText: {
    fontSize: 18,
    fontFamily: "DefaultBold",
    textAlign: "center",
    color: colors.background,
  },
});

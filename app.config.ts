import { ConfigContext, ExpoConfig } from "expo/config";
import { ConfigPlugin, withAndroidManifest } from "expo/config-plugins";

// EXPO_PUBLIC_E2E=1 builds a separate app for Maestro (see scripts/e2e).
// It installs next to the real app and can only talk to local Supabase.
const IS_E2E = process.env.EXPO_PUBLIC_E2E === "1";

// RevenueCat closes non-debuggable apps that use a Test Store key. Only the
// manifest flag is set: the build type stays release, so BuildConfig.DEBUG,
// dev support and the bundled JS are those of a real release build.
const withDebuggableManifest: ConfigPlugin = (config) =>
  withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    manifest.$["xmlns:tools"] = "http://schemas.android.com/tools";
    const app = manifest.application![0].$ as Record<string, string>;
    app["android:debuggable"] = "true";
    // Lint fails release builds with a hardcoded debuggable flag
    app["tools:ignore"] = "HardcodedDebugMode";
    return config;
  });

export default ({ config }: ConfigContext): ExpoConfig => {
  if (!IS_E2E) return config as ExpoConfig;

  return withDebuggableManifest({
    ...(config as ExpoConfig),
    name: "Matamim E2E",
    // Keeps deep links from opening the real app, and the other way around
    scheme: "ourrecipes-e2e",
    android: { ...config.android, package: "com.matamim.app.e2e" },
    ios: { ...config.ios, bundleIdentifier: "com.matamim.app.e2e" },
    // An OTA update would swap the e2e bundle for one that talks to prod
    updates: { ...config.updates, enabled: false },
    plugins: config.plugins?.map((plugin) =>
      Array.isArray(plugin) && plugin[0] === "expo-build-properties"
        ? [
          plugin[0],
          {
            ...plugin[1],
            // Local Supabase is plain http
            android: { ...plugin[1].android, usesCleartextTraffic: true },
          },
        ]
        : plugin
    ),
  });
};

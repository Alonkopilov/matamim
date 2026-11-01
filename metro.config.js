const { getSentryExpoConfig } = require("@sentry/react-native/metro");
const path = require("path");

// Expo's config plus the debug IDs that match Sentry reports to source maps
const config = getSentryExpoConfig(__dirname);

const stub = (name) => ({
  type: "sourceFile",
  filePath: path.resolve(__dirname, "utils/stubs", name),
});

const isFrom = (context, packageName) =>
  context.originModulePath.includes(
    `${path.sep}node_modules${path.sep}${packageName}${path.sep}`,
  );

// Modules that native builds never use but would bundle, swapped for stubs
const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform !== "web") {
    // The app runs in a dev client or a release build, never Expo Go, so it
    // always has RevenueCat's native module
    if (
      moduleName === "./browser/nativeModule" &&
      isFrom(context, "react-native-purchases")
    ) {
      return stub("purchasesBrowserMode.js");
    }
    if (moduleName === "expo-symbols" && isFrom(context, "expo-router")) {
      return stub("expoSymbols.js");
    }
  }
  return (resolveRequest ?? context.resolveRequest)(
    context,
    moduleName,
    platform,
  );
};

module.exports = config;

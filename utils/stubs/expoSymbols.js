// Stands in for expo-symbols in expo-router (see metro.config.js). Only its
// native tabs use it, to draw Material Symbols icons, and it bundles a 1 MB
// font on Android. The app's tabs are the JS ones.
exports.unstable_getMaterialSymbolSourceAsync = () =>
  Promise.reject(new Error("expo-symbols is not bundled"));

import { getShareExtensionKey } from "expo-share-intent";

// The iOS share extension opens the app with ourrecipes://dataUrl=<key>. It
// isn't a screen: ShareIntentProvider reads what was shared from the app
// group, and SharedImportHandler opens the import on a new recipe.
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}) {
  try {
    if (path.includes(`dataUrl=${getShareExtensionKey()}`)) {
      return "/new";
    }
  } catch {
    // Not a share: the link goes where it says
  }
  return path;
}

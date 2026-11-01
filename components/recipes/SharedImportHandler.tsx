import { showAlert } from "@/stores/alertStore";
import { pendingShare$ } from "@/stores/shareStore";
import { logger } from "@/utils/logger";
import { toSharedImport } from "@/utils/recipeImport";
import { router } from "expo-router";
import { useShareIntentContext } from "expo-share-intent";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

/**
 * Takes what another app shared to Matamim and opens a new recipe with the
 * import ready. Nothing is imported until the user taps Import there.
 */
export function SharedImportHandler() {
  const { t } = useTranslation();
  const { hasShareIntent, shareIntent, resetShareIntent, error } =
    useShareIntentContext();

  useEffect(() => {
    if (!error) return;
    logger.warn("SHARE_INTENT_FAILED", { errorMessage: error });
    // Our patch's message for a share whose file couldn't be read
    if (error.startsWith("Cannot read the shared content")) {
      showAlert(
        t("recipeImport.share.unsupportedTitle"),
        t("errors.SHARE_UNSUPPORTED"),
      );
    }
  }, [error, t]);

  useEffect(() => {
    if (!hasShareIntent) return;
    const shared = toSharedImport(shareIntent);
    resetShareIntent();

    logger.info("SHARE_RECEIVED", { kind: shared?.kind ?? "unsupported" });
    if (!shared) {
      showAlert(
        t("recipeImport.share.unsupportedTitle"),
        t("errors.SHARE_UNSUPPORTED"),
      );
      return;
    }
    pendingShare$.set(shared);
    router.navigate({ pathname: "/[id]", params: { id: "new" } });
  }, [hasShareIntent, shareIntent, resetShareIntent, t]);

  return null;
}

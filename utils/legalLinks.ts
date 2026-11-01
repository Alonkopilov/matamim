import i18n from "@/i18n";
import * as WebBrowser from "expo-web-browser";
import { logger } from "./logger";

// The website in site/, served by Cloudflare Pages
export const SITE_URL = "https://matamim.org";

type LegalPage = "privacy" | "terms";

// Hebrew pages are at the root, English ones under /en
export const openLegalPage = async (page: LegalPage) => {
  const prefix = i18n.language === "en" ? "/en" : "";
  logger.info("OPEN_LEGAL_PAGE", { page });
  try {
    await WebBrowser.openBrowserAsync(`${SITE_URL}${prefix}/${page}/`);
  } catch (error) {
    logger.error("OPEN_LEGAL_PAGE_FAILED", error, { page });
  }
};

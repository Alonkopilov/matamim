import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import {
  errorResponse,
  internalErrorResponse,
  unauthorizedResponse,
} from "../_shared/errors.ts";
import { enforceRateLimit } from "../_shared/rateLimiter.ts";
import {
  AiStats,
  extractRecipeFromImages,
  extractRecipeWithAi,
} from "./aiExtract.ts";
import { ImportError } from "./errors.ts";
import { parseImages, readJsonBody } from "./images.ts";
import { extractJsonLdRecipe } from "./jsonLd.ts";
import { ImportedRecipe } from "./recipe.ts";
import { cacheKey, fetchHtml, parseUrl } from "./safeFetch.ts";
import { isSocialLink, readSocialCaption } from "./social.ts";

// Imports that reach the model (cache hits are free) per user, which caps the
// AI bill at roughly this many model calls per user per window
const QUOTA_REQUESTS = 40;
const QUOTA_WINDOW = "30 d";
// A page without a recipe may get one later, so that result is retried
const NO_RECIPE_TTL_MS = 24 * 60 * 60 * 1000;
// Shared text: shorter can't hold a recipe, longer is a chat or a document
const MIN_TEXT_CHARS = 20;
const MAX_TEXT_CHARS = 20_000;

type AdminClient = {
  from: (table: string) => any;
  rpc: (fn: string, args: any) => any;
};
// Which input the model read the recipe from, or 'none' for no recipe
type Source = "ai_json_ld" | "ai_page" | "ai_caption" | "none";

// A row of ai_import_events, filled in as the request goes. Facts only:
// never the link, the photos or the recipe's text.
type ImportEvent = Partial<AiStats> & {
  user_id?: string;
  premium?: boolean;
  kind?: "url" | "images" | "text";
  source?: string;
  cached?: boolean;
  photo_count?: number;
  ingredients?: number;
  steps?: number;
  unsure_words?: number;
};

async function isPremium(supabaseAdmin: AdminClient, userId: string) {
  // Same rule as is_user_premium(): no expiry means a lifetime purchase
  const { data, error } = await supabaseAdmin
    .from("premium_entitlements")
    .select("expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Premium check failed: ${error.message}`);
  return !!data && (data.expires_at === null || new Date(data.expires_at) > new Date());
}

// Free users try a few imports before buying Premium
async function freeImportsLeft(supabaseAdmin: AdminClient, userId: string) {
  const { data, error } = await supabaseAdmin.rpc("free_ai_imports_left", {
    target_user_id: userId,
  });
  if (error) throw new Error(`Free imports check failed: ${error.message}`);
  return data as number;
}

// What's left after using one, or null if none were left. Taken before the
// model is called, so two imports at once can't both use the last one.
async function useFreeImport(supabaseAdmin: AdminClient, userId: string) {
  const { data, error } = await supabaseAdmin.rpc("use_free_ai_import", {
    target_user_id: userId,
  });
  if (error) throw new Error(`Using a free import failed: ${error.message}`);
  return data as number | null;
}

// For an import the model never answered, Anthropic being busy or down
async function refundFreeImport(supabaseAdmin: AdminClient, userId: string) {
  const { error } = await supabaseAdmin.rpc("refund_free_ai_import", {
    target_user_id: userId,
  });
  // The user only loses that one import
  if (error) console.error("Refunding a free import failed:", error.message);
}

async function readCache(supabaseAdmin: AdminClient, url: string) {
  const { data, error } = await supabaseAdmin
    .from("recipe_imports")
    .select("*")
    .eq("url", url)
    .maybeSingle();
  if (error) throw new Error(`Cache read failed: ${error.message}`);
  if (!data) return null;
  if (data.expires_at && new Date(data.expires_at) <= new Date()) return null;
  return data;
}

async function writeCache(
  supabaseAdmin: AdminClient,
  url: string,
  source: Source,
  recipe: ImportedRecipe | null,
) {
  const { error } = await supabaseAdmin.from("recipe_imports").upsert({
    url,
    source,
    ...recipe,
    created_at: new Date().toISOString(),
    expires_at: recipe ? null : new Date(Date.now() + NO_RECIPE_TTL_MS).toISOString(),
  });
  // The user still gets the recipe, only the next import pays again
  if (error) console.error("Cache write failed:", error.message);
}

// Words the model marked as read uncertainly, "(?)"
function countUnsureWords(recipe: ImportedRecipe): number {
  const text = [
    recipe.name,
    recipe.description,
    ...recipe.ingredients.map((i) => `${i.amount} ${i.unit} ${i.item}`),
    ...recipe.instructions.map((i) => i.text),
  ].join("\n");
  return text.split("(?)").length - 1;
}

// After the answer is ready, so a failed write only loses the row
async function recordEvent(
  supabaseAdmin: AdminClient,
  event: ImportEvent,
  response: Response,
  durationMs: number,
) {
  let outcome = "success";
  if (!response.ok) {
    const body = await response.clone().json().catch(() => ({}));
    outcome = typeof body.code === "string" ? body.code : `HTTP_${response.status}`;
  }
  const { error } = await supabaseAdmin.from("ai_import_events").insert({
    ...event,
    outcome,
    duration_ms: durationMs,
  });
  if (error) console.error("Import event write failed:", error.message);
}

// freeImportsLeft is null for a premium user
function toResponse(
  recipe: ImportedRecipe,
  source: string,
  cached: boolean,
  freeImportsLeft: number | null,
) {
  return Response.json({ success: true, source, cached, recipe, freeImportsLeft });
}

async function handleImport(
  req: Request,
  ctx: { userClaims?: { id?: string } | null; supabaseAdmin: AdminClient },
  event: ImportEvent,
): Promise<Response> {
  const userId = ctx.userClaims?.id;
  if (!userId) {
    return unauthorizedResponse();
  }
  event.user_id = userId;
  // Whether this import used one of the user's free imports
  let paidFree = false;

  try {
    const premium = await isPremium(ctx.supabaseAdmin, userId);
    event.premium = premium;
    if (!premium && (await freeImportsLeft(ctx.supabaseAdmin, userId)) <= 0) {
      return errorResponse(403, "IMPORT_PREMIUM_REQUIRED");
    }
    // A free user pays for every call to the model, even one that finds no
    // recipe, and for a cached recipe, or popular pages would be free forever
    let freeLeft: number | null = null;
    const payForImport = async () => {
      if (premium) return;
      freeLeft = await useFreeImport(ctx.supabaseAdmin, userId);
      // Another import took the last one meanwhile
      if (freeLeft === null) throw new ImportError(403, "IMPORT_PREMIUM_REQUIRED");
      paidFree = true;
    };
    const succeeded = (recipe: ImportedRecipe, source: string, cached: boolean) => {
      Object.assign(event, {
        source,
        cached,
        ingredients: recipe.ingredients.length,
        steps: recipe.instructions.length,
        unsure_words: countUnsureWords(recipe),
      });
      return toResponse(recipe, source, cached, freeLeft);
    };

    const burstLimit = await enforceRateLimit(userId, "import-recipe", {
      requests: 5,
      duration: "1 m",
    });
    if (burstLimit) return burstLimit;

    const body = await readJsonBody(req);
    event.kind = body.images !== undefined
      ? "images"
      : body.text !== undefined
      ? "text"
      : "url";

    // Every import that reaches the model counts, whatever it reads
    const enforceQuota = () =>
      enforceRateLimit(userId, "import-recipe-quota", {
        requests: QUOTA_REQUESTS,
        duration: QUOTA_WINDOW,
        // This one guards the bill, so don't let an outage lift it
        failClosed: true,
        error: {
          code: "IMPORT_QUOTA_EXCEEDED",
          params: { limit: QUOTA_REQUESTS },
        },
      });

    // Photos are the user's own, so they skip the cache and aren't kept
    if (body.images !== undefined) {
      if (Array.isArray(body.images)) event.photo_count = body.images.length;
      const images = parseImages(body.images);
      const quota = await enforceQuota();
      if (quota) return quota;
      const recipe = await extractRecipeFromImages(images, event, payForImport);
      return succeeded(recipe, "ai_images", false);
    }

    // Shared text, often a family's message, is the user's own like photos
    if (body.text !== undefined) {
      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (text.length < MIN_TEXT_CHARS) {
        throw new ImportError(400, "TEXT_TOO_SHORT");
      }
      if (text.length > MAX_TEXT_CHARS) {
        throw new ImportError(400, "TEXT_TOO_LONG");
      }
      const quota = await enforceQuota();
      if (quota) return quota;
      const recipe = await extractRecipeWithAi({ kind: "text", text }, event, payForImport);
      if (!recipe) {
        throw new ImportError(422, "TEXT_NO_RECIPE");
      }
      return succeeded(recipe, "ai_text", false);
    }

    if (typeof body.url !== "string" || !body.url.trim()) {
      throw new ImportError(400, "MISSING_URL");
    }
    if (body.url.length > 2048) {
      throw new ImportError(400, "URL_TOO_LONG");
    }

    const url = parseUrl(body.url);
    const key = cacheKey(url);

    const cached = await readCache(ctx.supabaseAdmin, key);
    if (cached) {
      if (cached.source === "none") {
        throw new ImportError(
          422,
          isSocialLink(url) ? "SOCIAL_NO_RECIPE" : "NO_RECIPE",
        );
      }
      const { url: _, source, created_at, expires_at, ...recipe } = cached;
      await payForImport();
      return succeeded(recipe, source, true);
    }

    const quota = await enforceQuota();
    if (quota) return quota;

    // A TikTok, Instagram or YouTube post: the recipe is in its caption
    const caption = await readSocialCaption(url);
    if (caption !== null) {
      // Not cached, since reading it may work next time
      if (!caption) {
        throw new ImportError(422, "SOCIAL_NO_RECIPE");
      }
      const recipe = await extractRecipeWithAi(
        { kind: "text", text: caption },
        event,
        payForImport,
      );
      await writeCache(ctx.supabaseAdmin, key, recipe ? "ai_caption" : "none", recipe);
      if (!recipe) {
        throw new ImportError(422, "SOCIAL_NO_RECIPE");
      }
      return succeeded(recipe, "ai_caption", false);
    }

    const html = await fetchHtml(url);

    // The schema.org data is cleaner and much shorter than the page text,
    // so the model reads it when the page has it
    const jsonLd = extractJsonLdRecipe(html);
    const source: Source = jsonLd ? "ai_json_ld" : "ai_page";
    const recipe = await extractRecipeWithAi(
      jsonLd ? { kind: "json_ld", recipe: jsonLd } : { kind: "page", html },
      event,
      payForImport,
    );

    await writeCache(ctx.supabaseAdmin, key, recipe ? source : "none", recipe);
    if (!recipe) {
      throw new ImportError(422, "NO_RECIPE");
    }
    return succeeded(recipe, source, false);
  } catch (err: any) {
    if (err instanceof ImportError) {
      // Thrown when the call to the model failed, so it never answered
      if (paidFree && (err.code === "AI_BUSY" || err.code === "AI_ERROR")) {
        await refundFreeImport(ctx.supabaseAdmin, userId);
      }
      return errorResponse(err.status, err.code);
    }
    return internalErrorResponse("import-recipe", err);
  }
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const started = Date.now();
    const event: ImportEvent = {};
    const response = await handleImport(req, ctx, event);
    if (event.user_id) {
      await recordEvent(ctx.supabaseAdmin, event, response, Date.now() - started);
    }
    return response;
  }),
};

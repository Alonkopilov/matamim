import i18n from "@/i18n";
import { premium$, refreshFreeImportsLeft } from "@/stores/premiumStore";
import { Ingredient, Instruction, Recipe } from "@/types/recipe";
import { File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { logger } from "./logger";
import { newItemId } from "./recipeItems";
import { toServerError } from "./serverErrors";
import { supabase } from "./supabase";

// What the import-recipe edge function returns, the recipe's own fields
// without the ids the app gives ingredients and steps
type ImportedRecipe = Pick<
  Recipe,
  | "name"
  | "description"
  | "prep_time"
  | "servings"
  | "category"
  | "difficulty"
  | "tags"
> & {
  ingredients: Omit<Ingredient, "id">[];
  instructions: Omit<Instruction, "id">[];
};

export type ImportedFields = Omit<
  Recipe,
  "id" | "user_id" | "image" | "is_public"
>;

// The photos an import can read at once, like both sides of a card
export const MAX_IMPORT_PHOTOS = 3;
// Longest side sent to the model. It reads up to 2576 px, and small
// handwriting needs the detail.
const PHOTO_SIZE = 2000;

// A photo the user picked, took or shared. A shared one may come without
// its size, 0 then.
export interface PickedPhoto {
  uri: string;
  width: number;
  height: number;
}

// What another app shared to Matamim, ready for the import
export type SharedImport =
  | { kind: "link"; url: string }
  | { kind: "text"; text: string }
  // skipped: shared photos past MAX_IMPORT_PHOTOS
  | { kind: "photos"; photos: PickedPhoto[]; skipped: number };

// Text around a shared link, like "Look at this recipe", up to this long is
// only the link's message. Longer text is the recipe itself, with a link to
// the source.
const MAX_LINK_MESSAGE_CHARS = 150;

/** The first web link in a text, without the punctuation after it */
export function extractFirstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"]+/i)?.[0];
  return match ? match.replace(/[.,;:!?)\]}'"]+$/, "") : null;
}

/**
 * Turns what another app shared into an import: photos, a link or a text.
 * @returns null when there's nothing to import, such as a video or a PDF.
 */
export function toSharedImport(share: {
  text?: string | null;
  files?:
    | {
        path: string;
        mimeType: string;
        width: number | null;
        height: number | null;
      }[]
    | null;
}): SharedImport | null {
  const images = (share.files ?? []).filter((file) =>
    file.mimeType.startsWith("image/"),
  );
  if (images.length > 0) {
    return {
      kind: "photos",
      photos: images.slice(0, MAX_IMPORT_PHOTOS).map((file) => ({
        uri: file.path,
        width: file.width ?? 0,
        height: file.height ?? 0,
      })),
      skipped: Math.max(0, images.length - MAX_IMPORT_PHOTOS),
    };
  }

  const text = share.text?.trim();
  if (!text) return null;
  const url = extractFirstUrl(text);
  if (url && text.replace(url, "").trim().length <= MAX_LINK_MESSAGE_CHARS) {
    return { kind: "link", url };
  }
  return { kind: "text", text };
}

/**
 * Sends one import to the import-recipe edge function and turns its answer
 * into the app's recipe fields.
 * @throws An Error whose message tells the user what went wrong.
 */
async function runImport(
  kind: "url" | "images" | "text",
  body: { url: string } | { images: string[] } | { text: string },
): Promise<ImportedFields> {
  logger.info("IMPORT_RECIPE_STARTED", { kind });
  const { data, error } = await supabase.functions.invoke("import-recipe", {
    body,
  });

  if (error) {
    logger.error("IMPORT_RECIPE_FAILED", error, { kind });
    // Used a free import anyway if it reached the model
    if (!premium$.isPremium.peek()) refreshFreeImportsLeft();
    throw await toServerError(error);
  }

  logger.info("IMPORT_RECIPE_SUCCESS", {
    source: data.source,
    cached: data.cached,
  });

  if (typeof data.freeImportsLeft === "number") {
    premium$.freeImportsLeft.set(data.freeImportsLeft);
  }

  const recipe: ImportedRecipe = data.recipe;
  return {
    name: recipe.name,
    description: recipe.description,
    prep_time: recipe.prep_time,
    servings: recipe.servings,
    category: recipe.category,
    difficulty: recipe.difficulty,
    tags: recipe.tags ?? [],
    ingredients: recipe.ingredients.map((ingredient) => ({
      ...ingredient,
      id: newItemId(),
    })),
    instructions: recipe.instructions.map((instruction) => ({
      ...instruction,
      id: newItemId(),
    })),
  };
}

/**
 * Converts a recipe page on the internet into the app's recipe fields.
 * @throws An Error whose message tells the user what went wrong.
 */
export function importRecipeFromUrl(url: string): Promise<ImportedFields> {
  return runImport("url", { url });
}

/**
 * Reads a recipe from text the user shared, like a family's WhatsApp
 * message, into the app's recipe fields. Like photos, the server keeps none
 * of it.
 * @throws An Error whose message tells the user what went wrong.
 */
export function importRecipeFromText(text: string): Promise<ImportedFields> {
  return runImport("text", { text });
}

/**
 * Reads a recipe written in the user's photos into the app's recipe fields.
 * The photos are shrunk to JPEGs and sent in the request, and the server
 * keeps none of them. The shrunk copies are deleted here afterwards.
 * @throws An Error whose message tells the user what went wrong.
 */
export async function importRecipeFromPhotos(
  photos: PickedPhoto[],
): Promise<ImportedFields> {
  const shrunk: string[] = [];
  try {
    const images: string[] = [];
    try {
      for (const photo of photos) {
        // A shared photo may come without its size, so it's measured
        const size =
          photo.width > 0 && photo.height > 0
            ? photo
            : await ImageManipulator.manipulate(photo.uri).renderAsync();
        const context = ImageManipulator.manipulate(photo.uri);
        if (Math.max(size.width, size.height) > PHOTO_SIZE) {
          context.resize(
            size.width >= size.height
              ? { width: PHOTO_SIZE }
              : { height: PHOTO_SIZE },
          );
        }
        // Also turns HEIC into the JPEG the server accepts
        const rendered = await context.renderAsync();
        const result = await rendered.saveAsync({
          compress: 0.85,
          format: SaveFormat.JPEG,
          base64: true,
        });
        shrunk.push(result.uri);
        if (!result.base64) throw new Error("The shrunk photo has no base64");
        // The server takes base64 without line breaks
        images.push(result.base64.replace(/\s/g, ""));
      }
    } catch (error) {
      logger.error("IMPORT_PHOTO_SHRINK_FAILED", error);
      throw new Error(i18n.t("errors.IMAGE_INVALID"));
    }
    return await runImport("images", { images });
  } finally {
    discardPhotoFiles(shrunk);
  }
}

// The same folder can be written through a link: /var is /private/var on
// iOS, and /data/data is /data/user/0 on Android
function normalizePath(uri: string): string {
  return uri
    .replace(/^file:\/\//, "")
    .replace(/^\/private\/var\//, "/var/")
    .replace(/^\/data\/data\//, "/data/user/0/");
}

// Where the app keeps copies of photos: its cache, and on iOS the folder the
// share extension hands shared photos over in
function copyFolders(): string[] {
  return [
    Paths.cache.uri,
    ...Object.values(Paths.appleSharedContainers ?? {}).map((dir) => dir.uri),
  ].map(normalizePath);
}

/**
 * Deletes the copies of photos the app made: the shrunk ones, and those the
 * camera, the picker or a share made. A photo anywhere else, such as the
 * original in the gallery, is never touched.
 */
export function discardPhotoFiles(uris: string[]) {
  const folders = copyFolders();
  for (const uri of uris) {
    const path = normalizePath(uri);
    if (!folders.some((folder) => path.startsWith(folder))) continue;
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch (error: any) {
      logger.warn("IMPORT_PHOTO_DELETE_FAILED", {
        errorMessage: error.message,
      });
    }
  }
}

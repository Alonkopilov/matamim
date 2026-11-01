import * as Crypto from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import { Image } from "expo-image";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { logger } from "./logger";
import { supabase, supabasePublishableKey, supabaseUrl } from "./supabase";

const BUCKET = "recipe-images";
// Recipes uploaded before the bucket was private hold the public URL, which
// ends with this and the path
const BUCKET_MARKER = `/${BUCKET}/`;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
// <user id>/<uuid>.<ext>, the paths the app uploads to (before every image
// was a JPEG, the extension followed the photo's type). The path goes in a
// URL sent with the user's token, and a teammate's recipe can hold anything,
// so a path like "../../functions/v1/delete-account" must never get there.
const STORAGE_PATH = new RegExp(
  `^${UUID}/${UUID}\\.(jpg|jpeg|png|webp|heic)$`,
  "i",
);

// Images that haven't reached Storage are kept as files on the device, and
// the recipe holds "local:<file name>". Only the name is kept because the
// app's folder path changes between iOS app updates.
const LOCAL_PREFIX = "local:";
// The name is <uuid>.jpg (saveLocalImage), so it can't leave the folder
const LOCAL_IMAGE = new RegExp(`^${LOCAL_PREFIX}${UUID}\\.jpg$`, "i");
// Longest side of a saved image, larger photos are scaled down to it
const MAX_IMAGE_SIZE = 1600;

const localImagesDirectory = () => new Directory(Paths.document, BUCKET);

const localImageFile = (image: string) =>
  new File(localImagesDirectory(), image.slice(LOCAL_PREFIX.length));

export const isLocalImage = (image: string) => LOCAL_IMAGE.test(image);

// Copies of the user's images in Storage, kept on the device while cloud sync
// is off: the cloud copy is deleted 30 days after it's turned off, and the
// copies are what's uploaded again when it's turned back on. Named after the
// image's path, which the recipe keeps meanwhile.
const keptImagesDirectory = () => new Directory(Paths.document, "kept-images");

const keptImageFile = (path: string) =>
  new File(keptImagesDirectory(), path.replaceAll("/", "_"));

/**
 * The object path of an image in Storage, or null when the image isn't in
 * Storage (a local file or an old base64 image) or isn't a path the app
 * uploads to.
 */
export function storagePath(image: string): string | null {
  const index = image.indexOf(BUCKET_MARKER);
  const path =
    index !== -1 ? image.substring(index + BUCKET_MARKER.length) : image;
  return STORAGE_PATH.test(path) ? path : null;
}

/**
 * The expo-image source to show a recipe image with. The bucket is private,
 * so images in Storage are loaded with the user's access token. The cache key
 * is the path, so a refreshed token keeps the cached image, which is what
 * shows it offline. Null for a value the app wouldn't have saved.
 */
export function imageSource(image: string, accessToken: string | undefined) {
  if (isLocalImage(image)) return { uri: localImageFile(image).uri };

  const path = storagePath(image);
  if (!path) {
    // Recipes from before Storage hold the image itself
    return image.startsWith("data:image/") ? { uri: image } : null;
  }

  const kept = keptImageFile(path);
  if (kept.exists) return { uri: kept.uri };

  const headers: Record<string, string> = { apikey: supabasePublishableKey };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return {
    uri: `${supabaseUrl}/storage/v1/object/authenticated/${BUCKET}/${path}`,
    headers,
    cacheKey: path,
  };
}

/**
 * Scales a picked photo down, saves it as a JPEG in the app's documents and
 * returns the value to keep in the recipe's image.
 */
export async function saveLocalImage(
  uri: string,
  width: number,
  height: number,
): Promise<string> {
  const context = ImageManipulator.manipulate(uri);
  if (Math.max(width, height) > MAX_IMAGE_SIZE) {
    context.resize(
      width >= height ? { width: MAX_IMAGE_SIZE } : { height: MAX_IMAGE_SIZE },
    );
  }
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({
    compress: 0.7,
    format: SaveFormat.JPEG,
  });

  const directory = localImagesDirectory();
  if (!directory.exists) directory.create({ intermediates: true });

  const name = `${Crypto.randomUUID()}.jpg`;
  new File(result.uri).moveSync(new File(directory, name));
  return LOCAL_PREFIX + name;
}

/**
 * Uploads a local image to <userId>/<uuid>.jpg and returns that path, which
 * the recipe keeps. The local file is kept, remove it with removeRecipeImage
 * once the recipe points to the path.
 */
export async function uploadRecipeImage(
  userId: string,
  image: string,
): Promise<string> {
  const path = `${userId}/${Crypto.randomUUID()}.jpg`;

  logger.info("IMAGE_UPLOAD_STARTED", { path });
  const bytes = await localImageFile(image).bytes();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: "image/jpeg" });

  if (error) {
    logger.error("IMAGE_UPLOAD_FAILED", error, { path });
    throw error;
  }

  logger.info("IMAGE_UPLOAD_SUCCESS", { path });
  return path;
}

/**
 * Keeps a copy of an image in Storage on the device, from expo-image's cache
 * if it's there or downloaded otherwise. Does nothing for other images.
 */
export async function keepImageOnDevice(
  image: string,
  accessToken: string | undefined,
) {
  const path = storagePath(image);
  if (!path) return;
  const file = keptImageFile(path);
  if (file.exists) return;

  const directory = keptImagesDirectory();
  if (!directory.exists) directory.create({ intermediates: true });

  // The cache key is the path (see imageSource)
  const cached = await Image.getCachePathAsync(path);
  if (cached) {
    new File(cached.startsWith("file://") ? cached : `file://${cached}`).copy(
      file,
    );
    return;
  }

  const headers: Record<string, string> = { apikey: supabasePublishableKey };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  await File.downloadFileAsync(
    `${supabaseUrl}/storage/v1/object/authenticated/${BUCKET}/${path}`,
    file,
    { headers },
  );
}

/**
 * Uploads the device's copy of an image to its path in Storage again, after
 * the cloud copy was deleted. Returns false when there's no copy to upload.
 */
export async function restoreImageToStorage(image: string): Promise<boolean> {
  const path = storagePath(image);
  if (!path) return true;
  let file = keptImageFile(path);
  if (!file.exists) {
    const cached = await Image.getCachePathAsync(path);
    if (!cached) return false;
    file = new File(cached.startsWith("file://") ? cached : `file://${cached}`);
  }

  // The image may still be in Storage: the night's image cleanup runs after
  // the recipes are deleted
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, await file.bytes(), {
      contentType: "image/jpeg",
      upsert: true,
    });
  if (error) throw error;
  return true;
}

/** Deletes the copies kept while cloud sync was off */
export function removeKeptImages() {
  try {
    const directory = keptImagesDirectory();
    if (directory.exists) directory.delete();
  } catch (error: any) {
    logger.warn("KEPT_IMAGES_REMOVE_FAILED", { errorMessage: error.message });
  }
}

/** Deletes every image kept on the device */
export function removeAllLocalImages() {
  try {
    const directory = localImagesDirectory();
    if (directory.exists) directory.delete();
  } catch (error: any) {
    logger.warn("LOCAL_IMAGES_REMOVE_FAILED", { errorMessage: error.message });
  }
  removeKeptImages();
}

/** Best-effort removal of a recipe image, local or in Storage */
export async function removeRecipeImage(image: string) {
  if (isLocalImage(image)) {
    try {
      const file = localImageFile(image);
      if (file.exists) file.delete();
    } catch (error: any) {
      logger.warn("LOCAL_IMAGE_REMOVE_FAILED", { errorMessage: error.message });
    }
    return;
  }

  const path = storagePath(image);
  if (!path) return;

  try {
    const kept = keptImageFile(path);
    if (kept.exists) kept.delete();
  } catch (error: any) {
    logger.warn("KEPT_IMAGE_REMOVE_FAILED", { errorMessage: error.message });
  }

  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) {
    logger.warn("IMAGE_REMOVE_FAILED", { path, errorMessage: error.message });
  }
}

import { Recipe } from "@/types/recipe";
import {
  isLocalImage,
  keepImageOnDevice,
  removeAllLocalImages,
  removeKeptImages,
  removeRecipeImage,
  restoreImageToStorage,
  storagePath,
  uploadRecipeImage,
} from "@/utils/imageStorage";
import { logger } from "@/utils/logger";
import {
  metadataSaves$,
  persistPlugin,
  whenStorageMigrated,
} from "@/utils/persistStorage";
import { supabase } from "@/utils/supabase";
import { observable, observe, syncState, when } from "@legendapp/state";
import { configureSynced } from "@legendapp/state/sync";
import { syncedSupabase } from "@legendapp/state/sync-plugins/supabase";
import { useSelector } from "@legendapp/state/react";
import { useMemo } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { Image } from "expo-image";
import { auth$, getCurrentUserId, refreshTeam } from "./authStore";
import { premium$ } from "./premiumStore";
import { settings$ } from "./settingsStore";
import { team$ } from "./teamStore";

const generateId = () => Crypto.randomUUID();

const customSynced = configureSynced(syncedSupabase, {
  persist: {
    plugin: persistPlugin,
  },
  generateId,
  supabase,
  changesSince: "last-sync",
  fieldCreatedAt: "created_at",
  fieldUpdatedAt: "updated_at",
  fieldDeleted: "is_deleted",
});

const selectFunction = (from: any) => from.select("*");

export function isCloudSyncActive() {
  const hasUser = getCurrentUserId(true) !== "guest";
  const isCloudEnabled = settings$.isSyncingToCloud.get();
  return hasUser && isCloudEnabled;
}

// The user's own recipes. Always kept on the device, and synced to the cloud
// only when cloud sync is on.
export const recipeStore$ = observable(
  customSynced({
    supabase,
    collection: "recipes",
    select: (from: any) =>
      selectFunction(from).eq("user_id", getCurrentUserId()),
    waitFor: () => isCloudSyncActive(),
    // waitFor only holds back the download. Without this, changes would keep
    // uploading after cloud sync is turned off. Changes made meanwhile stay
    // pending and upload once it's back on.
    waitForSet: () => when(() => isCloudSyncActive()),
    actions: ["read", "create", "update", "delete"],
    persist: {
      name: "recipes",
      retrySync: true,
    },
    retry: {
      infinite: true,
    },
  }),
);

export function isInTeam() {
  return getCurrentUserId(true) !== "guest" && team$.id.get() !== null;
}

// In a team but not uploading, so teammates can't see this user's recipes
export function isHiddenFromTeam() {
  return isInTeam() && !isCloudSyncActive();
}

// Teammates' recipes, download-only so it works without cloud sync (a free
// member can see the team's recipes but not share their own). RLS limits the
// rows to the caller's team.
export const teamRecipeStore$ = observable(
  customSynced({
    supabase,
    collection: "recipes",
    select: (from: any) =>
      selectFunction(from).neq("user_id", getCurrentUserId()),
    waitFor: () => isInTeam(),
    actions: ["read"],
    persist: {
      name: "team_recipes",
    },
    retry: {
      infinite: true,
    },
  }),
);

/**
 * Own recipes from the store. Before the stores were split, teammates'
 * recipes were cached here too, and they can't be removed locally without
 * the sync trying to delete them on the server, so they are skipped instead.
 */
export function getOwnRecipes(): Recipe[] {
  const currentUser = getCurrentUserId(true);
  const recipes = Object.values(recipeStore$.get() || {}) as Recipe[];
  return recipes.filter(
    (item) =>
      item != null &&
      (item.user_id === currentUser || item.user_id === "guest"),
  );
}

export function getTeamRecipes(): Recipe[] {
  const recipes = Object.values(teamRecipeStore$.get() || {}) as Recipe[];
  // A full fetch sets the rows as one object, which leaves Legend-State's
  // delete marker (a symbol) in place of every deleted recipe it returns
  return recipes.filter((item) => item != null && typeof item === "object");
}

export function addRecipe(userId: string, recipe: Recipe) {
  const id = generateId();

  logger.info("RECIPE_CREATION_STARTED", {
    userId: userId,
    id: id,
  });

  recipeStore$[id].assign({
    id: id,
    user_id: userId,
    name: recipe.name,
    description: recipe.description,
    image: recipe.image,
    prep_time: recipe.prep_time,
    difficulty: recipe.difficulty,
    category: recipe.category,
    servings: recipe.servings,
    tags: recipe.tags,
    ingredients: recipe.ingredients,
    instructions: recipe.instructions,
    is_public: recipe.is_public,
  });

  logger.info("RECIPE_CREATION_SUCCESS", {
    userId: userId,
    id: id,
  });
}

export function updateRecipe(id: string, recipe: Recipe) {
  logger.info("RECIPE_UPDATE_STARTED", {
    userId: recipe.user_id,
    id: id,
  });

  recipeStore$[id].assign({
    name: recipe.name,
    description: recipe.description,
    image: recipe.image,
    prep_time: recipe.prep_time,
    difficulty: recipe.difficulty,
    category: recipe.category,
    servings: recipe.servings,
    tags: recipe.tags,
    ingredients: recipe.ingredients,
    instructions: recipe.instructions,
    is_public: recipe.is_public,
  });

  logger.info("RECIPE_UPDATE_SUCCESS", {
    userId: recipe.user_id,
    id: id,
  });
}

export function deleteRecipe(id: string) {
  const userId = recipeStore$[id].user_id.peek();
  const image = recipeStore$[id].image.peek();

  logger.info("RECIPE_DELETION_STARTED", {
    userId: userId,
    id: id,
  });

  recipeStore$[id].delete();
  if (image) removeRecipeImage(image);

  logger.info("RECIPE_DELETION_SUCCESS", {
    userId: userId,
    id: id,
  });
}

export function migrateToLoggedUser(userId: string) {
  const rawStore = recipeStore$.peek() || {};

  Object.keys(rawStore).forEach((id) => {
    if (id.startsWith("_")) return;

    const currentUserId = recipeStore$[id].user_id.peek();
    if (currentUserId === "guest" || !currentUserId) {
      logger.info("RECIPE_MIGRATION_TO_USER", {
        from_user_id: recipeStore$[id].user_id.peek(),
        id: id,
      });
      recipeStore$[id].assign({ user_id: userId });
    }
  });
}

/**
 * Ids of own recipes with changes that haven't reached the server: queued
 * saves and images still kept on the device.
 */
export function getUnsyncedRecipeIds() {
  const pending = syncState(recipeStore$).getPendingChanges() || {};
  // Keys are paths like "<id>" or "<id>/name"
  const ids = new Set(Object.keys(pending).map((path) => path.split("/")[0]));
  for (const recipe of getOwnRecipes()) {
    if (recipe.image && isLocalImage(recipe.image)) ids.add(recipe.id);
  }
  return ids;
}

export function countUnsyncedRecipes() {
  return getUnsyncedRecipeIds().size;
}

/**
 * Whether each recipe is saved in the cloud, re-rendering as uploads finish.
 * Teammates' recipes come from the cloud. Without cloud sync nothing of the
 * user's own is in it.
 */
export function useIsInCloud() {
  const unsyncedKey = useSelector(() => {
    if (!isCloudSyncActive()) return null;
    // Re-read when recipes change, when their changes are queued for upload
    // (even offline, before any upload starts), and when uploads finish
    recipeStore$.get();
    metadataSaves$.get();
    syncState(recipeStore$).numPendingSets.get();
    return [...getUnsyncedRecipeIds()].sort().join(",");
  });
  const userId = useSelector(() => getCurrentUserId(true));
  // Kept while nothing changes, so lists re-render only when it does
  return useMemo(() => {
    const unsynced = new Set(unsyncedKey ? unsyncedKey.split(",") : []);
    return (recipe: Recipe) => {
      const isOwn = recipe.user_id === userId || recipe.user_id === "guest";
      if (!isOwn) return true;
      return unsyncedKey !== null && !unsynced.has(recipe.id);
    };
  }, [unsyncedKey, userId]);
}

/**
 * Whether any own recipe changes are queued for upload. Each one may have an
 * upload waiting in memory for cloud sync, which clearing the store doesn't
 * cancel.
 */
export function hasPendingChanges() {
  const pending = syncState(recipeStore$).getPendingChanges() || {};
  return Object.keys(pending).length > 0;
}

// Set while a logout clears the device, so a clear cut short (the app closed
// or crashed in the middle of it) finishes on next launch
const CLEAR_PENDING_KEY = "local_recipes_clear_pending";

export async function markLocalRecipesForClearing() {
  await AsyncStorage.setItem(CLEAR_PENDING_KEY, "true");
}

export async function unmarkLocalRecipesForClearing() {
  await AsyncStorage.removeItem(CLEAR_PENDING_KEY);
}

async function resetStore(store$: typeof recipeStore$) {
  // Reading the store first would load it before its saved data is in MMKV
  await whenStorageMigrated();
  const state$ = syncState(store$);
  // reset() only works once the store is active and its cache has loaded
  store$.peek();
  await when(state$.isPersistLoaded);
  await state$.reset();
}

/**
 * Removes all recipes and images from the device without touching the
 * server, including changes that haven't synced, so the next account on the
 * device starts clean and never uploads the previous one's changes. Call
 * after logging out so nothing syncs meanwhile.
 */
export async function clearLocalRecipes() {
  await resetStore(recipeStore$);
  await resetStore(teamRecipeStore$);
  removeAllLocalImages();
  // Synced and team images are cached by expo-image
  await Image.clearDiskCache();
  await AsyncStorage.removeItem(DOWNLOAD_CHECKED_KEY);
  await unmarkLocalRecipesForClearing();
  logger.info("LOCAL_RECIPES_CLEARED");
}

AsyncStorage.getItem(CLEAR_PENDING_KEY).then((value) => {
  if (!value) return;
  logger.info("LOCAL_RECIPES_CLEAR_RESUMED");
  clearLocalRecipes().catch((error) =>
    logger.error("LOCAL_RECIPES_CLEAR_FAILED", error),
  );
});

let isUploadingPendingImages = false;

/**
 * Recipes created offline or as a guest keep their image as a file on the
 * device. Once cloud sync is active, move those images to Storage.
 */
export async function uploadPendingImages() {
  if (isUploadingPendingImages || !isCloudSyncActive()) return;
  isUploadingPendingImages = true;

  try {
    const userId = getCurrentUserId();
    const rawStore = recipeStore$.peek() || {};

    for (const [id, recipe] of Object.entries(rawStore)) {
      if (!recipe || recipe.user_id !== userId) continue;
      // Kept apart: recipe is the store's raw object, so setting the image
      // below changes recipe.image too
      const localImage = recipe.image;
      if (!localImage || !isLocalImage(localImage)) continue;

      try {
        const path = await uploadRecipeImage(userId, localImage);
        recipeStore$[id].image.set(path);
        removeRecipeImage(localImage);
      } catch {
        // Keep the local image, it will be retried on the next launch
      }
    }
  } finally {
    isUploadingPendingImages = false;
  }
}

/**
 * Download all of the user's recipes, ignoring lastSync. Merges into the
 * store instead of clearing it, so recipes that haven't uploaded yet stay.
 */
export function resyncRecipes() {
  if (!isCloudSyncActive()) return;
  logger.info("RECIPES_FULL_RESYNC");
  const state$ = syncState(recipeStore$);
  // Clearing lastSync makes the next fetch a full one. When nothing observes
  // the store, sync() is deferred, and the deferred fetch is full too.
  state$.lastSync.set(undefined);
  state$.sync();
}

// The user whose recipes were all found on the device, so the check below
// doesn't run on every launch
const DOWNLOAD_CHECKED_KEY = "recipes_download_checked_user";

/**
 * lastSync outlives logins and app reloads, so once it moves past recipes
 * that never reached this device (a reload in the middle of the first
 * download, another account used before), incremental sync never fetches
 * them. Compares the ids on the server with the local ones and downloads
 * everything if any are missing. Runs until one check finds nothing missing,
 * after that incremental sync keeps up.
 */
async function ensureAllRecipesDownloaded() {
  const userId = getCurrentUserId();
  if ((await AsyncStorage.getItem(DOWNLOAD_CHECKED_KEY)) === userId) return;

  const { data, error } = await supabase
    .from("recipes")
    .select("id")
    .eq("user_id", userId)
    .eq("is_deleted", false);
  if (error) throw error;

  const localRecipes = recipeStore$.peek() || {};
  const missingCount = data.filter((row) => !localRecipes[row.id]).length;
  if (missingCount === 0) {
    await AsyncStorage.setItem(DOWNLOAD_CHECKED_KEY, userId);
    return;
  }

  logger.info("RECIPES_MISSING_LOCALLY", { count: missingCount });
  resyncRecipes();
}

/**
 * Drop the cached team recipes and fetch them again. Needed when team
 * membership changes: a new member's older recipes are not picked up by
 * incremental sync, and a departed member's recipes have to be dropped.
 * The store is read-only, so resetting it never touches the server.
 */
async function resyncTeamRecipes() {
  logger.info("TEAM_RECIPES_FULL_RESYNC");
  await whenStorageMigrated();
  const state$ = syncState(teamRecipeStore$);
  // reset() only works once the store is active and its cache has loaded
  // (it throws before that, e.g. when the team loads right after launch)
  teamRecipeStore$.peek();
  await when(state$.isPersistLoaded);
  await state$.reset();
  if (isInTeam()) state$.sync();
}

/**
 * Teammates' recipes deleted from the server for good (their cloud copy was
 * deleted, or a deletion older than 30 days) never come up in incremental
 * sync. Fetches the team's recipes again if any cached one is gone.
 */
async function ensureTeamRecipesCurrent() {
  const { data, error } = await supabase
    .from("recipes")
    .select("id")
    .neq("user_id", getCurrentUserId())
    .eq("is_deleted", false);
  if (error) throw error;

  const onServer = new Set(data.map((row) => row.id));
  const goneCount = getTeamRecipes().filter(
    (recipe) => !onServer.has(recipe.id),
  ).length;
  if (goneCount === 0) return;

  logger.info("TEAM_RECIPES_GONE_FROM_SERVER", { count: goneCount });
  await resyncTeamRecipes();
}

// Offline, the fetch retries forever, so stop waiting on it after this long
const REFRESH_TIMEOUT_MS = 15000;

async function syncAndWait(store$: typeof recipeStore$) {
  const state$ = syncState(store$);
  // sync() resolves once the fetch starts, not when it lands
  await state$.sync();
  await when(() => !state$.isGetting.get());
}

/**
 * Pull to refresh: reloads the team, then fetches what changed since the last
 * sync in both stores. Never throws, so the caller's spinner always stops.
 */
export async function refreshRecipes() {
  logger.info("RECIPES_REFRESH_STARTED");
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const refresh = async () => {
      if (getCurrentUserId(true) !== "guest") await refreshTeam();
      const syncs = [];
      if (isCloudSyncActive()) syncs.push(syncAndWait(recipeStore$));
      if (isInTeam()) {
        syncs.push(
          ensureTeamRecipesCurrent().then(() => syncAndWait(teamRecipeStore$)),
        );
      }
      await Promise.all(syncs);
    };
    const timedOut = new Promise<never>((_, reject) => {
      timeout = setTimeout(
        () => reject(new Error("Refresh timed out")),
        REFRESH_TIMEOUT_MS,
      );
    });
    await Promise.race([refresh(), timedOut]);
  } catch (error) {
    logger.error("RECIPES_REFRESH_FAILED", error);
  } finally {
    clearTimeout(timeout);
  }
}

// Columns the app writes, the rest are set by the server
const toRecipeRow = (recipe: Recipe) => ({
  id: recipe.id,
  user_id: recipe.user_id,
  name: recipe.name,
  description: recipe.description,
  image: recipe.image,
  prep_time: recipe.prep_time,
  difficulty: recipe.difficulty,
  category: recipe.category,
  servings: recipe.servings,
  tags: recipe.tags,
  ingredients: recipe.ingredients,
  instructions: recipe.instructions,
  is_public: recipe.is_public,
  is_deleted: false,
});

/**
 * The cloud copy is deleted 30 days after cloud sync is turned off or premium
 * ends. Once it's back on, uploads the device's recipes and images again.
 * Recipes that never reached the cloud are still queued as new and upload on
 * their own. Safe to run again if cut short: the server only forgets the
 * deletion once everything is uploaded.
 */
async function restoreCloudCopyIfPurged() {
  const { data: isPurged, error } = await supabase.rpc("my_cloud_copy_purged");
  if (error) throw error;
  if (!isPurged) return;

  const userId = getCurrentUserId();
  const recipes = getOwnRecipes().filter(
    (recipe) =>
      recipe.user_id === userId &&
      (recipe as Recipe & { created_at?: string }).created_at,
  );
  logger.info("CLOUD_COPY_RESTORE_STARTED", { count: recipes.length });

  for (const recipe of recipes) {
    const path = recipe.image ? storagePath(recipe.image) : null;
    // Storage only takes uploads to the user's own folder
    if (!path || !path.startsWith(`${userId}/`)) continue;
    const isRestored = await restoreImageToStorage(recipe.image);
    if (!isRestored) logger.warn("CLOUD_IMAGE_LOST", { id: recipe.id });
  }

  if (recipes.length > 0) {
    const { error: upsertError } = await supabase
      .from("recipes")
      .upsert(recipes.map(toRecipeRow), { defaultToNull: false });
    if (upsertError) throw upsertError;
  }

  const { error: clearError } = await supabase.rpc(
    "clear_my_cloud_copy_purged",
  );
  if (clearError) throw clearError;
  logger.info("CLOUD_COPY_RESTORED", { count: recipes.length });
}

// How long to wait before trying again after a failure, e.g. offline
const CLOUD_CHECK_RETRY_MS = 30000;

async function onCloudSyncActive() {
  const userId = getCurrentUserId();
  // Uploads are refused until the server knows the user is premium
  await when(premium$.isServerSynced);
  if (!isCloudSyncActive() || getCurrentUserId() !== userId) return;

  try {
    await restoreCloudCopyIfPurged();
    await ensureAllRecipesDownloaded();
    // The cloud has every image again
    removeKeptImages();
  } catch (error) {
    logger.error("RECIPES_CLOUD_CHECK_FAILED", error);
    setTimeout(() => {
      if (isCloudSyncActive() && getCurrentUserId() === userId) {
        onCloudSyncActive();
      }
    }, CLOUD_CHECK_RETRY_MS);
  }
}

let isKeepingImages = false;

/**
 * While cloud sync is off, keeps a copy of the user's images in Storage on
 * the device, so they survive the cloud copy being deleted. Runs when it's
 * turned off and on every launch, to catch up on what failed (e.g. offline).
 */
async function keepCloudImagesOnDevice() {
  if (isKeepingImages) return;
  isKeepingImages = true;
  const userId = getCurrentUserId();
  let failedCount = 0;

  try {
    for (const recipe of getOwnRecipes()) {
      // Turned back on or logged out meanwhile
      if (isCloudSyncActive() || getCurrentUserId() !== userId) return;
      if (!recipe.image) continue;
      try {
        await keepImageOnDevice(
          recipe.image,
          auth$.session.peek()?.access_token,
        );
      } catch {
        failedCount++;
      }
    }
    if (failedCount > 0) {
      logger.warn("KEEP_CLOUD_IMAGES_FAILED", { count: failedCount });
    }
  } finally {
    isKeepingImages = false;
  }
}

// Recipes created as a guest belong to whoever logs in on the device. Runs on
// every launch too, so recipes a login or registration missed aren't left as
// guest forever (they never upload while their user_id is "guest").
observe(() => {
  const isPersistLoaded = syncState(recipeStore$).isPersistLoaded.get();
  const userId = getCurrentUserId(true);
  if (isPersistLoaded && userId !== "guest") migrateToLoggedUser(userId);
});

// Runs on launch and again after every login once cloud sync is on
let wasCloudSyncActive = false;
observe(() => {
  const state$ = syncState(recipeStore$);
  const isPersistLoaded = state$.isPersistLoaded.get();
  const isActive = isCloudSyncActive();
  const turnedOn = isActive && !wasCloudSyncActive;
  wasCloudSyncActive = isActive;
  if (!isPersistLoaded || !isActive) return;

  // waitFor starts the first fetch. Turned back on after that, fetch what
  // changed on the server while it was off.
  if (turnedOn && state$.isLoaded.peek()) state$.sync();
  onCloudSyncActive();
});

// Logged in with cloud sync off
observe(() => {
  const isPersistLoaded = syncState(recipeStore$).isPersistLoaded.get();
  const userId = getCurrentUserId(true);
  if (isPersistLoaded && userId !== "guest" && !isCloudSyncActive()) {
    keepCloudImagesOnDevice();
  }
});

// Storage rejects uploads until the server knows the user is premium, so
// pending images wait for the premium check that runs on launch and login
observe(() => {
  const isPersistLoaded = syncState(recipeStore$).isPersistLoaded.get();
  const isServerSynced = premium$.isServerSynced.get();
  if (isPersistLoaded && isServerSynced && isCloudSyncActive()) {
    uploadPendingImages();
  }
});

// Resync team recipes when the user's team or its members change
let previousTeamKey: string | undefined;
observe(() => {
  const memberIds = team$.members.get().map((member) => member.user_id);
  const teamKey = [team$.id.get(), team$.host_id.get(), ...memberIds.sort()]
    .filter(Boolean)
    .join(",");
  if (previousTeamKey !== undefined && teamKey !== previousTeamKey) {
    resyncTeamRecipes();
  }
  previousTeamKey = teamKey;
});

// Once per launch and team, when there are cached team recipes to check
let checkedTeamKey: string | undefined;
observe(() => {
  const isPersistLoaded = syncState(teamRecipeStore$).isPersistLoaded.get();
  if (!isPersistLoaded || !isInTeam()) return;
  const teamKey = `${getCurrentUserId()}:${team$.id.peek()}`;
  if (teamKey === checkedTeamKey) return;
  checkedTeamKey = teamKey;
  ensureTeamRecipesCurrent().catch((error) =>
    logger.error("TEAM_RECIPES_CHECK_FAILED", error),
  );
});

// Drop cached team recipes left over from a team the user is no longer in.
// The watcher above misses a team deleted by its host while this device was
// away: the team never loads, so there is no change to react to.
observe(async () => {
  if (team$.inTeam.get() !== false) return;
  await whenStorageMigrated();
  teamRecipeStore$.peek();
  await when(syncState(teamRecipeStore$).isPersistLoaded);
  if (Object.keys(teamRecipeStore$.peek() || {}).length > 0) {
    resyncTeamRecipes();
  }
});

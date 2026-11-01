import { observable, when } from "@legendapp/state";
import { observablePersistMMKV } from "@legendapp/state/persist-plugins/mmkv";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ParseKeys } from "i18next";
import { createMMKV } from "react-native-mmkv";
import { logger } from "./logger";

// Recipes are kept in MMKV, which loads them right away on launch. AsyncStorage
// loads them asynchronously (the home screen waited on a spinner) and can't
// read a value over 2 MB on Android.
const MMKV_CONFIG = { id: "legend_state" };

export const persistPlugin = observablePersistMMKV(MMKV_CONFIG);

/**
 * Goes up each time a store's sync metadata is saved, which includes its
 * pending changes. Legend-State's pending changes aren't observable, and a
 * new one is added a moment after the store changes.
 */
export const metadataSaves$ = observable(0);

const setMetadata = persistPlugin.setMetadata.bind(persistPlugin);
persistPlugin.setMetadata = (table, metadata, config) => {
  const result = setMetadata(table, metadata, config);
  metadataSaves$.set((count) => count + 1);
  return result;
};

const storage = createMMKV(MMKV_CONFIG);

// Tables the recipe stores kept in AsyncStorage, and their sync metadata
const MIGRATED_TABLES = ["recipes", "team_recipes"].flatMap((table) => [
  table,
  `${table}__m`,
]);
const MIGRATED_FLAG = "migrated_from_async_storage";

const NOTICE_KEY = "pending_notice";

/** An alert to show on the next launch, as translation keys */
export type PendingNotice = { titleKey: ParseKeys; messageKey: ParseKeys };

/** For an alert that has to outlive a restart. Written before it happens. */
export const savePendingNotice = (notice: PendingNotice) =>
  storage.set(NOTICE_KEY, JSON.stringify(notice));

/** The saved notice, cleared so it's only shown once */
export const takePendingNotice = (): PendingNotice | null => {
  const saved = storage.getString(NOTICE_KEY);
  if (saved === undefined) return null;
  storage.remove(NOTICE_KEY);
  try {
    return JSON.parse(saved);
  } catch {
    return null;
  }
};

/** False until recipes saved in AsyncStorage are copied over to MMKV */
export const isStorageMigrated$ = observable(
  storage.getBoolean(MIGRATED_FLAG) === true,
);

/** Call before reading a recipe store, which loads from MMKV on first read */
export const whenStorageMigrated = () => when(isStorageMigrated$);

async function migrateFromAsyncStorage() {
  try {
    const values = await AsyncStorage.multiGet(MIGRATED_TABLES);
    for (const [key, value] of values) {
      if (value !== null) storage.set(key, value);
    }
    await AsyncStorage.multiRemove(MIGRATED_TABLES);
    logger.info("STORAGE_MIGRATED_TO_MMKV");
  } catch (error) {
    // Synced recipes download again. Not retried, a later copy would overwrite
    // what was saved in MMKV since.
    logger.error("STORAGE_MIGRATION_FAILED", error);
  } finally {
    storage.set(MIGRATED_FLAG, true);
    isStorageMigrated$.set(true);
  }
}

if (!isStorageMigrated$.peek()) migrateFromAsyncStorage();

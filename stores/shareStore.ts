import type { SharedImport } from "@/utils/recipeImport";
import { observable } from "@legendapp/state";

// What another app shared, or an empty one from the create menu, until the
// new recipe screen opens the import with it. Never saved: a share is acted on
// now or dropped.
export const pendingShare$ = observable<SharedImport | null>(null);

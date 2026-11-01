import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { timingSafeEqual } from "node:crypto";
import { internalErrorResponse } from "../_shared/errors.ts";

const BUCKET = "recipe-images";
// Storage removes at most this many objects per call
const PAGE_SIZE = 1000;

const PURGE_AUTH = Deno.env.get("PURGE_AUTH");

const isAuthorized = (header: string | null) => {
  if (!PURGE_AUTH || !header) return false;
  const expected = new TextEncoder().encode(PURGE_AUTH);
  const received = new TextEncoder().encode(header);
  return expected.length === received.length &&
    timingSafeEqual(expected, received);
};

// Called once a day by pg_cron (the purge_orphan_images job). Removes images
// no recipe points to: the app removes them itself, but only best-effort, so
// a failed removal or a purged recipe leaves them in the bucket.
export default {
  fetch: withSupabase({ auth: "none" }, async (req, ctx) => {
    if (!isAuthorized(req.headers.get("Authorization"))) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      const storage = ctx.supabaseAdmin.storage.from(BUCKET);
      let removedCount = 0;

      while (true) {
        const { data, error: listError } = await ctx.supabaseAdmin.rpc(
          "list_orphan_recipe_images",
          { p_limit: PAGE_SIZE },
        );
        if (listError) throw listError;
        const paths = data as string[] | null;
        if (!paths || paths.length === 0) break;

        const { data: removed, error: removeError } = await storage.remove(
          paths,
        );
        if (removeError) throw removeError;
        // Listing again would return the same images forever
        if (!removed || removed.length === 0) {
          throw new Error("Storage listed images it couldn't remove");
        }
        removedCount += removed.length;
        if (paths.length < PAGE_SIZE) break;
      }

      console.log(`purge-images removed ${removedCount} images`);
      return Response.json({ success: true, removed: removedCount });
    } catch (err) {
      return internalErrorResponse("purge-images", err);
    }
  }),
};

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { Database } from "./database.types";
import { assertE2EBackend, IS_E2E } from "./e2e";
import { logger } from "./logger";

const LOCAL_URL = process.env.EXPO_PUBLIC_SUPABASE_LOCAL_URL ||
  "http://127.0.0.1:54321";

const LOCAL_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_LOCAL_KEY ||
  "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";

// Dev builds talk to the local stack unless EXPO_PUBLIC_USE_PROD=1. E2E
// builds always do.
const useLocal = IS_E2E ||
  (__DEV__ && process.env.EXPO_PUBLIC_USE_PROD !== "1");

export const supabaseUrl = useLocal ? LOCAL_URL : process.env.EXPO_PUBLIC_SUPABASE_URL!;
export const supabasePublishableKey = useLocal
  ? LOCAL_PUBLISHABLE_KEY
  : process.env.EXPO_PUBLIC_SUPABASE_KEY!;

if (IS_E2E) assertE2EBackend(supabaseUrl);

// Log which Supabase a dev build is talking to
if (__DEV__) logger.info("SUPABASE_URL", { url: supabaseUrl });

export const supabase = createClient<Database>(
  supabaseUrl,
  supabasePublishableKey,
  {
    auth: {
      storage: AsyncStorage as any,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

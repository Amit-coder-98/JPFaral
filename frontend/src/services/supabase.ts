import { createClient } from "@supabase/supabase-js";
import { configuration, isMock } from "./config";
export const supabase =
  !isMock && !configuration.error
    ? createClient(configuration.url, configuration.key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

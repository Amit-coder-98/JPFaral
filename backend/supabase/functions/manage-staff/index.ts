import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { createManageStaffHandler } from "../_shared/manageStaff.ts";
const url = Deno.env.get("SUPABASE_URL");
const publicKey = Deno.env.get("SUPABASE_ANON_KEY");
const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const origin = Deno.env.get("APP_ORIGIN");
if (!url || !publicKey || !secret || !origin)
  throw new Error("Required Edge Function configuration is missing.");
const publicOrigin = new URL(origin).origin;
Deno.serve(
  createManageStaffHandler({
    appOrigin: publicOrigin,
    userClient: (token) =>
      createClient(url, publicKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      }),
    adminClient: () =>
      createClient(url, secret, {
        auth: { persistSession: false, autoRefreshToken: false },
      }),
  }),
);

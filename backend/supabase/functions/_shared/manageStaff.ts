import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.3";
type Dependencies = {
  userClient: (token: string) => SupabaseClient;
  adminClient: () => SupabaseClient;
  appOrigin: string;
};
export function createManageStaffHandler(deps: Dependencies) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("Origin");
    const cors: Record<string, string> = {
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "authorization, apikey, content-type, x-client-info",
      Vary: "Origin",
    };
    if (origin === deps.appOrigin) cors["Access-Control-Allow-Origin"] = origin;
    const respond = (status: number, body: unknown) =>
      Response.json(body, { status, headers: cors });
    if (origin && origin !== deps.appOrigin)
      return respond(403, { error: "Origin is not allowed." });
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return respond(405, { error: "Use POST." });
    const auth = request.headers.get("Authorization");
    if (!auth?.startsWith("Bearer "))
      return respond(401, { error: "Authentication is required." });
    try {
      const userClient = deps.userClient(auth.slice(7));
      const { data: identity, error: authError } =
        await userClient.auth.getUser(auth.slice(7));
      if (authError || !identity.user)
        return respond(401, { error: "Your session is invalid or expired." });
      const { data: caller, error: profileError } = await userClient
        .from("profiles")
        .select("role, active")
        .eq("id", identity.user.id)
        .single();
      if (profileError || !caller?.active || caller.role !== "super_admin")
        return respond(403, {
          error: "An active Super Admin account is required.",
        });
      // Create the privileged client only after verified caller authorization.
      const body = await request.json();
      if (
        !body ||
        typeof body.name !== "string" ||
        body.name.trim().length < 2 ||
        body.name.trim().length > 120 ||
        typeof body.email !== "string" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) ||
        typeof body.active !== "boolean"
      )
        return respond(400, {
          error: "Valid name, email, and account status are required.",
        });
      if (body.operation === "create") {
        if (!["staff","super_admin"].includes(body.role) || !body.active)
          return respond(400, {
            error: "Choose Admin or Data Entry Staff for an active new account.",
          });
        if(typeof body.password!=="string" || body.password.length<12)
          return respond(400,{error:"Password must contain at least 12 characters."});
        if(new TextEncoder().encode(body.password).length>72)
          return respond(400,{error:"Password must be no more than 72 bytes."});
        if(typeof body.confirmPassword!=="string" || body.password!==body.confirmPassword)
          return respond(400,{error:"Passwords do not match."});
        const admin = deps.adminClient();
        const { data: creation, error } =
          await admin.auth.admin.createUser({
            email:body.email.trim().toLowerCase(),password:body.password,email_confirm:true,
            user_metadata: { full_name: body.name.trim() },
          });
        if (error || !creation.user) {
          if(error && ["email_exists","user_already_exists"].includes(error.code??""))
            return respond(409,{error:"This email already has an account. Use the existing user profile."});
          return respond(400,{error:error?.code==="weak_password" ? "This password does not meet the project's password rules." : "The account could not be created. Check the email and password and try again."});
        }
        const { error: provisionError } = await userClient.rpc(
          "admin_update_profile",
          {
            p_id: creation.user.id,
            p_name: body.name,
            p_role: body.role,
            p_active: true,
          },
        );
        if (provisionError) {
          // Auth + PostgreSQL are separate transactions. Fail closed and compensate.
          const cleanup=await admin.auth.admin.deleteUser(creation.user.id);
          return respond(409, {
            error: cleanup.error ? "The account could not be activated and cleanup did not finish. Review the existing account before retrying."
              : "The account could not be activated and was removed. Check administrator access and try again.",
          });
        }
        return respond(201, { id: creation.user.id, created: true });
      }
      if(body.operation==="invite") return respond(400,{error:"Invitations have been replaced. Refresh the app and use Create user with a password."});
      if (body.operation === "update") {
        if (
          typeof body.id !== "string" ||
          !/^[0-9a-f-]{36}$/i.test(body.id) ||
          !["staff", "super_admin"].includes(body.role)
        )
          return respond(400, {
            error: "A valid staff identity and role are required.",
          });
        const { data: target, error } = await userClient
          .from("profiles")
          .select("email")
          .eq("id", body.id)
          .single();
        if (error || !target)
          return respond(404, { error: "Staff account not found." });
        if (target.email.toLowerCase() !== body.email.trim().toLowerCase())
          return respond(400, {
            error:
              "Email changes must be confirmed through the account's own profile.",
          });
        const { error: updateError } = await userClient.rpc(
          "admin_update_profile",
          {
            p_id: body.id,
            p_name: body.name,
            p_role: body.role,
            p_active: body.active,
          },
        );
        if (updateError) return respond(400, { error: updateError.message });
        return respond(200, { updated: true });
      }
      return respond(400, { error: "Unknown staff operation." });
    } catch {
      return respond(400, { error: "Unable to process this staff request." });
    }
  };
}

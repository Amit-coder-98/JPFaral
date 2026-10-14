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
      if (body.operation === "invite") {
        if (body.role !== "staff" || !body.active)
          return respond(400, {
            error: "New invitations must create active staff accounts.",
          });
        const admin = deps.adminClient();
        const { data: invitation, error } =
          await admin.auth.admin.inviteUserByEmail(body.email.trim(), {
            data: { full_name: body.name.trim() },
            redirectTo: deps.appOrigin + "/auth/setup",
          });
        if (error || !invitation.user)
          return respond(400, {
            error:
              "Invitation could not be created. Check whether the email is already registered and whether email delivery is configured.",
          });
        const { error: provisionError } = await userClient.rpc(
          "admin_update_profile",
          {
            p_id: invitation.user.id,
            p_name: body.name,
            p_role: "staff",
            p_active: true,
          },
        );
        if (provisionError) {
          // Auth + PostgreSQL are separate transactions. Fail closed and compensate.
          await admin.auth.admin.deleteUser(invitation.user.id);
          return respond(409, {
            error:
              "The invitation could not be provisioned. The account remains disabled or was removed. Retry after checking administrator access.",
          });
        }
        return respond(201, { id: invitation.user.id, invited: true });
      }
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

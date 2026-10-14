export function readConfiguration(env: Record<string, unknown>) {
  const mode = String(env.VITE_DATA_MODE ?? "supabase");
  if (mode === "mock")
    return {
      mode: "mock" as const,
      error: env.PROD
        ? "Mock data is disabled in production. Configure Supabase."
        : "",
      url: "",
      key: "",
    };
  const url = String(env.VITE_SUPABASE_URL ?? "").trim();
  const key = String(env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "").trim();
  let error = "";
  if (mode !== "supabase") error = "VITE_DATA_MODE must be supabase or mock.";
  else if (!url || !key || /YOUR_|placeholder|example/i.test(url + key))
    error =
      "Configure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in frontend/.env.local, then restart the app.";
  else {
    try {
      const parsed = new URL(url);
      if (
        parsed.protocol !== "https:" &&
        !(
          parsed.protocol === "http:" &&
          ["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname)
        )
      )
        throw new Error();
      if (
        parsed.username ||
        parsed.password ||
        parsed.search ||
        parsed.hash ||
        parsed.pathname !== "/"
      )
        throw new Error();
    } catch {
      error =
        "Enter a valid HTTPS Supabase project URL (HTTP is allowed for localhost).";
    }
    if (key.startsWith("sb_secret_"))
      error =
        "A server secret cannot be used in browser configuration. Use a publishable key.";
    else if (!key.startsWith("sb_publishable_")) {
      try {
        if (JSON.parse(atob(key.split(".")[1])).role !== "anon")
          throw new Error();
      } catch {
        error =
          "Use a Supabase publishable key or legacy anon key. Privileged keys are forbidden.";
      }
    }
  }
  return { mode: "supabase" as const, error, url, key };
}
export const configuration = readConfiguration(import.meta.env);
export const isMock = configuration.mode === "mock" && import.meta.env.DEV;

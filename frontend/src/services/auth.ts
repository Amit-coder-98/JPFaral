import { supabase } from "./supabase";
export async function requestPasswordReset(email: string) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/setup`,
  });
  if (error) throw new Error(error.message);
}
export async function setPassword(password: string) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(error.message);
}
export async function changePassword(
  email: string,
  current: string,
  next: string,
) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: current,
  });
  if (error) throw new Error("Current password is incorrect.");
  await setPassword(next);
}

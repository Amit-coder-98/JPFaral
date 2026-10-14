import { MockRepository } from "./mockRepository";
import { SupabaseRepository } from "./supabaseRepository";
import { isMock } from "./config";
import { supabase } from "./supabase";
import type { FrontendRepository } from "./contracts";
export { MockRepository } from "./mockRepository";
export type { FrontendRepository } from "./contracts";
export const repository: FrontendRepository = isMock
  ? new MockRepository()
  : new SupabaseRepository(supabase);

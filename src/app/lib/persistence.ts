import { hasDatabaseUrl } from "./prisma";
import { hasSupabaseAdminConfig } from "./supabase-admin";

export function hasPersistenceBackend() {
  return hasDatabaseUrl() || hasSupabaseAdminConfig();
}

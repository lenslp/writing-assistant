import { hasDatabaseUrl } from "./prisma";

export function hasPersistenceBackend() {
  return hasDatabaseUrl();
}

export function shouldUseSupabaseAdmin() {
  return false;
}

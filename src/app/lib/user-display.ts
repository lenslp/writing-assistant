import type { User } from "@supabase/supabase-js";

function readStringMetadata(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function getUserDisplayName(user: User | null | undefined, fallback = "公众号") {
  const metadata = user?.user_metadata ?? {};
  const metadataName =
    readStringMetadata(metadata.name) ||
    readStringMetadata(metadata.full_name) ||
    readStringMetadata(metadata.user_name) ||
    readStringMetadata(metadata.username);

  if (metadataName) return metadataName;

  const emailName = user?.email?.split("@")[0]?.trim();
  return emailName || fallback;
}

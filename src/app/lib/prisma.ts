import { PrismaClient } from "@prisma/client";

declare global {
  var __prisma__: PrismaClient | undefined;
}

export function hasDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  return Boolean(url && !url.includes("your-project.supabase.co") && !url.includes("[YOUR-PASSWORD]"));
}

export const prisma =
  global.__prisma__ ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__prisma__ = prisma;
}

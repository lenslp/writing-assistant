import "./node-localstorage-shim";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

declare global {
  var __supabaseAdmin__: SupabaseClient | undefined;
}

const SUPABASE_RETRYABLE_PATTERNS = [
  "fetch failed",
  "connect timeout",
  "timed out",
  "enotfound",
  "econnreset",
  "eai_again",
  "und_err",
] as const;

function getErrorText(error: unknown): string {
  if (error instanceof Error) {
    const cause =
      "cause" in error && error.cause
        ? ` ${getErrorText(error.cause)}`
        : "";
    return `${error.name} ${error.message}${cause}`.trim().toLowerCase();
  }

  return String(error).toLowerCase();
}

function isRetryableSupabaseError(error: unknown) {
  const text = getErrorText(error);
  return SUPABASE_RETRYABLE_PATTERNS.some((pattern) => text.includes(pattern));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(input: string | URL | Request, init?: RequestInit) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const request = input instanceof Request ? input.clone() : input;
      return await fetch(request, init);
    } catch (error) {
      lastError = error;

      if (!isRetryableSupabaseError(error) || attempt === 2) {
        throw error;
      }

      await sleep(400 * (attempt + 1));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Supabase request failed");
}

export function hasSupabaseAdminConfig() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getSupabaseAdmin() {
  if (!hasSupabaseAdminConfig()) {
    throw new Error("Supabase admin config is not available");
  }

  global.__supabaseAdmin__ ??= createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        fetch: fetchWithRetry as typeof fetch,
      },
    },
  );

  return global.__supabaseAdmin__;
}

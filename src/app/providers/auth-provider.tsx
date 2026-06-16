"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient, hasSupabaseBrowserEnv } from "../lib/supabase";

type AuthMode = "login" | "register";

type AuthContextValue = {
  authAvailable: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<{ needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

let supabaseClient: ReturnType<typeof createSupabaseBrowserClient> | null = null;
let authFetchPatched = false;
let currentAccessToken = "";

function getSupabaseClient() {
  if (!hasSupabaseBrowserEnv()) return null;
  supabaseClient ??= createSupabaseBrowserClient();
  return supabaseClient;
}

function normalizeAuthError(message: string) {
  if (/invalid login credentials/i.test(message)) return "邮箱或密码不正确。";
  if (/email not confirmed/i.test(message)) return "邮箱尚未完成验证，请先查看收件箱。";
  if (/user already registered|already been registered/i.test(message)) return "这个邮箱已经注册，请直接登录。";
  if (/password/i.test(message) && /six|6/i.test(message)) return "密码至少需要 6 位。";
  return "认证失败，请稍后重试。";
}

function isSameOriginApiRequest(input: RequestInfo | URL) {
  if (typeof window === "undefined") return false;

  const url = typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
  const target = new URL(url, window.location.origin);

  return target.origin === window.location.origin && target.pathname.startsWith("/api/");
}

function patchAuthenticatedFetch() {
  if (authFetchPatched || typeof window === "undefined") return;

  authFetchPatched = true;
  const nativeFetch = window.fetch.bind(window);

  window.fetch = (input, init = {}) => {
    if (!currentAccessToken || !isSameOriginApiRequest(input)) {
      return nativeFetch(input, init);
    }

    const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
    if (!headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${currentAccessToken}`);
    }

    return nativeFetch(input, {
      ...init,
      headers,
    });
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const authAvailable = hasSupabaseBrowserEnv();

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) {
      setLoading(false);
      return;
    }

    let mounted = true;

    client.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      currentAccessToken = data.session?.access_token ?? "";
      setLoading(false);
    });

    const { data: subscription } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      currentAccessToken = nextSession?.access_token ?? "";
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    patchAuthenticatedFetch();
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const client = getSupabaseClient();
    if (!client) throw new Error("Supabase 登录环境未配置。");

    const { error } = await client.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw new Error(normalizeAuthError(error.message));
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    const client = getSupabaseClient();
    if (!client) throw new Error("Supabase 登录环境未配置。");

    const { data, error } = await client.auth.signUp({
      email,
      password,
    });

    if (error) throw new Error(normalizeAuthError(error.message));

    return {
      needsEmailConfirmation: Boolean(data.user && !data.session),
    };
  }, []);

  const signOut = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client) return;

    const { error } = await client.auth.signOut();
    if (error) throw new Error(normalizeAuthError(error.message));
    setSession(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      authAvailable,
      loading,
      session,
      user: session?.user ?? null,
      signInWithEmail,
      signUpWithEmail,
      signOut,
    }),
    [authAvailable, loading, session, signInWithEmail, signOut, signUpWithEmail],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

export type { AuthMode };

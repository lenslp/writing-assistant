"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { AuthPage } from "./AuthPage";
import { Layout } from "./Layout";
import { AppStoreProvider } from "../providers/app-store";
import { useAuth } from "../providers/auth-provider";

function AppLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fffaf5]">
      <div className="rounded-2xl border border-[#eadfd4] bg-white/86 px-5 py-4 text-[13px] text-[#8c8178] shadow-[0_12px_36px_rgba(85,57,34,0.05)]">
        正在确认登录状态...
      </div>
    </main>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { loading, user } = useAuth();
  const isLoginPage = pathname === "/login";

  useEffect(() => {
    if (!loading && user && isLoginPage) {
      router.replace("/");
    }
  }, [isLoginPage, loading, router, user]);

  if (loading) {
    return <AppLoading />;
  }

  if (!user) {
    return <AuthPage />;
  }

  return (
    <AppStoreProvider>
      <Layout>{children}</Layout>
    </AppStoreProvider>
  );
}

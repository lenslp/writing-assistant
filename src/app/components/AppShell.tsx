"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Layout } from "./Layout";
import { AppStoreProvider } from "../providers/app-store";
import { useAuth } from "../providers/auth-provider";

function AppLoading() {
  return (
    <main className="lens-app-surface flex min-h-screen items-center justify-center">
      <div className="lens-card px-5 py-4 text-[13px] text-muted-foreground">
        正在确认登录状态...
      </div>
    </main>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { loading, user } = useAuth();
  const isPublicPage = pathname === "/";
  const isLoginPage = pathname === "/login";
  const isPublicRoute = isPublicPage || isLoginPage;

  useEffect(() => {
    if (!loading && user && isLoginPage) {
      router.replace("/dashboard");
    }

    if (!loading && !user && !isPublicRoute) {
      router.replace("/login");
    }
  }, [isLoginPage, isPublicRoute, loading, router, user]);

  if (isPublicRoute) {
    return children;
  }

  if (loading) {
    return <AppLoading />;
  }

  if (!user) {
    return <AppLoading />;
  }

  return (
    <AppStoreProvider>
      <Layout>{children}</Layout>
    </AppStoreProvider>
  );
}

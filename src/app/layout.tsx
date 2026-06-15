import type { Metadata } from "next";
import "../styles/index.css";
import { AppThemeProvider } from "./components/AppThemeProvider";
import { AppShell } from "./components/AppShell";
import { Toaster } from "./components/ui/sonner";
import { AuthProvider } from "./providers/auth-provider";

export const metadata: Metadata = {
  title: "Lens Assistant",
  description: "AI写作助手",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <AppThemeProvider>
          <AuthProvider>
            <AppShell>{children}</AppShell>
            <Toaster richColors position="top-right" />
          </AuthProvider>
        </AppThemeProvider>
      </body>
    </html>
  );
}

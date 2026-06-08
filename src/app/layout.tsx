import type { Metadata } from "next";
import "../styles/index.css";
import { AppShell } from "./components/AppShell";
import { Toaster } from "./components/ui/sonner";
import { AuthProvider } from "./providers/auth-provider";

export const metadata: Metadata = {
  title: "写作助手",
  description: "基于 Figma Make 设计还原的写作助手后台。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <AuthProvider>
          <AppShell>{children}</AppShell>
          <Toaster richColors position="top-right" />
        </AuthProvider>
      </body>
    </html>
  );
}

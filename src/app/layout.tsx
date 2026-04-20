import type { Metadata } from "next";
import "../styles/index.css";
import { Layout } from "./components/Layout";
import { Toaster } from "./components/ui/sonner";
import { AppStoreProvider } from "./providers/app-store";

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
        <AppStoreProvider>
          <Layout>{children}</Layout>
          <Toaster richColors position="top-right" />
        </AppStoreProvider>
      </body>
    </html>
  );
}

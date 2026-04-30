"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Flame, BarChart3, Lightbulb, FileText, Settings,
  Search, Plus, PenTool, Palette, CheckCheck
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { domainConfigs } from "../lib/content-domains";
import { useAppStore } from "../providers/app-store";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "工作台" },
  { to: "/hot-topics", icon: Flame, label: "热点中心" },
  { to: "/article-analysis", icon: BarChart3, label: "爆文分析" },
  { to: "/topic-center", icon: Lightbulb, label: "选题中心" },
  { to: "/writing", icon: PenTool, label: "写作生成" },
  { to: "/format-editor", icon: Palette, label: "排版编辑" },
  { to: "/drafts", icon: FileText, label: "草稿箱" },
  { to: "/published", icon: CheckCheck, label: "发布管理" },
  { to: "/settings", icon: Settings, label: "设置" },
];

type LayoutProps = {
  children: ReactNode;
};

export function Layout({ children }: LayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { drafts, topics, settings, selectTopic } = useAppStore();
  const isFullWidth = pathname === "/writing" || pathname === "/format-editor";
  const [keyword, setKeyword] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const quickPages = useMemo(
    () => navItems.map((item) => ({ keyword: item.label, href: item.to })),
    [],
  );

  useEffect(() => {
    const handleKeyboardFocus = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyboardFocus);
    return () => window.removeEventListener("keydown", handleKeyboardFocus);
  }, []);

  const handleGlobalSearch = () => {
    const query = keyword.trim().toLowerCase();
    if (!query) return;

    const matchedDraft = drafts.find(
      (draft) => draft.title.toLowerCase().includes(query) || draft.topic.toLowerCase().includes(query),
    );
    if (matchedDraft) {
      router.push(`/writing?draftId=${matchedDraft.id}`);
      return;
    }

    const matchedTopic = topics.find(
      (topic) =>
        topic.title.toLowerCase().includes(query) ||
        topic.tags.some((tag) => tag.toLowerCase().includes(query)),
    );
    if (matchedTopic) {
      selectTopic(matchedTopic.id);
      router.push(`/topic-center?topicId=${matchedTopic.id}`);
      return;
    }

    const matchedPage = quickPages.find((page) => page.keyword.toLowerCase().includes(query));
    router.push(matchedPage?.href ?? "/topic-center");
    setKeyword("");
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#f7f8fa]">
      <aside className="w-[220px] min-w-[220px] bg-white border-r border-border flex flex-col">
        <div className="h-14 flex items-center px-5 border-b border-border">
          <PenTool className="w-5 h-5 text-blue-600 mr-2" />
          <span className="text-[15px] tracking-tight" style={{ fontWeight: 600 }}>写作助手</span>
        </div>
        <nav className="flex-1 py-3 px-3 space-y-0.5 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label }) => (
            <Link
              key={to}
              href={to}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors text-[13.5px] ${
                pathname === to
                  ? "bg-blue-50 text-blue-600"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
              style={{ fontWeight: 500 }}
            >
              <Icon className="w-[18px] h-[18px]" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-border">
          <div className="flex items-center gap-2.5 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-[12px]" style={{ fontWeight: 500 }}>
              {settings.accountName.slice(0, 1)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] truncate" style={{ fontWeight: 500 }}>{settings.accountName}</div>
              <div className="text-[11px] text-gray-400 truncate">
                {settings.contentAreas.slice(0, 2).map((domain) => `${domainConfigs[domain].icon}${domain}`).join(" / ")}
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-14 min-h-[56px] bg-white border-b border-border flex items-center px-5 gap-3">
          <div className="flex-1 max-w-md">
            <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5 border border-transparent focus-within:border-blue-200 focus-within:bg-white transition-colors">
              <Search className="w-4 h-4 text-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleGlobalSearch();
                  }
                }}
                placeholder="搜索热点、选题、草稿..."
                className="bg-transparent border-none outline-none text-[13px] w-full placeholder:text-gray-400"
              />
              <kbd className="hidden sm:inline text-[10px] text-gray-400 bg-gray-200 rounded px-1.5 py-0.5">⌘K</kbd>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/topic-center")}
              className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700 transition-colors text-[13px]"
              style={{ fontWeight: 500 }}
            >
              <Plus className="w-4 h-4" />
              新建文章
            </button>
          </div>
        </header>

        <main id="app-scroll-root" className={`flex-1 min-h-0 ${isFullWidth ? "overflow-hidden" : "overflow-auto p-6"}`}>
          {children}
        </main>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Flame, Lightbulb, FileText, Settings,
  Search, Plus, PenTool, LogOut
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAppStore } from "../providers/app-store";
import { useAuth } from "../providers/auth-provider";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "工作台" },
  { to: "/hot-topics", icon: Flame, label: "热点中心" },
  { to: "/topic-center", icon: Lightbulb, label: "选题中心" },
  { to: "/writing", icon: PenTool, label: "写作生成" },
  { to: "/drafts", icon: FileText, label: "草稿箱" },
  { to: "/settings", icon: Settings, label: "设置" },
];

type LayoutProps = {
  children: ReactNode;
};

export function Layout({ children }: LayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { drafts, topics, selectTopic } = useAppStore();
  const { user, signOut } = useAuth();
  const isFullWidth = pathname === "/writing";
  const [keyword, setKeyword] = useState("");
  const [signingOut, setSigningOut] = useState(false);
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

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      router.replace("/login");
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#fffaf5] text-[#181715]">
      <aside className="flex w-[232px] min-w-[232px] flex-col border-r border-[#eadfd4] bg-[#fff7ef]">
        <div className="flex h-16 items-center border-b border-[#eadfd4] px-5">
          <div className="mr-3 grid h-9 w-9 place-items-center rounded-2xl bg-[#d65f2b] text-white shadow-[0_12px_26px_rgba(214,95,43,0.2)]">
            <PenTool className="h-4.5 w-4.5" />
          </div>
          <div>
            <div className="text-[15px] tracking-tight text-[#181715]" style={{ fontWeight: 800 }}>写作助手</div>
            <div className="text-[11px] text-[#8c8178]">Creator Writing Desk</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {navItems.map(({ to, icon: Icon, label }) => (
            <Link
              key={to}
              href={to}
              className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13.5px] transition-colors ${
                pathname === to
                  ? "bg-[#fff0e6] text-[#d65f2b] shadow-sm"
                  : "text-[#6f665d] hover:bg-white/70 hover:text-[#181715]"
              }`}
              style={{ fontWeight: pathname === to ? 800 : 650 }}
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-[#eadfd4] p-3">
          <div className="flex items-center gap-2 rounded-2xl bg-white/60 px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] text-[#9a9086]">当前账号</div>
              <div className="truncate text-[12px] text-[#5d544c]">{user?.email ?? "未登录"}</div>
            </div>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={signingOut}
              aria-label="退出登录"
              title="退出登录"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[#8c8178] hover:bg-white hover:text-[#d65f2b] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="flex h-16 min-h-[64px] items-center gap-3 border-b border-[#eadfd4] bg-white/82 px-5 backdrop-blur">
          <div className="flex-1 max-w-md">
            <div className="flex items-center gap-2 rounded-xl border border-[#eadfd4] bg-[#fffaf5] px-3 py-2 transition-colors focus-within:border-[#d65f2b] focus-within:bg-white focus-within:ring-3 focus-within:ring-[#d65f2b]/15">
              <Search className="h-4 w-4 text-[#9a9086]" />
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
                className="w-full border-none bg-transparent text-[13px] text-[#181715] outline-none placeholder:text-[#9a9086]"
              />
              <kbd className="hidden rounded bg-[#f1eadf] px-1.5 py-0.5 text-[10px] text-[#8c8178] sm:inline">⌘K</kbd>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/topic-center")}
              className="flex items-center gap-1.5 rounded-xl bg-[#d65f2b] px-4 py-2 text-[13px] text-white shadow-[0_12px_26px_rgba(214,95,43,0.18)] transition-colors hover:bg-[#bf4513]"
              style={{ fontWeight: 800 }}
            >
              <Plus className="h-4 w-4" />
              新建文章
            </button>
          </div>
        </header>

        <main id="app-scroll-root" className={`min-h-0 flex-1 ${isFullWidth ? "overflow-hidden" : "overflow-auto p-6"}`}>
          {children}
        </main>
      </div>
    </div>
  );
}

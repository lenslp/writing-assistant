"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Flame, Lightbulb, FileText, Settings,
  Search, Plus, PenTool, LogOut, Bell, ChevronDown,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ThemeToggle } from "./ThemeToggle";
import { useAppStore } from "../providers/app-store";
import { useAuth } from "../providers/auth-provider";
import { getUserDisplayName } from "../lib/user-display";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "工作台" },
  { to: "/hot-topics", icon: Flame, label: "发现灵感" },
  { to: "/topic-center", icon: Lightbulb, label: "选题中心" },
  { to: "/writing", icon: PenTool, label: "创作中心" },
  { to: "/drafts", icon: FileText, label: "我的草稿" },
  { to: "/settings", icon: Settings, label: "设置中心" },
];

type LayoutProps = {
  children: ReactNode;
};

export function Layout({ children }: LayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { drafts, topics, selectTopic, settings } = useAppStore();
  const { user, signOut } = useAuth();
  const isFullWidth = pathname === "/writing" || pathname === "/format-editor";
  const [keyword, setKeyword] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const displayName = settings.accountName.trim() || getUserDisplayName(user, "用户");
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
    <div className="lens-app-surface fixed inset-0 flex overflow-hidden text-foreground">
      <div className="pointer-events-none absolute inset-0 opacity-80">
        <div className="absolute left-[260px] top-[-160px] h-[360px] w-[360px] rounded-full bg-primary/15 blur-[90px]" />
        <div className="absolute bottom-[-180px] right-[120px] h-[420px] w-[420px] rounded-full bg-sky-400/10 blur-[110px]" />
      </div>

      <aside className="relative z-10 flex w-[244px] min-w-[244px] flex-col border-r border-sidebar-border bg-sidebar/90 backdrop-blur-2xl">
        <div className="flex h-20 items-center border-b border-sidebar-border px-5">
          <div className="mr-3 grid h-11 w-11 place-items-center overflow-hidden rounded-2xl bg-white shadow-[0_16px_38px_rgba(111,92,255,0.18)] ring-1 ring-border/70">
            <img src="/brand-logo.png" alt="Lens Assistant" className="h-full w-full object-cover" />
          </div>
          <div>
            <div className="text-[16px] tracking-tight text-sidebar-foreground font-black">Lens Assistant</div>
            <div className="text-[11px] text-muted-foreground">AI写作助手</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-5">
          {navItems.map(({ to, icon: Icon, label }) => (
            <Link
              key={to}
              href={to}
              className={`group flex items-center gap-3 rounded-2xl px-3.5 py-3 text-[13.5px] transition-all ${
                pathname === to
                  ? "border border-primary/25 bg-primary/10 text-primary shadow-[0_12px_28px_rgba(111,92,255,0.14)] font-black"
                  : "border border-transparent text-muted-foreground hover:border-border hover:bg-card/70 hover:text-foreground font-bold"
              }`}
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-sidebar-border p-4">
          <div className="flex items-center gap-3 rounded-3xl border border-border bg-card/70 px-3 py-3 shadow-sm backdrop-blur">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[var(--brand-gradient)] text-[13px] text-white shadow-[0_12px_28px_rgba(111,92,255,0.25)] font-black">
              {displayName.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] text-foreground font-extrabold">{displayName}</div>
              <div className="truncate text-[11px] text-muted-foreground">{user?.email ?? "未登录"}</div>
            </div>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={signingOut}
              aria-label="退出登录"
              title="退出登录"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-20 min-h-[80px] items-center gap-3 border-b border-border bg-card/70 px-4 backdrop-blur-2xl xl:px-5">
          <div className="flex flex-1 items-center gap-3 max-w-2xl">
            <div className="flex-1 max-w-md">
              <div className="lens-input flex h-11 items-center gap-2 rounded-2xl px-3.5">
                <Search className="h-4 w-4 text-muted-foreground" />
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
                  placeholder="搜索选题、文章、灵感..."
                  className="w-full border-none bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
                />
                <kbd className="hidden rounded-lg bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">⌘K</kbd>
              </div>
            </div>
            <button
              onClick={() => router.push("/topic-center")}
              className="lens-btn-primary flex h-11 items-center gap-2 rounded-2xl px-4 text-[13px] font-black shrink-0"
            >
              <Plus className="h-4 w-4" />
              新建文章
              <ChevronDown className="h-3.5 w-3.5 opacity-80" />
            </button>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle compact />
            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-2xl border border-border bg-card/70 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:border-primary/35 hover:text-primary"
              aria-label="通知"
              title="通知"
            >
              <Bell className="h-4 w-4" />
            </button>
          </div>
        </header>

        <main
          id="app-scroll-root"
          className={`min-h-0 flex-1 overscroll-contain ${
            isFullWidth ? "overflow-hidden" : "overflow-x-hidden overflow-y-auto p-4 [scrollbar-gutter:stable] xl:p-5"
          }`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

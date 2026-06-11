"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  Flame,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  PenTool,
  Send,
  Sparkles,
  User,
} from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { useAuth } from "../providers/auth-provider";
import { getUserDisplayName } from "../lib/user-display";

const deskRows = [
  { title: "ChatGPT 更新后的创作者机会", source: "AI HOT", heat: "18,926", tag: "可写" },
  { title: "小红书搜索词正在改变笔记标题", source: "小红书", heat: "12,480", tag: "适配" },
  { title: "知识类账号如何做系列化内容", source: "知乎", heat: "9,814", tag: "长尾" },
];

export function PublicHome() {
  const { user, signOut } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [dropdownOpen]);

  const handleSignOut = async () => {
    await signOut();
    setDropdownOpen(false);
  };

  return (
    <main className="lens-app-surface min-h-screen overflow-hidden text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/88 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary text-white shadow-[0_12px_28px_rgba(111,92,255,0.22)]">
              <PenTool className="h-4.5 w-4.5" />
            </div>
            <div>
              <div className="text-[16px] leading-none" style={{ fontWeight: 850 }}>写作助手</div>
              <div className="mt-1 text-[11px] text-muted-foreground">Creator Writing Desk</div>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <ThemeToggle compact />
            {user ? (
              <div ref={dropdownRef} className="relative">
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] text-muted-foreground hover:bg-card hover:text-foreground"
                  style={{ fontWeight: 750 }}
                >
                  <div className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-primary">
                    <User className="h-3.5 w-3.5" />
                  </div>
                  <span className="hidden sm:inline">{getUserDisplayName(user, "用户")}</span>
                </button>
                {dropdownOpen && (
                  <div className="absolute right-0 top-full mt-1 w-48 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
                    <div className="px-3 py-2 text-[11px] text-muted-foreground border-b border-border">{user.email}</div>
                    <button
                      onClick={handleSignOut}
                      className="flex w-full items-center gap-2 px-3 py-2 text-[13px] text-foreground hover:bg-accent"
                      style={{ fontWeight: 750 }}
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      退出登录
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Link href="/login" className="rounded-xl px-3 py-2 text-[13px] text-muted-foreground hover:bg-card hover:text-foreground" style={{ fontWeight: 750 }}>
                  登录
                </Link>
                <Link href="/login?mode=register" className="rounded-xl bg-primary px-4 py-2 text-[13px] text-white shadow-[0_12px_26px_rgba(111,92,255,0.18)] hover:bg-primary/90" style={{ fontWeight: 800 }}>
                  注册
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="mx-auto grid min-h-[calc(100vh-64px)] max-w-[1180px] grid-cols-1 items-center gap-10 px-5 py-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(460px,1fr)]">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/80 px-4 py-2 text-[13px] text-primary shadow-sm">
            <Sparkles className="h-4 w-4" />
            面向自媒体创作者的 AI 内容工作台
          </div>
          <h1 className="mt-6 max-w-[760px] text-[46px] leading-[1.08] tracking-normal text-foreground md:text-[64px]" style={{ fontWeight: 900 }}>
            从热点到草稿，把每天的内容灵感
            <span className="text-primary">写成作品</span>
          </h1>
          <p className="mt-5 max-w-[640px] text-[16px] leading-8 text-muted-foreground">
            写作助手帮你追踪热点、拆解选题、生成草稿，并为公众号、小红书、知乎等平台保留不同表达偏好。
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href={user ? "/dashboard" : "/login?mode=register"} className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-[14px] text-white shadow-[0_18px_38px_rgba(111,92,255,0.23)] hover:bg-primary/90" style={{ fontWeight: 850 }}>
              {user ? "前往工作台" : "开始写作"} <ArrowRight className="h-4 w-4" />
            </Link>
            {user ? (
              <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-2xl border border-border bg-card px-5 py-3 text-[14px] text-foreground/75 shadow-sm hover:text-primary" style={{ fontWeight: 800 }}>
                前往工作台
              </Link>
            ) : (
              <Link href="/login" className="inline-flex items-center gap-2 rounded-2xl border border-border bg-card px-5 py-3 text-[14px] text-foreground/75 shadow-sm hover:text-primary" style={{ fontWeight: 800 }}>
                登录工作台
              </Link>
            )}
          </div>

          <div className="mt-8 grid max-w-[660px] grid-cols-2 gap-3 text-[12px] text-muted-foreground sm:grid-cols-4">
            {["热点追踪", "选题拆解", "智能成稿", "平台适配"].map((item) => (
              <div key={item} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="relative min-w-0">
          <div className="rounded-[28px] border border-border bg-card/90 p-4 shadow-[0_28px_90px_rgba(31,41,86,0.12)]">
            <div className="grid overflow-hidden rounded-[22px] border border-border/70 bg-background md:grid-cols-[156px_minmax(0,1fr)]">
              <aside className="hidden border-r border-border/70 bg-accent p-3 md:block">
                {[
                  { icon: LayoutDashboard, label: "今日工作台", active: true },
                  { icon: Flame, label: "热点中心" },
                  { icon: Lightbulb, label: "选题中心" },
                  { icon: FileText, label: "草稿箱" },
                ].map(({ icon: Icon, label, active }) => (
                  <div key={label} className={`mb-1 flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] ${active ? "bg-primary/10 text-primary" : "text-muted-foreground"}`} style={{ fontWeight: active ? 850 : 700 }}>
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </div>
                ))}
              </aside>

              <div className="min-w-0 bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[15px] text-foreground" style={{ fontWeight: 900 }}>今天最值得写什么</div>
                    <div className="mt-1 text-[12px] text-muted-foreground">按热度、趋势和账号定位排序</div>
                  </div>
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-[11px] text-primary" style={{ fontWeight: 850 }}>AI 分析</span>
                </div>

                <div className="mt-4 space-y-2">
                  {deskRows.map((row, index) => (
                    <div key={row.title} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-border/70 bg-background px-3 py-3">
                      <div className={`grid h-7 w-7 place-items-center rounded-xl text-[12px] ${index === 0 ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`} style={{ fontWeight: 850 }}>
                        {index + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-[13px] text-foreground" style={{ fontWeight: 850 }}>{row.title}</div>
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span>{row.source}</span>
                          <span className="rounded-full bg-card px-2 py-0.5 text-primary">{row.tag}</span>
                        </div>
                      </div>
                      <div className="text-right text-[12px] text-foreground/75" style={{ fontWeight: 850 }}>{row.heat}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3">
                  {[
                    ["选题", "14"],
                    ["草稿", "7"],
                    ["平台", "4"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl bg-accent px-3 py-3 text-center">
                      <div className="text-[20px] text-foreground" style={{ fontWeight: 900 }}>{value}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>



      <section id="workflow" className="mx-auto max-w-[1180px] px-5 py-12">
        <div className="grid gap-6 lg:grid-cols-[0.8fr_1fr]">
          <div>
            <h2 className="text-[28px] text-foreground" style={{ fontWeight: 900 }}>一条适合日更创作者的生产线</h2>
            <p className="mt-3 text-[14px] leading-7 text-muted-foreground">从“今天写什么”开始，到草稿、排版和平台偏好沉淀，减少重复判断，把注意力留给表达。</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { step: "01", title: "抓热点", desc: "定时更新可写话题" },
              { step: "02", title: "定角度", desc: "匹配账号定位和受众" },
              { step: "03", title: "出草稿", desc: "生成可继续打磨的正文" },
            ].map((item) => (
              <div key={item.step} className="rounded-[22px] border border-border bg-card p-5">
                <div className="text-[12px] text-primary" style={{ fontWeight: 900 }}>{item.step}</div>
                <div className="mt-3 text-[16px] text-foreground" style={{ fontWeight: 850 }}>{item.title}</div>
                <div className="mt-2 text-[13px] leading-6 text-muted-foreground">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="platforms" className="bg-slate-950 dark:bg-white/10 text-white">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-5 py-10 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-[24px]" style={{ fontWeight: 900 }}>先从公众号开始，继续扩展到更多自媒体平台</div>
            <div className="mt-2 text-[14px] text-white/60">平台适配不是一键发布噱头，而是让选题、结构和表达更贴近每个内容场景。</div>
          </div>
          <Link href="/login?mode=register" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-card px-5 py-3 text-[14px] text-foreground hover:bg-primary/10" style={{ fontWeight: 850 }}>
            创建账号 <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </main>
  );
}

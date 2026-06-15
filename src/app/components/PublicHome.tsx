"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import {
  ArrowRight,
  CheckCircle2,
  CircleHelp,
  Gauge,
  Layers3,
  LogOut,
  MessageSquareText,
  Play,
  Send,
  Sparkles,
  Target,
  User,
  X,
} from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { useAuth } from "../providers/auth-provider";
import { getUserDisplayName } from "../lib/user-display";

const navLinks = [
  { label: "产品功能", href: "#features" },
  { label: "创作流程", href: "#workflow" },
  { label: "演示视频", href: "#demo-video" },
  { label: "常见问题", href: "#help" },
];

const platforms = [
  { name: "微信公众号", color: "#07C160", icon: "/icon-wechat.svg" },
  { name: "小红书", color: "#FF2442", icon: "/icon-xiaohongshu.svg" },
  { name: "知乎", color: "#0066FF", icon: "/icon-zhihu.svg" },
  { name: "B站", color: "#FB7299", icon: "/icon-bilibili.svg" },
  { name: "抖音", color: "#000000", icon: "/icon-douyin.svg" },
];

const featureCards = [
  {
    title: "热点信号筛选",
    desc: "把平台热榜、领域关键词和趋势变化合并成可写选题池。",
    icon: Gauge,
  },
  {
    title: "选题角度拆解",
    desc: "给出目标人群、内容立场、标题方向和可扩展段落。",
    icon: Target,
  },
  {
    title: "草稿生成与优化",
    desc: "先生成可编辑初稿，再按语气、结构和平台规则继续打磨。",
    icon: MessageSquareText,
  },
  {
    title: "多平台表达适配",
    desc: "公众号、小红书、知乎等渠道保留不同表达节奏和格式。",
    icon: Layers3,
  },
];

const workflowSteps = [
  { step: "01", title: "发现热点", desc: "从全网趋势里筛掉噪音，保留与账号定位相关的机会。" },
  { step: "02", title: "确定角度", desc: "围绕受众痛点、观点强度和平台偏好生成写作方案。" },
  { step: "03", title: "生成初稿", desc: "输出标题、提纲和正文，减少从空白页开始的时间。" },
  { step: "04", title: "适配发布", desc: "按不同平台重写开头、标题和结尾，提高发布效率。" },
];

const faqs = [
  { question: "适合哪些创作者？", answer: "适合需要稳定日更、追热点、做多平台分发的自媒体和运营团队。" },
  { question: "生成内容能继续编辑吗？", answer: "可以。它输出的是可编辑草稿，不会替代你的判断和最终表达。" },
  { question: "是否必须绑定发布平台？", answer: "不需要。你可以先用选题、草稿和改写能力，再决定是否接入发布流程。" },
];

export function PublicHome() {
  const { user, signOut } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
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

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setDemoOpen(false);
      }
    }
    if (demoOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [demoOpen]);

  const handleSignOut = async () => {
    await signOut();
    setDropdownOpen(false);
  };

  return (
    <main className="lens-app-surface min-h-screen overflow-hidden text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/88 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-5">
          <div className="flex items-center gap-10">
            <Link href="/" className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center overflow-hidden rounded-2xl bg-white shadow-[0_12px_28px_rgba(111,92,255,0.16)] ring-1 ring-border/70">
                <img src="/brand-logo.png" alt="Lens Assistant" className="h-full w-full object-cover" />
              </div>
              <div>
                <div className="text-[16px] leading-none" style={{ fontWeight: 850 }}>Lens Assistant</div>
                <div className="mt-1 text-[11px] text-muted-foreground">AI写作助手</div>
              </div>
            </Link>

            <nav className="hidden items-center gap-1 lg:flex">
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="rounded-xl px-3 py-2 text-[13px] text-muted-foreground hover:bg-card hover:text-foreground transition-colors"
                  style={{ fontWeight: 600 }}
                >
                  {link.label}
                </a>
              ))}
            </nav>
          </div>

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
                <Link href="/login" className="rounded-xl px-3 py-2 text-[13px] text-muted-foreground hover:bg-card hover:text-foreground transition-colors" style={{ fontWeight: 600 }}>
                  登录
                </Link>
                <Link href="/login?mode=register" className="rounded-2xl bg-primary px-5 py-2 text-[13px] text-white shadow-[0_8px_24px_rgba(111,92,255,0.28)] hover:bg-primary/90 transition-all" style={{ fontWeight: 800 }}>
                  免费注册
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="relative mx-auto flex min-h-[calc(100vh-64px)] max-w-[1240px] flex-col items-center gap-10 px-5 py-12">
        <div className="pointer-events-none absolute -left-36 top-28 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -right-32 bottom-8 h-96 w-96 rounded-full bg-sky-300/20 blur-3xl" />

        <div className="relative z-10 flex max-w-[920px] min-w-0 flex-col items-center text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-card/85 px-4 py-2 text-[13px] text-primary shadow-sm backdrop-blur">
            <Sparkles className="h-4 w-4" />
            专为内容创作者打造的 AI 内容工作台
          </div>

          <h1 className="mt-6 max-w-[880px] text-[48px] leading-[1.04] tracking-normal text-foreground md:text-[68px]" style={{ fontWeight: 900 }}>
            每天 10 分钟
            <br />
            完成一篇<span className="text-primary">爆款内容</span>
          </h1>

          <p className="mt-5 max-w-[720px] text-[16px] leading-8 text-muted-foreground">
            追热点、拆选题、生成初稿、内容优化、全平台适配，一站式搞定
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            {[
              { icon: "🔥", label: "热点追踪" },
              { icon: "📍", label: "选题分析" },
              { icon: "✏️", label: "AI 写作" },
              { icon: "📊", label: "多平台适配" },
            ].map((item) => (
              <span key={item.label} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/90 px-3 py-1.5 text-[12px] text-muted-foreground shadow-sm">
                <span>{item.icon}</span>
                {item.label}
              </span>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href={user ? "/dashboard" : "/login?mode=register"} className="inline-flex items-center gap-2 rounded-2xl bg-primary px-7 py-3.5 text-[15px] text-white shadow-[0_18px_38px_rgba(111,92,255,0.28)] hover:bg-primary/90 transition-all hover:shadow-[0_22px_44px_rgba(111,92,255,0.35)]" style={{ fontWeight: 800 }}>
              免费开始使用 <ArrowRight className="h-4 w-4" />
            </Link>
            <button type="button" onClick={() => setDemoOpen(true)} className="inline-flex items-center gap-2 rounded-2xl border border-border bg-card px-5 py-3.5 text-[14px] text-foreground/75 shadow-sm transition-all hover:border-primary/30 hover:text-primary" style={{ fontWeight: 700 }}>
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Play className="h-3 w-3 fill-current" />
              </span>
              观看演示视频
            </button>
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-5 text-[12px] text-muted-foreground">
            {["免费试用，额度充足", "无需信用卡", "2 分钟快速上手"].map((item) => (
              <div key={item} className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                {item}
              </div>
            ))}
          </div>
        </div>

        <div id="demo-video" className="relative z-10 w-full max-w-[860px] min-w-0 scroll-mt-24">
          <div className="relative overflow-hidden rounded-[30px] border border-border bg-card/88 p-2 shadow-[0_34px_110px_rgba(31,41,86,0.16)] backdrop-blur sm:p-3">
            <div className="flex items-center justify-between px-2 pb-2">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
              </div>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-[11px] text-primary" style={{ fontWeight: 800 }}>18s 演示</span>
            </div>
            <button
              type="button"
              onClick={() => setDemoOpen(true)}
              className="group relative block w-full overflow-hidden rounded-[23px] border border-border/70 bg-background text-left focus:outline-none focus:ring-2 focus:ring-primary/35"
              aria-label="播放 Lens Assistant 产品演示视频"
            >
              <video
                className="pointer-events-none block aspect-video w-full bg-background object-cover"
                src="/videos/lens-assistant-promo.mp4"
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                aria-label="Lens Assistant 产品演示宣传视频"
              />
            </button>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-[1240px] px-5 py-14">
        <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
          <div>
            <div className="text-[13px] text-primary" style={{ fontWeight: 900 }}>产品功能</div>
            <h2 className="mt-3 text-[34px] leading-tight text-foreground md:text-[44px]" style={{ fontWeight: 900 }}>把内容生产的重复判断，收进一个工作台</h2>
          </div>
          <p className="max-w-[650px] text-[15px] leading-8 text-muted-foreground lg:justify-self-end">
            不只是一键生成文章，而是把追热点、定角度、成稿、平台适配拆成连续流程，让每天创作更稳定。
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {featureCards.map((feature) => {
            const Icon = feature.icon;
            return (
              <div key={feature.title} className="rounded-[24px] border border-border bg-card/85 p-5 shadow-[0_18px_50px_rgba(31,41,86,0.06)]">
                <div className="mb-5 grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-[18px] text-foreground" style={{ fontWeight: 900 }}>{feature.title}</h3>
                <p className="mt-3 text-[13px] leading-6 text-muted-foreground">{feature.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section id="workflow" className="mx-auto max-w-[1240px] px-5 py-14">
        <div className="rounded-[30px] border border-border bg-card/82 p-6 shadow-[0_24px_70px_rgba(31,41,86,0.08)] md:p-8">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <div className="text-[13px] text-primary" style={{ fontWeight: 900 }}>创作流程</div>
              <h2 className="mt-3 text-[32px] leading-tight text-foreground md:text-[42px]" style={{ fontWeight: 900 }}>从今天写什么，到发布什么版本</h2>
            </div>
            <div className="rounded-2xl bg-primary/10 px-4 py-3 text-[13px] text-primary" style={{ fontWeight: 800 }}>
              平均 4 步完成一篇可编辑草稿
            </div>
          </div>

          <div className="mt-8 grid gap-3 lg:grid-cols-4">
            {workflowSteps.map((item) => (
              <div key={item.step} className="rounded-[22px] border border-border/70 bg-background/72 p-5">
                <div className="text-[13px] text-primary" style={{ fontWeight: 900 }}>{item.step}</div>
                <h3 className="mt-4 text-[20px] text-foreground" style={{ fontWeight: 900 }}>{item.title}</h3>
                <p className="mt-3 text-[13px] leading-6 text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="platforms" className="mx-auto max-w-[1240px] px-5 py-14">
        <div className="rounded-[30px] border border-border bg-card/82 p-8 text-center shadow-[0_20px_60px_rgba(31,41,86,0.07)] md:p-10">
          <div className="text-[13px] text-primary" style={{ fontWeight: 900 }}>平台适配</div>
          <h3 className="mt-3 text-[28px] leading-tight text-foreground md:text-[36px]" style={{ fontWeight: 900 }}>支持多平台内容创作与发布</h3>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-5 sm:gap-8">
            {platforms.map((platform) => (
              <div key={platform.name} className="flex flex-col items-center gap-3">
                <div className="grid h-14 w-14 place-items-center rounded-2xl shadow-[0_14px_30px_rgba(31,41,86,0.12)]" style={{ backgroundColor: platform.color }}>
                  <img src={platform.icon} alt={platform.name} className="h-7 w-7 brightness-0 invert" />
                </div>
                <span className="text-[13px] text-muted-foreground" style={{ fontWeight: 600 }}>{platform.name}</span>
              </div>
            ))}
          </div>
          <div className="mt-6 text-[13px] text-muted-foreground">更多平台陆续支持中...</div>
        </div>
      </section>

      <section id="help" className="mx-auto max-w-[1240px] px-5 py-14">
        <div className="grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
          <div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <CircleHelp className="h-6 w-6" />
            </div>
            <h2 className="mt-5 text-[32px] leading-tight text-foreground md:text-[42px]" style={{ fontWeight: 900 }}>开始前常见问题</h2>
          </div>
          <div className="grid gap-3">
            {faqs.map((item) => (
              <div key={item.question} className="rounded-[22px] border border-border bg-card/88 p-5">
                <h3 className="text-[16px] text-foreground" style={{ fontWeight: 900 }}>{item.question}</h3>
                <p className="mt-2 text-[13px] leading-6 text-muted-foreground">{item.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {demoOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/68 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Lens Assistant 产品演示视频"
          onClick={() => setDemoOpen(false)}
        >
          <div className="w-full max-w-[980px] overflow-hidden rounded-[24px] border border-white/12 bg-background shadow-[0_30px_90px_rgba(0,0,0,0.34)]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2 text-[13px] text-muted-foreground" style={{ fontWeight: 800 }}>
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Send className="h-3.5 w-3.5" />
                </span>
                Lens Assistant 演示
              </div>
              <button
                type="button"
                onClick={() => setDemoOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
                aria-label="关闭演示视频"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <video
              className="block aspect-video w-full bg-black"
              src="/videos/lens-assistant-promo.mp4"
              controls
              autoPlay
              playsInline
            />
          </div>
        </div>
      )}


    </main>
  );
}

"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Archive,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Database,
  Eye,
  EyeOff,
  FileText,
  Flame,
  Home,
  LoaderCircle,
  LockKeyhole,
  Mail,
  PenLine,
  PenTool,
  Send,
  Sparkles,
  Target,
} from "lucide-react";
import { useAuth, type AuthMode } from "../providers/auth-provider";

const featureItems = [
  { icon: Flame, title: "热点追踪", desc: "聚合趋势，快速找到可写方向" },
  { icon: Target, title: "选题拆解", desc: "拆出角度、受众和表达重点" },
  { icon: PenLine, title: "智能写作", desc: "生成标题、摘要、正文框架" },
  { icon: Send, title: "平台适配", desc: "沉淀不同平台的表达偏好" },
];

const workflowItems = [
  { step: "01", title: "发现热点", desc: "32 个热点更新", icon: Flame },
  { step: "02", title: "拆解选题", desc: "生成 8 个切入角度", icon: Target },
  { step: "03", title: "写作草稿", desc: "2 篇进行中", icon: PenLine },
];

const platformItems = ["公众号长文", "小红书笔记", "知乎问答", "微博观点"];

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function AuthPage() {
  const { authAvailable, signInWithEmail, signUpWithEmail } = useAuth();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const title = mode === "login" ? "立即开启高效创作" : "创建创作者账号";
  const submitLabel = mode === "login" ? "登录工作台" : "创建账号";
  const passwordHint = useMemo(
    () => mode === "login" ? "使用注册时设置的密码。" : "至少 6 位，建议包含字母和数字。",
    [mode],
  );

  const selectMode = (nextMode: AuthMode) => {
    if (mode === nextMode) return;
    setMode(nextMode);
    setError("");
    setMessage("");
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");

    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      setError("请输入有效的邮箱地址。");
      return;
    }

    if (password.length < 6) {
      setError("密码至少需要 6 位。");
      return;
    }

    if (mode === "register" && password !== confirmPassword) {
      setError("两次输入的密码不一致。");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "login") {
        await signInWithEmail(normalizedEmail, password);
        return;
      }

      const result = await signUpWithEmail(normalizedEmail, password);
      if (result.needsEmailConfirmation) {
        setMessage("注册成功，请打开邮箱完成验证后再登录。");
        setMode("login");
        setPassword("");
        setConfirmPassword("");
        setShowPassword(false);
        return;
      }

      setMessage("注册成功，已进入工作台。");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "登录失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  };

  const passwordType = showPassword ? "text" : "password";
  const revealLabel = showPassword ? "隐藏密码" : "显示密码";
  const RevealIcon = showPassword ? EyeOff : Eye;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#fffaf5] text-[#181715]">
      <div className="absolute inset-0 [background-image:linear-gradient(rgba(205,103,50,0.075)_1px,transparent_1px),linear-gradient(90deg,rgba(205,103,50,0.075)_1px,transparent_1px)] [background-size:44px_44px]" />
      <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(255,250,245,0.78)_0%,rgba(255,250,245,0.96)_52%,rgba(255,255,255,0.9)_100%)]" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1500px] flex-col px-8 py-8 xl:px-10">
        <header className="flex items-center justify-between gap-8">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#d65f2b] text-white shadow-[0_14px_35px_rgba(214,95,43,0.22)]">
              <PenTool className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[20px] leading-none text-[#181715]" style={{ fontWeight: 800 }}>写作助手</div>
              <div className="mt-1 text-[13px] text-[#7b7269]">AI 创作者的一站式内容工作台</div>
            </div>
          </div>

          <nav className="hidden items-center gap-10 text-[14px] text-[#3d3833] lg:flex" aria-label="产品导航预览">
            {["功能", "模板中心", "案例", "定价", "帮助中心"].map((item) => (
              <span key={item} className="cursor-default" style={{ fontWeight: 650 }}>{item}</span>
            ))}
          </nav>

          <div className="hidden rounded-full border border-[#eadfd4] bg-white/70 px-4 py-2 text-[13px] text-[#5d544c] shadow-sm backdrop-blur md:block">
            面向多平台自媒体创作者
          </div>
        </header>

        <div className="grid flex-1 items-center gap-12 py-10 lg:grid-cols-[minmax(0,1fr)_430px] xl:grid-cols-[minmax(0,1fr)_470px]">
          <section className="hidden min-w-0 lg:block">
            <div className="max-w-[790px]">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#f0dfd0] bg-white/72 px-4 py-2 text-[13px] text-[#c65322] shadow-sm">
                <Flame className="h-4 w-4" />
                聚合热点 · 拆解选题 · 智能写作 · 多平台适配
              </div>

              <h1 className="mt-6 max-w-[760px] text-[52px] leading-[1.12] text-[#151311] xl:text-[58px]" style={{ fontWeight: 850 }}>
                每天 10 分钟，完成热点到
                <span className="text-[#d65f2b]">多平台草稿</span>
              </h1>
              <p className="mt-5 max-w-[720px] text-[17px] leading-8 text-[#685f56]">
                追踪全网热点，拆出可写选题，一键生成适合公众号、小红书、知乎等平台的内容草稿。
              </p>

              <div className="mt-8 grid max-w-[760px] grid-cols-4 gap-5">
                {featureItems.map(({ icon: Icon, title: itemTitle, desc }) => (
                  <div key={itemTitle} className="flex min-w-0 items-start gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#fff1e8] text-[#d65f2b]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[14px] text-[#191613]" style={{ fontWeight: 800 }}>{itemTitle}</div>
                      <div className="mt-1 text-[12px] leading-5 text-[#7b7269]">{desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-9 max-w-[820px] rounded-[22px] border border-[#eadfd4] bg-white/78 p-4 shadow-[0_28px_90px_rgba(85,57,34,0.12)] backdrop-blur">
                <div className="grid grid-cols-[170px_minmax(0,1fr)] overflow-hidden rounded-[18px] border border-[#f0e5da] bg-[#fffaf5]">
                  <aside className="border-r border-[#f0e5da] bg-[#fff7ef] p-4">
                    <div className="space-y-1.5">
                      {[
                        { icon: Home, label: "工作台", active: true },
                        { icon: Flame, label: "热点追踪" },
                        { icon: BookOpen, label: "选题库" },
                        { icon: Archive, label: "草稿箱", badge: "7" },
                        { icon: Database, label: "素材库" },
                        { icon: BarChart3, label: "数据分析" },
                      ].map(({ icon: Icon, label, active, badge }) => (
                        <div
                          key={label}
                          className={`flex items-center justify-between rounded-xl px-3 py-2 text-[12px] ${
                            active ? "bg-[#fff0e6] text-[#d65f2b]" : "text-[#7b7269]"
                          }`}
                          style={{ fontWeight: active ? 800 : 650 }}
                        >
                          <span className="flex items-center gap-2">
                            <Icon className="h-3.5 w-3.5" /> {label}
                          </span>
                          {badge ? <span className="rounded-full bg-[#ffe3d3] px-1.5 text-[#d65f2b]">{badge}</span> : null}
                        </div>
                      ))}
                    </div>
                    <div className="mt-12 rounded-2xl bg-white p-3 text-[12px] text-[#8c8178] shadow-sm">
                      <div className="text-[#d65f2b]" style={{ fontWeight: 800 }}>创作者工作台</div>
                      <div className="mt-1">选题、草稿和平台偏好持续同步</div>
                    </div>
                  </aside>

                  <div className="min-w-0 bg-white p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <div className="text-[15px] text-[#181715]" style={{ fontWeight: 800 }}>今日创作概览</div>
                      <button type="button" className="rounded-full border border-[#f0dfd0] px-3 py-1.5 text-[12px] text-[#d65f2b]" disabled>
                        继续创作 <ArrowRight className="ml-1 inline h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      {workflowItems.map(({ step, title: itemTitle, desc, icon: Icon }) => (
                        <div key={step} className="rounded-2xl bg-[#fffaf5] p-3">
                          <div className="flex items-center gap-2">
                            <div className="grid h-9 w-9 place-items-center rounded-full bg-white text-[#d65f2b] shadow-sm">
                              <Icon className="h-4 w-4" />
                            </div>
                            <div>
                              <div className="text-[10px] text-[#d65f2b]" style={{ fontWeight: 800 }}>{step}</div>
                              <div className="text-[12px] text-[#181715]" style={{ fontWeight: 800 }}>{itemTitle}</div>
                            </div>
                          </div>
                          <div className="mt-2 text-[11px] text-[#8c8178]">{desc}</div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 grid grid-cols-[minmax(0,1fr)_180px] gap-3">
                      <div className="rounded-2xl border border-[#f0e5da] p-4">
                        <div className="mb-3 text-[13px] text-[#181715]" style={{ fontWeight: 800 }}>为你推荐的热点</div>
                        {[
                          ["OpenAI 发布新模型，创作者怎么用？", "98.6 万"],
                          ["小红书笔记标题开始重视搜索词", "76.3 万"],
                          ["知识类账号如何做系列化内容", "62.1 万"],
                        ].map(([itemTitle, heat], index) => (
                          <div key={itemTitle} className="flex items-center justify-between gap-3 py-1.5 text-[12px]">
                            <div className="min-w-0 truncate text-[#3d3833]">
                              <span className="mr-2 text-[#d65f2b]">{String(index + 1).padStart(2, "0")}</span>
                              {itemTitle}
                            </div>
                            <div className="shrink-0 text-[#8c8178]">{heat}</div>
                          </div>
                        ))}
                      </div>

                      <div className="rounded-2xl border border-[#f0e5da] bg-[#fffaf5] p-4">
                        <div className="text-[13px] text-[#181715]" style={{ fontWeight: 800 }}>草稿箱</div>
                        <div className="mt-3 text-[32px] leading-none text-[#181715]" style={{ fontWeight: 850 }}>7</div>
                        <div className="mt-1 text-[12px] text-[#7b7269]">篇草稿待打磨</div>
                        <div className="mt-4 space-y-2 text-[11px] text-[#8c8178]">
                          <div>AI 产品更新后的机会</div>
                          <div>小红书爆款笔记结构</div>
                          <div>公众号选题拆解方法</div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-[#f0e5da] px-4 py-3">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-[13px] text-[#181715]" style={{ fontWeight: 800 }}>平台适配</span>
                        <span className="text-[11px] text-[#8c8178]">保存偏好后自动带入写作</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {platformItems.map((item) => (
                          <span key={item} className="rounded-full border border-[#f0dfd0] bg-white px-3 py-1.5 text-[12px] text-[#5d544c]">
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="flex justify-center lg:justify-end">
            <div className="w-full max-w-[430px]">
              <div className="mb-8 flex items-center gap-3 lg:hidden">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#d65f2b] text-white">
                  <PenTool className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-[18px] text-[#181715]" style={{ fontWeight: 800 }}>写作助手</div>
                  <div className="text-[12px] text-[#7b7269]">AI 创作者的一站式内容工作台</div>
                </div>
              </div>

              <div className="rounded-[28px] border border-[#eadfd4] bg-white/92 p-7 shadow-[0_30px_100px_rgba(85,57,34,0.14)] backdrop-blur">
                <div className="text-center">
                  <h2 className="text-[25px] text-[#181715]" style={{ fontWeight: 850 }}>{title}</h2>
                  <p className="mt-2 text-[14px] text-[#6f665d]">
                    {mode === "login" ? "登录后继续管理选题、草稿和平台偏好。" : "创建账号后同步你的自媒体写作工作台。"}
                  </p>
                </div>

                <div className="mt-7 grid grid-cols-2 border-b border-[#eadfd4]">
                  {[
                    { value: "login" as AuthMode, label: "登录" },
                    { value: "register" as AuthMode, label: "注册" },
                  ].map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => selectMode(item.value)}
                      disabled={submitting}
                      className={`relative h-11 text-[14px] transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                        mode === item.value ? "text-[#181715]" : "text-[#7b7269] hover:text-[#181715]"
                      }`}
                      style={{ fontWeight: 800 }}
                    >
                      {item.label}
                      {mode === item.value ? <span className="absolute inset-x-8 bottom-[-1px] h-0.5 rounded-full bg-[#d65f2b]" /> : null}
                    </button>
                  ))}
                </div>

                {!authAvailable ? (
                  <div className="mt-5 rounded-xl border border-[#e8c681] bg-[#fff7df] px-4 py-3 text-[13px] leading-6 text-[#7a5414]">
                    Supabase 登录环境未配置，请先补充 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY。
                  </div>
                ) : null}

                <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
                  <div>
                    <label htmlFor="auth-email" className="mb-2 block text-[12px] text-[#3d3833]" style={{ fontWeight: 800 }}>
                      邮箱
                    </label>
                    <div className="flex h-11 items-center gap-2 rounded-xl border border-[#eadfd4] bg-white px-3 transition-colors focus-within:border-[#d65f2b] focus-within:ring-3 focus-within:ring-[#d65f2b]/15">
                      <Mail className="h-4 w-4 shrink-0 text-[#9a9086]" aria-hidden="true" />
                      <input
                        id="auth-email"
                        name="email"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        spellCheck={false}
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="name@example.com"
                        disabled={!authAvailable || submitting}
                        className="min-w-0 flex-1 border-0 bg-transparent text-[14px] text-[#181715] outline-none placeholder:text-[#aaa198] disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="auth-password" className="mb-2 block text-[12px] text-[#3d3833]" style={{ fontWeight: 800 }}>
                      密码
                    </label>
                    <div className="flex h-11 items-center gap-2 rounded-xl border border-[#eadfd4] bg-white px-3 transition-colors focus-within:border-[#d65f2b] focus-within:ring-3 focus-within:ring-[#d65f2b]/15">
                      <LockKeyhole className="h-4 w-4 shrink-0 text-[#9a9086]" aria-hidden="true" />
                      <input
                        id="auth-password"
                        name="password"
                        type={passwordType}
                        autoComplete={mode === "login" ? "current-password" : "new-password"}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="输入密码"
                        disabled={!authAvailable || submitting}
                        className="min-w-0 flex-1 border-0 bg-transparent text-[14px] text-[#181715] outline-none placeholder:text-[#aaa198] disabled:cursor-not-allowed"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((visible) => !visible)}
                        disabled={!authAvailable || submitting}
                        aria-label={revealLabel}
                        title={revealLabel}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[#9a9086] transition-colors hover:bg-[#fff3ea] hover:text-[#181715] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <RevealIcon className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                    <p className="mt-1.5 text-[11px] text-[#9a9086]">{passwordHint}</p>
                  </div>

                  {mode === "register" ? (
                    <div>
                      <label htmlFor="auth-confirm-password" className="mb-2 block text-[12px] text-[#3d3833]" style={{ fontWeight: 800 }}>
                        确认密码
                      </label>
                      <div className="flex h-11 items-center gap-2 rounded-xl border border-[#eadfd4] bg-white px-3 transition-colors focus-within:border-[#d65f2b] focus-within:ring-3 focus-within:ring-[#d65f2b]/15">
                        <LockKeyhole className="h-4 w-4 shrink-0 text-[#9a9086]" aria-hidden="true" />
                        <input
                          id="auth-confirm-password"
                          name="confirmPassword"
                          type={passwordType}
                          autoComplete="new-password"
                          value={confirmPassword}
                          onChange={(event) => setConfirmPassword(event.target.value)}
                          placeholder="再次输入密码"
                          disabled={!authAvailable || submitting}
                          className="min-w-0 flex-1 border-0 bg-transparent text-[14px] text-[#181715] outline-none placeholder:text-[#aaa198] disabled:cursor-not-allowed"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((visible) => !visible)}
                          disabled={!authAvailable || submitting}
                          aria-label={revealLabel}
                          title={revealLabel}
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[#9a9086] transition-colors hover:bg-[#fff3ea] hover:text-[#181715] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <RevealIcon className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div aria-live="polite" className="min-h-5">
                    {error ? <p className="text-[12px] leading-5 text-red-600">{error}</p> : null}
                    {message ? <p className="text-[12px] leading-5 text-[#2f7d61]">{message}</p> : null}
                  </div>

                  <button
                    type="submit"
                    disabled={!authAvailable || submitting}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#d94f17] px-4 text-[14px] text-white shadow-[0_14px_30px_rgba(217,79,23,0.24)] transition-colors hover:bg-[#bf4513] disabled:cursor-not-allowed disabled:bg-[#e6dfd8] disabled:text-[#8e8b82] disabled:shadow-none"
                    style={{ fontWeight: 800 }}
                  >
                    {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                    {submitting ? "处理中..." : submitLabel}
                  </button>
                </form>

                <div className="mt-6 rounded-2xl bg-[#fff8f2] px-4 py-3">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#d65f2b]" />
                    <div>
                      <div className="text-[12px] text-[#3d3833]" style={{ fontWeight: 800 }}>数据和偏好随账号同步</div>
                      <div className="mt-1 text-[11px] leading-5 text-[#8c8178]">用于保存草稿、模型设置和平台配置，不会公开你的创作内容。</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8 grid grid-cols-4 gap-2 rounded-2xl bg-white/58 p-4 text-center shadow-sm backdrop-blur">
                {[
                  ["热点", "聚合"],
                  ["选题", "拆解"],
                  ["草稿", "生成"],
                  ["平台", "适配"],
                ].map(([top, bottom]) => (
                  <div key={top} className="border-r border-[#eadfd4] last:border-r-0">
                    <div className="text-[18px] text-[#d65f2b]" style={{ fontWeight: 850 }}>{top}</div>
                    <div className="mt-1 text-[11px] text-[#8c8178]">{bottom}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
  PenTool,
} from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { useAuth, type AuthMode } from "../providers/auth-provider";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function AuthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { authAvailable, signInWithEmail, signUpWithEmail } = useAuth();
  const initialMode = searchParams.get("mode") === "register" ? "register" : "login";
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    setMode(searchParams.get("mode") === "register" ? "register" : "login");
  }, [searchParams]);

  const title = mode === "login" ? "登录工作台" : "创建创作者账号";
  const subtitle = mode === "login"
    ? "继续管理你的热点、选题、草稿和平台偏好。"
    : "用一个账号保存你的自媒体写作工作流。";
  const submitLabel = mode === "login" ? "登录" : "注册";
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
    router.replace(nextMode === "register" ? "/login?mode=register" : "/login");
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
        router.replace("/dashboard");
        return;
      }

      const result = await signUpWithEmail(normalizedEmail, password);
      if (result.needsEmailConfirmation) {
        setMessage("注册成功，请打开邮箱完成验证后再登录。");
        selectMode("login");
        setPassword("");
        setConfirmPassword("");
        return;
      }

      router.replace("/dashboard");
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
    <main className="lens-app-surface min-h-screen text-foreground">
      <header className="mx-auto flex h-16 max-w-[1180px] items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary text-white shadow-[0_12px_28px_rgba(111,92,255,0.2)]">
            <PenTool className="h-4.5 w-4.5" />
          </div>
          <div>
            <div className="text-[16px] leading-none" style={{ fontWeight: 850 }}>写作助手</div>
            <div className="mt-1 text-[11px] text-muted-foreground">Creator Writing Desk</div>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle compact />
          <Link href="/" className="rounded-xl border border-border bg-card px-3 py-2 text-[13px] text-muted-foreground hover:text-primary" style={{ fontWeight: 750 }}>
            返回首页
          </Link>
        </div>
      </header>

      <section className="flex min-h-[calc(100vh-64px)] items-center justify-center px-5 py-10">
        <div className="w-full max-w-[440px]">
          <div className="rounded-[28px] border border-border bg-card/95 p-7 shadow-[0_30px_100px_rgba(31,41,86,0.14)]">
            <div className="text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                <PenTool className="h-5 w-5" />
              </div>
              <h1 className="mt-4 text-[26px] text-foreground" style={{ fontWeight: 900 }}>{title}</h1>
              <p className="mt-2 text-[13px] leading-6 text-muted-foreground">{subtitle}</p>
            </div>

            <div className="mt-7 grid grid-cols-2 rounded-2xl bg-accent p-1">
              {[
                { value: "login" as AuthMode, label: "登录" },
                { value: "register" as AuthMode, label: "注册" },
              ].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => selectMode(item.value)}
                  disabled={submitting}
                  className={`h-10 rounded-xl text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                    mode === item.value ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                  style={{ fontWeight: 850 }}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {!authAvailable ? (
              <div className="mt-5 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-[13px] leading-6 text-amber-700 dark:text-amber-200">
                Supabase 登录环境未配置，请先补充 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY。
              </div>
            ) : null}

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="auth-email" className="mb-2 block text-[12px] text-foreground" style={{ fontWeight: 850 }}>
                  邮箱
                </label>
                <div className="flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-3 transition-colors focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/15">
                  <Mail className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
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
                    className="min-w-0 flex-1 border-0 bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="auth-password" className="mb-2 block text-[12px] text-foreground" style={{ fontWeight: 850 }}>
                  密码
                </label>
                <div className="flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-3 transition-colors focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/15">
                  <LockKeyhole className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <input
                    id="auth-password"
                    name="password"
                    type={passwordType}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="输入密码"
                    disabled={!authAvailable || submitting}
                    className="min-w-0 flex-1 border-0 bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    disabled={!authAvailable || submitting}
                    aria-label={revealLabel}
                    title={revealLabel}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RevealIcon className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">{passwordHint}</p>
              </div>

              {mode === "register" ? (
                <div>
                  <label htmlFor="auth-confirm-password" className="mb-2 block text-[12px] text-foreground" style={{ fontWeight: 850 }}>
                    确认密码
                  </label>
                  <div className="flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-3 transition-colors focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/15">
                    <LockKeyhole className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <input
                      id="auth-confirm-password"
                      name="confirmPassword"
                      type={passwordType}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder="再次输入密码"
                      disabled={!authAvailable || submitting}
                      className="min-w-0 flex-1 border-0 bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((visible) => !visible)}
                      disabled={!authAvailable || submitting}
                      aria-label={revealLabel}
                      title={revealLabel}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <RevealIcon className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ) : null}

              <div aria-live="polite" className="min-h-5">
                {error ? <p className="text-[12px] leading-5 text-red-600">{error}</p> : null}
                {message ? <p className="text-[12px] leading-5 text-emerald-600">{message}</p> : null}
              </div>

              <button
                type="submit"
                disabled={!authAvailable || submitting}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-[14px] text-white shadow-[0_14px_30px_rgba(111,92,255,0.24)] transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
                style={{ fontWeight: 850 }}
              >
                {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                {submitting ? "处理中..." : submitLabel}
              </button>
            </form>

            <div className="mt-6 rounded-2xl bg-accent/70 px-4 py-3">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <div className="text-[12px] text-foreground" style={{ fontWeight: 850 }}>账号用于同步创作资产</div>
                  <div className="mt-1 text-[11px] leading-5 text-muted-foreground">保存草稿、模型设置和平台偏好，不会公开你的创作内容。</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

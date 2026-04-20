"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  RotateCcw,
  Save,
  Plus,
  X,
  Star,
  Pencil,
  Trash2,
  UserRound,
  Users,
  MessageSquareQuote,
  ShieldAlert,
  Megaphone,
  LayoutTemplate,
  Bot,
  ImageIcon,
  Send,
  Tags,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { defaultSettings } from "../lib/app-data";
import { articleDomains, domainConfigs, type ArticleDomain } from "../lib/content-domains";
import { useAppStore } from "../providers/app-store";

type WechatAccountView = {
  id: string;
  name: string;
  appId: string;
  appIdMasked: string;
  hasAppSecret: boolean;
  defaultAuthor: string;
  contentSourceUrl: string;
  createdAt: string;
  updatedAt: string;
};

type WechatAccountForm = {
  id: string;
  name: string;
  appId: string;
  appSecret: string;
  defaultAuthor: string;
  contentSourceUrl: string;
  setAsSelected: boolean;
};

type AIProviderView = {
  baseUrl: string;
  model: string;
  fastModel: string;
  longformModel: string;
  hasApiKey: boolean;
  source: "database" | "environment" | "default";
};

type AIProviderForm = {
  baseUrl: string;
  apiKey: string;
  model: string;
  fastModel: string;
  longformModel: string;
};

type AIImageProviderView = {
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  source: "database" | "environment" | "default";
};

type AIImageProviderForm = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

const emptyWechatAccountForm: WechatAccountForm = {
  id: "",
  name: "",
  appId: "",
  appSecret: "",
  defaultAuthor: "",
  contentSourceUrl: "",
  setAsSelected: true,
};

const emptyAIProviderForm: AIProviderForm = {
  baseUrl: "",
  apiKey: "",
  model: "",
  fastModel: "",
  longformModel: "",
};

const emptyAIImageProviderForm: AIImageProviderForm = {
  baseUrl: "",
  apiKey: "",
  model: "",
};

const aiProviderPresets = [
  {
    name: "Claude",
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-sonnet-4-6",
    fastModel: "claude-3-5-haiku-latest",
    longformModel: "claude-sonnet-4-6",
  },
  {
    name: "通义千问",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen3.5-plus",
    fastModel: "qwen-turbo",
    longformModel: "qwen3.5-plus",
  },
  {
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    fastModel: "deepseek-chat",
    longformModel: "deepseek-chat",
  },
  {
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4o-mini",
    fastModel: "openai/gpt-4o-mini",
    longformModel: "openai/gpt-4o",
  },
  {
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    fastModel: "gpt-4o-mini",
    longformModel: "gpt-4o",
  },
  {
    name: "中转服务",
    baseUrl: "https://你的中转域名/v1",
    model: "gpt-4o-mini",
    fastModel: "gpt-4o-mini",
    longformModel: "gpt-4o",
  },
] as const;

const settingsSections: Array<{
  id: string;
  title: string;
  hint: string;
  icon: LucideIcon;
}> = [
  { id: "account-profile", title: "账号定位", hint: "名称、定位与覆盖领域", icon: UserRound },
  { id: "reader-persona", title: "目标读者", hint: "读者画像与需求", icon: Users },
  { id: "brand-tone", title: "品牌语气", hint: "语气关键词与风格", icon: MessageSquareQuote },
  { id: "restricted-topics", title: "禁写范围", hint: "敏感词与限制话题", icon: ShieldAlert },
  { id: "cta-copy", title: "CTA 文案", hint: "关注、互动与转发引导", icon: Megaphone },
  { id: "default-template", title: "排版模板", hint: "默认模板偏好", icon: LayoutTemplate },
  { id: "ai-writer", title: "AI 写作模型", hint: "正文生成模型配置", icon: Bot },
  { id: "ai-image", title: "AI 图片模型", hint: "AI 配图模型配置", icon: ImageIcon },
  { id: "wechat-account", title: "公众号接入", hint: "公众号账号与推送配置", icon: Send },
  { id: "content-preferences", title: "内容偏好", hint: "偏好输出的内容形式", icon: Tags },
];

export function Settings() {
  const { settings, saveSettings } = useAppStore();
  const [form, setForm] = useState(settings);
  const [notice, setNotice] = useState("");
  const [wechatAccounts, setWechatAccounts] = useState<WechatAccountView[]>([]);
  const [selectedWechatAccountId, setSelectedWechatAccountId] = useState<string | null>(null);
  const [wechatForm, setWechatForm] = useState<WechatAccountForm>(emptyWechatAccountForm);
  const [wechatLoading, setWechatLoading] = useState(false);
  const [wechatLoaded, setWechatLoaded] = useState(false);
  const [aiProvider, setAIProvider] = useState<AIProviderView | null>(null);
  const [aiProviderForm, setAIProviderForm] = useState<AIProviderForm>(emptyAIProviderForm);
  const [aiProviderLoading, setAIProviderLoading] = useState(false);
  const [aiProviderTesting, setAIProviderTesting] = useState(false);
  const [aiImageProvider, setAIImageProvider] = useState<AIImageProviderView | null>(null);
  const [aiImageProviderForm, setAIImageProviderForm] = useState<AIImageProviderForm>(emptyAIImageProviderForm);
  const [aiImageProviderLoading, setAIImageProviderLoading] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState(settingsSections[0]?.id ?? "");
  const sectionNavigationLockRef = useRef<number | null>(null);
  const isProgrammaticScrollRef = useRef(false);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  useEffect(() => {
    void loadWechatAccounts();
    void loadAIProviderConfig();
    void loadAIImageProviderConfig();
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (isProgrammaticScrollRef.current) return;

        const visibleEntries = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio);

        if (visibleEntries[0]?.target.id) {
          setActiveSectionId(visibleEntries[0].target.id);
        }
      },
      {
        rootMargin: "-15% 0px -55% 0px",
        threshold: [0.2, 0.35, 0.5, 0.75],
      },
    );

    settingsSections.forEach((section) => {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, []);

  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(settings), [form, settings]);

  const updateField = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((currentForm) => ({ ...currentForm, [key]: value }));
  };

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (!element) return;

    if (sectionNavigationLockRef.current) {
      window.clearTimeout(sectionNavigationLockRef.current);
    }

    isProgrammaticScrollRef.current = true;
    setActiveSectionId(sectionId);
    sectionNavigationLockRef.current = window.setTimeout(() => {
      isProgrammaticScrollRef.current = false;
      sectionNavigationLockRef.current = null;
    }, 700);
    element.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => () => {
    if (sectionNavigationLockRef.current) {
      window.clearTimeout(sectionNavigationLockRef.current);
    }
  }, []);

  const handleSave = () => {
    saveSettings(form);
    setNotice("已保存到云端");
    window.setTimeout(() => setNotice(""), 2000);
  };

  const handleRestoreDefaults = () => {
    setForm(defaultSettings);
    saveSettings(defaultSettings);
    setNotice("已恢复并保存默认设置");
    window.setTimeout(() => setNotice(""), 2000);
  };

  async function loadWechatAccounts() {
    setWechatLoading(true);

    try {
      const response = await fetch("/api/wechat/accounts", { cache: "no-store" });
      const payload = await response.json().catch(() => null);

      if (response.ok && payload) {
        setWechatAccounts(Array.isArray(payload.accounts) ? payload.accounts as WechatAccountView[] : []);
        setSelectedWechatAccountId(typeof payload.selectedAccountId === "string" ? payload.selectedAccountId : null);
        setWechatLoaded(true);
        return;
      }

      throw new Error(payload?.message ?? "加载公众号账号失败");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "加载公众号账号失败");
      window.setTimeout(() => setNotice(""), 2500);
    } finally {
      setWechatLoading(false);
    }
  }

  async function loadAIProviderConfig() {
    setAIProviderLoading(true);

    try {
      const response = await fetch("/api/ai/provider", { cache: "no-store" });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.config) {
        throw new Error(payload?.message ?? "加载模型配置失败");
      }

      const config = payload.config as AIProviderView;
      setAIProvider(config);
      setAIProviderForm({
        baseUrl: config.baseUrl || aiProviderPresets[0].baseUrl,
        apiKey: "",
        model: config.model || aiProviderPresets[0].model,
        fastModel: config.fastModel || "",
        longformModel: config.longformModel || "",
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "加载模型配置失败");
      window.setTimeout(() => setNotice(""), 2500);
    } finally {
      setAIProviderLoading(false);
    }
  }

  async function loadAIImageProviderConfig() {
    setAIImageProviderLoading(true);

    try {
      const response = await fetch("/api/ai/image-provider", { cache: "no-store" });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.config) {
        throw new Error(payload?.message ?? "加载图片模型配置失败");
      }

      const config = payload.config as AIImageProviderView;
      setAIImageProvider(config);
      setAIImageProviderForm({
        baseUrl: config.baseUrl || "https://api.openai.com/v1",
        apiKey: "",
        model: config.model || "",
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "加载图片模型配置失败");
      window.setTimeout(() => setNotice(""), 2500);
    } finally {
      setAIImageProviderLoading(false);
    }
  }

  const handleWechatFormChange = <K extends keyof WechatAccountForm>(key: K, value: WechatAccountForm[K]) => {
    setWechatForm((current) => ({ ...current, [key]: value }));
  };

  const handleAIProviderFormChange = <K extends keyof AIProviderForm>(key: K, value: AIProviderForm[K]) => {
    setAIProviderForm((current) => ({ ...current, [key]: value }));
  };

  const handleAIImageProviderFormChange = <K extends keyof AIImageProviderForm>(key: K, value: AIImageProviderForm[K]) => {
    setAIImageProviderForm((current) => ({ ...current, [key]: value }));
  };

  const handleApplyAIProviderPreset = (preset: typeof aiProviderPresets[number]) => {
    setAIProviderForm((current) => ({
      ...current,
      baseUrl: preset.baseUrl,
      model: preset.model,
      fastModel: preset.fastModel,
      longformModel: preset.longformModel,
    }));
  };

  const handleSaveAIProviderConfig = async () => {
    setAIProviderLoading(true);

    try {
      const response = await fetch("/api/ai/provider", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(aiProviderForm),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.config) {
        throw new Error(payload?.message ?? "保存模型配置失败");
      }

      const config = payload.config as AIProviderView;
      setAIProvider(config);
      setAIProviderForm((current) => ({ ...current, apiKey: "" }));
      setNotice("模型配置已保存");
      window.setTimeout(() => setNotice(""), 2000);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存模型配置失败");
      window.setTimeout(() => setNotice(""), 3000);
    } finally {
      setAIProviderLoading(false);
    }
  };

  const handleTestAIProviderConfig = async () => {
    setAIProviderTesting(true);

    try {
      const response = await fetch("/api/ai/test", { method: "POST" });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message ?? "模型连接测试失败");
      }

      setNotice(`${payload.provider ?? "模型"} · ${payload.model ?? ""} 测试通过`);
      window.setTimeout(() => setNotice(""), 3000);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "模型连接测试失败");
      window.setTimeout(() => setNotice(""), 4000);
    } finally {
      setAIProviderTesting(false);
    }
  };

  const handleDeleteAIProviderConfig = async () => {
    setAIProviderLoading(true);

    try {
      const response = await fetch("/api/ai/provider", { method: "DELETE" });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.config) {
        throw new Error(payload?.message ?? "恢复环境变量配置失败");
      }

      const config = payload.config as AIProviderView;
      setAIProvider(config);
      setAIProviderForm({
        baseUrl: config.baseUrl || aiProviderPresets[0].baseUrl,
        apiKey: "",
        model: config.model || aiProviderPresets[0].model,
        fastModel: config.fastModel || "",
        longformModel: config.longformModel || "",
      });
      setNotice("已恢复使用环境变量模型配置");
      window.setTimeout(() => setNotice(""), 2500);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "恢复环境变量配置失败");
      window.setTimeout(() => setNotice(""), 3000);
    } finally {
      setAIProviderLoading(false);
    }
  };

  const handleSaveAIImageProviderConfig = async () => {
    setAIImageProviderLoading(true);

    try {
      const response = await fetch("/api/ai/image-provider", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(aiImageProviderForm),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.config) {
        throw new Error(payload?.message ?? "保存图片模型配置失败");
      }

      const config = payload.config as AIImageProviderView;
      setAIImageProvider(config);
      setAIImageProviderForm((current) => ({ ...current, apiKey: "" }));
      setNotice("图片模型配置已保存");
      window.setTimeout(() => setNotice(""), 2000);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存图片模型配置失败");
      window.setTimeout(() => setNotice(""), 3000);
    } finally {
      setAIImageProviderLoading(false);
    }
  };

  const handleDeleteAIImageProviderConfig = async () => {
    setAIImageProviderLoading(true);

    try {
      const response = await fetch("/api/ai/image-provider", { method: "DELETE" });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.config) {
        throw new Error(payload?.message ?? "恢复图片模型环境变量配置失败");
      }

      const config = payload.config as AIImageProviderView;
      setAIImageProvider(config);
      setAIImageProviderForm({
        baseUrl: config.baseUrl || "https://api.openai.com/v1",
        apiKey: "",
        model: config.model || "",
      });
      setNotice("已恢复使用环境变量图片模型配置");
      window.setTimeout(() => setNotice(""), 2500);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "恢复图片模型环境变量配置失败");
      window.setTimeout(() => setNotice(""), 3000);
    } finally {
      setAIImageProviderLoading(false);
    }
  };

  const handleEditWechatAccount = (account: WechatAccountView) => {
    setWechatForm({
      id: account.id,
      name: account.name,
      appId: account.appId,
      appSecret: "",
      defaultAuthor: account.defaultAuthor,
      contentSourceUrl: account.contentSourceUrl,
      setAsSelected: selectedWechatAccountId === account.id,
    });
  };

  const resetWechatForm = () => {
    setWechatForm({
      ...emptyWechatAccountForm,
      setAsSelected: wechatAccounts.length === 0,
    });
  };

  const handleSaveWechatAccount = async () => {
    setWechatLoading(true);

    try {
      const response = await fetch("/api/wechat/accounts", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "upsert",
          account: wechatForm,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload) {
        throw new Error(payload?.message ?? "保存公众号账号失败");
      }

      setWechatAccounts(Array.isArray(payload.accounts) ? payload.accounts as WechatAccountView[] : []);
      setSelectedWechatAccountId(typeof payload.selectedAccountId === "string" ? payload.selectedAccountId : null);
      resetWechatForm();
      setNotice("公众号账号已保存");
      window.setTimeout(() => setNotice(""), 2000);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存公众号账号失败");
      window.setTimeout(() => setNotice(""), 2500);
    } finally {
      setWechatLoading(false);
    }
  };

  const handleDeleteWechatAccount = async (id: string) => {
    setWechatLoading(true);

    try {
      const response = await fetch("/api/wechat/accounts", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload) {
        throw new Error(payload?.message ?? "删除公众号账号失败");
      }

      setWechatAccounts(Array.isArray(payload.accounts) ? payload.accounts as WechatAccountView[] : []);
      setSelectedWechatAccountId(typeof payload.selectedAccountId === "string" ? payload.selectedAccountId : null);
      if (wechatForm.id === id) {
        resetWechatForm();
      }
      setNotice("公众号账号已删除");
      window.setTimeout(() => setNotice(""), 2000);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "删除公众号账号失败");
      window.setTimeout(() => setNotice(""), 2500);
    } finally {
      setWechatLoading(false);
    }
  };

  const handleSelectWechatAccount = async (id: string) => {
    setWechatLoading(true);

    try {
      const response = await fetch("/api/wechat/accounts", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "select",
          selectedAccountId: id,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload) {
        throw new Error(payload?.message ?? "切换默认公众号失败");
      }

      setWechatAccounts(Array.isArray(payload.accounts) ? payload.accounts as WechatAccountView[] : []);
      setSelectedWechatAccountId(typeof payload.selectedAccountId === "string" ? payload.selectedAccountId : null);
      setWechatForm((current) => ({ ...current, setAsSelected: current.id ? current.id === id : true }));
      setNotice("默认公众号已更新");
      window.setTimeout(() => setNotice(""), 2000);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "切换默认公众号失败");
      window.setTimeout(() => setNotice(""), 2500);
    } finally {
      setWechatLoading(false);
    }
  };

  const handleVerifyWechatAccount = async (id: string) => {
    setWechatLoading(true);

    try {
      const response = await fetch("/api/wechat/accounts", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "verify",
          accountId: id,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload) {
        throw new Error(payload?.message ?? "公众号连接测试失败");
      }

      setNotice(`连接测试通过${payload.accountName ? ` · ${payload.accountName}` : ""}`);
      window.setTimeout(() => setNotice(""), 2500);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "公众号连接测试失败");
      window.setTimeout(() => setNotice(""), 3000);
    } finally {
      setWechatLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1320px]">
      <div className="grid gap-6 xl:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="hidden xl:block">
          <div className="sticky top-6 overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f6f9ff_58%,#f9fbff_100%)] shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
            <div className="border-b border-slate-100 px-5 pb-4 pt-5">
              <div className="text-[11px] uppercase tracking-[0.24em] text-blue-500/80">Quick Jump</div>
              <div className="mt-2 text-[18px] text-slate-900" style={{ fontWeight: 700 }}>快速定位</div>
              <div className="mt-2 text-[12px] leading-5 text-slate-500">
                直接跳到对应配置分组，长页设置时不用来回滚动。
              </div>
            </div>

            <div className="px-3 py-3">
              {settingsSections.map((section, index) => {
                const Icon = section.icon;
                const isActive = activeSectionId === section.id;

                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => scrollToSection(section.id)}
                    className={`group flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors transition-shadow ${
                      isActive
                        ? "bg-blue-600 text-white shadow-[0_12px_30px_rgba(37,99,235,0.22)]"
                        : "text-slate-600 hover:bg-white hover:text-slate-900"
                    }`}
                  >
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border text-[12px] ${
                        isActive
                          ? "border-white/20 bg-white/14 text-white"
                          : "border-slate-200 bg-slate-50 text-slate-500 group-hover:border-blue-100 group-hover:bg-blue-50 group-hover:text-blue-600"
                      }`}
                      style={{ fontWeight: 700 }}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px]" style={{ fontWeight: 600 }}>{section.title}</span>
                        <span className={`text-[10px] ${isActive ? "text-blue-100" : "text-slate-400"}`}>{String(index + 1).padStart(2, "0")}</span>
                      </div>
                      <div className={`mt-1 line-clamp-2 text-[11px] leading-5 ${isActive ? "text-blue-100/90" : "text-slate-400"}`}>
                        {section.hint}
                      </div>
                    </div>
                    <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${isActive ? "translate-x-0 text-white" : "text-slate-300 group-hover:translate-x-0.5 group-hover:text-blue-400"}`} />
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        <div className="min-w-0 space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-[20px]" style={{ fontWeight: 600 }}>账号设置</h1>
              <p className="mt-1 text-[13px] text-gray-500">配置账号人设、可覆盖领域、写作风格和默认排版偏好，AI 会在生成每篇文章时综合参考</p>
            </div>
            <div className="w-full lg:w-auto">
              <div className="rounded-[24px] border border-slate-200/80 bg-white/90 p-3 shadow-[0_16px_40px_rgba(15,23,42,0.06)] backdrop-blur">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Settings</div>
                    <div className={`mt-1 text-[13px] ${notice ? "text-green-600" : isDirty ? "text-amber-600" : "text-slate-600"}`} style={{ fontWeight: 600 }}>
                      {notice || (isDirty ? "有未保存修改" : "当前配置已同步")}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={handleRestoreDefaults}
                      className="flex items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-[13px] text-slate-600 transition-colors hover:bg-slate-100"
                      style={{ fontWeight: 500 }}
                    >
                      <RotateCcw className="w-4 h-4" /> 恢复默认
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={!isDirty}
                      className="flex items-center justify-center gap-1.5 rounded-2xl bg-[linear-gradient(135deg,#3b82f6_0%,#60a5fa_100%)] px-4 py-2.5 text-[13px] text-white shadow-[0_10px_24px_rgba(59,130,246,0.24)] transition-all hover:translate-y-[-1px] hover:shadow-[0_14px_28px_rgba(59,130,246,0.28)] disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-blue-300 disabled:shadow-none"
                      style={{ fontWeight: 600 }}
                    >
                      <Save className="w-4 h-4" /> 保存设置
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="xl:hidden">
            <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white px-3 py-3 shadow-sm">
              <div className="flex min-w-max gap-2">
                {settingsSections.map((section) => {
                  const Icon = section.icon;
                  const isActive = activeSectionId === section.id;

                  return (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => scrollToSection(section.id)}
                      className={`flex items-center gap-2 rounded-full border px-3 py-2 text-[12px] transition-colors ${
                        isActive
                          ? "border-blue-200 bg-blue-50 text-blue-600"
                          : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-white"
                      }`}
                      style={{ fontWeight: 500 }}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {section.title}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

      <Section id="account-profile" title="账号定位">
        <Field label="账号名称" value={form.accountName} onChange={(value) => updateField("accountName", value)} />
        <Field label="账号定位" value={form.accountPosition} onChange={(value) => updateField("accountPosition", value)} />
        <DomainSelector label="账号可覆盖领域" values={form.contentAreas} onChange={(values) => updateField("contentAreas", values)} />
      </Section>

      <Section id="reader-persona" title="目标读者画像">
        <Field label="年龄范围" value={form.readerAgeRange} onChange={(value) => updateField("readerAgeRange", value)} />
        <Field label="职业特征" value={form.readerJobTraits} onChange={(value) => updateField("readerJobTraits", value)} />
        <Field label="核心需求" value={form.readerNeeds} onChange={(value) => updateField("readerNeeds", value)} />
      </Section>

      <Section id="brand-tone" title="品牌语气关键词">
        <TagEditor label="语气风格标签" values={form.toneKeywords} color="green" onChange={(values) => updateField("toneKeywords", values)} />
      </Section>

      <Section id="restricted-topics" title="禁写领域 / 敏感词">
        <TagEditor label="禁止涉及的话题或词汇" values={form.bannedTopics} color="red" onChange={(values) => updateField("bannedTopics", values)} />
      </Section>

      <Section id="cta-copy" title="常用 CTA 文案">
        <Field label="关注引导" value={form.ctaFollow} onChange={(value) => updateField("ctaFollow", value)} />
        <Field label="互动引导" value={form.ctaEngage} onChange={(value) => updateField("ctaEngage", value)} />
        <Field label="转发引导" value={form.ctaShare} onChange={(value) => updateField("ctaShare", value)} />
      </Section>

      <Section id="default-template" title="默认排版模板">
        <div>
          <label className="text-[12px] text-gray-500 mb-1.5 block">首选模板</label>
          <div className="grid grid-cols-4 gap-2">
            {["极简白", "科技蓝", "商务灰", "暖色调"].map((template) => (
              <button
                key={template}
                onClick={() => updateField("defaultTemplate", template)}
                className={`p-3 rounded-lg border text-[12px] text-center transition-colors ${
                  form.defaultTemplate === template ? "bg-blue-50 border-blue-200 text-blue-600" : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                }`}
                style={{ fontWeight: 500 }}
              >
                {template}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section id="ai-writer" title="AI 写作模型">
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-[13px] leading-6 text-blue-800">
          API Key 只保存在服务端配置里。中转服务直接填写它提供的 OpenAI 兼容 Base URL、Key 和模型名；保存后，标题、大纲、正文生成会优先使用这里的模型。
        </div>

        <div className="grid gap-2 sm:grid-cols-6">
          {aiProviderPresets.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => handleApplyAIProviderPreset(preset)}
              className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[12px] text-gray-600 hover:bg-gray-100"
              style={{ fontWeight: 500 }}
            >
              {preset.name}
            </button>
          ))}
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <Field
            label="接口地址 Base URL"
            value={aiProviderForm.baseUrl}
            onChange={(value) => handleAIProviderFormChange("baseUrl", value)}
          />
          <Field
            label={aiProvider?.hasApiKey ? "API Key（留空则保持不变）" : "API Key"}
            value={aiProviderForm.apiKey}
            onChange={(value) => handleAIProviderFormChange("apiKey", value)}
            type="password"
          />
          <Field
            label="默认写作模型"
            value={aiProviderForm.model}
            onChange={(value) => handleAIProviderFormChange("model", value)}
          />
          <Field
            label="快模型（标题 / 大纲 / 改写）"
            value={aiProviderForm.fastModel}
            onChange={(value) => handleAIProviderFormChange("fastModel", value)}
          />
          <Field
            label="长文模型（正文 / 全文）"
            value={aiProviderForm.longformModel}
            onChange={(value) => handleAIProviderFormChange("longformModel", value)}
          />
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-[12px] leading-6 text-gray-500">
            <div className="text-gray-900" style={{ fontWeight: 600 }}>当前状态</div>
            <div>来源：{aiProvider?.source === "database" ? "页面配置" : aiProvider?.source === "environment" ? "环境变量" : "默认配置"}</div>
            <div>密钥：{aiProvider?.hasApiKey ? "已配置" : "未配置"}</div>
            <div className="truncate">模型：{aiProvider?.model || aiProviderForm.model || "未设置"}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleSaveAIProviderConfig()}
            disabled={aiProviderLoading}
            className="rounded-lg bg-blue-600 px-4 py-2 text-[13px] text-white hover:bg-blue-700 disabled:bg-blue-300"
            style={{ fontWeight: 500 }}
          >
            {aiProviderLoading ? "保存中" : "保存模型配置"}
          </button>
          <button
            type="button"
            onClick={() => void loadAIProviderConfig()}
            disabled={aiProviderLoading}
            className="rounded-lg border border-gray-200 px-4 py-2 text-[13px] text-gray-600 hover:bg-gray-50 disabled:opacity-60"
            style={{ fontWeight: 500 }}
          >
            重新读取
          </button>
          <button
            type="button"
            onClick={() => void handleTestAIProviderConfig()}
            disabled={aiProviderLoading || aiProviderTesting}
            className="rounded-lg border border-blue-200 px-4 py-2 text-[13px] text-blue-600 hover:bg-blue-50 disabled:opacity-60"
            style={{ fontWeight: 500 }}
          >
            {aiProviderTesting ? "测试中" : "测试模型"}
          </button>
          {aiProvider?.source === "database" ? (
            <button
              type="button"
              onClick={() => void handleDeleteAIProviderConfig()}
              disabled={aiProviderLoading}
              className="rounded-lg border border-red-100 px-4 py-2 text-[13px] text-red-500 hover:bg-red-50 disabled:opacity-60"
              style={{ fontWeight: 500 }}
            >
              使用环境变量
            </button>
          ) : null}
        </div>
      </Section>

      <Section id="ai-image" title="AI 图片模型">
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-[13px] leading-6 text-amber-800">
          这里配置的是 AI 配图模型；真实图片搜索不受影响。留空时继续使用环境变量里的图片模型。
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <Field
            label="图片接口 Base URL"
            value={aiImageProviderForm.baseUrl}
            onChange={(value) => handleAIImageProviderFormChange("baseUrl", value)}
          />
          <Field
            label={aiImageProvider?.hasApiKey ? "图片 API Key（留空则保持不变）" : "图片 API Key"}
            value={aiImageProviderForm.apiKey}
            onChange={(value) => handleAIImageProviderFormChange("apiKey", value)}
            type="password"
          />
          <Field
            label="图片模型"
            value={aiImageProviderForm.model}
            onChange={(value) => handleAIImageProviderFormChange("model", value)}
          />
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-[12px] leading-6 text-gray-500">
            <div className="text-gray-900" style={{ fontWeight: 600 }}>当前状态</div>
            <div>来源：{aiImageProvider?.source === "database" ? "页面配置" : aiImageProvider?.source === "environment" ? "环境变量" : "默认配置"}</div>
            <div>密钥：{aiImageProvider?.hasApiKey ? "已配置" : "未配置"}</div>
            <div className="truncate">模型：{aiImageProvider?.model || aiImageProviderForm.model || "未设置"}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleSaveAIImageProviderConfig()}
            disabled={aiImageProviderLoading}
            className="rounded-lg bg-amber-600 px-4 py-2 text-[13px] text-white hover:bg-amber-700 disabled:bg-amber-300"
            style={{ fontWeight: 500 }}
          >
            {aiImageProviderLoading ? "保存中" : "保存图片模型"}
          </button>
          <button
            type="button"
            onClick={() => void loadAIImageProviderConfig()}
            disabled={aiImageProviderLoading}
            className="rounded-lg border border-gray-200 px-4 py-2 text-[13px] text-gray-600 hover:bg-gray-50 disabled:opacity-60"
            style={{ fontWeight: 500 }}
          >
            重新读取
          </button>
          {aiImageProvider?.source === "database" ? (
            <button
              type="button"
              onClick={() => void handleDeleteAIImageProviderConfig()}
              disabled={aiImageProviderLoading}
              className="rounded-lg border border-red-100 px-4 py-2 text-[13px] text-red-500 hover:bg-red-50 disabled:opacity-60"
              style={{ fontWeight: 500 }}
            >
              使用环境变量
            </button>
          ) : null}
        </div>
      </Section>

      <Section id="wechat-account" title="公众号接入">
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-[13px] leading-6 text-emerald-800">
          AppSecret 只会走服务端保存，不会进入浏览器本地草稿和普通设置同步里。
        </div>
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[13px] text-gray-900" style={{ fontWeight: 600 }}>已配置公众号</div>
              <button
                type="button"
                onClick={resetWechatForm}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] text-gray-600 hover:bg-gray-50"
                style={{ fontWeight: 500 }}
              >
                新增账号
              </button>
            </div>

            {!wechatAccounts.length && wechatLoaded ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-[13px] text-gray-500">
                还没有配置公众号账号。添加后就可以在排版页选择并推送到对应草稿箱。
              </div>
            ) : null}

            <div className="space-y-3">
              {wechatAccounts.map((account) => {
                const isSelected = selectedWechatAccountId === account.id;

                return (
                  <div key={account.id} className={`rounded-xl border px-4 py-3 ${isSelected ? "border-emerald-200 bg-emerald-50/70" : "border-gray-200 bg-white"}`}>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[14px] text-gray-900" style={{ fontWeight: 600 }}>{account.name}</span>
                          {isSelected ? (
                            <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] text-white">默认</span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-[12px] text-gray-500">AppID：{account.appIdMasked}</div>
                        <div className="mt-1 text-[12px] text-gray-500">
                          Author：{account.defaultAuthor || "未设置"} · Secret：{account.hasAppSecret ? "已配置" : "未配置"}
                        </div>
                      </div>
                      <div className="flex flex-nowrap items-center gap-2 lg:max-w-[46%] lg:justify-end">
                        {!isSelected ? (
                          <button
                            type="button"
                            onClick={() => void handleSelectWechatAccount(account.id)}
                            aria-label="设为默认"
                            title="设为默认"
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                          >
                            <Star className="h-4 w-4" />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => handleEditWechatAccount(account)}
                          aria-label="编辑"
                          title="编辑"
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteWechatAccount(account.id)}
                          aria-label="删除"
                          title="删除"
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-100 text-red-500 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-4 space-y-3">
            <div className="text-[13px] text-gray-900" style={{ fontWeight: 600 }}>
              {wechatForm.id ? "编辑公众号账号" : "新增公众号账号"}
            </div>
            <Field label="账号名称" value={wechatForm.name} onChange={(value) => handleWechatFormChange("name", value)} />
            <Field label="AppID" value={wechatForm.appId} onChange={(value) => handleWechatFormChange("appId", value)} />
            <Field
              label={wechatForm.id ? "AppSecret（留空则保持不变）" : "AppSecret"}
              value={wechatForm.appSecret}
              onChange={(value) => handleWechatFormChange("appSecret", value)}
              type="password"
            />
            <Field label="默认作者" value={wechatForm.defaultAuthor} onChange={(value) => handleWechatFormChange("defaultAuthor", value)} />
            <label className="flex items-center gap-2 text-[12px] text-gray-600">
              <input
                type="checkbox"
                checked={wechatForm.setAsSelected}
                onChange={(event) => handleWechatFormChange("setAsSelected", event.target.checked)}
              />
              保存后设为默认公众号
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleSaveWechatAccount()}
                disabled={wechatLoading}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-[12px] text-white hover:bg-emerald-700 disabled:bg-emerald-300"
                style={{ fontWeight: 500 }}
              >
                {wechatForm.id ? "保存账号" : "添加账号"}
              </button>
              {wechatForm.id ? (
                <button
                  type="button"
                  onClick={resetWechatForm}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-[12px] text-gray-600 hover:bg-gray-50"
                  style={{ fontWeight: 500 }}
                >
                  取消编辑
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </Section>

      <Section id="content-preferences" title="内容偏好标签">
        <TagEditor label="你偏好生成的内容形式" values={form.contentPreferences} color="purple" onChange={(values) => updateField("contentPreferences", values)} />
      </Section>

          <div className="flex justify-end text-[12px] text-gray-400">
            {isDirty ? "你有未保存的修改" : "当前设置已同步到云端"}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 rounded-xl border border-gray-100 bg-white p-5">
      <h3 className="text-[14px] mb-4 pb-3 border-b border-gray-50" style={{ fontWeight: 600 }}>{title}</h3>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "password";
}) {
  return (
    <div>
      <label className="text-[12px] text-gray-500 mb-1.5 block">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-blue-300 focus:bg-white transition-colors"
      />
    </div>
  );
}

function TagEditor({
  label,
  values,
  color,
  onChange,
}: {
  label: string;
  values: string[];
  color: "blue" | "green" | "red" | "purple";
  onChange: (values: string[]) => void;
}) {
  const [draftValue, setDraftValue] = useState("");

  const colorClasses = {
    blue: "bg-blue-50 text-blue-600 hover:text-blue-800 hover:border-blue-300",
    green: "bg-green-50 text-green-600 hover:text-green-800 hover:border-green-300",
    red: "bg-red-50 text-red-500 hover:text-red-700 hover:border-red-300",
    purple: "bg-purple-50 text-purple-600 hover:text-purple-800 hover:border-purple-300",
  };

  const addTag = () => {
    const trimmedValue = draftValue.trim();
    if (!trimmedValue || values.includes(trimmedValue)) return;
    onChange([...values, trimmedValue]);
    setDraftValue("");
  };

  return (
    <div>
      <label className="text-[12px] text-gray-500 mb-1.5 block">{label}</label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {values.map((value) => (
          <span key={value} className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] ${colorClasses[color]}`} style={{ fontWeight: 500 }}>
            {value}
            <button type="button" onClick={() => onChange(values.filter((item) => item !== value))}>
              <X className="w-3 h-3 cursor-pointer" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          value={draftValue}
          onChange={(event) => setDraftValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addTag();
            }
          }}
          className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-blue-300 focus:bg-white transition-colors"
          placeholder="输入后回车添加"
        />
        <button
          type="button"
          onClick={addTag}
          className="flex items-center gap-1 border border-dashed border-gray-300 px-2.5 py-2 rounded-full text-[12px] text-gray-400 hover:text-gray-700"
        >
          <Plus className="w-3 h-3" /> 添加
        </button>
      </div>
    </div>
  );
}

function DomainSelector({
  label,
  values,
  onChange,
}: {
  label: string;
  values: ArticleDomain[];
  onChange: (values: ArticleDomain[]) => void;
}) {
  const toggleDomain = (domain: ArticleDomain) => {
    if (values.includes(domain)) {
      if (values.length === 1) return;
      onChange(values.filter((item) => item !== domain));
      return;
    }

    onChange([...values, domain]);
  };

  return (
    <div>
      <label className="text-[12px] text-gray-500 mb-1.5 block">{label}</label>
      <div className="grid grid-cols-3 gap-2">
        {articleDomains.map((domain) => {
          const active = values.includes(domain);
          return (
            <button
              key={domain}
              type="button"
              onClick={() => toggleDomain(domain)}
              className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                active
                  ? "border-blue-200 bg-blue-50"
                  : "border-gray-200 bg-gray-50 hover:bg-white hover:border-gray-300"
              }`}
            >
              <div className="flex items-center gap-2 text-[13px]" style={{ fontWeight: 600 }}>
                <span>{domainConfigs[domain].icon}</span>
                <span className={active ? "text-blue-700" : "text-gray-800"}>{domain}</span>
              </div>
              <div className="mt-1 text-[11px] leading-5 text-gray-500">{domainConfigs[domain].description}</div>
            </button>
          );
        })}
      </div>
      <div className="mt-2 text-[11px] text-gray-400">至少保留 1 个领域，写作页会基于这里展示可选范围。</div>
    </div>
  );
}

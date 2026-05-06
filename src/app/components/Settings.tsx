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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
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

type AIProviderKind = "openai" | "anthropic";

type AIProviderProfileView = {
  id: string;
  name: string;
  providerType: AIProviderKind;
  baseUrl: string;
  model: string;
  fastModel: string;
  longformModel: string;
  hasApiKey: boolean;
  maskedApiKey: string;
  isActive: boolean;
};

type AIProviderView = {
  activeProfileId: string | null;
  activeProfile: AIProviderProfileView | null;
  profiles: AIProviderProfileView[];
  source: "local" | "environment" | "default";
};

type AIProviderForm = {
  id: string;
  name: string;
  providerType: AIProviderKind;
  baseUrl: string;
  apiKey: string;
  model: string;
  fastModel: string;
  longformModel: string;
  setAsActive: boolean;
};

type AIImageProviderProfileView = {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  maskedApiKey: string;
  isActive: boolean;
};

type AIImageProviderView = {
  activeProfileId: string | null;
  activeProfile: AIImageProviderProfileView | null;
  profiles: AIImageProviderProfileView[];
  source: "local" | "environment" | "default";
};

type AIImageProviderForm = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  setAsActive: boolean;
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
  id: "",
  name: "",
  providerType: "openai",
  baseUrl: "",
  apiKey: "",
  model: "",
  fastModel: "",
  longformModel: "",
  setAsActive: true,
};

const emptyAIImageProviderForm: AIImageProviderForm = {
  id: "",
  name: "",
  baseUrl: "",
  apiKey: "",
  model: "",
  setAsActive: true,
};

const aiProviderPresets: Array<{
  kind: AIProviderKind;
  name: string;
  baseUrl: string;
  model: string;
  fastModel: string;
  longformModel: string;
}> = [
  {
    kind: "openai",
    name: "兼容 OpenAI 接口协议",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    fastModel: "",
    longformModel: "",
  },
  {
    kind: "anthropic",
    name: "兼容 Anthropic 接口协议",
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-3-5-sonnet-latest",
    fastModel: "",
    longformModel: "",
  },
] as const;

const aiProviderPresetDetails: Record<
  (typeof aiProviderPresets)[number]["kind"],
  { hint: string; tag: string }
> = {
  openai: { hint: "适合 OpenAI 官方，以及大多数兼容 OpenAI 协议的模型服务。", tag: "兼容" },
  anthropic: { hint: "适合 Claude 原生接口，以及兼容 Anthropic messages 协议的模型服务。", tag: "兼容" },
};

function buildAIProviderFormFromProfile(profile: AIProviderProfileView | null): AIProviderForm {
  return {
    id: profile?.id ?? "",
    name: profile?.name ?? "",
    providerType: profile?.providerType ?? "openai",
    baseUrl: profile?.baseUrl || aiProviderPresets[0].baseUrl,
    apiKey: "",
    model: profile?.model || aiProviderPresets[0].model,
    fastModel: profile?.fastModel || "",
    longformModel: profile?.longformModel || "",
    setAsActive: profile?.isActive ?? true,
  };
}

function buildAIImageProviderFormFromProfile(profile: AIImageProviderProfileView | null): AIImageProviderForm {
  return {
    id: profile?.id ?? "",
    name: profile?.name ?? "",
    baseUrl: profile?.baseUrl || "https://api.openai.com/v1",
    apiKey: "",
    model: profile?.model || "",
    setAsActive: profile?.isActive ?? true,
  };
}

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
  const [isWechatDialogOpen, setIsWechatDialogOpen] = useState(false);
  const [wechatLoading, setWechatLoading] = useState(false);
  const [wechatLoaded, setWechatLoaded] = useState(false);
  const [aiProvider, setAIProvider] = useState<AIProviderView | null>(null);
  const [aiProviderForm, setAIProviderForm] = useState<AIProviderForm>(emptyAIProviderForm);
  const [aiProviderLoading, setAIProviderLoading] = useState(false);
  const [aiProviderTesting, setAIProviderTesting] = useState(false);
  const [aiProviderTestFeedback, setAIProviderTestFeedback] = useState<{ type: "idle" | "success" | "error"; message: string } | null>(null);
  const [isAIProviderDialogOpen, setIsAIProviderDialogOpen] = useState(false);
  const [isAIModelRolesOpen, setIsAIModelRolesOpen] = useState(false);
  const [aiImageProvider, setAIImageProvider] = useState<AIImageProviderView | null>(null);
  const [aiImageProviderForm, setAIImageProviderForm] = useState<AIImageProviderForm>(emptyAIImageProviderForm);
  const [aiImageProviderLoading, setAIImageProviderLoading] = useState(false);
  const [isAIImageProviderDialogOpen, setIsAIImageProviderDialogOpen] = useState(false);
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
    let frameId = 0;
    const scrollRoot = document.getElementById("app-scroll-root");

    const updateActiveSection = () => {
      if (isProgrammaticScrollRef.current) return;

      const activationOffset = 180;
      let nextActiveSectionId = settingsSections[0]?.id ?? "";
      const scrollRootTop = scrollRoot?.getBoundingClientRect().top ?? 0;

      settingsSections.forEach((section) => {
        const element = document.getElementById(section.id);
        if (!element) return;

        const elementTop = scrollRoot
          ? element.getBoundingClientRect().top - scrollRootTop
          : element.getBoundingClientRect().top;

        if (elementTop - activationOffset <= 0) {
          nextActiveSectionId = section.id;
        }
      });

      setActiveSectionId((current) => (current === nextActiveSectionId ? current : nextActiveSectionId));
    };

    const handleScroll = () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(updateActiveSection);
    };

    updateActiveSection();
    if (scrollRoot) {
      scrollRoot.addEventListener("scroll", handleScroll, { passive: true });
    } else {
      window.addEventListener("scroll", handleScroll, { passive: true });
    }
    window.addEventListener("resize", handleScroll);

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      if (scrollRoot) {
        scrollRoot.removeEventListener("scroll", handleScroll);
      } else {
        window.removeEventListener("scroll", handleScroll);
      }
      window.removeEventListener("resize", handleScroll);
    };
  }, []);

  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(settings), [form, settings]);
  const aiProviderProtocolHint = aiProviderForm.providerType === "anthropic"
    ? "适合 Claude 原生接口和 Anthropic-compatible 服务"
    : "适合 OpenAI 官方及大多数 OpenAI-compatible 服务";

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

  const openCreateAIImageProviderDialog = () => {
    setAIImageProviderForm({
      ...emptyAIImageProviderForm,
      baseUrl: "https://api.openai.com/v1",
      setAsActive: true,
    });
    setIsAIImageProviderDialogOpen(true);
  };

  const openEditAIImageProviderDialog = (profile: AIImageProviderProfileView) => {
    setAIImageProviderForm(
      aiImageProvider?.source === "local"
        ? buildAIImageProviderFormFromProfile(profile)
        : {
            ...buildAIImageProviderFormFromProfile(profile),
            id: "",
            name: `${profile.name}（本地）`,
            setAsActive: true,
          },
    );
    setIsAIImageProviderDialogOpen(true);
  };

  const closeAIImageProviderDialog = () => {
    setIsAIImageProviderDialogOpen(false);
    setAIImageProviderForm(emptyAIImageProviderForm);
  };

  const handleApplyAIProviderPreset = (preset: typeof aiProviderPresets[number]) => {
    setAIProviderForm((current) => ({
      ...current,
      providerType: preset.kind,
      baseUrl: current.baseUrl.trim() ? current.baseUrl : preset.baseUrl,
      model: current.model.trim() ? current.model : preset.model,
      fastModel: current.fastModel.trim() ? current.fastModel : preset.fastModel,
      longformModel: current.longformModel.trim() ? current.longformModel : preset.longformModel,
    }));
    setIsAIModelRolesOpen(Boolean(preset.fastModel || preset.longformModel));
  };

  const openCreateAIProviderDialog = () => {
    setAIProviderForm({
      ...emptyAIProviderForm,
      providerType: "openai",
      baseUrl: aiProviderPresets[0].baseUrl,
      model: aiProviderPresets[0].model,
      setAsActive: true,
    });
    setIsAIModelRolesOpen(false);
    setAIProviderTestFeedback(null);
    setIsAIProviderDialogOpen(true);
  };

  const openEditAIProviderDialog = (profile: AIProviderProfileView) => {
    setAIProviderForm(
      aiProvider?.source === "local"
        ? buildAIProviderFormFromProfile(profile)
        : {
            ...buildAIProviderFormFromProfile(profile),
            id: "",
            name: `${profile.name}（本地）`,
            setAsActive: true,
          },
    );
    setIsAIModelRolesOpen(Boolean(profile.fastModel || profile.longformModel));
    setAIProviderTestFeedback(null);
    setIsAIProviderDialogOpen(true);
  };

  const closeAIProviderDialog = () => {
    setIsAIProviderDialogOpen(false);
    setAIProviderForm(emptyAIProviderForm);
    setIsAIModelRolesOpen(false);
    setAIProviderTestFeedback(null);
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
      closeAIProviderDialog();
      setAIProviderTestFeedback(null);
      setNotice(aiProviderForm.id ? "写作模型配置已更新" : "写作模型配置已添加");
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
    setAIProviderTestFeedback({
      type: "idle",
      message: "正在测试当前表单配置...",
    });

    try {
      const response = await fetch("/api/ai/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          providerType: aiProviderForm.providerType,
          baseUrl: aiProviderForm.baseUrl,
          apiKey: aiProviderForm.apiKey,
          model: aiProviderForm.model,
          fastModel: aiProviderForm.fastModel,
          longformModel: aiProviderForm.longformModel,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message ?? "模型连接测试失败");
      }

      setAIProviderTestFeedback({
        type: "success",
        message: `${payload.provider ?? "模型"} · ${payload.model ?? ""} 测试通过`,
      });
      setNotice(`${payload.provider ?? "模型"} · ${payload.model ?? ""} 测试通过`);
      window.setTimeout(() => setNotice(""), 3000);
    } catch (error) {
      setAIProviderTestFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "模型连接测试失败",
      });
      setNotice(error instanceof Error ? error.message : "模型连接测试失败");
      window.setTimeout(() => setNotice(""), 4000);
    } finally {
      setAIProviderTesting(false);
    }
  };

  const handleActivateAIProviderConfig = async (profileId: string) => {
    setAIProviderLoading(true);

    try {
      const response = await fetch("/api/ai/provider", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ profileId }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.config) {
        throw new Error(payload?.message ?? "切换默认模型配置失败");
      }

      setAIProvider(payload.config as AIProviderView);
      setNotice("默认写作模型已切换");
      window.setTimeout(() => setNotice(""), 2000);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "切换默认模型配置失败");
      window.setTimeout(() => setNotice(""), 3000);
    } finally {
      setAIProviderLoading(false);
    }
  };

  const handleDeleteAIProviderConfig = async (profileId?: string) => {
    setAIProviderLoading(true);

    try {
      const url = profileId ? `/api/ai/provider?profileId=${encodeURIComponent(profileId)}` : "/api/ai/provider";
      const response = await fetch(url, { method: "DELETE" });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.config) {
        throw new Error(payload?.message ?? "删除模型配置失败");
      }

      const config = payload.config as AIProviderView;
      setAIProvider(config);
      if (isAIProviderDialogOpen && aiProviderForm.id === profileId) {
        closeAIProviderDialog();
      }
      setAIProviderTestFeedback(null);
      setNotice(profileId ? "模型配置已删除" : "已清空本地写作模型配置");
      window.setTimeout(() => setNotice(""), 2500);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "删除模型配置失败");
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
      closeAIImageProviderDialog();
      setNotice(aiImageProviderForm.id ? "图片模型配置已更新" : "图片模型配置已添加");
      window.setTimeout(() => setNotice(""), 2000);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存图片模型配置失败");
      window.setTimeout(() => setNotice(""), 3000);
    } finally {
      setAIImageProviderLoading(false);
    }
  };

  const handleActivateAIImageProviderConfig = async (profileId: string) => {
    setAIImageProviderLoading(true);

    try {
      const response = await fetch("/api/ai/image-provider", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ profileId }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.config) {
        throw new Error(payload?.message ?? "切换默认图片模型配置失败");
      }

      setAIImageProvider(payload.config as AIImageProviderView);
      setNotice("默认图片模型已切换");
      window.setTimeout(() => setNotice(""), 2000);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "切换默认图片模型配置失败");
      window.setTimeout(() => setNotice(""), 3000);
    } finally {
      setAIImageProviderLoading(false);
    }
  };

  const handleDeleteAIImageProviderConfig = async (profileId?: string) => {
    setAIImageProviderLoading(true);

    try {
      const url = profileId ? `/api/ai/image-provider?profileId=${encodeURIComponent(profileId)}` : "/api/ai/image-provider";
      const response = await fetch(url, { method: "DELETE" });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.config) {
        throw new Error(payload?.message ?? "删除图片模型配置失败");
      }

      const config = payload.config as AIImageProviderView;
      setAIImageProvider(config);
      if (isAIImageProviderDialogOpen && aiImageProviderForm.id === profileId) {
        closeAIImageProviderDialog();
      }
      setNotice(profileId ? "图片模型配置已删除" : "已清空本地图片模型配置");
      window.setTimeout(() => setNotice(""), 2500);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "删除图片模型配置失败");
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
    setIsWechatDialogOpen(true);
  };

  const resetWechatForm = () => {
    setWechatForm({
      ...emptyWechatAccountForm,
      setAsSelected: wechatAccounts.length === 0,
    });
  };

  const openNewWechatAccountDialog = () => {
    resetWechatForm();
    setIsWechatDialogOpen(true);
  };

  const closeWechatAccountDialog = () => {
    setIsWechatDialogOpen(false);
    resetWechatForm();
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
      setIsWechatDialogOpen(false);
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
        setIsWechatDialogOpen(false);
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
          <div className="sticky top-6 overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f6f9ff_58%,#f9fbff_100%)] shadow-[0_24px_60px_rgba(15,23,42,0.08)] [transform:translateZ(0)] [backface-visibility:hidden] will-change-transform">
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
                <div className="flex flex-wrap items-center justify-end gap-2">
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
        <div className="rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-[12px] uppercase tracking-[0.16em] text-slate-400">Profiles</div>
              <div className="mt-1 text-[16px] text-slate-900" style={{ fontWeight: 700 }}>写作模型配置列表</div>
              <div className="mt-1 text-[12px] leading-5 text-slate-500">
                支持保存多套模型入口，通过列表快速切换默认配置。API Key 只会保存在本地，不会上传或泄露。
              </div>
            </div>
            <button
              type="button"
              onClick={openCreateAIProviderDialog}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-[13px] text-white hover:bg-blue-700"
              style={{ fontWeight: 600 }}
            >
              <Plus className="h-4 w-4" />
              新增模型配置
            </button>
          </div>

          {(aiProvider?.profiles?.length ?? 0) === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-white/80 px-4 py-5 text-[13px] leading-6 text-slate-500">
              当前还没有本地写作模型配置。新增一套后，就可以在这里设置默认并快速切换。
            </div>
          ) : null}

          <div className="mt-5 grid gap-3">
            {(aiProvider?.profiles ?? []).map((profile) => {
              const meta = aiProviderPresetDetails[profile.providerType];

              return (
                <div
                  key={profile.id}
                  className={`rounded-2xl border px-4 py-4 transition-colors ${
                    profile.isActive
                      ? "border-blue-200 bg-blue-50/70"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-[14px] text-slate-900" style={{ fontWeight: 700 }}>{profile.name}</div>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500" style={{ fontWeight: 700 }}>
                          {meta.tag}
                        </span>
                        {profile.isActive ? (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] text-blue-700" style={{ fontWeight: 700 }}>
                            默认
                          </span>
                        ) : null}
                        {aiProvider?.source !== "local" ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700" style={{ fontWeight: 700 }}>
                            {aiProvider?.source === "environment" ? "环境变量" : "默认值"}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 text-[13px] leading-6 text-slate-600">
                        {profile.providerType === "anthropic" ? "Anthropic 协议" : "OpenAI 协议"} · {profile.model}
                      </div>
                      <div className="text-[12px] leading-5 text-slate-500">{profile.baseUrl}</div>
                      {(profile.fastModel || profile.longformModel) ? (
                        <div className="mt-2 text-[12px] leading-5 text-slate-500">
                          {profile.fastModel ? `快模型：${profile.fastModel}` : "快模型未设置"}
                          {" · "}
                          {profile.longformModel ? `长文模型：${profile.longformModel}` : "长文模型未设置"}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {!profile.isActive && aiProvider?.source === "local" ? (
                        <button
                          type="button"
                          onClick={() => void handleActivateAIProviderConfig(profile.id)}
                          disabled={aiProviderLoading}
                          className="rounded-xl border border-blue-200 px-3 py-2 text-[12px] text-blue-600 hover:bg-blue-50 disabled:opacity-60"
                          style={{ fontWeight: 600 }}
                        >
                          设为默认
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => openEditAIProviderDialog(profile)}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-[12px] text-slate-600 hover:bg-slate-50"
                        style={{ fontWeight: 500 }}
                      >
                        {aiProvider?.source === "local" ? "编辑" : "复制为本地"}
                      </button>
                      {aiProvider?.source === "local" ? (
                        <button
                          type="button"
                          onClick={() => void handleDeleteAIProviderConfig(profile.id)}
                          disabled={aiProviderLoading}
                          className="rounded-xl border border-rose-100 px-3 py-2 text-[12px] text-rose-600 hover:bg-rose-50 disabled:opacity-60"
                          style={{ fontWeight: 500 }}
                        >
                          删除
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-100 bg-gray-50/70 px-4 py-3">
          <button
            type="button"
            onClick={() => void loadAIProviderConfig()}
            disabled={aiProviderLoading}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-[13px] text-gray-600 hover:bg-gray-50 disabled:opacity-60"
            style={{ fontWeight: 500 }}
          >
            重新读取
          </button>
          {aiProvider?.source === "local" ? (
            <button
              type="button"
              onClick={() => void handleDeleteAIProviderConfig()}
              disabled={aiProviderLoading}
              className="rounded-xl border border-amber-100 px-4 py-2.5 text-[13px] text-amber-700 hover:bg-amber-50 disabled:opacity-60"
              style={{ fontWeight: 500 }}
            >
              清空写作模型配置
            </button>
          ) : null}
        </div>

        <Dialog open={isAIProviderDialogOpen} onOpenChange={(open) => {
          if (open) {
            setIsAIProviderDialogOpen(true);
            return;
          }
          closeAIProviderDialog();
        }}>
          <DialogContent className="max-h-[90vh] max-w-3xl overflow-hidden rounded-3xl border-0 p-0 shadow-[0_28px_70px_rgba(15,23,42,0.18)]">
            <DialogHeader className="border-b border-slate-100 px-6 py-5">
              <DialogTitle className="text-[20px] text-slate-900">
                {aiProviderForm.id ? "编辑写作模型配置" : "新增写作模型配置"}
              </DialogTitle>
              <DialogDescription className="mt-1 text-[13px] leading-6 text-slate-500">
                支持 OpenAI 和 Anthropic 两种协议，保存后可直接设为默认配置。
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-[calc(90vh-164px)] overflow-y-auto px-6 py-5">
              <div className="space-y-5 pb-28">
              <Field
                label="配置名称"
                value={aiProviderForm.name}
                onChange={(value) => handleAIProviderFormChange("name", value)}
                placeholder="例如：小米 MiMo / Claude 正式环境 / OpenRouter 备用"
              />

              <div className="grid gap-3 lg:grid-cols-2">
                {aiProviderPresets.map((preset) => {
                  const meta = aiProviderPresetDetails[preset.kind];
                  const active = aiProviderForm.providerType === preset.kind;

                  return (
                    <button
                      key={preset.kind}
                      type="button"
                      onClick={() => handleApplyAIProviderPreset(preset)}
                      className={`rounded-2xl border px-4 py-4 text-left transition-all ${
                        active
                          ? "border-blue-200 bg-blue-50 shadow-[0_12px_24px_rgba(59,130,246,0.12)]"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className={`text-[14px] ${active ? "text-blue-700" : "text-slate-900"}`} style={{ fontWeight: 700 }}>
                          {preset.name}
                        </div>
                        <span className={`text-[10px] ${active ? "text-blue-600" : "text-slate-400"}`} style={{ fontWeight: 700 }}>
                          {meta.tag}
                        </span>
                      </div>
                      <div className={`mt-2 text-[11px] leading-5 ${active ? "text-blue-600" : "text-slate-500"}`}>
                        {meta.hint}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-[12px] uppercase tracking-[0.16em] text-slate-400">Connection</div>
                <div className="mt-1 text-[15px] text-slate-900" style={{ fontWeight: 700 }}>连接配置</div>
                <div className="mt-1 text-[12px] leading-5 text-slate-500">{aiProviderProtocolHint}</div>

                <div className="mt-4 grid gap-3">
                  <Field
                    label="接口 Base URL"
                    value={aiProviderForm.baseUrl}
                    onChange={(value) => handleAIProviderFormChange("baseUrl", value)}
                    placeholder="https://api.openai.com/v1"
                  />
                  <Field
                    label={aiProviderForm.id ? "API Key（已配置，留空则保持不变）" : "API Key"}
                    value={aiProviderForm.apiKey}
                    onChange={(value) => handleAIProviderFormChange("apiKey", value)}
                    type="password"
                    placeholder={aiProvider?.profiles.find((item) => item.id === aiProviderForm.id)?.maskedApiKey || undefined}
                  />
                  <Field
                    label="写作模型"
                    value={aiProviderForm.model}
                    onChange={(value) => handleAIProviderFormChange("model", value)}
                    placeholder="gpt-4o-mini / claude-3-5-sonnet-latest / qwen-plus / kimi-k2"
                  />
                </div>

                <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/70">
                  <button
                    type="button"
                    onClick={() => setIsAIModelRolesOpen((current) => !current)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <div>
                      <div className="text-[13px] text-slate-900" style={{ fontWeight: 700 }}>高级模型分工</div>
                      <div className="mt-0.5 text-[12px] leading-5 text-slate-500">不填写时，标题、大纲和正文都会使用上面的写作模型。</div>
                    </div>
                    <ChevronRight
                      className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isAIModelRolesOpen ? "rotate-90" : ""}`}
                    />
                  </button>

                  {isAIModelRolesOpen ? (
                    <div className="grid gap-3 border-t border-slate-100 px-4 pb-4 pt-3 lg:grid-cols-2">
                      <Field
                        label="快模型（可选）"
                        value={aiProviderForm.fastModel}
                        onChange={(value) => handleAIProviderFormChange("fastModel", value)}
                        placeholder="标题、大纲、短改写优先"
                      />
                      <Field
                        label="长文模型（可选）"
                        value={aiProviderForm.longformModel}
                        onChange={(value) => handleAIProviderFormChange("longformModel", value)}
                        placeholder="正文、全文优化优先"
                      />
                    </div>
                  ) : null}
                </div>
              </div>

              <label className="flex items-center gap-2 text-[12px] text-gray-600">
                <input
                  type="checkbox"
                  checked={aiProviderForm.setAsActive}
                  onChange={(event) => handleAIProviderFormChange("setAsActive", event.target.checked)}
                />
                保存后设为默认写作模型
              </label>

              {aiProviderTestFeedback ? (
                <div
                  className={`rounded-2xl border px-4 py-3 text-[12px] leading-5 ${
                    aiProviderTestFeedback.type === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : aiProviderTestFeedback.type === "error"
                        ? "border-red-200 bg-red-50 text-red-600"
                        : "border-slate-200 bg-slate-50 text-slate-500"
                  }`}
                >
                  {aiProviderTestFeedback.message}
                </div>
              ) : null}
              </div>
            </div>

            <DialogFooter className="absolute inset-x-0 bottom-0 border-t border-slate-100 bg-white/95 px-6 py-4 backdrop-blur sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={closeAIProviderDialog}
                  className="rounded-xl border border-gray-200 px-4 py-2.5 text-[13px] text-gray-600 hover:bg-gray-50"
                  style={{ fontWeight: 500 }}
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => void handleTestAIProviderConfig()}
                  disabled={aiProviderLoading || aiProviderTesting}
                  className="rounded-xl border border-blue-200 px-4 py-2.5 text-[13px] text-blue-600 hover:bg-blue-50 disabled:opacity-60"
                  style={{ fontWeight: 500 }}
                >
                  {aiProviderTesting ? "测试中" : "测试连接"}
                </button>
              </div>
              <button
                type="button"
                onClick={() => void handleSaveAIProviderConfig()}
                disabled={aiProviderLoading}
                className="rounded-xl bg-blue-600 px-4 py-2.5 text-[13px] text-white hover:bg-blue-700 disabled:bg-blue-300"
                style={{ fontWeight: 600 }}
              >
                {aiProviderLoading ? "保存中" : aiProviderForm.id ? "保存配置" : "添加配置"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Section>

      <Section id="ai-image" title="AI 图片模型">
        <div className="rounded-2xl border border-amber-100 bg-[linear-gradient(180deg,#fffdf7_0%,#fff9eb_100%)] p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-[12px] uppercase tracking-[0.16em] text-amber-500">Profiles</div>
              <div className="mt-1 text-[16px] text-slate-900" style={{ fontWeight: 700 }}>图片模型配置列表</div>
              <div className="mt-1 text-[12px] leading-5 text-slate-500">
                用于 AI 配图生成。支持保存多套配置，并快速切换默认图片模型。
              </div>
            </div>
            <button
              type="button"
              onClick={openCreateAIImageProviderDialog}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-[13px] text-white hover:bg-amber-600"
              style={{ fontWeight: 600 }}
            >
              <Plus className="h-4 w-4" />
              新增图片模型
            </button>
          </div>

          {(aiImageProvider?.profiles?.length ?? 0) === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-amber-200 bg-white/80 px-4 py-5 text-[13px] leading-6 text-slate-500">
              当前还没有本地图片模型配置。新增一套后，就可以在这里设置默认并快速切换。
            </div>
          ) : null}

          <div className="mt-5 grid gap-3">
            {(aiImageProvider?.profiles ?? []).map((profile) => (
              <div
                key={profile.id}
                className={`rounded-2xl border px-4 py-4 transition-colors ${
                  profile.isActive
                    ? "border-amber-200 bg-amber-50/70"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-[14px] text-slate-900" style={{ fontWeight: 700 }}>{profile.name}</div>
                      {profile.isActive ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700" style={{ fontWeight: 700 }}>
                          默认
                        </span>
                      ) : null}
                      {aiImageProvider?.source !== "local" ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500" style={{ fontWeight: 700 }}>
                          {aiImageProvider?.source === "environment" ? "环境变量" : "默认值"}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 text-[13px] leading-6 text-slate-600">{profile.model}</div>
                    <div className="text-[12px] leading-5 text-slate-500">{profile.baseUrl}</div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {!profile.isActive && aiImageProvider?.source === "local" ? (
                      <button
                        type="button"
                        onClick={() => void handleActivateAIImageProviderConfig(profile.id)}
                        disabled={aiImageProviderLoading}
                        className="rounded-xl border border-amber-200 px-3 py-2 text-[12px] text-amber-700 hover:bg-amber-50 disabled:opacity-60"
                        style={{ fontWeight: 600 }}
                      >
                        设为默认
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => openEditAIImageProviderDialog(profile)}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-[12px] text-slate-600 hover:bg-slate-50"
                      style={{ fontWeight: 500 }}
                    >
                      {aiImageProvider?.source === "local" ? "编辑" : "复制为本地"}
                    </button>
                    {aiImageProvider?.source === "local" ? (
                      <button
                        type="button"
                        onClick={() => void handleDeleteAIImageProviderConfig(profile.id)}
                        disabled={aiImageProviderLoading}
                        className="rounded-xl border border-rose-100 px-3 py-2 text-[12px] text-rose-600 hover:bg-rose-50 disabled:opacity-60"
                        style={{ fontWeight: 500 }}
                      >
                        删除
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-100 bg-gray-50/70 px-4 py-3">
          <button
            type="button"
            onClick={() => void loadAIImageProviderConfig()}
            disabled={aiImageProviderLoading}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-[13px] text-gray-600 hover:bg-gray-50 disabled:opacity-60"
            style={{ fontWeight: 500 }}
          >
            重新读取
          </button>
          {aiImageProvider?.source === "local" ? (
            <button
              type="button"
              onClick={() => void handleDeleteAIImageProviderConfig()}
              disabled={aiImageProviderLoading}
              className="rounded-xl border border-amber-100 px-4 py-2.5 text-[13px] text-amber-700 hover:bg-amber-50 disabled:opacity-60"
              style={{ fontWeight: 500 }}
            >
              清空图片模型配置
            </button>
          ) : null}
        </div>

        <Dialog open={isAIImageProviderDialogOpen} onOpenChange={(open) => {
          if (open) {
            setIsAIImageProviderDialogOpen(true);
            return;
          }
          closeAIImageProviderDialog();
        }}>
          <DialogContent className="max-h-[90vh] max-w-3xl overflow-hidden rounded-3xl border-0 p-0 shadow-[0_28px_70px_rgba(15,23,42,0.18)]">
            <DialogHeader className="border-b border-slate-100 px-6 py-5">
              <DialogTitle className="text-[20px] text-slate-900">
                {aiImageProviderForm.id ? "编辑图片模型配置" : "新增图片模型配置"}
              </DialogTitle>
              <DialogDescription className="mt-1 text-[13px] leading-6 text-slate-500">
                保存多套图片模型入口，支持快速切换默认图片生成配置。
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-[calc(90vh-164px)] overflow-y-auto px-6 py-5">
              <div className="space-y-5 pb-28">
                <Field
                  label="配置名称"
                  value={aiImageProviderForm.name}
                  onChange={(value) => handleAIImageProviderFormChange("name", value)}
                  placeholder="例如：OpenAI 图片 / Qwen Image / 备用出图"
                />

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-[12px] uppercase tracking-[0.16em] text-slate-400">Connection</div>
                  <div className="mt-1 text-[15px] text-slate-900" style={{ fontWeight: 700 }}>连接配置</div>
                  <div className="mt-1 text-[12px] leading-5 text-slate-500">这里配置的是 AI 配图模型；真实图片搜索不受影响。</div>

                  <div className="mt-4 grid gap-3">
                    <Field
                      label="图片接口 Base URL"
                      value={aiImageProviderForm.baseUrl}
                      onChange={(value) => handleAIImageProviderFormChange("baseUrl", value)}
                      placeholder="https://api.openai.com/v1"
                    />
                    <Field
                      label={aiImageProviderForm.id ? "图片 API Key（已配置，留空则保持不变）" : "图片 API Key"}
                      value={aiImageProviderForm.apiKey}
                      onChange={(value) => handleAIImageProviderFormChange("apiKey", value)}
                      type="password"
                      placeholder={aiImageProvider?.profiles.find((item) => item.id === aiImageProviderForm.id)?.maskedApiKey || undefined}
                    />
                    <Field
                      label="图片模型"
                      value={aiImageProviderForm.model}
                      onChange={(value) => handleAIImageProviderFormChange("model", value)}
                      placeholder="gpt-image-1 / qwen-image-2.0 / wan2.2-t2i"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-[12px] text-gray-600">
                  <input
                    type="checkbox"
                    checked={aiImageProviderForm.setAsActive}
                    onChange={(event) => handleAIImageProviderFormChange("setAsActive", event.target.checked)}
                  />
                  保存后设为默认图片模型
                </label>
              </div>
            </div>

            <DialogFooter className="absolute inset-x-0 bottom-0 border-t border-slate-100 bg-white/95 px-6 py-4 backdrop-blur sm:justify-between">
              <button
                type="button"
                onClick={closeAIImageProviderDialog}
                className="rounded-xl border border-gray-200 px-4 py-2.5 text-[13px] text-gray-600 hover:bg-gray-50"
                style={{ fontWeight: 500 }}
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleSaveAIImageProviderConfig()}
                disabled={aiImageProviderLoading}
                className="rounded-xl bg-amber-500 px-4 py-2.5 text-[13px] text-white hover:bg-amber-600 disabled:bg-amber-300"
                style={{ fontWeight: 600 }}
              >
                {aiImageProviderLoading ? "保存中" : aiImageProviderForm.id ? "保存配置" : "添加配置"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Section>

      <Section id="wechat-account" title="公众号接入">
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-[13px] leading-6 text-emerald-800">
          AppSecret 只会走服务端保存，不会进入浏览器本地草稿和普通设置同步里。
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[13px] text-gray-900" style={{ fontWeight: 600 }}>已配置公众号</div>
            <button
              type="button"
              onClick={openNewWechatAccountDialog}
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

        <Dialog
          open={isWechatDialogOpen}
          onOpenChange={(open) => {
            if (open) {
              setIsWechatDialogOpen(true);
              return;
            }
            closeWechatAccountDialog();
          }}
        >
          <DialogContent className="max-w-[560px] rounded-[28px] border border-slate-200 bg-white p-0 shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
            <DialogHeader className="border-b border-slate-100 px-6 py-5">
              <DialogTitle className="text-[20px] text-slate-900" style={{ fontWeight: 700 }}>
                {wechatForm.id ? "编辑公众号账号" : "新增公众号账号"}
              </DialogTitle>
              <DialogDescription className="mt-1 text-[13px] leading-6 text-slate-500">
                AppSecret 仅保存在服务端，保存后可在排版页直接选择并推送到对应草稿箱。
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 px-6 py-5">
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
            </div>

            <DialogFooter className="border-t border-slate-100 px-6 py-4 sm:justify-between">
              <button
                type="button"
                onClick={closeWechatAccountDialog}
                className="rounded-xl border border-gray-200 px-4 py-2.5 text-[13px] text-gray-600 hover:bg-gray-50"
                style={{ fontWeight: 500 }}
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleSaveWechatAccount()}
                disabled={wechatLoading}
                className="rounded-xl bg-emerald-600 px-4 py-2.5 text-[13px] text-white hover:bg-emerald-700 disabled:bg-emerald-300"
                style={{ fontWeight: 600 }}
              >
                {wechatLoading ? "保存中" : wechatForm.id ? "保存账号" : "添加账号"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "password";
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div>
      <label className="text-[12px] text-gray-500 mb-1.5 block">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-[13px] outline-none transition-colors focus:border-blue-300 focus:bg-white"
      />
      {hint ? <div className="mt-1.5 text-[12px] leading-5 text-slate-400">{hint}</div> : null}
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
  const canAddTag = Boolean(draftValue.trim()) && !values.includes(draftValue.trim());

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
          disabled={!canAddTag}
          className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] transition-all ${
            canAddTag
              ? "border border-purple-200 bg-purple-50 text-purple-700 hover:border-purple-300 hover:bg-purple-100"
              : "border border-gray-200 bg-gray-50 text-gray-300"
          }`}
          style={{ fontWeight: 600 }}
        >
          <Plus className="h-3.5 w-3.5" /> 添加标签
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

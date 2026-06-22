"use client";

import React, { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronDown, Quote, Sparkles,
  Bold, Italic, Underline, AlignLeft, List, Save,
  Pause, Copy, Download, Send, LoaderCircle, CheckCircle2,
  Smartphone, Monitor, ArrowUp, Undo2, Redo2, ListOrdered, Minus, Code2, Pilcrow, RefreshCw,
} from "lucide-react";
import {
  createBody, createFormattingForDomain, createOutline, createSummary,
  getTemplateColors, getTemplateDotStyle, templates, ctaStyles, formatDraftTime, migrateDefaultFormattingToMinimal,
  type Draft, type DraftFormatting, type TemplateName,
} from "../lib/app-data";
import {
  extractContentBlocks, collectInlineTokens,
  getInlineHighlightStyle, getWechatDomainPreviewStyle, buildHtml, buildWechatArticleHtml, buildWechatText,
  getTemplatePreviewStyle, escapeHtml,
} from "../lib/format-render";
import { writeRichClipboard } from "../lib/rich-clipboard";
import {
  buildAutoImageCaption,
  buildAutoImagePrompt,
  buildAutoImageSearchQuery,
  countArticleImages,
  getAutoImageInsertLimit,
  insertAutoImageIntoBody,
  insertAutoImagesIntoBody,
} from "../lib/article-auto-image";
import type {
  AITransformAction,
  AIWriteResponse,
  AIWriteResult,
  AIWriteScope,
  DraftWritingSnapshot,
} from "../lib/ai-writing-types";
import { domainConfigs, resolveArticleDomain } from "../lib/content-domains";
import { getClientErrorMessage } from "../lib/client-error";
import { getUserDisplayName } from "../lib/user-display";
import { useAppStore } from "../providers/app-store";
import { useAuth } from "../providers/auth-provider";
import { LazyRichTextEditor } from "./LazyRichTextEditor";
import type {
  EditorToolbarMode,
  RichTextEditorHandle,
  RichTextEditorStyle,
} from "./RichTextEditor";

const generationLabels: Record<AIWriteScope, string> = {
  title: "AI 文章生成中",
  outline: "AI 大纲生成中",
  body: "AI 正文生成中",
  full: "AI 全文生成中",
};

const generationStageLabels = {
  material: "素材搜索中",
  planning: "结构规划中",
  drafting: "正文生成中",
  quality: "质量校验中",
  image: "配图搜索中",
} as const;

type GenerationStageKey = keyof typeof generationStageLabels;

const transformLabels: Partial<Record<AITransformAction, string>> = {
  rewrite: "AI 改写中",
  expand: "AI 扩写中",
  shorten: "AI 缩写中",
};

const QUALITY_RETRY_MESSAGE = "AI 正在自动调整稿件质量，请再试一次。";
const AI_WRITER_CONFIG_REQUIRED_MESSAGE = "AI 写作模型尚未配置，请先到设置中心配置 API Key。";

type AIProviderStatusResponse = {
  config?: {
    activeProfile?: {
      hasApiKey?: boolean;
    } | null;
  } | null;
  message?: string;
};

function isAIWriterConfigError(message: string) {
  return message.includes("配置 API") || message.includes("模型尚未配置") || message.includes("API Key");
}

function collapseChineseQuoteLayers(text: string) {
  let normalized = text;
  let previous = "";

  while (normalized !== previous) {
    previous = normalized;
    normalized = normalized.replace(/「{2,}([^「」]+)」{2,}/g, "「$1」");
  }

  return normalized;
}

function normalizeArticleTitleLine(title: string) {
  return title.replace(/^#+\s*/, "").trim();
}

function composeBodyWithTitle(title: string, content: string) {
  const normalizedTitle = normalizeArticleTitleLine(title);
  const normalizedContent = content.trimStart();
  if (!normalizedTitle) return normalizedContent;
  if (normalizeArticleTitleLine(normalizedContent.split(/\r?\n/)[0] ?? "") === normalizedTitle) {
    return normalizedContent;
  }
  return `${normalizedTitle}\n\n${normalizedContent}`.trim();
}

function inferTitleFromBody(content: string, fallback = "未命名文章") {
  return normalizeArticleTitleLine(content.split(/\r?\n/).find((line) => line.trim()) ?? "") || fallback;
}

function stripTitleLineFromBody(content: string, title: string) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const firstContentIndex = lines.findIndex((line) => line.trim());
  if (firstContentIndex === -1) return "";

  if (normalizeArticleTitleLine(lines[firstContentIndex]) !== normalizeArticleTitleLine(title)) {
    return content;
  }

  return lines.slice(firstContentIndex + 1).join("\n").replace(/^\n+/, "");
}

function removeMarkdownImageBlocks(content: string) {
  return content
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .filter((section) => !/^!\[[^\]]*]\((?:data:[^)]+|[^)]+)\)(?:\n(?:图注|说明|caption)[:：].*)?$/i.test(section.trim()))
    .join("\n\n")
    .trim();
}

const domainUiThemes: Record<
  keyof typeof domainConfigs,
  {
    primary: string;
    accent: string;
    soft: string;
    border: string;
    text: string;
  }
> = {
  AI: { primary: "#2563eb", accent: "#06b6d4", soft: "#eff6ff", border: "#bfdbfe", text: "#1d4ed8" },
  科技: { primary: "#2563eb", accent: "#06b6d4", soft: "#eff6ff", border: "#bfdbfe", text: "#1d4ed8" },
  教育: { primary: "#ea580c", accent: "#f59e0b", soft: "#fff7ed", border: "#fed7aa", text: "#c2410c" },
  旅游: { primary: "#0891b2", accent: "#14b8a6", soft: "#ecfeff", border: "#a5f3fc", text: "#0f766e" },
  情感: { primary: "#db2777", accent: "#f472b6", soft: "#fff1f2", border: "#fbcfe8", text: "#be185d" },
  社会: { primary: "#ea580c", accent: "#eab308", soft: "#fefce8", border: "#fde68a", text: "#ca8a04" },
  汽车: { primary: "#1d4ed8", accent: "#dc2626", soft: "#eff6ff", border: "#bfdbfe", text: "#1e40af" },
  体育: { primary: "#16a34a", accent: "#22c55e", soft: "#f0fdf4", border: "#bbf7d0", text: "#15803d" },
  娱乐: { primary: "#c026d3", accent: "#ec4899", soft: "#fdf4ff", border: "#f5d0fe", text: "#a21caf" },
  财经: { primary: "#b45309", accent: "#f59e0b", soft: "#fffbeb", border: "#fde68a", text: "#92400e" },
  文化: { primary: "#7c3aed", accent: "#a78bfa", soft: "#f5f3ff", border: "#ddd6fe", text: "#6d28d9" },
  其他: { primary: "#475569", accent: "#94a3b8", soft: "#f8fafc", border: "#cbd5e1", text: "#334155" },
};

const domainArticleTypeOptions: Record<keyof typeof domainConfigs, string[]> = {
  AI: ["项目推荐", "产品解读", "趋势解读", "观点文", "盘点文"],
  科技: ["项目推荐", "产品解读", "趋势解读", "观点文", "盘点文"],
  教育: ["方法文", "解读文", "指南文", "观点文"],
  旅游: ["攻略文", "体验文", "清单文", "路线文", "小众推荐", "城市指南", "季节游"],
  情感: ["共鸣文", "故事文", "观点文", "关系解读"],
  社会: ["热点解读", "事件观察", "观点文", "案例文"],
  汽车: ["评测文", "对比文", "解读文", "购车指南"],
  体育: ["赛事解读", "人物文", "观点文", "复盘文"],
  娱乐: ["热点解读", "人物文", "作品解读", "舆论观察"],
  财经: ["商业解读", "消费观察", "公司分析", "观点文"],
  文化: ["文化观察", "生活方式", "人物文", "观点文"],
  其他: ["综合观察", "热点杂谈", "信息解读", "清单文"],
};

export function WritingPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const handledAutogenKey = useRef<string | null>(null);
  const richTextEditorRef = useRef<RichTextEditorHandle>(null);
  const requestAbortControllerRef = useRef<AbortController | null>(null);
  const autosaveTimerRef = useRef<number | null>(null);
  const autosaveInitializedRef = useRef(false);

  const {
    drafts,
    topics,
    selectedTopic,
    settings,
    writingTasks,
    selectTopic,
    createManualDraft,
    generateDraftFromTopic,
    startWritingTask,
    clearWritingTask,
    getDraftById,
    updateDraft,
  } = useAppStore();

  const topicId = searchParams.get("topicId");
  const draftId = searchParams.get("draftId");
  const autogen = searchParams.get("autogen") as "title" | "outline" | "body" | "full" | null;
  const autogenKey = topicId && autogen ? `${topicId}:${autogen}` : null;
  const latestDraft = useMemo(
    () => [...drafts].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())[0],
    [drafts],
  );
  const activeWritingTaskDraft = useMemo(() => {
    const activeTaskDraftIds = Object.values(writingTasks)
      .sort((left, right) => new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime())
      .map((task) => task.draftId);

    return activeTaskDraftIds
      .map((activeDraftId) => getDraftById(activeDraftId))
      .find((draft): draft is Draft => Boolean(draft));
  }, [getDraftById, writingTasks]);

  const currentDraft = draftId ? getDraftById(draftId) : !topicId ? activeWritingTaskDraft ?? latestDraft : undefined;
  const activeWritingTask = currentDraft ? writingTasks[currentDraft.id] : undefined;
  const activeTopic =
    topics.find((topic) => topic.id === topicId) ??
    topics.find((topic) => topic.id === currentDraft?.topicId) ??
    selectedTopic ??
    topics[0] ??
    null;
  const defaultDomain = resolveArticleDomain(currentDraft?.domain ?? activeTopic?.domain ?? settings.contentAreas[0]);
  const [selectedDomain, setSelectedDomain] = useState(defaultDomain);
  const topicForWriting = useMemo(
    () => (activeTopic ? { ...activeTopic, domain: selectedDomain } : undefined),
    [activeTopic, selectedDomain],
  );
  const isGithubTrendingTopic = useMemo(
    () => Boolean(topicForWriting?.source?.includes("GitHub Trending")),
    [topicForWriting],
  );

  const fallbackOutline = useMemo(() => (topicForWriting ? createOutline(topicForWriting) : []), [topicForWriting]);
  const fallbackSummary = useMemo(() => (topicForWriting ? createSummary(topicForWriting, settings) : ""), [settings, topicForWriting]);
  const fallbackBody = useMemo(() => (topicForWriting ? createBody(topicForWriting, settings) : ""), [settings, topicForWriting]);
  const [articleType, setArticleType] = useState("观点文");

  const [selectedTitle, setSelectedTitle] = useState(currentDraft?.title ?? "");
  const [summary, setSummary] = useState(currentDraft?.summary ?? fallbackSummary);
  const [outline, setOutline] = useState<string[]>(currentDraft?.outline ?? fallbackOutline);
  const [body, setBody] = useState(currentDraft?.body ?? fallbackBody);
  const [saveNotice, setSaveNotice] = useState("");
  const [targetWordCount, setTargetWordCount] = useState(1200);
  const [generationError, setGenerationError] = useState("");
  const [pendingAction, setPendingAction] = useState("");
  const [generationStage, setGenerationStage] = useState<GenerationStageKey | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isWechatPushing, setIsWechatPushing] = useState(false);
  const [activeGenerationTask, setActiveGenerationTask] = useState<AIWriteScope | AITransformAction | null>(null);
  const activeDomainTheme = useMemo(() => domainUiThemes[selectedDomain], [selectedDomain]);
  const articleTypeOptions = useMemo(() => domainArticleTypeOptions[selectedDomain], [selectedDomain]);

  const [formatting, setFormatting] = useState<DraftFormatting>(
    migrateDefaultFormattingToMinimal(currentDraft?.formatting ?? createFormattingForDomain(selectedDomain, settings.defaultTemplate))
  );
  const formattingSourceKey = currentDraft ? `draft:${currentDraft.id}` : `topic:${activeTopic?.id ?? "empty"}:${defaultDomain}`;
  const syncedFormattingSourceRef = useRef<string | null>(null);
  const activeScheme = useMemo(
    () => getTemplateColors(formatting.template),
    [formatting.template],
  );

  const [previewMode, setPreviewMode] = useState<"mobile" | "desktop">("mobile");
  const [publishChannel, setPublishChannel] = useState<"公众号" | "知乎" | "微博" | "头条" | "小红书">("公众号");
  const editorScrollRef = useRef<HTMLDivElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const scrollSyncSourceRef = useRef<"editor" | "preview" | null>(null);
  const scrollSyncTimerRef = useRef<number | null>(null);

  const domainPreviewStyle = useMemo(
    () => getWechatDomainPreviewStyle(selectedDomain, activeScheme.primary, activeScheme.accent),
    [activeScheme.accent, activeScheme.primary, selectedDomain]
  );

  const previewThemeStyle = useMemo(
    () => getTemplatePreviewStyle(formatting.template, activeScheme.primary, activeScheme.accent),
    [activeScheme.accent, activeScheme.primary, formatting.template]
  );

  const isWechatChannel = publishChannel === "公众号";
  const isDarkTemplate = formatting.template === "曜石黑";

  const textPrimary = isWechatChannel ? "rgba(0,0,0,0.9)" : isDarkTemplate ? "#f9fafb" : "#111827";
  const textSecondary = isWechatChannel ? "#4a4a4a" : isDarkTemplate ? "#d1d5db" : "#4b5563";
  const textMuted = isWechatChannel ? "#8c8c8c" : isDarkTemplate ? "#94a3b8" : "#9ca3af";
  const surfaceBackground = isWechatChannel ? "#ffffff" : isDarkTemplate ? "#0f172a" : "#ffffff";
  const phoneShellBackground = isWechatChannel ? "#ffffff" : isDarkTemplate ? "#0b1120" : "#ffffff";

  const previewAccountName = settings.accountName.trim() || getUserDisplayName(user, "公众号");
  const previewAccountInitials = previewAccountName.slice(0, 2);
  const articleDate = currentDraft ? formatDraftTime(currentDraft.updatedAt).split(" ")[0] : formatDraftTime(new Date().toISOString()).split(" ")[0];

  const highlightBackground = isWechatChannel
    ? domainPreviewStyle.highlightBackground
    : isDarkTemplate
      ? "rgba(59,130,246,0.12)"
      : `${activeScheme.primary}08`;

  const previewBlocks = useMemo(() => {
    const htmlBody = stripTitleLineFromBody(body, selectedTitle);
    return extractContentBlocks(htmlBody);
  }, [body, selectedTitle]);
  const editorBody = useMemo(() => stripTitleLineFromBody(body, selectedTitle), [body, selectedTitle]);
  const wechatPreviewTitle = useMemo(
    () => inferTitleFromBody(body, selectedTitle || currentDraft?.title || ""),
    [body, currentDraft?.title, selectedTitle],
  );
  const wechatPreviewBody = useMemo(
    () => stripTitleLineFromBody(body, wechatPreviewTitle).trim(),
    [body, wechatPreviewTitle],
  );
  const wechatPreviewHtml = useMemo(
    () => buildWechatArticleHtml(
      {
        title: wechatPreviewTitle,
        summary,
        updatedAt: currentDraft?.updatedAt ?? new Date().toISOString(),
        publishedAt: currentDraft?.publishedAt,
      },
      wechatPreviewBody,
      formatting,
      activeScheme.primary,
      activeScheme.accent,
      previewAccountName,
      selectedDomain,
      { includeHeader: false },
    ),
    [activeScheme.accent, activeScheme.primary, currentDraft?.publishedAt, currentDraft?.updatedAt, formatting, previewAccountName, selectedDomain, summary, wechatPreviewBody, wechatPreviewTitle],
  );

  const headingCount = useMemo(() => previewBlocks.filter((block) => block.type === "heading").length, [previewBlocks]);
  const estimatedCards = useMemo(() => Math.max(1, previewBlocks.filter((block) => block.type === "golden" || block.type === "highlight" || block.type === "quote").length), [previewBlocks]);

  const inlineHighlightStyle = useMemo(
    () => getInlineHighlightStyle(activeScheme.primary, activeScheme.accent),
    [activeScheme.accent, activeScheme.primary]
  );

  const handleScrollPreviewTop = () => {
    editorScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    previewScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const syncScroll = (source: "editor" | "preview") => {
    const sourceElement = source === "editor" ? editorScrollRef.current : previewScrollRef.current;
    const targetElement = source === "editor" ? previewScrollRef.current : editorScrollRef.current;
    if (!sourceElement || !targetElement) return;
    if (scrollSyncSourceRef.current && scrollSyncSourceRef.current !== source) return;

    scrollSyncSourceRef.current = source;

    const sourceScrollable = sourceElement.scrollHeight - sourceElement.clientHeight;
    const targetScrollable = targetElement.scrollHeight - targetElement.clientHeight;
    const ratio = sourceScrollable > 0 ? sourceElement.scrollTop / sourceScrollable : 0;

    targetElement.scrollTop = ratio * Math.max(0, targetScrollable);

    if (scrollSyncTimerRef.current) {
      window.clearTimeout(scrollSyncTimerRef.current);
    }
    scrollSyncTimerRef.current = window.setTimeout(() => {
      scrollSyncSourceRef.current = null;
    }, 120);
  };

  const handleTitleChange = (nextTitle: string) => {
    const nextNormalizedTitle = normalizeArticleTitleLine(nextTitle);
    const currentEditorBody = stripTitleLineFromBody(body, selectedTitle);
    setSelectedTitle(nextNormalizedTitle);
    setBody(composeBodyWithTitle(nextNormalizedTitle, currentEditorBody));
  };

  const handleEditorBodyChange = (nextEditorBody: string) => {
    setBody(composeBodyWithTitle(selectedTitle, nextEditorBody));
  };

  const clearPendingAutosave = () => {
    if (!autosaveTimerRef.current) return;
    window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = null;
  };

  useEffect(() => {
    if (topicId) {
      selectTopic(topicId);
    }
  }, [selectTopic, topicId]);

  useEffect(() => {
    if (draftId || topicId || !currentDraft) return;

    startTransition(() => {
      router.replace(`/writing?draftId=${currentDraft.id}`);
    });
  }, [currentDraft, draftId, router, topicId]);

  useEffect(() => {
    if (syncedFormattingSourceRef.current === formattingSourceKey) return;
    syncedFormattingSourceRef.current = formattingSourceKey;

    setSelectedTitle(currentDraft?.title ?? "");
    setSummary(currentDraft?.summary ?? fallbackSummary);
    setOutline(currentDraft?.outline ?? fallbackOutline);
    setBody(currentDraft?.body ?? fallbackBody);
    setSelectedDomain(defaultDomain);
    setFormatting(migrateDefaultFormattingToMinimal(currentDraft?.formatting ?? createFormattingForDomain(defaultDomain, settings.defaultTemplate)));
  }, [currentDraft, defaultDomain, fallbackBody, fallbackOutline, fallbackSummary, formattingSourceKey, settings.defaultTemplate]);

  useEffect(() => {
    if (!articleTypeOptions.includes(articleType)) {
      setArticleType(articleTypeOptions[0]);
    }
  }, [articleType, articleTypeOptions]);

  useEffect(() => {
    if (!isGithubTrendingTopic) return;
    setArticleType((current) => (current === "观点文" || current === "趋势解读" || !current ? "项目推荐" : current));
  }, [isGithubTrendingTopic]);

  useEffect(() => {
    if (!autogenKey) {
      handledAutogenKey.current = null;
      return;
    }

    if (!activeTopic || !autogen || handledAutogenKey.current === autogenKey) return;

    handledAutogenKey.current = autogenKey;
    void handleGenerate(autogen);
  }, [activeTopic, autogen, autogenKey]);

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
      }
      if (scrollSyncTimerRef.current) {
        window.clearTimeout(scrollSyncTimerRef.current);
      }
    };
  }, []);

  const visibleGenerationTask = activeGenerationTask ?? activeWritingTask?.scope ?? null;
  const isWritingBusy = isGenerating || Boolean(activeWritingTask);
  const visiblePendingAction =
    (generationStage ? generationStageLabels[generationStage] : "") ||
    pendingAction ||
    activeWritingTask?.label ||
    "";
  const generationStageSteps = useMemo(() => {
    if ((!isWritingBusy && !generationStage) || (!visibleGenerationTask && generationStage !== "image")) return [];

    const baseStages: GenerationStageKey[] =
      visibleGenerationTask === "title" || visibleGenerationTask === "outline"
        ? ["material", "planning", "quality"]
        : ["material", "planning", "drafting", "quality", "image"];
    const activeStage = generationStage ?? baseStages[0];
    const activeIndex = Math.max(0, baseStages.indexOf(activeStage));

    return baseStages.map((stage, index) => ({
      key: stage,
      label: generationStageLabels[stage],
      status: index < activeIndex ? "done" : index === activeIndex ? "active" : "pending",
    }));
  }, [generationStage, isWritingBusy, visibleGenerationTask]);
  const generationStageProgress = useMemo(() => {
    if (!generationStageSteps.length) return 0;

    const activeIndex = generationStageSteps.findIndex((step) => step.status === "active");
    const resolvedIndex = activeIndex >= 0 ? activeIndex : generationStageSteps.length - 1;
    const segmentCount = Math.max(1, generationStageSteps.length - 1);
    const activeStageOffset = isWritingBusy ? 0.45 : 1;

    return Math.min(100, ((resolvedIndex + activeStageOffset) / segmentCount) * 100);
  }, [generationStageSteps, isWritingBusy]);
  const generationStageTrackInset = generationStageSteps.length
    ? `calc(${100 / (generationStageSteps.length * 2)}% + 18px)`
    : "0%";
  const isBodyDraftGenerating =
    isWritingBusy &&
    (visibleGenerationTask === "body" || visibleGenerationTask === "full");
  const hasGeneratedBody = Boolean(editorBody.trim());

  function buildDraftSnapshot(draft: Draft): DraftWritingSnapshot {
    const useLocalState = currentDraft?.id === draft.id;

    return {
      id: draft.id,
      domain: useLocalState ? selectedDomain : draft.domain,
      title: useLocalState ? selectedTitle : draft.title,
      titleCandidates: draft.titleCandidates,
      selectedAngle: draft.selectedAngle,
      status: draft.status,
      topic: draft.topic,
      topicId: draft.topicId,
      tags: draft.tags,
      summary: useLocalState ? summary : draft.summary,
      outline: useLocalState ? outline : draft.outline,
      body: useLocalState ? body : draft.body,
      source: draft.source,
    };
  }

  function ensureDraft(scope: AIWriteScope): Draft | null {
    if (currentDraft) return currentDraft;
    if (!activeTopic) {
      return createManualDraft(selectedDomain);
    }

    const placeholderScope = scope === "title" ? "title" : "outline";
    const generatedDraft = generateDraftFromTopic(activeTopic.id, placeholderScope);

    startTransition(() => {
      router.replace(`/writing?draftId=${generatedDraft.id}`);
    });

    return generatedDraft;
  }

  async function ensureAIWriterConfigured() {
    try {
      const response = await fetch("/api/ai/provider", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as AIProviderStatusResponse | null;
      const hasApiKey = Boolean(payload?.config?.activeProfile?.hasApiKey);

      if (response.ok && hasApiKey) {
        return true;
      }

      setGenerationError(payload?.message || AI_WRITER_CONFIG_REQUIRED_MESSAGE);
      return false;
    } catch (error) {
      console.error("Failed to check AI writer provider config:", error);
      setGenerationError("暂时无法读取 AI 写作模型配置，请先到设置中心确认 API Key。");
      return false;
    }
  }

  function syncAiResult(targetDraft: Draft, result: AIWriteResult) {
    const nextBody = composeBodyWithTitle(result.title, result.body);
    const nextTitle = inferTitleFromBody(nextBody, result.title || targetDraft.title || "未命名文章");
    const nextStatus = targetDraft.status === "已发布" ? "已发布" : nextBody.trim() ? "待修改" : "待生成";

    setSelectedTitle(nextTitle);
    setSummary(result.summary);
    setOutline(result.outline);
    setBody(nextBody);

    updateDraft(targetDraft.id, {
      domain: selectedDomain,
      title: nextTitle,
      titleCandidates: result.titleCandidates,
      selectedAngle: result.selectedAngle,
      summary: result.summary,
      outline: result.outline,
      body: nextBody,
      status: nextStatus,
    });
  }

  async function requestAiGeneration(
    scope: AIWriteScope,
    targetDraft: Draft,
    signal: AbortSignal,
    draftSnapshot?: DraftWritingSnapshot,
    options: { retryOnQualityAdjust?: boolean } = {},
  ) {
    const response = await fetch("/api/ai/write", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal,
      body: JSON.stringify({
        mode: "generate",
        scope,
        topic: topicForWriting,
        settings,
        domain: selectedDomain,
        articleType,
        targetWordCount,
        draft: draftSnapshot ?? buildDraftSnapshot(targetDraft),
      }),
    });

    const payload = (await response.json()) as AIWriteResponse;
    if (!response.ok || !payload.result) {
      if (payload.qualityRetry && options.retryOnQualityAdjust !== false) {
        setGenerationStage("quality");
        setPendingAction("质量校验中，正在重写稿件");
        return requestAiGeneration(scope, targetDraft, signal, draftSnapshot, { retryOnQualityAdjust: false });
      }

      const message = payload.message === QUALITY_RETRY_MESSAGE
        ? "稿件质量校验仍未通过，我已经停止本次生成，请稍后重新生成。"
        : payload.message || "AI 写作暂时不可用";
      throw new Error(message);
    }

    return payload;
  }

  function buildGenerationSuccessNotice(
    scope: AIWriteScope,
    label: string,
    bodyChangedByImageInsert: boolean,
    wordCountStatus?: AIWriteResponse["wordCountStatus"],
  ) {
    const wordCountHint =
      wordCountStatus && (scope === "body" || scope === "full") && !wordCountStatus.inRange
        ? `，正文已生成（当前 ${wordCountStatus.actual} 字，目标 ${wordCountStatus.target} 字）`
        : "";

    if (scope === "full") {
      return bodyChangedByImageInsert
        ? `AI 已生成全文并自动插入配图${wordCountHint}`
        : `AI 已生成公众号完整草稿${wordCountHint}`;
    }

    return bodyChangedByImageInsert ? `${label}完成，已自动插入配图${wordCountHint}` : `${label}完成${wordCountHint}`;
  }

  async function maybeAutoInsertImage(targetDraft: Draft, result: AIWriteResult, scope: AIWriteScope) {
    const sourceBody = composeBodyWithTitle(result.title, result.body);
    if ((scope !== "body" && scope !== "full") || !sourceBody.trim()) {
      return result;
    }

    const imageLimit = getAutoImageInsertLimit(selectedDomain);
    const existingImageCount = countArticleImages(sourceBody);
    const remainingImageCount = Math.max(0, imageLimit - existingImageCount);
    if (remainingImageCount <= 0) {
      return result;
    }

    const query = buildAutoImageSearchQuery({
      title: result.title,
      summary: result.summary,
      body: sourceBody,
      domain: selectedDomain,
    });
    const prompt = buildAutoImagePrompt({
      title: result.title,
      summary: result.summary,
      body: sourceBody,
      domain: selectedDomain,
    });
    const caption = buildAutoImageCaption({
      title: result.title,
      summary: result.summary,
      domain: selectedDomain,
    });

    if (!query.trim() && !prompt.trim()) {
      return result;
    }

    setPendingAction("真实配图搜索中");
    clearPendingAutosave();

    try {
      const searchResponse = await fetch("/api/images/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: result.title,
          summary: result.summary,
          body: sourceBody,
          domain: selectedDomain,
          source: topicForWriting?.source || targetDraft.source || "",
          query,
        }),
      });
      const searchPayload = await searchResponse.json().catch(() => null);
      const searchResults = Array.isArray(searchPayload?.results)
        ? (searchPayload.results as Array<{ url?: string; confidence?: string; score?: number }>)
        : [];
      const fallbackSearchUrl = typeof searchPayload?.url === "string" ? searchPayload.url.trim() : "";
      const realImages = searchResults
        .filter((item) => item.confidence === "high" || (item.confidence === "medium" && (item.score ?? 0) >= 64))
        .map((item) => item.url)
        .concat(fallbackSearchUrl ? [fallbackSearchUrl] : [])
        .filter((url): url is string => Boolean(url?.trim()))
        .filter((url, index, list) => list.indexOf(url) === index)
        .slice(0, remainingImageCount)
        .map((url, index) => ({
          url,
          caption: index === 0 ? caption : `${caption}-${index + 1}`,
        }));

      if (searchResponse.ok && realImages.length) {
        const nextBody = insertAutoImagesIntoBody(sourceBody, realImages, imageLimit);
        if (nextBody === sourceBody) {
          return result;
        }
        const nextTitle = inferTitleFromBody(nextBody, result.title);

        const nextResult = {
          ...result,
          title: nextTitle,
          body: nextBody,
        };

        setSelectedTitle(nextTitle);
        setBody(nextBody);
        clearPendingAutosave();
        updateDraft(targetDraft.id, {
          domain: selectedDomain,
          title: nextTitle,
          titleCandidates: result.titleCandidates,
          selectedAngle: result.selectedAngle,
          summary: result.summary,
          outline: result.outline,
          body: nextBody,
          status: targetDraft.status === "已发布" ? "已发布" : "待修改",
        });

        return nextResult;
      }
    } catch (error) {
      console.warn("自动真实配图搜索失败，继续尝试 AI 配图。", error);
      // If real image search is unavailable, fall back to AI image generation below.
    }

    setPendingAction("AI 配图生成中");

    try {
      const response = await fetch("/api/ai/image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          title: result.title,
          summary: result.summary,
          domain: selectedDomain,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.url) {
        console.warn("自动 AI 配图生成失败，已保留正文。", payload?.message ?? response.status);
        return result;
      }

      const nextBody =
        remainingImageCount > 1
          ? insertAutoImagesIntoBody(sourceBody, [{ url: payload.url as string, caption }], imageLimit)
          : insertAutoImageIntoBody(sourceBody, payload.url as string, caption);
      if (nextBody === sourceBody) {
        return result;
      }
      const nextTitle = inferTitleFromBody(nextBody, result.title);

      const nextResult = {
        ...result,
        title: nextTitle,
        body: nextBody,
      };

      setSelectedTitle(nextTitle);
      setBody(nextBody);
      clearPendingAutosave();
      updateDraft(targetDraft.id, {
        domain: selectedDomain,
        title: nextTitle,
        titleCandidates: result.titleCandidates,
        selectedAngle: result.selectedAngle,
        summary: result.summary,
        outline: result.outline,
        body: nextBody,
        status: targetDraft.status === "已发布" ? "已发布" : "待修改",
      });

      return nextResult;
    } catch (error) {
      console.warn("自动 AI 配图生成失败，已保留正文。", error);
      return result;
    }
  }

  async function retryGithubTrendingImageInsert(targetDraft: Draft, result: AIWriteResult) {
    const sourceBody = composeBodyWithTitle(result.title, result.body);
    if (!topicForWriting?.source?.includes("GitHub Trending") || !sourceBody.trim()) {
      return result;
    }

    try {
      const response = await fetch("/api/images/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: result.title,
          summary: result.summary,
          body: sourceBody,
          domain: selectedDomain,
          source: topicForWriting.source,
          query: `${result.title} ${targetDraft.topic}`.trim(),
        }),
      });
      const payload = await response.json().catch(() => null);
      const imageUrl = typeof payload?.url === "string" ? payload.url.trim() : "";
      if (!response.ok || !imageUrl) {
        return result;
      }

      const nextBody = insertAutoImageIntoBody(sourceBody, imageUrl, buildAutoImageCaption({
        title: result.title,
        summary: result.summary,
        domain: selectedDomain,
      }));

      if (nextBody === sourceBody) {
        return result;
      }
      const nextTitle = inferTitleFromBody(nextBody, result.title);

      setSelectedTitle(nextTitle);
      setBody(nextBody);
      clearPendingAutosave();
      updateDraft(targetDraft.id, {
        domain: selectedDomain,
        title: nextTitle,
        titleCandidates: result.titleCandidates,
        selectedAngle: result.selectedAngle,
        summary: result.summary,
        outline: result.outline,
        body: nextBody,
        status: targetDraft.status === "已发布" ? "已发布" : "待修改",
      });

      return { ...result, title: nextTitle, body: nextBody };
    } catch {
      return result;
    }
  }

  async function handleRefreshImages() {
    if (!currentDraft || isWritingBusy || !body.trim()) return;

    const bodyWithoutImages = removeMarkdownImageBlocks(body);
    if (!bodyWithoutImages.trim()) return;

    const nextTitle = inferTitleFromBody(bodyWithoutImages, selectedTitle || currentDraft.title || "未命名文章");
    const imageFreeResult: AIWriteResult = {
      title: nextTitle,
      titleCandidates: currentDraft.titleCandidates?.length ? currentDraft.titleCandidates : [nextTitle],
      selectedAngle: currentDraft.selectedAngle,
      summary,
      outline,
      body: bodyWithoutImages,
    };

    setIsGenerating(true);
    setGenerationStage("image");
    setPendingAction("重新搜图中");
    setGenerationError("");
    setSelectedTitle(nextTitle);
    setBody(bodyWithoutImages);
    clearPendingAutosave();
    updateDraft(currentDraft.id, {
      domain: selectedDomain,
      title: nextTitle,
      titleCandidates: imageFreeResult.titleCandidates,
      selectedAngle: imageFreeResult.selectedAngle,
      summary,
      outline,
      body: bodyWithoutImages,
      status: currentDraft.status === "已发布" ? "已发布" : "待修改",
    });

    try {
      const refreshedResult = await maybeAutoInsertImage(currentDraft, imageFreeResult, "body");
      if (refreshedResult.body !== bodyWithoutImages) {
        setSaveNotice("已重新匹配配图");
      } else {
        setSaveNotice("暂时没有匹配到新的配图");
      }
      window.setTimeout(() => setSaveNotice(""), 2400);
    } catch {
      setSaveNotice("重新搜图失败，请稍后再试");
      window.setTimeout(() => setSaveNotice(""), 2400);
    } finally {
      setIsGenerating(false);
      setGenerationStage(null);
      setPendingAction("");
    }
  }

  function resetGenerationState() {
    requestAbortControllerRef.current = null;
    setIsGenerating(false);
    setPendingAction("");
    setGenerationStage(null);
    setActiveGenerationTask(null);
  }

  function handlePauseGeneration() {
    const activeTask = activeWritingTask;
    const abortGeneration = requestAbortControllerRef.current?.abort.bind(requestAbortControllerRef.current) ?? activeTask?.abort;
    if (!abortGeneration) return;

    abortGeneration();
    requestAbortControllerRef.current = null;
    if (activeTask) {
      clearWritingTask(activeTask.draftId, activeTask.id);
    }
    resetGenerationState();
    setIsPaused(true);
    setGenerationError("");
    setSaveNotice("已暂停本次生成");
    window.setTimeout(() => setSaveNotice(""), 2000);
  }

  function isSameAsCurrentDraft() {
    if (!currentDraft) return false;
    const inferredTitle = inferTitleFromBody(body, selectedTitle || currentDraft.title);

    return (
      currentDraft.domain === selectedDomain &&
      currentDraft.title === inferredTitle &&
      currentDraft.summary === summary &&
      currentDraft.body === body &&
      JSON.stringify(currentDraft.outline) === JSON.stringify(outline) &&
      JSON.stringify(currentDraft.formatting) === JSON.stringify(formatting)
    );
  }

  async function handleGenerate(scope: AIWriteScope) {
    if (!topicForWriting || isWritingBusy) return;

    setGenerationError("");
    const hasAIConfig = await ensureAIWriterConfigured();
    if (!hasAIConfig) return;

    const targetDraft = ensureDraft(scope);
    if (!targetDraft) return;
    const label = generationLabels[scope];

    setIsGenerating(true);
    setPendingAction(label);
    setGenerationStage("material");
    setGenerationError("");
    setIsPaused(false);
    setActiveGenerationTask(scope);
    const controller = new AbortController();
    requestAbortControllerRef.current = controller;
    const writingTask = startWritingTask({
      draftId: targetDraft.id,
      scope,
      label,
      abort: () => controller.abort(),
    });

    try {
      let payload: AIWriteResponse;
      let generatedResult: AIWriteResult;

      if (scope === "body") {
        setGenerationStage("planning");
        setPendingAction("AI 正在规划摘要和大纲");

        const planningPayload = await requestAiGeneration("outline", targetDraft, controller.signal);
        const planningResult = planningPayload.result;

        if (!planningResult) {
          throw new Error(planningPayload.message || "AI 未返回可用结构稿");
        }

        syncAiResult(targetDraft, planningResult);

        const plannedDraftSnapshot: DraftWritingSnapshot = {
          ...buildDraftSnapshot(targetDraft),
          domain: selectedDomain,
          title: planningResult.title,
          titleCandidates: planningResult.titleCandidates,
          selectedAngle: planningResult.selectedAngle,
          summary: planningResult.summary,
          outline: planningResult.outline,
          body: planningResult.body,
        };

        setGenerationStage("drafting");
        setPendingAction(generationLabels.body);
        payload = await requestAiGeneration(scope, targetDraft, controller.signal, plannedDraftSnapshot);
        generatedResult = payload.result as AIWriteResult;
      } else {
        setGenerationStage(scope === "title" || scope === "outline" ? "planning" : "drafting");
        payload = await requestAiGeneration(scope, targetDraft, controller.signal);
        generatedResult = payload.result as AIWriteResult;
      }

      setGenerationStage("quality");
      syncAiResult(targetDraft, generatedResult);
      const baseNotice = buildGenerationSuccessNotice(scope, label, false, payload.wordCountStatus);
      setSaveNotice(baseNotice);
      window.setTimeout(() => setSaveNotice(""), 2400);
      clearWritingTask(targetDraft.id, writingTask.id);
      resetGenerationState();

      if (scope === "body" || scope === "full") {
        setGenerationStage("image");
        setPendingAction("配图搜索中，正在匹配文章素材");
      }

      void maybeAutoInsertImage(targetDraft, generatedResult, scope)
        .then((finalResult) => {
          setGenerationStage(null);
          setPendingAction("");
          if (finalResult.body !== generatedResult.body) {
            setSaveNotice(buildGenerationSuccessNotice(scope, label, true, payload.wordCountStatus));
            window.setTimeout(() => setSaveNotice(""), 2400);
            return;
          }

          void retryGithubTrendingImageInsert(targetDraft, generatedResult).then((retryResult) => {
            if (retryResult.body === generatedResult.body) return;
            setSaveNotice(buildGenerationSuccessNotice(scope, label, true, payload.wordCountStatus));
            window.setTimeout(() => setSaveNotice(""), 2400);
          });
        })
        .catch(() => {
          setGenerationStage(null);
          setPendingAction("");
          // Ignore background image insertion failures to keep generation responsive.
        });

      return;
    } catch (error) {
      clearWritingTask(targetDraft.id, writingTask.id);
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setGenerationError(getClientErrorMessage(error, "AI 写作失败，请稍后重试"));
    } finally {
      if (requestAbortControllerRef.current) {
        resetGenerationState();
      }
    }
  }

  async function handleTransform(mode: AITransformAction) {
    if (!topicForWriting || !body.trim() || isWritingBusy) return;

    setGenerationError("");
    const hasAIConfig = await ensureAIWriterConfigured();
    if (!hasAIConfig) return;

    const targetDraft = ensureDraft("body");
    if (!targetDraft) return;

    const selectedText = richTextEditorRef.current?.getSelectedText() ?? "";

    setIsGenerating(true);
    setPendingAction(transformLabels[mode] ?? "AI 处理中");
    setGenerationError("");
    setIsPaused(false);
    setActiveGenerationTask(mode);
    const controller = new AbortController();
    requestAbortControllerRef.current = controller;
    const writingTask = startWritingTask({
      draftId: targetDraft.id,
      scope: mode,
      label: transformLabels[mode] ?? "AI 处理中",
      abort: () => controller.abort(),
    });

    try {
      const response = await fetch("/api/ai/write", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          mode: "transform",
          action: mode,
          topic: topicForWriting,
          settings,
          domain: selectedDomain,
          articleType,
          targetWordCount,
          draft: buildDraftSnapshot(targetDraft),
          body,
          selectedText: selectedText || undefined,
        }),
      });

      const payload = (await response.json()) as AIWriteResponse;
      if (!response.ok || !payload.transformedText) {
        throw new Error(payload.message || "AI 改写失败，请稍后重试");
      }

      const nextBody = selectedText
        ? richTextEditorRef.current?.replaceSelection(payload.transformedText) ?? payload.transformedText
        : payload.transformedText;
      const nextTitle = inferTitleFromBody(nextBody, selectedTitle || targetDraft.title);

      setSelectedTitle(nextTitle);
      setBody(nextBody);
      updateDraft(targetDraft.id, {
        domain: selectedDomain,
        title: nextTitle,
        summary,
        outline,
        body: nextBody,
        formatting: targetDraft.domain === selectedDomain ? targetDraft.formatting : createFormattingForDomain(selectedDomain, settings.defaultTemplate),
        status: targetDraft.status === "已发布" ? "已发布" : "待修改",
      });
      setSaveNotice(`${transformLabels[mode] ?? "AI 处理"}完成`);
      window.setTimeout(() => setSaveNotice(""), 2000);
    } catch (error) {
      clearWritingTask(targetDraft.id, writingTask.id);
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setGenerationError(getClientErrorMessage(error, "AI 改写失败，请稍后重试"));
    } finally {
      clearWritingTask(targetDraft.id, writingTask.id);
      resetGenerationState();
    }
  }

  const saveCurrentDraft = (showNotice = true) => {
    if (!currentDraft) {
      const nextTitle = inferTitleFromBody(body, selectedTitle || "未命名文章");
      const targetDraft = createManualDraft(selectedDomain, {
        title: nextTitle,
        summary,
        outline,
        body,
        formatting,
        status: "待修改",
      });

      setSelectedTitle(nextTitle);
      startTransition(() => {
        router.replace(`/writing?draftId=${targetDraft.id}`);
      });

      if (showNotice) {
        setSaveNotice("已保存到草稿箱");
        window.setTimeout(() => setSaveNotice(""), 2000);
      }

      return targetDraft;
    }

    const nextTitle = inferTitleFromBody(body, selectedTitle || currentDraft.title);
    const nextDraft: Draft = {
      ...currentDraft,
      domain: selectedDomain,
      title: nextTitle,
      summary,
      outline,
      body,
      formatting,
      status: currentDraft.status === "已发布" ? "已发布" : "待修改",
    };

    setSelectedTitle(nextTitle);
    updateDraft(currentDraft.id, {
      domain: nextDraft.domain,
      title: nextDraft.title,
      summary: nextDraft.summary,
      outline: nextDraft.outline,
      body: nextDraft.body,
      formatting: nextDraft.formatting,
      status: nextDraft.status,
    });

    if (showNotice) {
      setSaveNotice("已保存到草稿箱");
      window.setTimeout(() => setSaveNotice(""), 2000);
    }

    return nextDraft;
  };

  const handleSaveDraft = () => {
    saveCurrentDraft(true);
  };

  const applyToolbarAction = (mode: EditorToolbarMode) => {
    richTextEditorRef.current?.runCommand(mode);
    setSaveNotice("已更新正文格式");
    window.setTimeout(() => setSaveNotice(""), 1500);
  };

  useEffect(() => {
    if (isWritingBusy) return;

    if (!autosaveInitializedRef.current) {
      autosaveInitializedRef.current = true;
      return;
    }

    const hasMeaningfulContent = Boolean(
      summary.trim() ||
      editorBody.trim() ||
      outline.some((item) => item.trim()),
    );

    if (!hasMeaningfulContent || isSameAsCurrentDraft()) return;

    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = window.setTimeout(() => {
      if (!currentDraft) {
        const nextTitle = inferTitleFromBody(body, selectedTitle || "未命名文章");
        const targetDraft = createManualDraft(selectedDomain, {
          title: nextTitle,
          summary,
          outline,
          body,
          formatting,
          status: "待修改",
        });

        setSelectedTitle(nextTitle);
        startTransition(() => {
          router.replace(`/writing?draftId=${targetDraft.id}`);
        });

        setSaveNotice("已自动保存");
        window.setTimeout(() => setSaveNotice(""), 1500);
        return;
      }

      const nextTitle = inferTitleFromBody(body, selectedTitle || currentDraft.title);

      setSelectedTitle(nextTitle);
      updateDraft(currentDraft.id, {
        domain: selectedDomain,
        title: nextTitle,
        summary,
        outline,
        body,
        formatting,
        status: currentDraft.status === "已发布" ? "已发布" : "待修改",
      });

      setSaveNotice("已自动保存");
      window.setTimeout(() => setSaveNotice(""), 1500);
    }, 1200);

    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [
    activeTopic,
    body,
    createManualDraft,
    currentDraft,
    editorBody,
    isWritingBusy,
    outline,
    formatting,
    router,
    selectedDomain,
    selectedTitle,
    settings.defaultTemplate,
    summary,
    updateDraft,
  ]);
  function renderInlineNodes(text: string, primary: string, accent: string) {
    const tokens = collectInlineTokens(text, true);
    if (!tokens.length) return <>{text}</>;
    const parts: React.ReactNode[] = [];
    let cursor = 0;
    tokens.forEach((token, index) => {
      if (token.start > cursor) parts.push(text.slice(cursor, token.start));
      if (token.kind === "bold") {
        parts.push(<strong key={index} style={{ color: primary }}>{token.content}</strong>);
      } else if (token.kind === "quote") {
        parts.push(<span key={index} style={{ color: accent }}>{token.content}</span>);
      } else {
        parts.push(<span key={index} style={getInlineHighlightStyle(primary, accent)}>{token.content}</span>);
      }
      cursor = token.end;
    });
    if (cursor < text.length) parts.push(text.slice(cursor));
    return <>{parts}</>;
  }

  function handleCopyHtml() {
    const draft = currentDraft;
    if (!draft) return;
    const inferredTitle = inferTitleFromBody(body, selectedTitle || draft.title);
    const htmlBody = stripTitleLineFromBody(body, inferredTitle);
    const html = buildWechatArticleHtml(
      { ...draft, title: inferredTitle, summary },
      htmlBody,
      formatting,
      activeScheme.primary,
      activeScheme.accent,
      previewAccountName,
      selectedDomain,
      { includeHeader: false },
    );
    const plainText = buildWechatText(
      { ...draft, title: inferredTitle, summary },
      htmlBody,
      "",
      { includeTitle: false, includeSummary: false, includeCta: false, ctaText: formatting.ctaText },
    );
    writeRichClipboard(html, plainText).then(() => {
      setSaveNotice("已复制公众号格式");
      window.setTimeout(() => setSaveNotice(""), 2000);
    }).catch(() => {
      setSaveNotice("复制失败");
      window.setTimeout(() => setSaveNotice(""), 2000);
    });
  }

  function handleExportHtml() {
    const draft = currentDraft;
    if (!draft) return;
    const inferredTitle = inferTitleFromBody(body, selectedTitle || draft.title);
    const htmlBody = stripTitleLineFromBody(body, inferredTitle);
    const html = buildHtml({ ...draft, title: inferredTitle, summary }, htmlBody, formatting, activeScheme.primary, activeScheme.accent, "公众号", previewAccountName, selectedDomain);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${inferredTitle || "article"}.html`;
    a.click();
    URL.revokeObjectURL(url);
    setSaveNotice("已导出 HTML");
    window.setTimeout(() => setSaveNotice(""), 2000);
  }

  function handleExportMarkdown() {
    const draft = currentDraft;
    if (!draft) return;
    const inferredTitle = inferTitleFromBody(body, selectedTitle || draft.title);
    const md = body;
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${inferredTitle || "article"}.md`;
    a.click();
    URL.revokeObjectURL(url);
    setSaveNotice("已导出 Markdown");
    window.setTimeout(() => setSaveNotice(""), 2000);
  }

  async function handlePushToWechatDraft() {
    if (isWritingBusy || isWechatPushing) return;

    const draft = saveCurrentDraft(false);
    if (!draft) return;

    const inferredTitle = inferTitleFromBody(body, selectedTitle || draft.title);
    const articleBody = stripTitleLineFromBody(body, inferredTitle).trim();

    if (!inferredTitle || !articleBody) {
      setGenerationError("推送前需要先补齐标题和正文。");
      return;
    }

    setIsWechatPushing(true);
    setGenerationError("");
    setSaveNotice("正在检查公众号草稿...");

    try {
      const checkResponse = await fetch("/api/wechat/draft/check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: inferredTitle,
          summary,
          body: articleBody,
          formatting,
          author: previewAccountName,
          domain: selectedDomain,
        }),
      });
      const checkPayload = await checkResponse.json().catch(() => null);

      if (!checkResponse.ok || !checkPayload?.ok) {
        const firstIssue = Array.isArray(checkPayload?.items)
          ? checkPayload.items.find((item: { ok?: boolean }) => !item.ok)
          : null;
        throw new Error(firstIssue?.message ?? checkPayload?.message ?? "推送前检查未通过");
      }

      setSaveNotice("正在推送公众号草稿...");
      const response = await fetch("/api/wechat/draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: inferredTitle,
          summary,
          body: articleBody,
          formatting,
          author: previewAccountName,
          domain: selectedDomain,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.message ?? "推送公众号草稿箱失败");
      }

      updateDraft(draft.id, {
        title: inferredTitle,
        summary,
        body,
        formatting,
        publishedChannel: "公众号",
        lastExportFormat: "wechat",
        lastExportedAt: new Date().toISOString(),
      });

      setSaveNotice(
        `已推送到公众号草稿箱${payload?.accountName ? ` · ${payload.accountName}` : ""}${payload?.digestTruncated ? " · 摘要已截断" : ""}`,
      );
      window.setTimeout(() => setSaveNotice(""), 3000);
    } catch (error) {
      setGenerationError(getClientErrorMessage(error, "推送公众号草稿箱失败"));
      setSaveNotice("");
    } finally {
      setIsWechatPushing(false);
    }
  }

  function renderMockupPreviewContent() {
    if (isWechatChannel) {
      return (
        <div className="mx-auto max-w-[640px]">
          <header className="mb-7">
            <h1
              className="text-[25px] leading-[1.42] tracking-[-0.01em]"
              style={{ color: textPrimary, fontWeight: 800 }}
            >
              {wechatPreviewTitle || "未命名文章"}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[14px] leading-5" style={{ color: textMuted }}>
              <span style={{ color: "#576b95", fontWeight: 500 }}>{previewAccountName}</span>
              <span>·</span>
              <span>{articleDate}</span>
            </div>
          </header>
          <div dangerouslySetInnerHTML={{ __html: wechatPreviewHtml }} />
        </div>
      );
    } else {
      /* Standard channel preview */
      return (
        <div className="flex h-full min-h-0 flex-col">
          <div
            className="relative overflow-hidden rounded-[28px] border px-5 pb-5 pt-5"
            style={{
              background: `${previewThemeStyle.shellTint}, ${previewThemeStyle.shellGradient}`,
              borderColor: previewThemeStyle.heroBorder,
              boxShadow: isDarkTemplate
                ? "0 20px 60px rgba(2,6,23,0.35)"
                : "0 20px 60px rgba(15,23,42,0.08)",
            }}
          >
            <div
              className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full blur-3xl"
              style={{ background: `${activeScheme.accent}35` }}
            />
            <div
              className="pointer-events-none absolute -left-10 bottom-8 h-24 w-24 rounded-full blur-3xl"
              style={{ background: `${activeScheme.primary}18` }}
            />

            <div className="relative flex items-center gap-3">
              <div
                className="flex h-11 w-11 items-center justify-center rounded-full text-[12px] text-white"
                style={{
                  background: `linear-gradient(135deg, ${activeScheme.primary}, ${activeScheme.accent})`,
                  fontWeight: 700,
                  boxShadow: `0 12px 24px ${activeScheme.primary}24`,
                }}
              >
                {previewAccountInitials}
              </div>
              <div className="min-w-0">
                <div className="text-[14px] truncate" style={{ color: textPrimary, fontWeight: 700 }}>
                  {previewAccountName}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: textMuted }}>
                  <span>{articleDate}</span>
                  <span>·</span>
                  <span>{publishChannel}</span>
                </div>
              </div>
            </div>

            <div
              className="relative mt-4 overflow-hidden rounded-[24px] border px-5 py-6"
              style={{
                background: previewThemeStyle.heroGradient,
                borderColor: previewThemeStyle.heroBorder,
              }}
            >
              <h1 className="max-w-[92%] text-[23px] leading-[1.35] tracking-[-0.02em]" style={{ fontWeight: 800, color: textPrimary }}>
                {selectedTitle}
              </h1>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px]" style={{ color: textMuted }}>
                <span>作者：{previewAccountName}</span>
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-1">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-[0.24em]" style={{ color: textMuted, fontWeight: 700 }}>
                正文
              </div>
              <div className="text-[11px]" style={{ color: textMuted }}>
                {headingCount || 1} 个章节 · {estimatedCards} 处重点信息
              </div>
            </div>

            {previewBlocks.map((block, index) => {
              if (block.type === "heading") {
                const displayIndex = previewBlocks.slice(0, index + 1).filter((item) => item.type === "heading").length;

                return (
                  <div key={`${block.type}-${block.content}-${index}`} className="my-8">
                    <div className="mb-2 flex items-center gap-3">
                      <span
                        className="inline-flex h-8 min-w-8 items-center justify-center rounded-2xl px-2 text-[11px]"
                        style={{
                          background: formatting.numberedBadge ? activeScheme.primary : isDarkTemplate ? "#334155" : "#e2e8f0",
                          color: "#ffffff",
                          fontWeight: 700,
                          boxShadow: `0 12px 28px ${activeScheme.primary}22`,
                        }}
                      >
                        {String(displayIndex).padStart(2, "0")}
                      </span>
                      <div className="h-px flex-1" style={{ background: `${activeScheme.primary}24` }} />
                    </div>
                    <h2
                      className="text-[18px] leading-[1.5] tracking-[-0.01em]"
                      style={{ fontWeight: 800, color: textPrimary }}
                    >
                      {renderInlineNodes(block.content, activeScheme.primary, activeScheme.accent)}
                    </h2>
                  </div>
                );
              }

              if (block.type === "quote") {
                const quoteBorderColor = formatting.template === "曜石黑" ? "#475569" : activeScheme.primary;
                const quoteBorderLeft = formatting.template === "极简白" ? "none" : `4px solid ${quoteBorderColor}`;

                return (
                  <div
                    key={`${block.type}-${block.content}-${index}`}
                    className="px-4 py-4 my-6"
                    style={{
                      borderLeft: quoteBorderLeft,
                      background: formatting.gradientQuote
                        ? `linear-gradient(135deg, ${activeScheme.primary}14, ${activeScheme.accent}0f)`
                        : `${activeScheme.primary}12`,
                      borderRadius: 0,
                      boxShadow: isDarkTemplate ? "none" : "0 10px 30px rgba(15,23,42,0.04)",
                    }}
                  >
                    <div className="mb-2 text-[10px] uppercase tracking-[0.24em]" style={{ color: activeScheme.primary, fontWeight: 700 }}>
                      引用
                    </div>
                    <p className="text-[14px] leading-[1.8]" style={{ color: textSecondary }}>
                      {renderInlineNodes(block.content, activeScheme.primary, activeScheme.accent)}
                    </p>
                  </div>
                );
              }

              if (block.type === "divider") {
                return <div key={`${block.type}-${index}`} className="my-7 h-px bg-slate-200" />;
              }

              if (block.type === "image") {
                if (block.src) {
                  return (
                    <figure
                      key={`${block.type}-${block.src}-${index}`}
                      className="my-7 overflow-hidden"
                    >
                      <img
                        src={block.src}
                        alt={block.alt || block.caption || "文章配图"}
                        className="block w-full rounded-2xl border border-slate-200 object-cover"
                      />
                      <figcaption className="px-2 pt-3 text-center text-[12px] text-gray-500">
                        {block.caption || block.alt || "文章配图"}
                      </figcaption>
                    </figure>
                  );
                }

                return (
                  <div
                    key={`${block.type}-${block.content}-${index}`}
                    className="my-7 overflow-hidden rounded-[20px] border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-slate-400"
                  >
                    {block.content}
                  </div>
                );
              }

              if (block.type === "golden") {
                return (
                  <div
                    key={`${block.type}-${block.content}-${index}`}
                    className="my-6 rounded-[18px] px-5 py-5"
                    style={{
                      background: `linear-gradient(135deg, ${activeScheme.primary}15, ${activeScheme.accent}22)`,
                      color: textPrimary,
                    }}
                  >
                    <p className="text-[16px] leading-[1.85] font-semibold">
                      {renderInlineNodes(block.content, activeScheme.primary, activeScheme.accent)}
                    </p>
                  </div>
                );
              }

              if (block.type === "highlight") {
                return (
                  <div
                    key={`${block.type}-${block.content}-${index}`}
                    className="my-6 rounded-[16px] border px-4 py-4"
                    style={{
                      background: highlightBackground,
                      borderColor: `${activeScheme.primary}20`,
                    }}
                  >
                    <p className="text-[15px] leading-[1.8] font-medium" style={{ color: textPrimary }}>
                      {renderInlineNodes(block.content, activeScheme.primary, activeScheme.accent)}
                    </p>
                  </div>
                );
              }

              if (block.type === "unordered-list") {
                return (
                  <ul key={`${block.type}-${index}`} className="my-5 space-y-3">
                    {block.items.map((item, itemIndex) => (
                      <li
                        key={`${item}-${itemIndex}`}
                        className="flex items-start gap-3 text-[15px] leading-[1.8]"
                        style={{ color: textSecondary }}
                      >
                        <span className="mt-[11px] h-[5px] w-[5px] rounded-full bg-[#6b7280] flex-shrink-0" />
                        <span>{renderInlineNodes(item, activeScheme.primary, activeScheme.accent)}</span>
                      </li>
                    ))}
                  </ul>
                );
              }

              if (block.type === "ordered-list") {
                return (
                  <ol key={`${block.type}-${index}`} className="my-5 space-y-3">
                    {block.items.map((item, itemIndex) => (
                      <li
                        key={`${item}-${itemIndex}`}
                        className="flex items-start gap-3 text-[15px] leading-[1.8]"
                        style={{ color: textSecondary }}
                      >
                        <span className="min-w-[18px] text-[14px] leading-[1.8] text-[#6b7280]">
                          {itemIndex + 1}.
                        </span>
                        <span>{renderInlineNodes(item, activeScheme.primary, activeScheme.accent)}</span>
                      </li>
                    ))}
                  </ol>
                );
              }

              if (block.type === "code") {
                const language = block.language ? block.language : "code";
                return (
                  <figure key={`${block.type}-${block.content}-${index}`} className="my-6 border border-gray-800 rounded-lg overflow-hidden shadow-lg bg-slate-900">
                    <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800 text-[11px] text-slate-300 uppercase">
                      <span>代码</span>
                      <span>{language}</span>
                    </div>
                    <pre className="p-3 overflow-x-auto text-[13px] text-slate-200 font-mono leading-relaxed">
                      <code>{block.content}</code>
                    </pre>
                  </figure>
                );
              }

              return (
                <p
                  key={`${block.type}-${block.content}-${index}`}
                  className="mb-[18px] text-[15px] leading-[1.8] tracking-[0.01em]"
                  style={{
                    color: textSecondary,
                  }}
                >
                  {renderInlineNodes(block.content, activeScheme.primary, activeScheme.accent)}
                </p>
              );
            })}
          </div>
        </div>
      );
    }
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-12 min-h-[48px] items-center gap-2 border-b border-border bg-card/90 px-4">
        <button
          onClick={() => void handleGenerate("full")}
          disabled={isWritingBusy}
          className="lens-btn-primary flex items-center gap-1.5 px-3.5 py-1.5 text-[12px]"
          style={{ fontWeight: 850 }}
        >
          <Sparkles className="w-3.5 h-3.5" /> 生成文章
        </button>
        <button
          onClick={() => void handleRefreshImages()}
          disabled={isWritingBusy || !hasGeneratedBody}
          className="lens-btn-secondary flex items-center gap-1.5 px-3.5 py-1.5 text-[12px]"
          style={{ fontWeight: 700 }}
        >
          <RefreshCw className="w-3.5 h-3.5" /> 重新搜图
        </button>
        <div className="flex-1" />
        {visiblePendingAction ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[12px] text-primary">
            <LoaderCircle className="h-3 w-3 animate-spin" />
            {visiblePendingAction}
          </span>
        ) : null}
        {!visiblePendingAction && saveNotice ? <span className="text-[12px] text-primary">{saveNotice}</span> : null}
        {isWritingBusy ? (
          <button
            onClick={handlePauseGeneration}
            className="flex items-center gap-1.5 rounded-lg border border-border/70 bg-accent px-3.5 py-1.5 text-[12px] text-primary hover:bg-primary/10"
            style={{ fontWeight: 600 }}
          >
            <Pause className="w-3.5 h-3.5" /> 暂停生成
          </button>
        ) : null}
        <button
          onClick={handleSaveDraft}
          disabled={isWritingBusy || isWechatPushing}
          className="lens-btn-secondary flex items-center gap-1.5 px-3.5 py-1.5 text-[12px]"
          style={{ fontWeight: 750 }}
        >
          <Save className="w-3.5 h-3.5" /> 保存
        </button>
        <button
          onClick={() => void handlePushToWechatDraft()}
          disabled={isWritingBusy || isWechatPushing || !editorBody.trim()}
          className="lens-btn-primary flex items-center gap-1.5 px-3.5 py-1.5 text-[12px] disabled:cursor-not-allowed disabled:bg-primary/40"
          style={{ fontWeight: 600 }}
        >
          {isWechatPushing ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          推送
        </button>
        <div className="relative group">
          <button
            disabled={isWritingBusy || isWechatPushing}
            className="lens-btn-secondary flex items-center gap-1.5 px-3.5 py-1.5 text-[12px]"
            style={{ fontWeight: 750 }}
          >
            <Download className="w-3.5 h-3.5" /> 导出
            <ChevronDown className="w-3 h-3" />
          </button>
          <div className="invisible absolute right-0 top-full z-20 mt-1 min-w-[160px] rounded-xl border border-border bg-card py-1 opacity-0 shadow-lg transition-all group-hover:visible group-hover:opacity-100">
            <button onClick={handleCopyHtml} className="w-full px-3 py-2 text-left text-[12px] text-muted-foreground hover:bg-accent">
              复制公众号格式
            </button>
            <button onClick={handleExportHtml} className="w-full px-3 py-2 text-left text-[12px] text-muted-foreground hover:bg-accent">
              导出 HTML
            </button>
            <button onClick={handleExportMarkdown} className="w-full px-3 py-2 text-left text-[12px] text-muted-foreground hover:bg-accent">
              导出 Markdown
            </button>
          </div>
        </div>
      </div>

      {generationError ? (
        <div className="flex items-center justify-between gap-3 border-b border-red-100 bg-red-50 px-4 py-2 text-[12px] text-red-600">
          <span>{generationError}</span>
          {isAIWriterConfigError(generationError) ? (
            <button
              type="button"
              onClick={() => router.push("/settings#ai-writer")}
              className="shrink-0 rounded-md border border-red-200 bg-white px-2.5 py-1 text-[11px] text-red-600 hover:bg-red-50"
              style={{ fontWeight: 750 }}
            >
              去配置
            </button>
          ) : null}
        </div>
      ) : null}

      {generationStageSteps.length ? (
        <div className="border-b border-border bg-background/80 px-5 py-2.5">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-5">
            <div className="flex min-w-[190px] items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary shadow-[0_6px_18px_rgba(111,92,255,0.12)]">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              </span>
              <div className="min-w-0">
                <div className="text-[12px] text-foreground" style={{ fontWeight: 850 }}>
                  {visiblePendingAction || "生成中"}
                </div>
                <div className="text-[10px] text-muted-foreground">{Math.round(generationStageProgress)}% · 正在推进写作流程</div>
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <div className="relative min-h-11 overflow-hidden px-6 py-1 lg:px-8">
                <div
                  className="absolute top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-border"
                  style={{ left: generationStageTrackInset, right: generationStageTrackInset }}
                >
                  <div
                    className="relative h-full overflow-hidden rounded-full bg-primary transition-[width] duration-500 ease-out"
                    style={{ width: `${generationStageProgress}%` }}
                  >
                    <span
                      className="absolute inset-y-0 rounded-full opacity-70"
                      style={{
                        left: "-36%",
                        width: "36%",
                        background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.55) 45%, transparent 100%)",
                        animation: "writing-progress-flow 1.35s linear infinite",
                      }}
                    />
                  </div>
                </div>
                <div
                  className="relative grid min-h-9 min-w-0 items-center gap-4"
                  style={{ gridTemplateColumns: `repeat(${generationStageSteps.length}, minmax(0, 1fr))` }}
                >
                  {generationStageSteps.map((step) => (
                    <div
                      key={step.key}
                      className="flex min-w-0 justify-center"
                    >
                      <div
                        className={`inline-flex max-w-full items-center gap-2 rounded-full border px-2.5 py-1.5 text-[10px] shadow-[0_4px_12px_rgba(24,23,21,0.06)] ${
                          step.status === "active"
                            ? "border-primary/30 bg-card text-primary"
                            : step.status === "done"
                              ? "border-border bg-background text-muted-foreground"
                              : "border-border bg-background text-muted-foreground/60"
                        }`}
                        style={{ fontWeight: step.status === "active" ? 850 : 700 }}
                      >
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                            step.status === "active"
                              ? "border-primary bg-card"
                              : step.status === "done"
                                ? "border-border bg-accent"
                                : "border-border/70 bg-card"
                          }`}
                        >
                          {step.status === "done" ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : (
                            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                          )}
                        </span>
                        <span className="truncate">{step.label}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <style jsx>{`
            @keyframes writing-progress-flow {
              0% {
                transform: translateX(0);
              }
              100% {
                transform: translateX(380%);
              }
            }
          `}</style>
        </div>
      ) : null}

      <div className="flex flex-1 overflow-hidden">
        <div className="w-[260px] min-w-[260px] space-y-5 overflow-y-auto border-r border-border bg-accent p-4">
          <div>
            <div className="mb-2 text-[13px] text-foreground" style={{ fontWeight: 800 }}>写作参数</div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[12px] text-muted-foreground">目标字数</label>
                <input
                  type="number"
                  min={300}
                  max={5000}
                  step={100}
                  value={targetWordCount}
                  onChange={(event) => {
                    const parsed = Number.parseInt(event.target.value, 10);
                    setTargetWordCount(Number.isFinite(parsed) ? parsed : 1200);
                  }}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-[13px] outline-none focus:border-primary"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">AI 会按这个长度生成正文。</p>
              </div>
            </div>
          </div>

          <div className="mt-4 border-t border-border pt-4">
            <div className="mb-2 text-[13px] text-foreground" style={{ fontWeight: 800 }}>排版设置</div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[12px] text-muted-foreground">模板</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {templates.map((t) => (
                    <button
                      key={t}
                      onClick={() => setFormatting((f) => ({ ...f, template: t }))}
                      className={`inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] border transition-colors ${
                        formatting.template === t
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card text-muted-foreground hover:bg-accent"
                      }`}
                      style={{ fontWeight: 700 }}
                    >
                      <span
                        className="inline-block h-2 w-2 rounded-full border align-middle"
                        style={getTemplateDotStyle(t)}
                      />
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[12px] text-muted-foreground">字号</label>
                <select
                  value={formatting.fontSize}
                  onChange={(e) => setFormatting((f) => ({ ...f, fontSize: e.target.value as DraftFormatting["fontSize"] }))}
                  className="w-full cursor-pointer appearance-none rounded-lg border border-border bg-card px-3 py-1.5 text-[12px]"
                >
                  <option value="15px">15px 紧凑</option>
                  <option value="16px">16px 默认</option>
                  <option value="17px">17px 舒适</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[12px] text-muted-foreground">底部引导语</label>
                <textarea
                  value={formatting.ctaText ?? settings.ctaEngage}
                  onChange={(event) => setFormatting((current) => ({ ...current, ctaText: event.target.value }))}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-[12px] leading-relaxed outline-none focus:border-primary"
                  placeholder="输入底部引导文案"
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] text-muted-foreground">引导语样式</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {ctaStyles.map((styleName) => (
                    <button
                      key={styleName}
                      type="button"
                      onClick={() => setFormatting((current) => ({ ...current, ctaStyle: styleName }))}
                      className={`rounded-lg border px-2 py-1.5 text-[11px] transition-colors ${
                        (formatting.ctaStyle ?? "简洁") === styleName
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card text-muted-foreground hover:bg-accent"
                      }`}
                      style={{ fontWeight: 700 }}
                    >
                      {styleName}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="relative flex flex-1 flex-col overflow-hidden bg-background px-4 py-5">
          <div className="grid flex-1 min-h-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 overflow-hidden">
            <section className="flex min-w-0 flex-col overflow-hidden rounded-[24px] border border-border bg-card shadow-[0_18px_60px_rgba(31,41,86,0.08)]">
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/70 px-4 py-2.5">
                <div className="text-[13px] text-foreground" style={{ fontWeight: 800 }}>编辑</div>
                <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">
                  {[
                    { icon: Undo2, mode: "undo" as const, label: "撤销" },
                    { icon: Redo2, mode: "redo" as const, label: "重做" },
                    { icon: Pilcrow, mode: "paragraph" as const, label: "正文" },
                    { icon: AlignLeft, mode: "heading" as const, label: "二级标题" },
                    { icon: Bold, mode: "bold" as const, label: "加粗" },
                    { icon: Italic, mode: "italic" as const, label: "斜体" },
                    { icon: Underline, mode: "underline" as const, label: "下划线" },
                    { icon: List, mode: "list" as const, label: "无序列表" },
                    { icon: ListOrdered, mode: "orderedList" as const, label: "有序列表" },
                    { icon: Quote, mode: "quote" as const, label: "引用" },
                    { icon: Minus, mode: "divider" as const, label: "分割线" },
                    { icon: Code2, mode: "code" as const, label: "代码块" },
                  ].map(({ icon: Icon, mode, label }) => (
                    <button
                      key={mode}
                      type="button"
                      title={label}
                      aria-label={label}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => applyToolbarAction(mode)}
                      disabled={isWritingBusy}
                      className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-primary disabled:cursor-not-allowed disabled:text-muted-foreground/40"
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </button>
                  ))}
                </div>
              </div>

              <div
                ref={editorScrollRef}
                onScroll={() => syncScroll("editor")}
                className={isWechatChannel ? "min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-card px-5 py-5" : "min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-6 py-6"}
                style={
                  isWechatChannel
                    ? { background: surfaceBackground }
                    : {
                        background: surfaceBackground,
                        backgroundImage: `${previewThemeStyle.bodyOverlay}, repeating-linear-gradient(180deg, transparent 0, transparent 34px, ${isDarkTemplate ? "rgba(148,163,184,0.03)" : "rgba(148,163,184,0.05)"} 35px)`,
                      }
                }
              >
                <div className="mx-auto flex min-h-full w-full max-w-[680px] flex-col">
                  <div className="mb-5 border-b pb-5" style={{ borderColor: "#f1f1f1" }}>
                    <textarea
                      value={selectedTitle}
                      onChange={(event) => handleTitleChange(event.target.value)}
                      disabled={isWritingBusy}
                      rows={1}
                      placeholder="输入文章标题"
                      className="block w-full resize-none overflow-hidden border-0 bg-transparent p-0 outline-none disabled:cursor-not-allowed disabled:opacity-70"
                      style={{
                        fontSize: String(domainPreviewStyle.titleStyle.fontSize),
                        lineHeight: Number(domainPreviewStyle.titleStyle.lineHeight),
                        letterSpacing: String(domainPreviewStyle.titleStyle.letterSpacing),
                        color: textPrimary,
                        fontWeight: Number(domainPreviewStyle.titleStyle.fontWeight),
                        textAlign: domainPreviewStyle.titleStyle.textAlign,
                        fontFamily: String(domainPreviewStyle.titleStyle.fontFamily),
                      }}
                    />
                    <div
                      className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px]"
                      style={{
                        color: textMuted,
                        justifyContent: domainPreviewStyle.metaAlign,
                      }}
                    >
                      <span className="text-[15px]" style={{ fontWeight: 500, color: "#576b95" }}>{previewAccountName}</span>
                      <span>·</span>
                      <span>{articleDate}</span>
                    </div>
                  </div>

                  {isBodyDraftGenerating && !editorBody.trim() ? (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-border/70 bg-accent px-3 py-3 text-[12px] text-primary">
                        {visiblePendingAction || "正文生成中，正在组织正文内容和段落细节…"}
                      </div>
                      <div className="rounded-lg bg-background px-4 py-4">
                        <div className="space-y-3">
                          {[
                            "w-[92%]",
                            "w-[84%]",
                            "w-[76%]",
                            "w-[88%]",
                            "w-[69%]",
                            "w-[94%]",
                            "w-[81%]",
                          ].map((widthClass, index) => (
                            <div key={index} className={`h-4 animate-pulse rounded bg-muted ${widthClass}`} />
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <LazyRichTextEditor
                      ref={richTextEditorRef}
                      value={editorBody}
                      onChange={handleEditorBodyChange}
                      disabled={isWritingBusy}
                      placeholder="请输入"
                      editorStyle={{
                        fontSize: formatting.fontSize,
                        lineHeight: formatting.lineHeight,
                        color: isWechatChannel ? domainPreviewStyle.paragraphColor : textPrimary,
                        fontFamily: isWechatChannel ? domainPreviewStyle.paragraphFontFamily : undefined,
                        "--editor-divider-color": "#eeeeee",
                      }}
                    />
                  )}
                </div>
              </div>
            </section>

            <section className="flex min-w-0 flex-col overflow-hidden rounded-[24px] border border-border bg-card shadow-[0_18px_60px_rgba(31,41,86,0.08)]">
              <div className="flex shrink-0 items-center justify-between border-b border-border/70 px-4 py-2.5">
                <div className="text-[13px] text-foreground" style={{ fontWeight: 800 }}>实时预览</div>
                <div className="text-[11px] text-muted-foreground">
                  {previewMode === "mobile" ? "手机" : "桌面"}
                </div>
              </div>
              <div ref={previewScrollRef} onScroll={() => syncScroll("preview")} className="min-h-0 flex-1 overflow-y-auto bg-background p-5">
                <div
                  className="mx-auto min-h-full overflow-hidden rounded-[24px] border shadow-lg"
                  style={{
                    width: previewMode === "mobile" ? 390 : "100%",
                    maxWidth: previewMode === "mobile" ? 390 : 760,
                    background: phoneShellBackground,
                    color: textPrimary,
                    borderColor: isDarkTemplate ? "transparent" : "#e5e7eb",
                  }}
                >
                  <div
                    className={isWechatChannel ? (previewMode === "mobile" ? "bg-white px-5 py-7" : "bg-white px-10 py-9") : "px-6 py-6"}
                    style={
                      isWechatChannel
                        ? { background: surfaceBackground }
                        : {
                            background: surfaceBackground,
                            backgroundImage: `${previewThemeStyle.bodyOverlay}, repeating-linear-gradient(180deg, transparent 0, transparent 34px, ${isDarkTemplate ? "rgba(148,163,184,0.03)" : "rgba(148,163,184,0.05)"} 35px)`,
                          }
                    }
                  >
                    {renderMockupPreviewContent()}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

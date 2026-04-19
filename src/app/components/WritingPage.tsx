"use client";

import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Type, ListTree, FileText, RefreshCw, Maximize2, Minimize2,
  Palette, ChevronDown, Flame, Eye, BookOpen, Quote, Sparkles,
  Bold, Italic, Underline, AlignLeft, List, Save,
  LoaderCircle, CheckCircle2, Send, Pause,
} from "lucide-react";
import { createBody, createFormattingForDomain, createOutline, createSummary, createTitleCandidates, type Draft } from "../lib/app-data";
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
import { buildWritingToneOptions, resolveWritingTone } from "../lib/writing-tones";
import { useAppStore } from "../providers/app-store";

const generationLabels: Record<AIWriteScope, string> = {
  title: "AI 标题生成中",
  outline: "AI 大纲生成中",
  body: "AI 正文生成中",
  full: "AI 全文生成中",
};

const transformLabels: Record<AITransformAction, string> = {
  rewrite: "AI 改写中",
  expand: "AI 扩写中",
  shorten: "AI 缩写中",
};

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
  科技: ["趋势解读", "观点文", "产品解读", "盘点文"],
  教育: ["方法文", "解读文", "指南文", "观点文"],
  旅游: ["攻略文", "体验文", "清单文", "路线文"],
  情感: ["共鸣文", "故事文", "观点文", "关系解读"],
  社会: ["热点解读", "事件观察", "观点文", "案例文"],
  汽车: ["评测文", "对比文", "解读文", "购车指南"],
  体育: ["赛事解读", "人物文", "观点文", "复盘文"],
  娱乐: ["热点解读", "人物文", "作品解读", "舆论观察"],
  财经: ["商业解读", "消费观察", "公司分析", "观点文"],
  文化: ["文化观察", "生活方式", "人物文", "观点文"],
  其他: ["综合观察", "热点杂谈", "信息解读", "清单文"],
};

const generationStageMap: Record<
  AIWriteScope | AITransformAction,
  {
    title: string;
    hint: string;
    steps: string[];
    accent: string;
  }
> = {
  title: {
    title: "标题灵感生成中",
    hint: "正在结合热点角度、账号定位和读者预期，提炼更像公众号的标题候选。",
    steps: ["分析热点切口", "提炼传播钩子", "生成标题候选"],
    accent: "from-blue-500 via-cyan-500 to-sky-500",
  },
  outline: {
    title: "摘要与结构规划中",
    hint: "正在梳理文章节奏和关键判断，让后续成文更顺、更适合公众号阅读。",
    steps: ["理解核心冲突", "规划摘要导语", "输出文章大纲"],
    accent: "from-violet-500 via-fuchsia-500 to-pink-500",
  },
  body: {
    title: "正文成稿中",
    hint: "会先校准结构和角度，再生成完整正文，通常比标题生成更耗时一些。",
    steps: ["校准选题角度", "规划正文节奏", "生成可发布初稿"],
    accent: "from-emerald-500 via-teal-500 to-cyan-500",
  },
  full: {
    title: "全文生成中",
    hint: "正在执行两段式生成：先出标题与结构，再写出完整公众号成稿。",
    steps: ["分析热点与受众", "规划标题和大纲", "生成全文初稿"],
    accent: "from-orange-500 via-amber-500 to-yellow-500",
  },
  rewrite: {
    title: "局部改写中",
    hint: "正在优化表达节奏和信息密度，尽量保留原有观点不跑偏。",
    steps: ["理解原文语义", "重组表达方式", "输出润色结果"],
    accent: "from-blue-500 via-indigo-500 to-violet-500",
  },
  expand: {
    title: "内容扩写中",
    hint: "正在补充解释、转折和行动建议，让段落更完整、更像公众号正文。",
    steps: ["理解核心观点", "补强解释层次", "输出扩写结果"],
    accent: "from-emerald-500 via-lime-500 to-green-500",
  },
  shorten: {
    title: "内容缩写中",
    hint: "正在收紧节奏、删除空话套话，保留主要判断和关键信息。",
    steps: ["识别冗余表达", "压缩句段节奏", "输出精简结果"],
    accent: "from-rose-500 via-orange-500 to-amber-500",
  },
};

export function WritingPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const handledAutogenKey = useRef<string | null>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const requestAbortControllerRef = useRef<AbortController | null>(null);
  const autosaveTimerRef = useRef<number | null>(null);
  const autosaveInitializedRef = useRef(false);

  const { drafts, topics, selectedTopic, settings, selectTopic, generateDraftFromTopic, getDraftById, updateDraft } = useAppStore();

  const topicId = searchParams.get("topicId");
  const draftId = searchParams.get("draftId");
  const autogen = searchParams.get("autogen") as "title" | "outline" | "body" | "full" | null;
  const autogenKey = topicId && autogen ? `${topicId}:${autogen}` : null;
  const latestDraft = useMemo(
    () => [...drafts].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())[0],
    [drafts],
  );

  const currentDraft = draftId ? getDraftById(draftId) : !topicId ? latestDraft : undefined;
  const activeTopic =
    topics.find((topic) => topic.id === topicId) ??
    topics.find((topic) => topic.id === currentDraft?.topicId) ??
    selectedTopic ??
    topics[0];
  const defaultDomain = resolveArticleDomain(currentDraft?.domain ?? activeTopic?.domain ?? settings.contentAreas[0]);
  const [selectedDomain, setSelectedDomain] = useState(defaultDomain);
  const topicForWriting = useMemo(
    () => (activeTopic ? { ...activeTopic, domain: selectedDomain } : undefined),
    [activeTopic, selectedDomain],
  );
  const activeDomainConfig = useMemo(() => domainConfigs[selectedDomain], [selectedDomain]);

  const fallbackTitleCandidates = useMemo(
    () => {
      if (!topicForWriting) return [];
      return createTitleCandidates(topicForWriting, settings);
    },
    [settings, topicForWriting],
  );
  const fallbackOutline = useMemo(() => (topicForWriting ? createOutline(topicForWriting) : []), [topicForWriting]);
  const fallbackSummary = useMemo(() => (topicForWriting ? createSummary(topicForWriting, settings) : ""), [settings, topicForWriting]);
  const fallbackBody = useMemo(() => (topicForWriting ? createBody(topicForWriting, settings) : ""), [settings, topicForWriting]);
  const toneOptions = useMemo(() => buildWritingToneOptions(settings.toneKeywords).slice(0, 6), [settings.toneKeywords]);
  const defaultTone = useMemo(
    () => toneOptions.find((tone) => resolveWritingTone(tone).id === "friendly") ?? toneOptions[0] ?? "朋友式表达",
    [toneOptions],
  );

  const [selectedTitle, setSelectedTitle] = useState(currentDraft?.title ?? fallbackTitleCandidates[0] ?? "");
  const [summary, setSummary] = useState(currentDraft?.summary ?? fallbackSummary);
  const [outline, setOutline] = useState<string[]>(currentDraft?.outline ?? fallbackOutline);
  const [body, setBody] = useState(currentDraft?.body ?? fallbackBody);
  const [saveNotice, setSaveNotice] = useState("");
  const [articleType, setArticleType] = useState("观点文");
  const [targetReader, setTargetReader] = useState(settings.readerJobTraits);
  const [selectedTone, setSelectedTone] = useState(defaultTone);
  const [generationError, setGenerationError] = useState("");
  const [pendingAction, setPendingAction] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [aiStatus, setAiStatus] = useState("");
  const [activeGenerationTask, setActiveGenerationTask] = useState<AIWriteScope | AITransformAction | null>(null);
  const [generationStartedAt, setGenerationStartedAt] = useState<number | null>(null);
  const [generationNow, setGenerationNow] = useState(Date.now());
  const activeTonePreset = useMemo(() => resolveWritingTone(selectedTone), [selectedTone]);
  const activeDomainTheme = useMemo(() => domainUiThemes[selectedDomain], [selectedDomain]);
  const articleTypeOptions = useMemo(() => domainArticleTypeOptions[selectedDomain], [selectedDomain]);

  const titleCandidates = currentDraft?.titleCandidates ?? fallbackTitleCandidates;

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
    setSelectedTitle(currentDraft?.title ?? fallbackTitleCandidates[0] ?? "");
    setSummary(currentDraft?.summary ?? fallbackSummary);
    setOutline(currentDraft?.outline ?? fallbackOutline);
    setBody(currentDraft?.body ?? fallbackBody);
    setSelectedDomain(defaultDomain);
  }, [currentDraft, defaultDomain, fallbackBody, fallbackOutline, fallbackSummary, fallbackTitleCandidates]);

  useEffect(() => {
    setTargetReader(settings.readerJobTraits);
    setSelectedTone(defaultTone);
  }, [defaultTone, settings.readerJobTraits]);

  useEffect(() => {
    if (!articleTypeOptions.includes(articleType)) {
      setArticleType(articleTypeOptions[0]);
    }
  }, [articleType, articleTypeOptions]);

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
    if (!isGenerating) return;

    setGenerationNow(Date.now());
    const timer = window.setInterval(() => {
      setGenerationNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isGenerating]);

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
      }
    };
  }, []);

  const activeGenerationMeta = activeGenerationTask ? generationStageMap[activeGenerationTask] : null;
  const generationElapsedSeconds =
    isGenerating && generationStartedAt ? Math.max(1, Math.floor((generationNow - generationStartedAt) / 1000)) : 0;
  const activeStageIndex = activeGenerationMeta
    ? Math.min(activeGenerationMeta.steps.length - 1, Math.floor(generationElapsedSeconds / 5))
    : 0;
  const isBodyGenerationTask =
    activeGenerationTask === "body" ||
    activeGenerationTask === "full" ||
    activeGenerationTask === "rewrite" ||
    activeGenerationTask === "expand" ||
    activeGenerationTask === "shorten";

  function buildDraftSnapshot(draft: Draft): DraftWritingSnapshot {
    const useLocalState = currentDraft?.id === draft.id;

    return {
      id: draft.id,
      domain: useLocalState ? selectedDomain : draft.domain,
      title: useLocalState ? selectedTitle : draft.title,
      titleCandidates: useLocalState ? titleCandidates : draft.titleCandidates,
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
    if (!activeTopic) return null;
    if (currentDraft) return currentDraft;

    const placeholderScope = scope === "title" ? "title" : "outline";
    const generatedDraft = generateDraftFromTopic(activeTopic.id, placeholderScope);

    startTransition(() => {
      router.replace(`/writing?draftId=${generatedDraft.id}`);
    });

    return generatedDraft;
  }

  function syncAiResult(targetDraft: Draft, result: AIWriteResult) {
    const nextStatus = targetDraft.status === "已发布" ? "已发布" : result.body.trim() ? "待修改" : "待生成";

    setSelectedTitle(result.title);
    setSummary(result.summary);
    setOutline(result.outline);
    setBody(result.body);

    updateDraft(targetDraft.id, {
      domain: selectedDomain,
      title: result.title,
      titleCandidates: result.titleCandidates,
      selectedAngle: result.selectedAngle,
      summary: result.summary,
      outline: result.outline,
      body: result.body,
      status: nextStatus,
    });
  }

  function buildGenerationSuccessNotice(
    scope: AIWriteScope,
    label: string,
    bodyChangedByImageInsert: boolean,
  ) {
    if (scope === "full") {
      return bodyChangedByImageInsert ? "AI 已生成全文并自动插入配图" : "AI 已生成公众号完整草稿";
    }

    return bodyChangedByImageInsert ? `${label}完成，已自动插入配图` : `${label}完成`;
  }

  async function maybeAutoInsertImage(targetDraft: Draft, result: AIWriteResult, scope: AIWriteScope) {
    if ((scope !== "body" && scope !== "full") || !result.body.trim()) {
      return result;
    }

    const imageLimit = getAutoImageInsertLimit(selectedDomain);
    const existingImageCount = countArticleImages(result.body);
    const remainingImageCount = Math.max(0, imageLimit - existingImageCount);
    if (remainingImageCount <= 0) {
      return result;
    }

    const query = buildAutoImageSearchQuery({
      title: result.title,
      summary: result.summary,
      body: result.body,
      domain: selectedDomain,
    });
    const prompt = buildAutoImagePrompt({
      title: result.title,
      summary: result.summary,
      body: result.body,
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

    try {
      const searchResponse = await fetch("/api/images/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: result.title,
          summary: result.summary,
          body: result.body,
          domain: selectedDomain,
          query,
        }),
      });
      const searchPayload = await searchResponse.json().catch(() => null);
      const searchResults = Array.isArray(searchPayload?.results)
        ? (searchPayload.results as Array<{ url?: string }>)
        : [];
      const realImages = searchResults
        .map((item) => item.url)
        .filter((url): url is string => Boolean(url?.trim()))
        .slice(0, remainingImageCount)
        .map((url, index) => ({
          url,
          caption: index === 0 ? caption : `${caption}-${index + 1}`,
        }));

      if (searchResponse.ok && realImages.length) {
        const nextBody = insertAutoImagesIntoBody(result.body, realImages, imageLimit);
        if (nextBody === result.body) {
          return result;
        }

        const nextResult = {
          ...result,
          body: nextBody,
        };

        setBody(nextBody);
        updateDraft(targetDraft.id, {
          domain: selectedDomain,
          title: result.title,
          titleCandidates: result.titleCandidates,
          selectedAngle: result.selectedAngle,
          summary: result.summary,
          outline: result.outline,
          body: nextBody,
          status: targetDraft.status === "已发布" ? "已发布" : "待修改",
        });

        return nextResult;
      }
    } catch {
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
        return result;
      }

      const nextBody =
        remainingImageCount > 1
          ? insertAutoImagesIntoBody(result.body, [{ url: payload.url as string, caption }], imageLimit)
          : insertAutoImageIntoBody(result.body, payload.url as string, caption);
      if (nextBody === result.body) {
        return result;
      }

      const nextResult = {
        ...result,
        body: nextBody,
      };

      setBody(nextBody);
      updateDraft(targetDraft.id, {
        domain: selectedDomain,
        title: result.title,
        titleCandidates: result.titleCandidates,
        selectedAngle: result.selectedAngle,
        summary: result.summary,
        outline: result.outline,
        body: nextBody,
        status: targetDraft.status === "已发布" ? "已发布" : "待修改",
      });

      return nextResult;
    } catch {
      return result;
    }
  }

  function resetGenerationState() {
    requestAbortControllerRef.current = null;
    setIsGenerating(false);
    setPendingAction("");
    setActiveGenerationTask(null);
    setGenerationStartedAt(null);
  }

  function handlePauseGeneration() {
    if (!requestAbortControllerRef.current) return;
    requestAbortControllerRef.current.abort();
    requestAbortControllerRef.current = null;
    setIsPaused(true);
    setGenerationError("");
    setSaveNotice("已暂停本次生成");
    window.setTimeout(() => setSaveNotice(""), 2000);
  }

  function isSameAsCurrentDraft() {
    if (!currentDraft) return false;

    return (
      currentDraft.domain === selectedDomain &&
      currentDraft.title === selectedTitle &&
      currentDraft.summary === summary &&
      currentDraft.body === body &&
      JSON.stringify(currentDraft.outline) === JSON.stringify(outline)
    );
  }

  async function handleGenerate(scope: AIWriteScope) {
    if (!topicForWriting || isGenerating) return;

    const targetDraft = ensureDraft(scope);
    if (!targetDraft) return;
    const label = generationLabels[scope];

    setIsGenerating(true);
    setPendingAction(label);
    setGenerationError("");
    setIsPaused(false);
    setActiveGenerationTask(scope);
    setGenerationStartedAt(Date.now());
    const controller = new AbortController();
    requestAbortControllerRef.current = controller;

    try {
      const response = await fetch("/api/ai/write", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          mode: "generate",
          scope,
          topic: topicForWriting,
          settings,
          domain: selectedDomain,
          articleType,
          targetReader,
          tone: selectedTone,
          draft: buildDraftSnapshot(targetDraft),
        }),
      });

      const payload = (await response.json()) as AIWriteResponse;
      if (!response.ok || !payload.result) {
        throw new Error(payload.message || "AI 写作暂时不可用");
      }
      const generatedResult = payload.result;

      setAiStatus(`${payload.provider} · ${payload.model}`);
      syncAiResult(targetDraft, generatedResult);
      const baseNotice = buildGenerationSuccessNotice(scope, label, false);
      setSaveNotice(baseNotice);
      window.setTimeout(() => setSaveNotice(""), 2400);
      resetGenerationState();

      void maybeAutoInsertImage(targetDraft, generatedResult, scope)
        .then((finalResult) => {
          if (finalResult.body === generatedResult.body) return;
          setSaveNotice(buildGenerationSuccessNotice(scope, label, true));
          window.setTimeout(() => setSaveNotice(""), 2400);
        })
        .catch(() => {
          // Ignore background image insertion failures to keep generation responsive.
        });

      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setGenerationError(error instanceof Error ? error.message : "AI 写作失败，请稍后重试");
    } finally {
      if (requestAbortControllerRef.current) {
        resetGenerationState();
      }
    }
  }

  async function handleTransform(mode: AITransformAction) {
    if (!topicForWriting || !body.trim() || isGenerating) return;

    const targetDraft = ensureDraft("body");
    if (!targetDraft) return;

    const textarea = bodyTextareaRef.current;
    const selectionStart = textarea?.selectionStart ?? 0;
    const selectionEnd = textarea?.selectionEnd ?? 0;
    const selectedText = selectionEnd > selectionStart ? body.slice(selectionStart, selectionEnd).trim() : "";

    setIsGenerating(true);
    setPendingAction(transformLabels[mode]);
    setGenerationError("");
    setIsPaused(false);
    setActiveGenerationTask(mode);
    setGenerationStartedAt(Date.now());
    const controller = new AbortController();
    requestAbortControllerRef.current = controller;

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
          targetReader,
          tone: selectedTone,
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
        ? `${body.slice(0, selectionStart)}${payload.transformedText}${body.slice(selectionEnd)}`
        : payload.transformedText;

      setAiStatus(`${payload.provider} · ${payload.model}`);
      setBody(nextBody);
      updateDraft(targetDraft.id, {
        domain: selectedDomain,
        title: selectedTitle,
        summary,
        outline,
        body: nextBody,
        formatting: targetDraft.domain === selectedDomain ? targetDraft.formatting : createFormattingForDomain(selectedDomain, settings.defaultTemplate),
        status: targetDraft.status === "已发布" ? "已发布" : "待修改",
      });
      setSaveNotice(`${transformLabels[mode]}完成`);
      window.setTimeout(() => setSaveNotice(""), 2000);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setGenerationError(error instanceof Error ? error.message : "AI 改写失败，请稍后重试");
    } finally {
      resetGenerationState();
    }
  }

  const handleSaveDraft = () => {
    const targetDraft = currentDraft ?? ensureDraft("body");
    if (!targetDraft) return;

    updateDraft(targetDraft.id, {
      domain: selectedDomain,
      title: selectedTitle,
      summary,
      outline,
      body,
      formatting: targetDraft.domain === selectedDomain ? targetDraft.formatting : createFormattingForDomain(selectedDomain, settings.defaultTemplate),
      status: targetDraft.status === "已发布" ? "已发布" : "待修改",
    });

    if (!currentDraft) {
      startTransition(() => {
        router.replace(`/writing?draftId=${targetDraft.id}`);
      });
    }

    setSaveNotice("已保存到草稿箱");
    window.setTimeout(() => setSaveNotice(""), 2000);
  };

  const handleOpenFormatEditor = () => {
    const targetDraft = currentDraft ?? ensureDraft("body");
    if (!targetDraft) return;

    updateDraft(targetDraft.id, {
      domain: selectedDomain,
      title: selectedTitle,
      summary,
      outline,
      body,
      formatting: targetDraft.domain === selectedDomain ? targetDraft.formatting : createFormattingForDomain(selectedDomain, settings.defaultTemplate),
      status: targetDraft.status,
    });

    router.push(`/format-editor?draftId=${targetDraft.id}`);
  };

  const handleSubmitReview = () => {
    const targetDraft = currentDraft ?? ensureDraft("body");
    if (!targetDraft) return;

    updateDraft(targetDraft.id, {
      domain: selectedDomain,
      title: selectedTitle,
      summary,
      outline,
      body,
      formatting: targetDraft.domain === selectedDomain ? targetDraft.formatting : createFormattingForDomain(selectedDomain, settings.defaultTemplate),
      status: "审核中",
    });

    setSaveNotice("已提交审核");
    window.setTimeout(() => setSaveNotice(""), 2000);
    router.push(`/review-center?draftId=${targetDraft.id}`);
  };

  const workflowStatus = currentDraft?.status ?? "待生成";
  const workflowHint =
    workflowStatus === "已发布"
      ? "这篇文章已经发布，如需复用可继续微调后重新排版。"
      : workflowStatus === "审核中"
        ? "当前草稿已经进入审核阶段，下一步建议直接去排版页完成发布。"
        : "建议先一键成文或补全正文，再提交审核进入发布流程。";

  const applyToolbarAction = (mode: "bold" | "italic" | "underline" | "heading" | "list" | "quote") => {
    const textarea = bodyTextareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = body.slice(start, end);
    const fallbackText = selectedText || "请替换这段文字";
    let nextText = "";
    let nextCursorOffset = 0;

    if (mode === "bold") {
      nextText = `【重点】${fallbackText}`;
      nextCursorOffset = nextText.length;
    }

    if (mode === "italic") {
      nextText = `「${fallbackText}」`;
      nextCursorOffset = nextText.length;
    }

    if (mode === "underline") {
      nextText = `__${fallbackText}__`;
      nextCursorOffset = nextText.length;
    }

    if (mode === "heading") {
      nextText = `## ${fallbackText}`;
      nextCursorOffset = nextText.length;
    }

    if (mode === "list") {
      nextText = fallbackText
        .split("\n")
        .map((line) => `- ${line.replace(/^- /, "")}`)
        .join("\n");
      nextCursorOffset = nextText.length;
    }

    if (mode === "quote") {
      nextText = fallbackText
        .split("\n")
        .map((line) => `> ${line.replace(/^> /, "")}`)
        .join("\n");
      nextCursorOffset = nextText.length;
    }

    const updatedBody = `${body.slice(0, start)}${nextText}${body.slice(end)}`;
    setBody(updatedBody);
    setSaveNotice("已插入正文格式");
    window.setTimeout(() => setSaveNotice(""), 1500);

    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + nextCursorOffset;
      textarea.setSelectionRange(cursor, cursor);
    });
  };

  useEffect(() => {
    if (!activeTopic || isGenerating) return;

    if (!autosaveInitializedRef.current) {
      autosaveInitializedRef.current = true;
      return;
    }

    const hasMeaningfulContent = Boolean(
      selectedTitle.trim() ||
      summary.trim() ||
      body.trim() ||
      outline.some((item) => item.trim()),
    );

    if (!hasMeaningfulContent || isSameAsCurrentDraft()) return;

    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = window.setTimeout(() => {
      const targetDraft = currentDraft ?? ensureDraft(body.trim() ? "body" : "outline");
      if (!targetDraft) return;

      updateDraft(targetDraft.id, {
        domain: selectedDomain,
        title: selectedTitle,
        summary,
        outline,
        body,
        formatting:
          targetDraft.domain === selectedDomain
            ? targetDraft.formatting
            : createFormattingForDomain(selectedDomain, settings.defaultTemplate),
        status: targetDraft.status === "已发布" ? "已发布" : "待修改",
      });

      if (!currentDraft) {
        startTransition(() => {
          router.replace(`/writing?draftId=${targetDraft.id}`);
        });
      }

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
    currentDraft,
    isGenerating,
    outline,
    router,
    selectedDomain,
    selectedTitle,
    settings.defaultTemplate,
    summary,
    updateDraft,
  ]);

  if (!activeTopic) {
    return <div className="p-8 text-sm text-gray-500">请先从选题中心选择一个选题。</div>;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="h-12 min-h-[48px] bg-white border-b border-gray-200 flex items-center px-4 gap-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => void handleGenerate("full")}
            disabled={isGenerating}
            className="flex items-center gap-1.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white px-3.5 py-1.5 rounded-lg text-[12px] hover:from-orange-600 hover:to-amber-600 disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ fontWeight: 600 }}
          >
            <Sparkles className="w-3.5 h-3.5" /> 一键生成全文
          </button>
          <button
            onClick={() => void handleGenerate("title")}
            disabled={isGenerating}
            className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-[12px] hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed"
            style={{ fontWeight: 500 }}
          >
            <Type className="w-3.5 h-3.5" /> 生成标题
          </button>
          <button
            onClick={() => void handleGenerate("outline")}
            disabled={isGenerating}
            className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-[12px] hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed"
            style={{ fontWeight: 500 }}
          >
            <ListTree className="w-3.5 h-3.5" /> 生成大纲
          </button>
          <button
            onClick={() => void handleGenerate("body")}
            disabled={isGenerating}
            className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-[12px] hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed"
            style={{ fontWeight: 500 }}
          >
            <FileText className="w-3.5 h-3.5" /> 生成正文
          </button>
        </div>
        <div className="w-px h-6 bg-gray-200 mx-1" />
        <div className="flex items-center gap-1">
          <button
            onClick={() => void handleTransform("rewrite")}
            disabled={isGenerating || !body.trim()}
            className="flex items-center gap-1 border border-gray-200 px-2.5 py-1.5 rounded-lg text-[12px] text-gray-600 hover:bg-gray-50 disabled:text-gray-300 disabled:cursor-not-allowed"
            style={{ fontWeight: 500 }}
          >
            <RefreshCw className="w-3.5 h-3.5" /> 局部改写
          </button>
          <button
            onClick={() => void handleTransform("expand")}
            disabled={isGenerating || !body.trim()}
            className="flex items-center gap-1 border border-gray-200 px-2.5 py-1.5 rounded-lg text-[12px] text-gray-600 hover:bg-gray-50 disabled:text-gray-300 disabled:cursor-not-allowed"
            style={{ fontWeight: 500 }}
          >
            <Maximize2 className="w-3.5 h-3.5" /> 扩写
          </button>
          <button
            onClick={() => void handleTransform("shorten")}
            disabled={isGenerating || !body.trim()}
            className="flex items-center gap-1 border border-gray-200 px-2.5 py-1.5 rounded-lg text-[12px] text-gray-600 hover:bg-gray-50 disabled:text-gray-300 disabled:cursor-not-allowed"
            style={{ fontWeight: 500 }}
          >
            <Minimize2 className="w-3.5 h-3.5" /> 缩写
          </button>
        </div>
        <div className="flex-1" />
        {pendingAction ? <span className="text-[12px] text-blue-600">{pendingAction}</span> : null}
        {!pendingAction && saveNotice ? <span className="text-[12px] text-green-600">{saveNotice}</span> : null}
        {isGenerating ? (
          <button
            onClick={handlePauseGeneration}
            className="flex items-center gap-1.5 border border-orange-200 bg-orange-50 px-3.5 py-1.5 rounded-lg text-[12px] text-orange-600 hover:bg-orange-100"
            style={{ fontWeight: 600 }}
          >
            <Pause className="w-3.5 h-3.5" /> 暂停生成
          </button>
        ) : null}
        <button
          onClick={handleSaveDraft}
          disabled={isGenerating}
          className="flex items-center gap-1.5 border border-gray-200 px-3.5 py-1.5 rounded-lg text-[12px] text-gray-600 hover:bg-gray-50"
          style={{ fontWeight: 500 }}
        >
          <Save className="w-3.5 h-3.5" /> 保存草稿
        </button>
        <button
          onClick={handleOpenFormatEditor}
          disabled={isGenerating}
          className="flex items-center gap-1.5 bg-green-600 text-white px-3.5 py-1.5 rounded-lg text-[12px] hover:bg-green-700"
          style={{ fontWeight: 500 }}
        >
          <Palette className="w-3.5 h-3.5" /> 自动排版
        </button>
        <button
          onClick={handleSubmitReview}
          disabled={isGenerating}
          className="flex items-center gap-1.5 bg-purple-600 text-white px-3.5 py-1.5 rounded-lg text-[12px] hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-purple-300"
          style={{ fontWeight: 500 }}
        >
          <Send className="w-3.5 h-3.5" /> 提交审核
        </button>
      </div>

      {generationError ? (
        <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-[12px] text-red-600">
          {generationError}
        </div>
      ) : null}

      {isGenerating && activeGenerationMeta ? (
        <div className="border-b border-amber-100 bg-gradient-to-r from-amber-50 via-white to-orange-50 px-4 py-4">
          <div className="rounded-2xl border border-amber-100/80 bg-white/90 px-4 py-4 shadow-sm backdrop-blur">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-[260px] flex-1">
                <div className="flex items-center gap-2 text-[13px] text-gray-900" style={{ fontWeight: 600 }}>
                  <div className={`flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br ${activeGenerationMeta.accent} text-white shadow-sm`}>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  </div>
                  <div>
                    <p>{pendingAction || activeGenerationMeta.title}</p>
                    <p className="mt-0.5 text-[11px] text-gray-500" style={{ fontWeight: 400 }}>
                      已运行 {generationElapsedSeconds} 秒
                      {activeGenerationTask === "body" || activeGenerationTask === "full" ? " · 长文生成通常会稍慢一些" : ""}
                    </p>
                  </div>
                </div>
                <p className="mt-3 max-w-3xl text-[12px] leading-6 text-gray-600">
                  {activeGenerationMeta.hint}
                </p>
              </div>
              <div className="min-w-[200px] rounded-2xl border border-gray-100 bg-gray-50/80 px-3 py-3">
                <div className="flex items-center justify-between text-[11px] text-gray-500">
                  <span>执行阶段</span>
                  <span>{activeStageIndex + 1}/{activeGenerationMeta.steps.length}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${activeGenerationMeta.accent} transition-all duration-500`}
                    style={{ width: `${((activeStageIndex + 1) / activeGenerationMeta.steps.length) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-3">
              {activeGenerationMeta.steps.map((step, index) => {
                const isDone = index < activeStageIndex;
                const isCurrent = index === activeStageIndex;

                return (
                  <div
                    key={step}
                    className={`rounded-2xl border px-3 py-3 transition-colors ${
                      isCurrent
                        ? "border-amber-200 bg-amber-50"
                        : isDone
                          ? "border-emerald-200 bg-emerald-50"
                          : "border-gray-100 bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {isDone ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <div className={`flex h-4 w-4 items-center justify-center rounded-full border text-[10px] ${
                          isCurrent ? "border-amber-400 text-amber-600" : "border-gray-300 text-gray-400"
                        }`}>
                          {index + 1}
                        </div>
                      )}
                      <span
                        className={`text-[12px] ${
                          isCurrent ? "text-gray-900" : isDone ? "text-emerald-700" : "text-gray-500"
                        }`}
                        style={{ fontWeight: isCurrent || isDone ? 600 : 500 }}
                      >
                        {step}
                      </span>
                    </div>
                    <p className="mt-2 text-[11px] leading-5 text-gray-500">
                      {isCurrent ? "当前正在执行这一阶段，请稍等片刻。" : isDone ? "这一阶段已经完成。" : "完成前一阶段后会继续推进。"}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-1 overflow-hidden">
        <div className="w-[260px] min-w-[260px] bg-white border-r border-gray-100 overflow-y-auto p-4 space-y-5">
          <div>
            <div className="text-[13px] mb-2" style={{ fontWeight: 600 }}>写作参数</div>
            <div className="space-y-3">
              <div
                className="rounded-xl px-3 py-2"
                style={{
                  border: `1px solid ${activeDomainTheme.border}`,
                  background: `linear-gradient(135deg, ${activeDomainTheme.soft}, #ffffff)`,
                }}
              >
                <div className="text-[11px]" style={{ fontWeight: 600, color: activeDomainTheme.text }}>
                  当前领域提示：{activeDomainConfig.icon} {selectedDomain}
                </div>
                <p className="mt-1 text-[11px] leading-5 text-gray-600">{activeDomainConfig.promptHint}</p>
              </div>
              <div>
                <label className="text-[12px] text-gray-500 mb-1 block">文章类型</label>
                <div className="relative">
                  <select value={articleType} onChange={(event) => setArticleType(event.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-[13px] appearance-none cursor-pointer">
                    {articleTypeOptions.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="text-[12px] text-gray-500 mb-1 block">目标读者</label>
                <input value={targetReader} onChange={(event) => setTargetReader(event.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-blue-300" />
              </div>
              <div>
                <label className="text-[12px] text-gray-500 mb-1 block">风格语气</label>
                <div className="flex flex-wrap gap-1.5">
                  {toneOptions.map((tone) => (
                    <button
                      key={tone}
                      onClick={() => setSelectedTone(tone)}
                      className={`px-2.5 py-1 rounded-full text-[11px] border transition-colors ${
                        selectedTone === tone ? "bg-blue-50 border-blue-200 text-blue-600" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
                      }`}
                      style={{ fontWeight: 500 }}
                    >
                      {tone}
                    </button>
                  ))}
                </div>
                <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2">
                  <div className="flex items-center gap-2 text-[12px] text-blue-700" style={{ fontWeight: 600 }}>
                    <Sparkles className="h-3.5 w-3.5" />
                    当前风格：{activeTonePreset.label}
                  </div>
                  <p className="mt-1 text-[12px] leading-5 text-gray-600">{activeTonePreset.description}</p>
                </div>
              </div>
              <div className="border-t border-gray-100 pt-4">
                <div className="text-[13px] mb-2" style={{ fontWeight: 600 }}>选题信息</div>
                <div className="bg-blue-50/50 rounded-lg p-3">
                  <div className="text-[13px]" style={{ fontWeight: 500 }}>{activeTopic.title}</div>
                  <div className="text-[11px] text-gray-500 mt-1">领域：{selectedDomain} · 角度：{activeTopic.angles[0]}</div>
                  <div className="flex items-center gap-1 mt-2 flex-wrap">
                    {activeTopic.tags.map((tag) => (
                      <span key={tag} className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">{tag}</span>
                    ))}
                    <span className="text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded">热度{activeTopic.heat}</span>
                  </div>
                </div>
              </div>
              <div className="border-t border-gray-100 pt-4">
                <div className="text-[13px] mb-2" style={{ fontWeight: 600 }}>AI 写作状态</div>
                <div className="bg-amber-50/70 rounded-lg p-3 text-[12px] text-gray-600 leading-relaxed space-y-1">
                  <p>{aiStatus ? `当前模型：${aiStatus}` : "尚未发起 AI 写作请求"}</p>
                  <p>生成失败时，请到设置页检查模型配置，并使用“测试模型”确认接口可用。</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="relative flex-1 overflow-y-auto bg-[#f7f8fa]">
          {isGenerating ? (
            <div className="pointer-events-none sticky top-0 z-10 px-4 pt-4">
              <div className="mx-auto flex max-w-[720px] items-center justify-between gap-3 rounded-2xl border border-white/70 bg-white/75 px-4 py-3 shadow-sm backdrop-blur">
                <div className="flex items-center gap-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${activeGenerationMeta?.accent ?? "from-blue-500 to-cyan-500"} text-white`}>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  </div>
                  <div>
                    <p className="text-[13px] text-gray-900" style={{ fontWeight: 600 }}>
                      {pendingAction || "AI 正在处理中"}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      {activeGenerationMeta?.steps[activeStageIndex] ?? "正在生成结果"} · 请尽量不要重复点击
                    </p>
                  </div>
                </div>
                <div className="hidden text-[11px] text-gray-500 sm:block">
                  {generationElapsedSeconds}s
                </div>
              </div>
            </div>
          ) : null}
          <div className="max-w-[720px] mx-auto py-6 px-4 space-y-4">
            <div
              className={`bg-white rounded-xl border p-5 transition-opacity ${isGenerating ? "opacity-80" : "opacity-100"}`}
              style={{ borderColor: activeDomainTheme.border }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Type className="w-4 h-4" style={{ color: activeDomainTheme.primary }} />
                  <span className="text-[13px]" style={{ fontWeight: 600 }}>标题候选</span>
                </div>
                <button
                  onClick={() => void handleGenerate("title")}
                  disabled={isGenerating}
                  className="text-[11px] text-blue-600 hover:text-blue-700 disabled:cursor-not-allowed disabled:text-blue-300"
                  style={{ fontWeight: 500 }}
                >
                  AI 重新生成
                </button>
              </div>
              <div className="space-y-2">
                {titleCandidates.map((title) => (
                  <button
                    key={title}
                    onClick={() => setSelectedTitle(title)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors text-left ${
                      selectedTitle === title ? "bg-blue-50 border border-blue-200" : "bg-gray-50 border border-transparent hover:bg-gray-100"
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${selectedTitle === title ? "border-blue-600" : "border-gray-300"}`}>
                      {selectedTitle === title && <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />}
                    </div>
                    <span className="text-[13px]" style={{ fontWeight: selectedTitle === title ? 600 : 400 }}>{title}</span>
                  </button>
                ))}
              </div>
            </div>

            <div
              className={`bg-white rounded-xl border p-5 transition-opacity ${isGenerating ? "opacity-80" : "opacity-100"}`}
              style={{ borderColor: activeDomainTheme.border }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4" style={{ color: activeDomainTheme.accent }} />
                <span className="text-[13px]" style={{ fontWeight: 600 }}>摘要</span>
              </div>
              <textarea
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                className="w-full min-h-28 text-[13px] text-gray-700 leading-relaxed bg-gray-50 rounded-lg p-3 border border-gray-100 outline-none focus:border-blue-200"
              />
            </div>

            <div
              className={`bg-white rounded-xl border p-5 transition-opacity ${isGenerating ? "opacity-80" : "opacity-100"}`}
              style={{ borderColor: activeDomainTheme.border }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ListTree className="w-4 h-4" style={{ color: activeDomainTheme.accent }} />
                  <span className="text-[13px]" style={{ fontWeight: 600 }}>大纲</span>
                </div>
                <button
                  onClick={() => void handleGenerate("outline")}
                  disabled={isGenerating}
                  className="text-[11px] text-blue-600 hover:text-blue-700 disabled:cursor-not-allowed disabled:text-blue-300"
                  style={{ fontWeight: 500 }}
                >
                  AI 重新生成
                </button>
              </div>
              <div className="space-y-2">
                {outline.map((item, index) => (
                  <input
                    key={`${index}-${item}`}
                    value={item}
                    onChange={(event) =>
                      setOutline((currentOutline) =>
                        currentOutline.map((outlineItem, itemIndex) => (itemIndex === index ? event.target.value : outlineItem)),
                      )
                    }
                    className="w-full bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-[13px] text-gray-700 outline-none focus:border-blue-200"
                  />
                ))}
              </div>
            </div>

            <div
              className={`bg-white rounded-xl border p-5 transition-all ${isBodyGenerationTask ? "shadow-[0_16px_40px_rgba(15,23,42,0.06)]" : ""}`}
              style={{
                borderColor: activeDomainTheme.border,
                boxShadow: isBodyGenerationTask ? `0 16px 40px color-mix(in srgb, ${activeDomainTheme.primary} 10%, transparent)` : undefined,
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-green-500" />
                  <span className="text-[13px]" style={{ fontWeight: 600 }}>正文草稿</span>
                  {isBodyGenerationTask ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-600">
                      <LoaderCircle className="h-3 w-3 animate-spin" />
                      生成中
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-gray-400">
                  <span>{body.replace(/\s+/g, "").length} 字</span>
                  <span>·</span>
                  <span>状态：{currentDraft?.status ?? "未保存"}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 mb-3 pb-3 border-b border-gray-100">
                {[
                  { icon: Bold, mode: "bold" as const },
                  { icon: Italic, mode: "italic" as const },
                  { icon: Underline, mode: "underline" as const },
                  { icon: AlignLeft, mode: "heading" as const },
                  { icon: List, mode: "list" as const },
                  { icon: Quote, mode: "quote" as const },
                ].map(({ icon: Icon, mode }) => (
                  <button
                    key={mode}
                    onClick={() => applyToolbarAction(mode)}
                    disabled={isGenerating}
                    className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 text-gray-500 disabled:cursor-not-allowed disabled:text-gray-300"
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </button>
                ))}
                <div className="ml-auto">
                  <button
                    onClick={() => void handleGenerate("body")}
                    disabled={isGenerating}
                    className="text-[11px] text-blue-600 hover:text-blue-700 disabled:cursor-not-allowed disabled:text-blue-300"
                    style={{ fontWeight: 500 }}
                  >
                    AI 重写正文
                  </button>
                </div>
              </div>
              <div className="relative">
                {isBodyGenerationTask ? (
                  <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-[20px] bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(255,255,255,0.72)_18%,rgba(248,250,252,0.84)_100%)] backdrop-blur-[2px]">
                    <div className="absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.12),transparent_68%)]" />
                    <div className="flex h-full flex-col gap-5 p-5">
                      <div className="mx-auto w-full max-w-[560px] rounded-2xl border border-emerald-100/90 bg-white/92 px-4 py-3 shadow-[0_14px_34px_rgba(16,185,129,0.10)]">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 text-white shadow-sm">
                              <LoaderCircle className="h-4.5 w-4.5 animate-spin" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-[13px] text-gray-900" style={{ fontWeight: 700 }}>
                                  {pendingAction || activeGenerationMeta?.title || "AI 正在处理中"}
                                </span>
                                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700">
                                  第 {activeStageIndex + 1} 阶段
                                </span>
                              </div>
                              <p className="mt-1 text-[11px] leading-5 text-gray-500">
                                {activeGenerationMeta?.steps[activeStageIndex] ?? "正在组织正文内容"} · 已运行 {generationElapsedSeconds} 秒
                              </p>
                            </div>
                          </div>
                          <div className="hidden text-right sm:block">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-gray-400">Body Drafting</div>
                            <div className="mt-1 text-[12px] text-gray-600" style={{ fontWeight: 600 }}>
                              请稍候
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-emerald-50">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 transition-all duration-700"
                            style={{ width: `${((activeStageIndex + 1) / (activeGenerationMeta?.steps.length ?? 3)) * 100}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex-1 rounded-[20px] border border-white/80 bg-white/38 px-5 py-6 shadow-inner">
                        <div className="space-y-4">
                          {[0, 1, 2, 3, 4].map((item) => (
                            <div key={item} className="space-y-2.5">
                              <div
                                className={`h-4 animate-pulse rounded-full bg-gradient-to-r from-slate-200/90 via-slate-100 to-slate-200/80 ${
                                  item === 0 ? "w-[92%]" : item === 1 ? "w-[78%]" : item === 2 ? "w-[96%]" : item === 3 ? "w-[71%]" : "w-[83%]"
                                }`}
                              />
                              <div
                                className={`h-4 animate-pulse rounded-full bg-gradient-to-r from-slate-200/70 via-slate-100 to-slate-200/60 ${
                                  item % 2 === 0 ? "w-[86%]" : "w-[64%]"
                                }`}
                              />
                            </div>
                          ))}
                        </div>
                        <div className="mt-6 flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-3">
                          <div className="flex items-center gap-2 text-[11px] text-slate-500">
                            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                            生成完成后将自动回填到正文编辑器
                          </div>
                          <div className="text-[11px] text-slate-400">
                            建议暂时不要切换页面
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
                <textarea
                  ref={bodyTextareaRef}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  className={`w-full min-h-[420px] text-[14px] leading-relaxed text-gray-800 border-none outline-none resize-none transition-opacity ${
                    isBodyGenerationTask ? "opacity-30" : "opacity-100"
                  }`}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="w-[260px] min-w-[260px] bg-white border-l border-gray-100 overflow-y-auto p-4 space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Flame className="w-4 h-4 text-orange-500" />
              <span className="text-[13px]" style={{ fontWeight: 600 }}>热点摘要</span>
            </div>
            <div className="bg-orange-50/50 rounded-lg p-3 text-[12px] text-gray-600 leading-relaxed space-y-2">
              <p>{activeTopic.source}</p>
              <p>热度等级：{activeTopic.heat}，匹配度 {activeTopic.fit}%</p>
              <p>推荐理由：{activeTopic.reason}</p>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <Eye className="w-4 h-4 text-purple-500" />
              <span className="text-[13px]" style={{ fontWeight: 600 }}>写作提示</span>
            </div>
            <div className="space-y-2">
              {activeTopic.angles.map((angle) => (
                <div key={angle} className="bg-gray-50 rounded-lg p-3 text-[12px] text-gray-600 leading-relaxed">
                  {angle}
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="w-4 h-4 text-blue-500" />
              <span className="text-[13px]" style={{ fontWeight: 600 }}>账号画像</span>
            </div>
            <div className="bg-blue-50/50 rounded-lg p-3 text-[12px] text-gray-600 leading-relaxed space-y-2">
              <p>账号：{settings.accountName}</p>
              <p>定位：{settings.accountPosition}</p>
              <p>推荐语气：{settings.toneKeywords.slice(0, 3).join("、")}</p>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span className="text-[13px]" style={{ fontWeight: 600 }}>流程进度</span>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3 text-[12px] text-gray-600 space-y-3">
              <div className="flex items-center justify-between">
                <span>当前状态</span>
                <span className={`rounded-full px-2 py-0.5 ${
                  workflowStatus === "已发布"
                    ? "bg-green-50 text-green-600"
                    : workflowStatus === "审核中"
                      ? "bg-purple-50 text-purple-600"
                      : workflowStatus === "待修改"
                        ? "bg-amber-50 text-amber-600"
                        : "bg-blue-50 text-blue-600"
                }`} style={{ fontWeight: 600 }}>
                  {workflowStatus}
                </span>
              </div>
              <p className="leading-6">{workflowHint}</p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleSaveDraft}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-[12px] text-gray-700 hover:bg-gray-50"
                  style={{ fontWeight: 500 }}
                >
                  1. 保存当前草稿
                </button>
                <button
                  onClick={handleSubmitReview}
                  disabled={isGenerating}
                  className="w-full rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-left text-[12px] text-purple-700 hover:bg-purple-100 disabled:opacity-60"
                  style={{ fontWeight: 500 }}
                >
                  2. 提交审核
                </button>
                <button
                  onClick={handleOpenFormatEditor}
                  className="w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-left text-[12px] text-emerald-700 hover:bg-emerald-100"
                  style={{ fontWeight: 500 }}
                >
                  3. 去排版发布
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

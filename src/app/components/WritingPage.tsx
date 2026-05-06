"use client";

import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Type, ListTree, FileText, RefreshCw, Maximize2, Minimize2,
  Palette, ChevronDown, Flame, Eye, Quote, Sparkles,
  Bold, Italic, Underline, AlignLeft, List, Save,
  LoaderCircle, Pause,
} from "lucide-react";
import { createBody, createFormattingForDomain, createOutline, createSummary, type Draft } from "../lib/app-data";
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
import { buildWritingToneOptions, recommendToneForArticleType, resolveWritingTone } from "../lib/writing-tones";
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
  const toneAutoManagedRef = useRef(true);

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

  const fallbackOutline = useMemo(() => (topicForWriting ? createOutline(topicForWriting) : []), [topicForWriting]);
  const fallbackSummary = useMemo(() => (topicForWriting ? createSummary(topicForWriting, settings) : ""), [settings, topicForWriting]);
  const fallbackBody = useMemo(() => (topicForWriting ? createBody(topicForWriting, settings) : ""), [settings, topicForWriting]);
  const toneOptions = useMemo(() => buildWritingToneOptions(settings.toneKeywords).slice(0, 6), [settings.toneKeywords]);
  const [articleType, setArticleType] = useState("观点文");
  const defaultTone = useMemo(
    () => recommendToneForArticleType("观点文", toneOptions),
    [toneOptions],
  );
  const recommendedTone = useMemo(() => recommendToneForArticleType(articleType, toneOptions), [articleType, toneOptions]);

  const [selectedTitle, setSelectedTitle] = useState(currentDraft?.title ?? "");
  const [summary, setSummary] = useState(currentDraft?.summary ?? fallbackSummary);
  const [outline, setOutline] = useState<string[]>(currentDraft?.outline ?? fallbackOutline);
  const [body, setBody] = useState(currentDraft?.body ?? fallbackBody);
  const [saveNotice, setSaveNotice] = useState("");
  const [targetReader, setTargetReader] = useState(settings.readerJobTraits);
  const [targetWordCount, setTargetWordCount] = useState(1200);
  const [selectedTone, setSelectedTone] = useState(defaultTone);
  const [generationError, setGenerationError] = useState("");
  const [pendingAction, setPendingAction] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [activeGenerationTask, setActiveGenerationTask] = useState<AIWriteScope | AITransformAction | null>(null);
  const [generationStartedAt, setGenerationStartedAt] = useState<number | null>(null);
  const [generationNow, setGenerationNow] = useState(Date.now());
  const activeTonePreset = useMemo(() => resolveWritingTone(selectedTone), [selectedTone]);
  const activeDomainTheme = useMemo(() => domainUiThemes[selectedDomain], [selectedDomain]);
  const articleTypeOptions = useMemo(() => domainArticleTypeOptions[selectedDomain], [selectedDomain]);

  const titleCandidates = currentDraft?.titleCandidates ?? [];

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
    setSelectedTitle(currentDraft?.title ?? "");
    setSummary(currentDraft?.summary ?? fallbackSummary);
    setOutline(currentDraft?.outline ?? fallbackOutline);
    setBody(currentDraft?.body ?? fallbackBody);
    setSelectedDomain(defaultDomain);
  }, [currentDraft, defaultDomain, fallbackBody, fallbackOutline, fallbackSummary]);

  useEffect(() => {
    setTargetReader(settings.readerJobTraits);
    setSelectedTone(defaultTone);
    toneAutoManagedRef.current = true;
  }, [defaultTone, settings.readerJobTraits]);

  useEffect(() => {
    if (!articleTypeOptions.includes(articleType)) {
      setArticleType(articleTypeOptions[0]);
    }
  }, [articleType, articleTypeOptions]);

  useEffect(() => {
    if (!toneOptions.length) return;

    if (toneAutoManagedRef.current || !toneOptions.includes(selectedTone)) {
      setSelectedTone(recommendedTone);
      toneAutoManagedRef.current = true;
    }
  }, [recommendedTone, selectedTone, toneOptions]);

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

  const generationElapsedSeconds =
    isGenerating && generationStartedAt ? Math.max(1, Math.floor((generationNow - generationStartedAt) / 1000)) : 0;
  const isTitleGenerating =
    isGenerating &&
    (activeGenerationTask === "title" || activeGenerationTask === "outline" || activeGenerationTask === "body" || activeGenerationTask === "full");
  const hasGeneratedTitles = titleCandidates.length > 0;
  const isSummaryGenerating =
    isGenerating &&
    (activeGenerationTask === "outline" || activeGenerationTask === "body" || activeGenerationTask === "full");
  const hasGeneratedSummary = Boolean(summary.trim());
  const isOutlineGenerating =
    isGenerating &&
    (activeGenerationTask === "outline" || activeGenerationTask === "body" || activeGenerationTask === "full");
  const hasGeneratedOutline = outline.some((item) => item.trim());
  const isBodyDraftGenerating =
    isGenerating &&
    (activeGenerationTask === "body" || activeGenerationTask === "full");
  const hasGeneratedBody = Boolean(body.trim());

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

  async function requestAiGeneration(
    scope: AIWriteScope,
    targetDraft: Draft,
    signal: AbortSignal,
    draftSnapshot?: DraftWritingSnapshot,
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
        targetReader,
        targetWordCount,
        tone: selectedTone,
        draft: draftSnapshot ?? buildDraftSnapshot(targetDraft),
      }),
    });

    const payload = (await response.json()) as AIWriteResponse;
    if (!response.ok || !payload.result) {
      throw new Error(payload.message || "AI 写作暂时不可用");
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
      let payload: AIWriteResponse;
      let generatedResult: AIWriteResult;

      if (scope === "body" || scope === "full") {
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

        setPendingAction(scope === "full" ? generationLabels.full : generationLabels.body);
        payload = await requestAiGeneration(scope, targetDraft, controller.signal, plannedDraftSnapshot);
        generatedResult = payload.result as AIWriteResult;
      } else {
        payload = await requestAiGeneration(scope, targetDraft, controller.signal);
        generatedResult = payload.result as AIWriteResult;
      }

      syncAiResult(targetDraft, generatedResult);
      const baseNotice = buildGenerationSuccessNotice(scope, label, false, payload.wordCountStatus);
      setSaveNotice(baseNotice);
      window.setTimeout(() => setSaveNotice(""), 2400);
      resetGenerationState();

      void maybeAutoInsertImage(targetDraft, generatedResult, scope)
        .then((finalResult) => {
          if (finalResult.body === generatedResult.body) return;
          setSaveNotice(buildGenerationSuccessNotice(scope, label, true, payload.wordCountStatus));
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
          targetWordCount,
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
      </div>

      {generationError ? (
        <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-[12px] text-red-600">
          {generationError}
        </div>
      ) : null}

      <div className="flex flex-1 overflow-hidden">
        <div className="w-[260px] min-w-[260px] bg-white border-r border-gray-100 overflow-y-auto p-4 space-y-5">
          <div>
            <div className="text-[13px] mb-2" style={{ fontWeight: 600 }}>写作参数</div>
            <div className="space-y-3">
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
                <label className="text-[12px] text-gray-500 mb-1 block">目标字数</label>
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
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-blue-300"
                />
                <p className="mt-1 text-[11px] text-gray-400">AI 会按这个长度规划大纲和正文。</p>
              </div>
              <div>
                <label className="text-[12px] text-gray-500 mb-1 block">风格语气</label>
                <div className="flex flex-wrap gap-1.5">
                  {toneOptions.map((tone) => (
                    <button
                      key={tone}
                      onClick={() => {
                        setSelectedTone(tone);
                        toneAutoManagedRef.current = tone === recommendedTone;
                      }}
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
                  {selectedTone === recommendedTone ? (
                    <p className="mt-1 text-[11px] text-blue-500">已按当前文章类型自动匹配推荐风格。</p>
                  ) : (
                    <p className="mt-1 text-[11px] text-gray-400">当前是手动选择风格，未跟随文章类型自动切换。</p>
                  )}
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
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 text-white">
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  </div>
                  <div>
                    <p className="text-[13px] text-gray-900" style={{ fontWeight: 600 }}>
                      {pendingAction || "AI 正在处理中"}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      正在生成结果 · 请尽量不要重复点击
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
                {isTitleGenerating && !hasGeneratedTitles ? (
                  <div className="space-y-2">
                    <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-3 text-[12px] text-blue-600">
                      标题生成中，正在根据选题和结构生成候选标题…
                    </div>
                    {Array.from({ length: 4 }).map((_, index) => (
                      <div key={index} className="flex items-start gap-3 rounded-lg bg-gray-50 px-3 py-3">
                        <div className="mt-0.5 h-5 w-5 flex-shrink-0 rounded-full border-2 border-gray-200 bg-white" />
                        <div className="flex-1 space-y-2">
                          <div className="h-4 w-[88%] animate-pulse rounded bg-gray-200" />
                          <div className="h-4 w-[64%] animate-pulse rounded bg-gray-100" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : hasGeneratedTitles ? (
                  titleCandidates.map((title) => (
                    <button
                      key={title}
                      onClick={() => setSelectedTitle(title)}
                      className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors text-left ${
                        selectedTitle === title ? "bg-blue-50 border border-blue-200" : "bg-gray-50 border border-transparent hover:bg-gray-100"
                      }`}
                    >
                      <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${selectedTitle === title ? "border-blue-600" : "border-gray-300"}`}>
                        {selectedTitle === title && <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />}
                      </div>
                      <span className="flex-1 whitespace-normal break-words text-[13px] leading-6" style={{ fontWeight: selectedTitle === title ? 600 : 400 }}>{title}</span>
                    </button>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-[12px] text-gray-500">
                    还没有生成标题，点击“生成标题”或“一键生成全文”后会在这里显示 AI 标题候选。
                  </div>
                )}
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
              {isSummaryGenerating && !hasGeneratedSummary ? (
                <div className="space-y-2">
                  <div className="rounded-lg border border-violet-100 bg-violet-50 px-3 py-3 text-[12px] text-violet-600">
                    摘要生成中，正在提炼这篇文章的导语和核心判断…
                  </div>
                  <div className="rounded-lg bg-gray-50 px-3 py-3">
                    <div className="space-y-2">
                      <div className="h-4 w-[92%] animate-pulse rounded bg-gray-200" />
                      <div className="h-4 w-[84%] animate-pulse rounded bg-gray-100" />
                      <div className="h-4 w-[68%] animate-pulse rounded bg-gray-200" />
                    </div>
                  </div>
                </div>
              ) : (
                <textarea
                  value={summary}
                  onChange={(event) => setSummary(event.target.value)}
                  className="w-full min-h-28 text-[13px] text-gray-700 leading-relaxed bg-gray-50 rounded-lg p-3 border border-gray-100 outline-none focus:border-blue-200"
                />
              )}
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
                {isOutlineGenerating && !hasGeneratedOutline ? (
                  <div className="space-y-2">
                    <div className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-3 text-[12px] text-sky-600">
                      大纲生成中，正在组织文章结构和段落节奏…
                    </div>
                    {Array.from({ length: 5 }).map((_, index) => (
                      <div key={index} className="rounded-lg bg-gray-50 px-3 py-3">
                        <div className={`h-4 animate-pulse rounded bg-gray-200 ${index % 2 === 0 ? "w-[82%]" : "w-[68%]"}`} />
                      </div>
                    ))}
                  </div>
                ) : (
                  outline.map((item, index) => (
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
                  ))
                )}
              </div>
            </div>

            <div
              className="bg-white rounded-xl border p-5 transition-opacity"
              style={{
                borderColor: activeDomainTheme.border,
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-green-500" />
                  <span className="text-[13px]" style={{ fontWeight: 600 }}>正文草稿</span>
                  {isBodyDraftGenerating ? (
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
              {isBodyDraftGenerating && !hasGeneratedBody ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-3 text-[12px] text-emerald-600">
                    正文生成中，正在组织正文内容和段落细节…
                  </div>
                  <div className="rounded-lg bg-gray-50 px-4 py-4">
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
                        <div key={index} className={`h-4 animate-pulse rounded bg-gray-200 ${widthClass}`} />
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <textarea
                  ref={bodyTextareaRef}
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  className="w-full min-h-[420px] text-[14px] leading-relaxed text-gray-800 border-none outline-none resize-none transition-opacity"
                />
              )}
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
              <div className="text-[13px] text-gray-900" style={{ fontWeight: 600 }}>{activeTopic.title}</div>
              <p>{activeTopic.source}</p>
              <p>热度等级：{activeTopic.heat}，匹配度 {activeTopic.fit}%</p>
              <p>领域：{selectedDomain} · 核心角度：{activeTopic.angles[0]}</p>
              <p>推荐理由：{activeTopic.reason}</p>
              <div className="flex items-center gap-1 pt-1 flex-wrap">
                {activeTopic.tags.map((tag) => (
                  <span key={tag} className="text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded">{tag}</span>
                ))}
              </div>
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

        </div>
      </div>
    </div>
  );
}

"use client";

import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Type, Heading2, AlignLeft, Quote, Minus, Image, Sparkles, Heart,
  Save, Copy, Download, FileCode, ChevronDown, Palette, Smartphone, Monitor, RotateCcw, ArrowUp, Send, RefreshCcw,
  Upload, Link2, WandSparkles, X, LoaderCircle, MoreHorizontal, Search,
} from "lucide-react";
import {
  ctaStyles,
  createDefaultFormatting,
  formatDraftTime,
  getTemplateColors,
  getTemplateDotStyle,
  migrateDefaultFormattingToMinimal,
  templates,
  type Draft,
  type DraftStatus,
  type DraftFormatting,
} from "../lib/app-data";
import { buildAutoImageCaption, buildAutoImagePrompt, buildAutoImageSearchQuery, buildImageSnippet, shouldPreferRealImage } from "../lib/article-auto-image";
import { domainConfigs, type ArticleDomain } from "../lib/content-domains";
import {
  buildHtml,
  buildWechatArticleHtml,
  buildMarkdown,
  buildWechatText,
  collectInlineTokens,
  extractContentBlocks,
  getInlineHighlightStyle,
  getTemplatePreviewStyle,
  getWechatDomainPreviewStyle,
} from "../lib/format-render";
import { writeRichClipboard } from "../lib/rich-clipboard";
import { getUserDisplayName } from "../lib/user-display";
import { useAppStore } from "../providers/app-store";
import { useAuth } from "../providers/auth-provider";

const publishChannels = ["公众号", "知乎", "微博", "头条", "小红书"] as const;
const previewModes = ["mobile", "desktop"] as const;
const WECHAT_TITLE_LIMIT = 64;

const moduleTools = [
  { icon: Type, label: "标题" },
  { icon: Heading2, label: "小标题" },
  { icon: AlignLeft, label: "段落" },
  { icon: Quote, label: "引用块" },
  { icon: Minus, label: "分割线" },
  { icon: Image, label: "图片" },
  { icon: Sparkles, label: "金句卡片" },
  { icon: Heart, label: "CTA" },
] as const;

const draftStatusStyles: Record<DraftStatus, { chip: string; dot: string }> = {
  待生成: { chip: "bg-primary/10 text-primary", dot: "bg-primary" },
  待修改: { chip: "bg-accent text-primary", dot: "bg-primary" },
  审核中: { chip: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
  已发布: { chip: "bg-primary/10 text-primary", dot: "bg-primary" },
};

type ContentBlock =
  | { type: "heading"; content: string }
  | { type: "quote"; content: string }
  | { type: "divider" }
  | { type: "image"; content: string; src?: string; alt?: string; caption?: string; isPlaceholder?: boolean }
  | { type: "code"; content: string; language: string }
  | { type: "golden"; content: string }
  | { type: "highlight"; content: string }
  | { type: "unordered-list"; items: string[] }
  | { type: "ordered-list"; items: string[] }
  | { type: "paragraph"; content: string };

type InlineToken = {
  start: number;
  end: number;
  kind: "bold" | "quote" | "highlight";
  content: string;
};

type ImageInsertMode = "auto" | "cursor" | "end";
type ImagePanelTab = "upload" | "link" | "search" | "ai";

type WechatAccountView = {
  id: string;
  name: string;
  appIdMasked: string;
};

type RealImageSearchItem = {
  url: string;
  source: string;
  query: string;
  score?: number;
  confidence?: "high" | "medium" | "low";
  reason?: string;
  title?: string;
  pageUrl?: string;
  thumbnailUrl?: string;
};

type WechatDraftCheckItem = {
  key: string;
  label: string;
  ok: boolean;
  message: string;
};

function renderInlineNodes(text: string, options?: { autoHighlight?: boolean; highlightStyle?: CSSProperties }) {
  const tokens = collectInlineTokens(text, options?.autoHighlight);

  if (!tokens.length) {
    return [<span key={`${text}-plain`}>{text}</span>];
  }

  const nodes: JSX.Element[] = [];
  let cursor = 0;

  tokens.forEach((token, index) => {
    if (token.start > cursor) {
      nodes.push(<span key={`plain-${index}-${cursor}`}>{text.slice(cursor, token.start)}</span>);
    }

    if (token.kind === "bold") {
      nodes.push(<strong key={`bold-${index}`}>{token.content}</strong>);
    } else if (token.kind === "quote") {
      nodes.push(<span key={`quote-${index}`} style={{ color: "#2563eb" }}>{token.content}</span>);
    } else {
      nodes.push(<span key={`highlight-${index}`} style={options?.highlightStyle}>{token.content}</span>);
    }

    cursor = token.end;
  });

  if (cursor < text.length) {
    nodes.push(<span key={`plain-tail-${cursor}`}>{text.slice(cursor)}</span>);
  }

  return nodes;
}

export function FormatEditor() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { drafts, settings, getDraftById, updateDraft, publishDraft } = useAppStore();
  const latestDraft = useMemo(
    () => [...drafts].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0],
    [drafts],
  );
  const draftId = searchParams.get("draftId");
  const currentDraft = draftId ? getDraftById(draftId) ?? latestDraft : latestDraft;

  const [title, setTitle] = useState(currentDraft?.title ?? "");
  const [summary, setSummary] = useState(currentDraft?.summary ?? "");
  const [body, setBody] = useState(currentDraft?.body ?? "");
  const [formatting, setFormatting] = useState<DraftFormatting>(
    migrateDefaultFormattingToMinimal(currentDraft?.formatting ?? createDefaultFormatting(settings.defaultTemplate)),
  );
  const formattingSourceKey = currentDraft?.id ?? "empty";
  const syncedFormattingSourceRef = useRef<string | null>(null);
  const [publishChannel, setPublishChannel] = useState<(typeof publishChannels)[number]>(currentDraft?.publishedChannel ?? "公众号");
  const [notice, setNotice] = useState("");
  const [previewMode, setPreviewMode] = useState<(typeof previewModes)[number]>("mobile");
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const bodySelectionRef = useRef({ start: 0, end: 0 });
  const toolbarMoreRef = useRef<HTMLDivElement>(null);
  const toolbarMoreMenuRef = useRef<HTMLDivElement>(null);
  const toolbarActionRef = useRef<HTMLDivElement>(null);
  const toolbarActionMenuRef = useRef<HTMLDivElement>(null);
  const [isImagePanelOpen, setIsImagePanelOpen] = useState(false);
  const [activeImageTab, setActiveImageTab] = useState<ImagePanelTab>("upload");
  const [imageUrl, setImageUrl] = useState("");
  const [imageCaption, setImageCaption] = useState("");
  const [imageSearchQuery, setImageSearchQuery] = useState("");
  const [imageSearchResults, setImageSearchResults] = useState<RealImageSearchItem[]>([]);
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageInsertMode, setImageInsertMode] = useState<ImageInsertMode>("auto");
  const [imageLoading, setImageLoading] = useState<"upload" | "search" | "generate" | null>(null);
  const [wechatDraftLoading, setWechatDraftLoading] = useState(false);
  const [wechatDraftChecking, setWechatDraftChecking] = useState(false);
  const [wechatDraftCheckItems, setWechatDraftCheckItems] = useState<WechatDraftCheckItem[]>([]);
  const [wechatAccounts, setWechatAccounts] = useState<WechatAccountView[]>([]);
  const [selectedWechatAccountId, setSelectedWechatAccountId] = useState<string | null>(null);
  const [isToolbarMoreOpen, setIsToolbarMoreOpen] = useState(false);
  const [toolbarMoreMenuPosition, setToolbarMoreMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [isToolbarActionOpen, setIsToolbarActionOpen] = useState(false);
  const [toolbarActionMenuPosition, setToolbarActionMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const selectedWechatAccount = useMemo(
    () => wechatAccounts.find((account) => account.id === selectedWechatAccountId) ?? wechatAccounts[0] ?? null,
    [selectedWechatAccountId, wechatAccounts],
  );
  const previewAccountName = selectedWechatAccount?.name || getUserDisplayName(user, settings.accountName || "公众号");
  const previewAccountInitials = previewAccountName.slice(0, 2);

  useEffect(() => {
    if (draftId || !currentDraft) return;

    startTransition(() => {
      router.replace(`/format-editor?draftId=${currentDraft.id}`);
    });
  }, [currentDraft, draftId, router]);

  useEffect(() => {
    if (!currentDraft) return;
    if (syncedFormattingSourceRef.current === formattingSourceKey) return;
    syncedFormattingSourceRef.current = formattingSourceKey;

    setTitle(currentDraft.title);
    setSummary(currentDraft.summary);
    setBody(currentDraft.body);
    setFormatting(migrateDefaultFormattingToMinimal(currentDraft.formatting ?? createDefaultFormatting(settings.defaultTemplate)));
    setPublishChannel(currentDraft.publishedChannel ?? "公众号");
  }, [currentDraft, formattingSourceKey, settings.defaultTemplate]);

  useEffect(() => {
    let ignore = false;

    const loadWechatAccounts = async () => {
      try {
        const response = await fetch("/api/wechat/accounts", { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload || ignore) return;

        setWechatAccounts(Array.isArray(payload.accounts) ? payload.accounts as WechatAccountView[] : []);
        setSelectedWechatAccountId(typeof payload.selectedAccountId === "string" ? payload.selectedAccountId : null);
      } catch {
        if (!ignore) {
          setWechatAccounts([]);
          setSelectedWechatAccountId(null);
        }
      }
    };

    void loadWechatAccounts();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!isToolbarMoreOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!toolbarMoreRef.current?.contains(target) && !toolbarMoreMenuRef.current?.contains(target)) {
        setIsToolbarMoreOpen(false);
      }
    };

    const updateToolbarMoreMenuPosition = () => {
      const rect = toolbarMoreRef.current?.getBoundingClientRect();
      if (!rect) return;

      const menuWidth = 188;
      const viewportPadding = 12;
      const maxLeft = Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding);
      setToolbarMoreMenuPosition({
        top: rect.bottom + 8,
        left: Math.min(rect.left, maxLeft),
      });
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsToolbarMoreOpen(false);
      }
    };

    updateToolbarMoreMenuPosition();
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("resize", updateToolbarMoreMenuPosition);
    window.addEventListener("scroll", updateToolbarMoreMenuPosition, true);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("resize", updateToolbarMoreMenuPosition);
      window.removeEventListener("scroll", updateToolbarMoreMenuPosition, true);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isToolbarMoreOpen]);

  useEffect(() => {
    if (!isToolbarActionOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!toolbarActionRef.current?.contains(target) && !toolbarActionMenuRef.current?.contains(target)) {
        setIsToolbarActionOpen(false);
      }
    };

    const updateToolbarActionMenuPosition = () => {
      const rect = toolbarActionRef.current?.getBoundingClientRect();
      if (!rect) return;

      const menuWidth = 196;
      const viewportPadding = 12;
      const maxLeft = Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding);
      setToolbarActionMenuPosition({
        top: rect.bottom + 8,
        left: Math.min(rect.left, maxLeft),
      });
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsToolbarActionOpen(false);
      }
    };

    updateToolbarActionMenuPosition();
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("resize", updateToolbarActionMenuPosition);
    window.addEventListener("scroll", updateToolbarActionMenuPosition, true);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("resize", updateToolbarActionMenuPosition);
      window.removeEventListener("scroll", updateToolbarActionMenuPosition, true);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isToolbarActionOpen]);

  const activeScheme = getTemplateColors(formatting.template);
  const deferredBody = useDeferredValue(body);
  const previewBlocks = useMemo(() => extractContentBlocks(deferredBody), [deferredBody]);
  const articleDate = currentDraft ? formatDraftTime(currentDraft.updatedAt).split(" ")[0] : formatDraftTime(new Date().toISOString()).split(" ")[0];
  const isWechatChannel = publishChannel === "公众号";
  const articleDomain = currentDraft?.domain ?? "科技";
  const domainMeta = domainConfigs[articleDomain];
  const readingMinutes = Math.max(3, Math.ceil(body.replace(/\s+/g, "").length / 350));
  const bodyWords = body.replace(/\s+/g, "").length;
  const normalizedTitle = title.trim();
  const titleLength = normalizedTitle.length;
  const isWechatTitleTooLong = titleLength > WECHAT_TITLE_LIMIT;
  const isDarkTemplate = formatting.template === "曜石黑";
  const textPrimary = isWechatChannel ? "rgba(0,0,0,0.9)" : isDarkTemplate ? "#f9fafb" : "#111827";
  const textSecondary = isWechatChannel ? "#4a4a4a" : isDarkTemplate ? "#d1d5db" : "#4b5563";
  const textMuted = isWechatChannel ? "#8c8c8c" : isDarkTemplate ? "#94a3b8" : "#9ca3af";
  const surfaceBackground = isWechatChannel ? "#ffffff" : isDarkTemplate ? "#0f172a" : "#ffffff";
  const phoneShellBackground = isWechatChannel ? "#ffffff" : isDarkTemplate ? "#0b1120" : "#ffffff";
  const previewWidth = previewMode === "mobile" ? 390 : 760;
  const domainPreviewStyle = useMemo(
    () => getWechatDomainPreviewStyle(articleDomain, activeScheme.primary, activeScheme.accent),
    [activeScheme.accent, activeScheme.primary, articleDomain],
  );
  const highlightBackground = isWechatChannel
    ? domainPreviewStyle.highlightBackground
    : isDarkTemplate
      ? "rgba(59,130,246,0.12)"
      : `${activeScheme.primary}08`;
  const previewThemeStyle = useMemo(
    () => getTemplatePreviewStyle(formatting.template, activeScheme.primary, activeScheme.accent),
    [activeScheme.accent, activeScheme.primary, formatting.template],
  );
  const inlineHighlightStyle = useMemo(
    () => getInlineHighlightStyle(activeScheme.primary, activeScheme.accent),
    [activeScheme.accent, activeScheme.primary],
  );
  const wechatPreviewHtml = useMemo(
    () => buildWechatArticleHtml(
      {
        title,
        summary,
        updatedAt: currentDraft?.updatedAt ?? new Date().toISOString(),
        publishedAt: currentDraft?.publishedAt,
      },
      body,
      formatting,
      activeScheme.primary,
      activeScheme.accent,
      previewAccountName,
      articleDomain,
      { includeHeader: false },
    ),
    [activeScheme.accent, activeScheme.primary, articleDomain, body, currentDraft?.publishedAt, currentDraft?.updatedAt, formatting, previewAccountName, summary, title],
  );
  const headingCount = useMemo(() => previewBlocks.filter((block) => block.type === "heading").length, [previewBlocks]);
  const leadParagraphIndex = useMemo(() => previewBlocks.findIndex((block) => block.type === "paragraph"), [previewBlocks]);
  const estimatedCards = Math.max(1, previewBlocks.filter((block) => block.type === "golden" || block.type === "highlight" || block.type === "quote").length);
  const isDirty = Boolean(
    currentDraft &&
      (
        currentDraft.title !== title ||
        currentDraft.summary !== summary ||
        currentDraft.body !== body ||
        currentDraft.publishedChannel !== publishChannel ||
        JSON.stringify(currentDraft.formatting) !== JSON.stringify(formatting)
      ),
  );
  const currentDraftStatusStyle = draftStatusStyles[currentDraft?.status ?? "draft"];
  const currentDraftPreview =
    summary.trim() ||
    body
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) ||
    domainMeta.description;
  const currentDraftMetrics = [
    { label: "字数", value: bodyWords.toLocaleString(), hint: "正文" },
    { label: "阅读", value: `${readingMinutes} 分钟`, hint: "预估" },
    { label: "章节", value: String(Math.max(headingCount, body.trim() ? 1 : 0)), hint: "小标题" },
    { label: "重点", value: String(estimatedCards), hint: "高亮卡片" },
  ] as const;
  const draftSyncBadge = isDirty
    ? {
        label: "待保存",
        description: "当前内容有改动",
        className: "border-border/70 bg-accent text-primary",
      }
    : {
        label: "已同步",
        description: "草稿内容已落盘",
        className: "border-border bg-background text-muted-foreground",
      };

  const openImagePanel = () => {
    setIsImagePanelOpen(true);
    setActiveImageTab(shouldPreferRealImage(articleDomain) ? "search" : "ai");
    setImageCaption((current) => current || title || currentDraft?.title || "文章配图");
    setImageSearchResults([]);
    setImageSearchQuery((current) => current || buildAutoImageSearchQuery({
      title: title || currentDraft?.title || "",
      summary,
      body,
      domain: articleDomain,
    }));
    setImagePrompt((current) => current || `${articleDomain}主题公众号文章配图，呼应标题《${title || currentDraft?.title || "未命名文章"}》，简洁高级，适合中文内容封面插图`);
  };

  const syncBodySelection = () => {
    const textarea = bodyTextareaRef.current;
    if (!textarea) return;
    bodySelectionRef.current = {
      start: textarea.selectionStart ?? 0,
      end: textarea.selectionEnd ?? 0,
    };
  };

  const insertImageToBody = (url: string, caption: string) => {
    const snippet = buildImageSnippet(url, caption);

    setBody((currentBody) => {
      const placeholderPattern = /\[图片占位[^\]]*\]/;
      const { start, end } = bodySelectionRef.current;
      const safeStart = Math.max(0, Math.min(start, currentBody.length));
      const safeEnd = Math.max(safeStart, Math.min(end, currentBody.length));

      if (imageInsertMode === "auto" && placeholderPattern.test(currentBody)) {
        return currentBody.replace(placeholderPattern, snippet);
      }

      if (imageInsertMode !== "end") {
        const before = currentBody.slice(0, safeStart).replace(/\s*$/, "");
        const after = currentBody.slice(safeEnd).replace(/^\s*/, "");

        if (before || after) {
          return [before, snippet, after].filter(Boolean).join("\n\n");
        }
      }

      return [currentBody.replace(/\s+$/, ""), snippet].filter(Boolean).join("\n\n");
    });

    setImageUrl("");
    setImageCaption(caption);
    setNotice(
      imageInsertMode === "auto"
        ? "图片已插入正文"
        : imageInsertMode === "cursor"
          ? "图片已插入到当前光标位置"
          : "图片已追加到正文末尾",
    );
    window.setTimeout(() => setNotice(""), 2000);
  };

  const searchImages = async (query: string) => {
    setImageLoading("search");

    try {
      const response = await fetch("/api/images/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          title: title || currentDraft?.title || "",
          summary,
          body,
          domain: articleDomain,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.message ?? "联网搜图失败");
      }

      const results = Array.isArray(payload.results) ? payload.results as RealImageSearchItem[] : [];
      setImageSearchResults(results);
      return {
        url: typeof payload?.url === "string" ? payload.url : "",
        results,
      };
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "联网搜图失败");
    } finally {
      setImageLoading(null);
    }
  };

  const handleInsertImageByUrl = () => {
    if (!imageUrl.trim()) {
      setNotice("请先输入图片链接");
      window.setTimeout(() => setNotice(""), 2000);
      return;
    }

    insertImageToBody(imageUrl, imageCaption || title || "文章配图");
    setIsImagePanelOpen(false);
  };

  const handleUploadImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImageLoading("upload");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/images/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error((await response.json().catch(() => null))?.message ?? "上传失败");
      }

      const payload = await response.json();
      insertImageToBody(payload.url as string, imageCaption || file.name.replace(/\.[^.]+$/, "") || "文章配图");
      setIsImagePanelOpen(false);
    } catch {
      const reader = new FileReader();

      reader.onload = () => {
        if (typeof reader.result === "string") {
          insertImageToBody(reader.result, imageCaption || file.name.replace(/\.[^.]+$/, "") || "文章配图");
          setIsImagePanelOpen(false);
        } else {
          setNotice("图片插入失败");
          window.setTimeout(() => setNotice(""), 2000);
        }
      };

      reader.onerror = () => {
        setNotice("图片插入失败");
        window.setTimeout(() => setNotice(""), 2000);
      };

      reader.readAsDataURL(file);
    } finally {
      setImageLoading(null);
      event.target.value = "";
    }
  };

  const handleGenerateImage = async () => {
    if (!imagePrompt.trim()) {
      setNotice("请先补充图片提示词");
      window.setTimeout(() => setNotice(""), 2000);
      return;
    }

    await generateImageAndInsert(imagePrompt, imageCaption || title || "AI 配图");
  };

  const handleSearchImage = async () => {
    if (!imageSearchQuery.trim()) {
      setNotice("请先补充搜图关键词");
      window.setTimeout(() => setNotice(""), 2000);
      return;
    }

    try {
      const payload = await searchImages(imageSearchQuery);
      if (!payload.results.length) {
        throw new Error("暂时没有找到合适的真实图片");
      }
      setNotice("已找到候选图片，点选即可插入");
      window.setTimeout(() => setNotice(""), 2200);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "联网搜图失败");
      window.setTimeout(() => setNotice(""), 2600);
    }
  };

  const generateImageAndInsert = async (prompt: string, caption: string) => {
    setImageLoading("generate");

    try {
      const response = await fetch("/api/ai/image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          title: title || currentDraft?.title || "",
          summary,
          domain: articleDomain,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.url) {
        throw new Error(payload?.message ?? "AI 图片生成失败");
      }

      insertImageToBody(payload.url as string, caption);
      setIsImagePanelOpen(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "AI 图片生成失败");
      window.setTimeout(() => setNotice(""), 2600);
    } finally {
      setImageLoading(null);
    }
  };

  const handleAutoGenerateImage = async () => {
    const articleTitle = title || currentDraft?.title || "";
    const query = buildAutoImageSearchQuery({
      title: articleTitle,
      summary,
      body,
      domain: articleDomain,
    });
    const prompt = buildAutoImagePrompt({
      title: articleTitle,
      summary,
      body,
      domain: articleDomain,
    });
    const caption = imageCaption || buildAutoImageCaption({
      title: articleTitle,
      summary,
      domain: articleDomain,
    });

    setImageSearchQuery(query);
    setImagePrompt(prompt);
    setImageCaption(caption);

    if (shouldPreferRealImage(articleDomain)) {
      try {
        const payload = await searchImages(query);
        if (payload.url) {
          insertImageToBody(payload.url, caption);
          setIsImagePanelOpen(false);
          return;
        }
        return;
      } catch {
        setNotice("未找到合适实拍图，已自动回退到 AI 配图");
        window.setTimeout(() => setNotice(""), 2400);
      }
    }

    await generateImageAndInsert(prompt, caption);
  };

  const appendBlock = (label: (typeof moduleTools)[number]["label"]) => {
    if (label === "图片") {
      openImagePanel();
      return;
    }

    const snippets: Record<(typeof moduleTools)[number]["label"], string> = {
      标题: `${title}｜排版版`,
      小标题: "## 新增小节标题",
      段落: "请在这里补充一段更适合公众号排版阅读的正文内容。",
      引用块: "> 这里是一段适合高亮展示的引用或观点。",
      分割线: "---",
      图片: "[图片占位：请在公众号后台替换真实配图]",
      金句卡片: "【金句】好的内容，不是堆信息，而是帮读者快速建立判断。",
      CTA: settings.ctaEngage,
    };

    if (label === "标题") {
      setTitle(snippets[label]);
      return;
    }

    setBody((currentBody) => [currentBody, snippets[label]].filter(Boolean).join("\n\n"));
  };

  const handleSave = () => {
    if (!currentDraft) return;
    updateDraft(currentDraft.id, {
      title,
      summary,
      body,
      formatting,
      publishedChannel: publishChannel,
    });
    setNotice("排版已保存");
    window.setTimeout(() => setNotice(""), 2000);
  };

  const handleRestoreDraft = () => {
    if (!currentDraft) return;
    setIsToolbarMoreOpen(false);
    setTitle(currentDraft.title);
    setSummary(currentDraft.summary);
    setBody(currentDraft.body);
    setFormatting(migrateDefaultFormattingToMinimal(currentDraft.formatting ?? createDefaultFormatting(settings.defaultTemplate)));
    setPublishChannel(currentDraft.publishedChannel ?? "公众号");
    setNotice("已恢复到草稿原始内容");
    window.setTimeout(() => setNotice(""), 2000);
  };

  const handleScrollPreviewTop = () => {
    previewScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCopy = async () => {
    if (!currentDraft) return;
    setIsToolbarMoreOpen(false);
    const wechatHtml = buildWechatArticleHtml(
      { ...currentDraft, title, summary },
      body,
      formatting,
      activeScheme.primary,
      activeScheme.accent,
      previewAccountName,
      articleDomain,
      { includeHeader: false },
    );
    const wechatText = buildWechatText(
      { ...currentDraft, title, summary },
      body,
      settings.ctaEngage,
      { includeTitle: false, includeSummary: false, includeCta: false, ctaText: formatting.ctaText },
    );
    await writeRichClipboard(wechatHtml, wechatText);
    updateDraft(currentDraft.id, {
      title,
      summary,
      body,
      formatting,
      publishedChannel: publishChannel,
      lastExportFormat: "wechat",
      lastExportedAt: new Date().toISOString(),
    });
    setNotice("已复制公众号格式");
    window.setTimeout(() => setNotice(""), 2000);
  };

  const handleExport = (type: "html" | "md") => {
    if (!currentDraft) return;
    setIsToolbarMoreOpen(false);
    const fileName = `${title || currentDraft.title}.${type === "html" ? "html" : "md"}`;
    const content =
      type === "html"
        ? buildHtml(
            { ...currentDraft, title, summary },
            body,
            formatting,
            activeScheme.primary,
            activeScheme.accent,
            publishChannel,
            previewAccountName,
            articleDomain,
          )
        : buildMarkdown({ ...currentDraft, title, summary }, body);

    const blob = new Blob([content], { type: type === "html" ? "text/html;charset=utf-8" : "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    updateDraft(currentDraft.id, {
      title,
      summary,
      body,
      formatting,
      publishedChannel: publishChannel,
      lastExportFormat: type,
      lastExportedAt: new Date().toISOString(),
    });
    setNotice(type === "html" ? "HTML 已导出" : "Markdown 已导出");
    window.setTimeout(() => setNotice(""), 2000);
  };

  const handlePublish = () => {
    if (!currentDraft) return;
    setIsToolbarActionOpen(false);
    publishDraft(currentDraft.id, {
      title,
      summary,
      body,
      formatting,
      publishedChannel: publishChannel,
      lastExportFormat: publishChannel === "公众号" ? "wechat" : currentDraft.lastExportFormat,
    });
    setNotice("已标记为已发布");
    window.setTimeout(() => setNotice(""), 2000);
    router.push("/drafts");
  };

  const runWechatDraftCheck = async () => {
    const response = await fetch("/api/wechat/draft/check", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        summary,
        body,
        author: previewAccountName,
        domain: articleDomain,
        accountId: selectedWechatAccountId,
      }),
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok || !Array.isArray(payload?.items)) {
      throw new Error(payload?.message ?? "推送前检查失败");
    }

    const items = payload.items as WechatDraftCheckItem[];
    setWechatDraftCheckItems(items);
    return {
      ok: Boolean(payload.ok),
      items,
    };
  };

  const handleCheckWechatDraft = async () => {
    if (!currentDraft || wechatDraftChecking) return;

    setWechatDraftChecking(true);

    try {
      const result = await runWechatDraftCheck();
      if (result.ok) {
        toast.success("推送前检查通过");
      } else {
        const firstIssue = result.items.find((item) => !item.ok);
        toast.error(firstIssue?.message ?? "推送前检查未通过");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "推送前检查失败");
    } finally {
      setWechatDraftChecking(false);
    }
  };

  const handlePushToWechatDraft = async () => {
    if (!currentDraft || wechatDraftLoading) return;

    setWechatDraftLoading(true);

    try {
      const checkResult = await runWechatDraftCheck();
      if (!checkResult.ok) {
        const firstIssue = checkResult.items.find((item) => !item.ok);
        throw new Error(firstIssue?.message ?? "推送前检查未通过");
      }

      const response = await fetch("/api/wechat/draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          summary,
          body,
          formatting,
          author: previewAccountName,
          domain: articleDomain,
          accountId: selectedWechatAccountId,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message ?? "推送公众号草稿箱失败");
      }

      updateDraft(currentDraft.id, {
        title,
        summary,
        body,
        formatting,
        publishedChannel: "公众号",
        lastExportFormat: "wechat",
        lastExportedAt: new Date().toISOString(),
      });

      setPublishChannel("公众号");
      toast.success(
        `已推送到公众号草稿箱${payload?.accountName ? ` · ${payload.accountName}` : ""}${payload?.digestTruncated ? " · 摘要已自动截断" : ""}${payload?.mediaId ? ` · media_id: ${payload.mediaId}` : ""}`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "推送公众号草稿箱失败");
    } finally {
      setWechatDraftLoading(false);
    }
  };

  const handleBackToWriting = () => {
    if (!currentDraft) return;
    setIsToolbarActionOpen(false);
    router.push(`/writing?draftId=${currentDraft.id}`);
  };

  if (!currentDraft) {
    return (
      <div className="lens-card-strong mx-auto max-w-[720px] space-y-4 px-6 py-16 text-center">
        <div className="text-[22px] text-foreground" style={{ fontWeight: 850 }}>还没有可排版的草稿</div>
        <p className="text-[14px] text-muted-foreground">先去生成一篇文章草稿，再回来做多平台排版。</p>
        <div className="flex items-center justify-center gap-3">
          <Link href="/topic-center" className="lens-btn-primary px-4 py-2 text-[13px]">去选题中心</Link>
          <Link href="/drafts" className="lens-btn-secondary px-4 py-2 text-[13px]">查看草稿箱</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="overflow-x-auto overflow-y-hidden border-b border-border bg-card/90">
        <div className="flex min-w-max items-center gap-2 px-4 py-2">
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={handleSave} disabled={!isDirty} className="lens-btn-secondary flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-1.5 text-[12px] disabled:cursor-not-allowed disabled:opacity-50" style={{ fontWeight: 750 }}>
            <Save className="w-3.5 h-3.5" /> 保存排版
          </button>
          {wechatAccounts.length ? (
            <div className="relative shrink-0">
              <select
                value={selectedWechatAccountId ?? wechatAccounts[0]?.id ?? ""}
                onChange={(event) => setSelectedWechatAccountId(event.target.value || null)}
                className="w-[168px] appearance-none rounded-lg border border-border bg-card px-3 py-1.5 pr-8 text-[12px] text-muted-foreground"
              >
                {wechatAccounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            </div>
          ) : null}
          <button
            onClick={() => void handleCheckWechatDraft()}
            disabled={wechatDraftChecking || wechatDraftLoading}
            className="lens-btn-secondary flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-1.5 text-[12px] disabled:opacity-60"
            style={{ fontWeight: 500 }}
          >
            {wechatDraftChecking ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5" />}
            推送检查
          </button>
          <button
            onClick={() => void handlePushToWechatDraft()}
            disabled={wechatDraftLoading}
            className="lens-btn-primary flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-1.5 text-[12px] disabled:cursor-not-allowed disabled:bg-primary/40"
            style={{ fontWeight: 500 }}
          >
            {wechatDraftLoading ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            推送草稿箱
          </button>
        </div>
        <div className="mx-1 h-6 w-px shrink-0 bg-border" />
        <div className="flex items-center gap-1 shrink-0">
          <div className="relative shrink-0">
            <select
              value={publishChannel}
              onChange={(event) => setPublishChannel(event.target.value as (typeof publishChannels)[number])}
              className="w-[110px] appearance-none rounded-lg border border-border bg-card px-3 py-1.5 pr-8 text-[12px] text-muted-foreground"
            >
              {publishChannels.map((channel) => (
                <option key={channel} value={channel}>{channel}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          </div>
          <div ref={toolbarMoreRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setIsToolbarMoreOpen((current) => !current)}
              className="lens-btn-secondary flex shrink-0 items-center gap-1 whitespace-nowrap px-2.5 py-1.5 text-[12px]"
              style={{ fontWeight: 750 }}
            >
              <MoreHorizontal className="w-3.5 h-3.5" /> 更多
            </button>
          </div>
          <div ref={toolbarActionRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setIsToolbarActionOpen((current) => !current)}
              className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-slate-950 dark:bg-white/10 px-2.5 py-1.5 text-[12px] text-white hover:bg-black"
              style={{ fontWeight: 750 }}
            >
              发布操作 <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {notice ? <span className="shrink-0 whitespace-nowrap px-1 text-[12px] text-primary">{notice}</span> : null}
        </div>
      </div>
      {wechatDraftCheckItems.length ? (
        <div className="border-b border-border bg-accent px-4 py-2">
          <div className="flex flex-wrap gap-2">
            {wechatDraftCheckItems.map((item) => (
              <span
                key={item.key}
                className={`rounded-full px-2.5 py-1 text-[11px] ${
                  item.ok ? "bg-card text-primary" : "bg-red-50 text-red-600"
                }`}
                title={item.message}
              >
                {item.ok ? "通过" : "需处理"} · {item.label}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {isToolbarMoreOpen && toolbarMoreMenuPosition ? createPortal(
        <div
          ref={toolbarMoreMenuRef}
          className="fixed z-50 min-w-[188px] rounded-xl border border-border bg-card p-1.5 shadow-[0_18px_40px_rgba(31,41,86,0.12)]"
          style={{
            top: toolbarMoreMenuPosition.top,
            left: toolbarMoreMenuPosition.left,
          }}
        >
          <button
            type="button"
            onClick={handleRestoreDraft}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] text-muted-foreground hover:bg-accent"
          >
            <RotateCcw className="h-3.5 w-3.5" /> 恢复原稿
          </button>
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] text-muted-foreground hover:bg-accent"
          >
            <Copy className="h-3.5 w-3.5" /> 复制公众号格式
          </button>
          <button
            type="button"
            onClick={() => handleExport("html")}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] text-muted-foreground hover:bg-accent"
          >
            <FileCode className="h-3.5 w-3.5" /> 导出 HTML
          </button>
          <button
            type="button"
            onClick={() => handleExport("md")}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] text-muted-foreground hover:bg-accent"
          >
            <Download className="h-3.5 w-3.5" /> 导出 Markdown
          </button>
        </div>,
        document.body,
      ) : null}
      {isToolbarActionOpen && toolbarActionMenuPosition ? createPortal(
        <div
          ref={toolbarActionMenuRef}
          className="fixed z-50 min-w-[196px] rounded-xl border border-border bg-card p-1.5 shadow-[0_18px_40px_rgba(31,41,86,0.12)]"
          style={{
            top: toolbarActionMenuPosition.top,
            left: toolbarActionMenuPosition.left,
          }}
        >
          <button
            type="button"
            onClick={handlePublish}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] text-muted-foreground hover:bg-accent"
          >
            <Save className="h-3.5 w-3.5" /> 直接发布
          </button>
          <button
            type="button"
            onClick={handleBackToWriting}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] text-muted-foreground hover:bg-accent"
          >
            <Palette className="h-3.5 w-3.5" /> 返回编辑
          </button>
        </div>,
        document.body,
      ) : null}

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUploadImage} />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex w-[72px] min-w-[72px] flex-col items-center gap-1 border-r border-border bg-accent py-3">
          {moduleTools.map(({ icon: Icon, label }) => {
            const isImageToolActive = label === "图片" && isImagePanelOpen;

            return (
              <button
                key={label}
                onClick={() => appendBlock(label)}
                aria-pressed={isImageToolActive}
                className={`w-14 h-14 flex flex-col items-center justify-center rounded-lg transition-colors gap-1 ${
                  isImageToolActive
                    ? "bg-primary/10 text-primary shadow-[inset_0_0_0_1px_rgba(111,92,255,0.16)]"
                    : "text-muted-foreground hover:bg-card hover:text-primary"
                }`}
              >
                <Icon className="w-4.5 h-4.5" />
                <span className="text-[10px]" style={{ fontWeight: 500 }}>{label}</span>
              </button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden bg-background px-4 py-5">
          <div className="mx-auto flex h-full max-w-[980px] min-h-0 flex-col">
            <div className="mb-4 flex items-center justify-between rounded-2xl border border-border bg-card/80 px-4 py-3 backdrop-blur">
              <div>
                <div className="text-[14px] text-foreground" style={{ fontWeight: 800 }}>排版预览</div>
                <div className="text-[12px] text-muted-foreground">独立滚动预览，支持移动端与桌面宽度切换</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewMode("mobile")}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] transition-colors ${
                    previewMode === "mobile" ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-accent"
                  }`}
                  style={{ fontWeight: 750 }}
                >
                  <Smartphone className="h-3.5 w-3.5" /> 手机
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode("desktop")}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] transition-colors ${
                    previewMode === "desktop" ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-accent"
                  }`}
                  style={{ fontWeight: 750 }}
                >
                  <Monitor className="h-3.5 w-3.5" /> 桌面
                </button>
                <button
                  type="button"
                  onClick={handleScrollPreviewTop}
                  className="lens-btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-[12px]"
                  style={{ fontWeight: 750 }}
                >
                  <ArrowUp className="h-3.5 w-3.5" /> 回到顶部
                </button>
              </div>
            </div>

            <div
              className={`flex-1 min-h-0 overflow-hidden rounded-[28px] border p-5 ${
                isWechatChannel
                  ? "border-border bg-card shadow-[0_18px_60px_rgba(31,41,86,0.06)]"
                  : "border-border/70 bg-[var(--surface-strong)] shadow-[0_20px_80px_rgba(31,41,86,0.08)]"
              }`}
            >
              <div className="flex h-full min-h-0 justify-center overflow-hidden">
                <div
                  className="h-full min-h-0 rounded-[28px] border shadow-lg overflow-hidden"
                  style={{
                    width: previewWidth,
                    background: phoneShellBackground,
                    color: textPrimary,
                    borderColor: previewThemeStyle.deviceBorder,
                    boxShadow: isDarkTemplate
                      ? "0 24px 64px rgba(2,6,23,0.44)"
                      : "0 24px 64px rgba(15,23,42,0.12)",
                  }}
                >
                  <div className="flex h-full min-h-0 flex-col">
                    <div
                      className="px-4 py-3 flex items-center gap-2 border-b"
                      style={{
                        background: previewThemeStyle.deviceHeaderBackground,
                        borderColor: previewThemeStyle.deviceHeaderBorder,
                      }}
                    >
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-[10px]"
                        style={{
                          fontWeight: 500,
                          background: isWechatChannel ? "#111827" : activeScheme.primary,
                          color: "#ffffff",
                        }}
                      >
                        {previewAccountInitials}
                      </div>
                      <div>
                        <div
                          className={isWechatChannel ? "text-[13px]" : "text-[12px]"}
                          style={{ fontWeight: isWechatChannel ? 400 : 500, color: textPrimary }}
                        >
                          {previewAccountName}
                        </div>
                        <div className="text-[10px]" style={{ color: textMuted }}>
                          {articleDate}
                        </div>
                      </div>
                    </div>

                    <div ref={previewScrollRef} className="flex-1 min-h-0 overflow-y-auto">
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
                        {isWechatChannel ? (
                          <div className="mx-auto max-w-[640px]">
                            <header className="mb-7">
                              <h1
                                className="text-[25px] leading-[1.42] tracking-[-0.01em]"
                                style={{ color: textPrimary, fontWeight: 800 }}
                              >
                                {title || currentDraft?.title || "未命名文章"}
                              </h1>
                              <div className="mt-3 flex flex-wrap items-center gap-2 text-[14px] leading-5" style={{ color: textMuted }}>
                                <span style={{ color: "#576b95", fontWeight: 500 }}>{previewAccountName}</span>
                                <span>·</span>
                                <span>{articleDate}</span>
                              </div>
                            </header>
                            <div dangerouslySetInnerHTML={{ __html: wechatPreviewHtml }} />
                          </div>
                        ) : (
                          <>
                            <div
                              className="relative overflow-hidden rounded-[28px] border px-5 pb-5 pt-5"
                              style={{
                                background: `${previewThemeStyle.shellTint}, ${previewThemeStyle.shellGradient}`,
                                borderColor: previewThemeStyle.contentCardBorder,
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
                                  background: previewThemeStyle.titlePanelBackground,
                                  borderColor: previewThemeStyle.titlePanelBorder,
                                  boxShadow: previewThemeStyle.titlePanelShadow,
                                }}
                              >
                                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                  <span
                                    className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px]"
                                    style={{
                                      background: previewThemeStyle.badgeBackground,
                                      color: previewThemeStyle.badgeColor,
                                      border: previewThemeStyle.badgeBorder,
                                      fontWeight: 700,
                                    }}
                                  >
                                    <span>{formatting.template}</span>
                                    <span className="opacity-70">/</span>
                                    <span>{publishChannel}</span>
                                  </span>
                                  <span className="text-[11px]" style={{ color: textMuted }}>
                                    预计 {readingMinutes} 分钟读完
                                  </span>
                                </div>
                                <h1 className="max-w-[92%] text-[23px] leading-[1.35] tracking-[-0.02em]" style={{ fontWeight: 800, color: textPrimary }}>
                                  {title}
                                </h1>
                                <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px]" style={{ color: textMuted }}>
                                  <span>作者：{previewAccountName}</span>
                                </div>
                              </div>

                              {summary ? (
                                <div
                                  className="mt-5 rounded-[24px] border px-4 py-4"
                                  style={{
                                    background: previewThemeStyle.contentCardBackground,
                                    borderColor: previewThemeStyle.contentCardBorder,
                                    boxShadow: previewThemeStyle.titlePanelShadow,
                                  }}
                                >
                                  <div className="mb-2 flex items-center gap-2">
                                    <span
                                      className="inline-flex h-2.5 w-2.5 rounded-full"
                                      style={{ background: activeScheme.primary }}
                                    />
                                    <div className="text-[11px] uppercase tracking-[0.2em]" style={{ color: activeScheme.primary, fontWeight: 700 }}>
                                      导读
                                    </div>
                                  </div>
                                  <p className="text-[13px] leading-[1.9]" style={{ color: textSecondary }}>
                                    {summary}
                                  </p>
                                </div>
                              ) : null}
                            </div>

                            <div
                              className="mt-6 rounded-[28px] border px-5 py-5"
                              style={{
                                background: previewThemeStyle.contentCardBackground,
                                borderColor: previewThemeStyle.contentCardBorder,
                                boxShadow: previewThemeStyle.titlePanelShadow,
                              }}
                            >
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
                                        {renderInlineNodes(block.content)}
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
                                      <p className="text-[14px] leading-[1.8]" style={{ color: textSecondary }}>{renderInlineNodes(block.content)}</p>
                                    </div>
                                  );
                                }

                                if (block.type === "divider") {
                                  return (
                                    <div key={`${block.type}-${index}`} className="flex items-center gap-3 my-6">
                                      <div className="flex-1 h-px" style={{ background: isDarkTemplate ? "#334155" : "#e5e7eb" }} />
                                      <span className="text-[11px]" style={{ color: textMuted }}>✦</span>
                                      <div className="flex-1 h-px" style={{ background: isDarkTemplate ? "#334155" : "#e5e7eb" }} />
                                    </div>
                                  );
                                }

                                if (block.type === "image") {
                                  if (block.src) {
                                    return (
                                      <figure
                                        key={`${block.type}-${block.src}-${index}`}
                                        className="my-7 overflow-hidden rounded-[24px]"
                                      >
                                        <img
                                          src={block.src}
                                          alt={block.alt || block.caption || "文章配图"}
                                          className="block w-full rounded-[24px] border object-cover"
                                          style={{ borderColor: isDarkTemplate ? "#475569" : "#cbd5e1" }}
                                        />
                                        <figcaption className="px-2 pt-3 text-center text-[12px]" style={{ color: textMuted }}>
                                          {block.caption || block.alt || "文章配图"}
                                        </figcaption>
                                      </figure>
                                    );
                                  }

                                  return (
                                    <div
                                      key={`${block.type}-${block.content}-${index}`}
                                      className="my-7 overflow-hidden rounded-[24px] border"
                                      style={{ borderColor: isDarkTemplate ? "#475569" : "#cbd5e1" }}
                                    >
                                      <div
                                        className="flex h-40 items-center justify-center"
                                        style={{
                                          background: `linear-gradient(135deg, ${activeScheme.primary}12, ${activeScheme.accent}20)`,
                                        }}
                                      >
                                        <div className="rounded-full border px-4 py-2 text-[12px]" style={{ color: textSecondary, borderColor: `${activeScheme.primary}28` }}>
                                          图片视觉区
                                        </div>
                                      </div>
                                      <div className="border-t border-dashed px-4 py-3 text-center text-[12px]" style={{ color: textMuted, borderColor: isDarkTemplate ? "#475569" : "#cbd5e1" }}>
                                        {block.content}
                                      </div>
                                    </div>
                                  );
                                }

                                if (block.type === "golden") {
                                  return (
                                    <div
                                      key={`${block.type}-${block.content}-${index}`}
                                      className="rounded-xl p-5 my-6 text-center border"
                                      style={{
                                        borderColor: `${activeScheme.primary}25`,
                                        background: formatting.gradientQuote
                                          ? `linear-gradient(135deg, ${activeScheme.primary}12, ${activeScheme.accent}22)`
                                          : `${activeScheme.primary}10`,
                                        boxShadow: isDarkTemplate ? "none" : "0 18px 40px rgba(15,23,42,0.06)",
                                      }}
                                    >
                                      <div className="text-[11px] mb-2" style={{ color: activeScheme.primary, fontWeight: 500 }}>✦ 金句 ✦</div>
                                      <p className="text-[15px] leading-[1.7]" style={{ fontWeight: 600, color: textPrimary }}>
                                        {renderInlineNodes(block.content)}
                                      </p>
                                    </div>
                                  );
                                }

                                if (block.type === "highlight") {
                                  return (
                                    <div
                                      key={`${block.type}-${block.content}-${index}`}
                                      className="my-6 rounded-2xl border px-4 py-4"
                                      style={{ borderColor: `${activeScheme.primary}22`, background: highlightBackground }}
                                    >
                                      <div className="mb-2 text-[10px] uppercase tracking-[0.2em]" style={{ color: activeScheme.primary, fontWeight: 700 }}>
                                        重点
                                      </div>
                                      <p className="text-[14px] leading-[1.85]" style={{ color: textPrimary, fontWeight: 600 }}>
                                        {renderInlineNodes(block.content)}
                                      </p>
                                    </div>
                                  );
                                }

                                if (block.type === "unordered-list") {
                                  return (
                                    <ul key={`${block.type}-${index}`} className="my-5 space-y-3">
                                      {block.items.map((item, itemIndex) => (
                                        <li key={`${item}-${itemIndex}`} className="flex items-start gap-3 text-[14px] leading-[1.85]" style={{ color: textPrimary }}>
                                          <span
                                            className="mt-2 h-2.5 w-2.5 rounded-full flex-shrink-0"
                                            style={{ background: activeScheme.primary }}
                                          />
                                          <span>{renderInlineNodes(item)}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  );
                                }

                                if (block.type === "ordered-list") {
                                  return (
                                    <ol key={`${block.type}-${index}`} className="my-5 space-y-3">
                                      {block.items.map((item, itemIndex) => (
                                        <li key={`${item}-${itemIndex}`} className="flex items-start gap-3 text-[14px] leading-[1.85]" style={{ color: textPrimary }}>
                                          <span
                                            className="inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[11px] text-white"
                                            style={{ background: activeScheme.primary, fontWeight: 700 }}
                                          >
                                            {itemIndex + 1}
                                          </span>
                                          <span>{renderInlineNodes(item)}</span>
                                        </li>
                                      ))}
                                    </ol>
                                  );
                                }

                                return (
                                  <p
                                    key={`${block.type}-${block.content}-${index}`}
                                    className={index === leadParagraphIndex ? "first-letter:mr-2 first-letter:float-left first-letter:text-[34px] first-letter:leading-none first-letter:font-bold" : undefined}
                                    style={{
                                      fontSize: formatting.fontSize,
                                      lineHeight: formatting.lineHeight,
                                      marginBottom: formatting.paragraphSpacing,
                                      color: index === leadParagraphIndex ? textSecondary : textPrimary,
                                      fontWeight: index === leadParagraphIndex ? 500 : 400,
                                    }}
                                  >
                                    {renderInlineNodes(block.content)}
                                  </p>
                                );
                              })}
                            </div>

                            {currentDraft.outline.length ? (
                              <div
                                className="mt-10 rounded-[24px] border px-4 py-4 space-y-3"
                                style={{
                                  background: previewThemeStyle.sectionBackground,
                                  borderColor: previewThemeStyle.contentCardBorder,
                                }}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="text-[12px]" style={{ color: textMuted, fontWeight: 700 }}>结构提示</div>
                                  <div className="text-[11px]" style={{ color: textMuted }}>适合继续扩写的节奏线</div>
                                </div>
                                {currentDraft.outline.slice(0, 3).map((item, index) => (
                                  <div key={item} className="flex items-start gap-2">
                                    <span
                                      className="inline-flex h-6 min-w-6 items-center justify-center rounded px-1.5 text-[11px] text-white"
                                      style={{
                                        background: formatting.numberedBadge ? activeScheme.primary : "#9ca3af",
                                        fontWeight: 600,
                                      }}
                                    >
                                      {index + 1}
                                    </span>
                                    <span className="text-[13px]" style={{ color: textSecondary }}>{item}</span>
                                  </div>
                                ))}
                              </div>
                            ) : null}

                            <div
                              className="mt-10 rounded-[28px] border px-5 py-6 text-center"
                              style={{
                                background: previewThemeStyle.titlePanelBackground,
                                borderColor: previewThemeStyle.titlePanelBorder,
                                boxShadow: previewThemeStyle.titlePanelShadow,
                              }}
                            >
                              <div className="text-[11px] uppercase tracking-[0.24em]" style={{ color: activeScheme.primary, fontWeight: 700 }}>
                                互动收束
                              </div>
                              <p className="mt-3 text-[15px] leading-[1.9]" style={{ color: textSecondary }}>
                                {settings.ctaEngage}
                              </p>
                              <div className="mt-5 flex items-center justify-center gap-3 text-[12px]" style={{ color: textPrimary }}>
                                {[settings.ctaFollow, "欢迎留言交流", settings.ctaShare].map((item) => (
                                  <span
                                    key={item}
                                    className="rounded-full px-3 py-1.5"
                                    style={{
                                      background: isDarkTemplate ? "rgba(15,23,42,0.34)" : "rgba(255,255,255,0.72)",
                                      border: `1px solid ${previewThemeStyle.heroBorder}`,
                                      fontWeight: 600,
                                    }}
                                  >
                                    {item}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          className={`space-y-5 overflow-y-auto border-l border-border bg-card p-4 ${isImagePanelOpen ? "w-[360px] min-w-[360px] xl:w-[380px] xl:min-w-[380px]" : "w-[352px] min-w-[352px] xl:w-[368px] xl:min-w-[368px]"}`}
        >
          {isImagePanelOpen ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[18px] text-foreground" style={{ fontWeight: 850 }}>插入图片</div>
                  <div className="mt-1 text-[12px] leading-6 text-muted-foreground">侧栏插图不会打断中间预览区，适合边看正文边决定插入位置。</div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsImagePanelOpen(false)}
                  className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-primary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

                <div className="rounded-2xl border border-border bg-background p-3">
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { key: "upload" as const, label: "本地上传", icon: Upload, color: "text-primary" },
                    { key: "link" as const, label: "图片链接", icon: Link2, color: "text-primary" },
                    { key: "search" as const, label: "联网搜图", icon: Search, color: "text-primary" },
                    { key: "ai" as const, label: "AI 配图", icon: WandSparkles, color: "text-primary" },
                  ].map(({ key, label, icon: Icon, color }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setActiveImageTab(key)}
                      className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                        activeImageTab === key
                          ? "border-primary bg-primary/10"
                          : "border-transparent bg-card hover:bg-accent"
                      }`}
                    >
                      <Icon className={`mb-2 h-4 w-4 ${color}`} />
                      <div className="text-[12px] text-foreground" style={{ fontWeight: 750 }}>{label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {activeImageTab === "upload" ? (
                <div className="rounded-2xl border border-border bg-card p-4">
                  <div className="text-[14px] text-foreground" style={{ fontWeight: 800 }}>本地上传</div>
                  <p className="mt-2 text-[12px] leading-6 text-muted-foreground">上传后会直接插入正文；若云存储未配置，会退化为本地内嵌图片。</p>
                  <button
                    type="button"
                    disabled={imageLoading === "upload"}
                    onClick={() => fileInputRef.current?.click()}
                    className="lens-btn-primary mt-4 inline-flex items-center gap-2 px-3 py-2 text-[12px]"
                    style={{ fontWeight: 800 }}
                  >
                    {imageLoading === "upload" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    选择图片并插入
                  </button>
                </div>
              ) : null}

              {activeImageTab === "link" ? (
                <div className="rounded-2xl border border-border bg-card p-4">
                  <div className="text-[14px] text-foreground" style={{ fontWeight: 800 }}>图片链接</div>
                  <div className="mt-3 space-y-3">
                    <input
                      value={imageUrl}
                      onChange={(event) => setImageUrl(event.target.value)}
                      placeholder="https://example.com/image.jpg"
                      className="w-full rounded-lg border border-border bg-card px-3 py-2 text-[12px] outline-none placeholder:text-muted-foreground focus:border-primary"
                    />
                    <button
                      type="button"
                      onClick={handleInsertImageByUrl}
                      className="lens-btn-secondary inline-flex items-center gap-2 px-3 py-2 text-[12px]"
                      style={{ fontWeight: 750 }}
                    >
                      <Link2 className="h-3.5 w-3.5" /> 插入链接图片
                    </button>
                  </div>
                </div>
              ) : null}

              {activeImageTab === "search" ? (
                <div className="rounded-2xl border border-border bg-card p-4">
                  <div className="text-[14px] text-foreground" style={{ fontWeight: 800 }}>联网搜图</div>
                  <div className="mt-2 rounded-xl border border-border/70 bg-accent p-3">
                    <div className="text-[12px] text-primary" style={{ fontWeight: 800 }}>更真实的配图</div>
                    <p className="mt-1 text-[12px] leading-6 text-muted-foreground">所有领域默认优先找真实摄影图；默认不加文字，找不到再回退 AI。</p>
                  </div>
                  <div className="mt-3 space-y-3">
                    <input
                      value={imageSearchQuery}
                      onChange={(event) => setImageSearchQuery(event.target.value)}
                      placeholder="例如：travel landscape street photography"
                      className="w-full rounded-lg border border-border bg-card px-3 py-2 text-[12px] outline-none placeholder:text-muted-foreground focus:border-primary"
                    />
                    <button
                      type="button"
                      disabled={imageLoading === "search"}
                      onClick={handleSearchImage}
                      className="lens-btn-primary inline-flex items-center gap-2 px-3 py-2 text-[12px] disabled:cursor-not-allowed disabled:bg-primary/40"
                      style={{ fontWeight: 800 }}
                    >
                      {imageLoading === "search" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                      搜索真实图片
                    </button>
                    {imageSearchResults.length ? (
                      <div className="grid grid-cols-2 gap-3 pt-1">
                        {imageSearchResults.slice(0, 4).map((item) => (
                          <button
                            key={item.url}
                            type="button"
                            onClick={() => {
                              insertImageToBody(item.url, imageCaption || title || "文章配图");
                              setIsImagePanelOpen(false);
                            }}
                            className="overflow-hidden rounded-xl border border-border bg-card text-left transition hover:border-primary/40 hover:shadow-sm"
                          >
                            <img src={item.thumbnailUrl || item.url} alt="真实图片候选" className="h-28 w-full object-cover" loading="lazy" />
                            <div className="space-y-1 px-3 py-2">
                              <div className="line-clamp-2 text-[11px] text-foreground/75">{item.title || "真实图片候选"}</div>
                              <div className="text-[11px] text-muted-foreground">点击插入</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {activeImageTab === "ai" ? (
                <div className="rounded-2xl border border-border bg-card p-4">
                  <div className="text-[14px] text-foreground" style={{ fontWeight: 800 }}>AI 配图</div>
                  <div className="mt-3 space-y-3">
                    <div className="rounded-xl border border-border/70 bg-accent p-3">
                      <div className="text-[12px] text-primary" style={{ fontWeight: 800 }}>智能配图</div>
                      <p className="mt-1 text-[12px] leading-6 text-muted-foreground">会根据文章内容自动配图；默认优先联网搜真实图，失败时再回退 AI。</p>
                      <button
                        type="button"
                        disabled={imageLoading === "generate" || imageLoading === "search"}
                        onClick={handleAutoGenerateImage}
                        className="lens-btn-primary mt-3 inline-flex items-center gap-2 px-3 py-2 text-[12px]"
                        style={{ fontWeight: 800 }}
                      >
                        {imageLoading === "generate" || imageLoading === "search" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        智能配图并插入
                      </button>
                    </div>

                    <textarea
                      value={imagePrompt}
                      onChange={(event) => setImagePrompt(event.target.value)}
                      rows={6}
                      placeholder="描述你想要的配图风格、主体和氛围"
                      className="w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-[12px] leading-6 outline-none placeholder:text-muted-foreground focus:border-primary"
                    />
                    <button
                      type="button"
                      disabled={imageLoading === "generate" || imageLoading === "search"}
                      onClick={handleGenerateImage}
                      className="lens-btn-primary inline-flex items-center gap-2 px-3 py-2 text-[12px] disabled:cursor-not-allowed disabled:bg-primary/40"
                      style={{ fontWeight: 800 }}
                    >
                      {imageLoading === "generate" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <WandSparkles className="h-3.5 w-3.5" />}
                      AI 生成并插入
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
                <div>
                  <div className="mb-2 text-[13px] text-foreground" style={{ fontWeight: 750 }}>图注</div>
                  <input
                    value={imageCaption}
                    onChange={(event) => setImageCaption(event.target.value)}
                    placeholder="图片说明 / 图注"
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-[12px] outline-none placeholder:text-muted-foreground focus:border-primary"
                  />
                </div>

                <div>
                  <div className="mb-2 text-[13px] text-foreground" style={{ fontWeight: 750 }}>插入位置</div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: "auto" as const, label: "智能插入" },
                      { value: "cursor" as const, label: "插入到光标处" },
                      { value: "end" as const, label: "追加到末尾" },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setImageInsertMode(option.value)}
                        className={`rounded-full border px-3 py-1.5 text-[12px] transition-colors ${
                          imageInsertMode === option.value
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-card text-muted-foreground hover:bg-accent"
                        }`}
                        style={{ fontWeight: 500 }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[12px] leading-6 text-muted-foreground">默认优先替换图片占位；如果没有占位，就插入到正文当前光标位置。</p>
                </div>
              </div>
            </>
          ) : (
            <>
          <div>
            <div className="text-[13px] mb-3" style={{ fontWeight: 600 }}>当前草稿</div>
            <div className="rounded-[22px] border border-border bg-card shadow-[0_10px_28px_rgba(31,41,86,0.05)]">
              <div className="space-y-4 px-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] whitespace-nowrap"
                    style={{
                      background: `linear-gradient(135deg, ${activeScheme.primary}, ${activeScheme.accent})`,
                      color: "#ffffff",
                      fontWeight: 700,
                    }}
                  >
                    <span>{domainMeta.icon}</span>
                    {articleDomain}
                  </span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] whitespace-nowrap ${currentDraftStatusStyle.chip}`} style={{ fontWeight: 600 }}>
                    <span className={`h-1.5 w-1.5 rounded-full ${currentDraftStatusStyle.dot}`} />
                    {currentDraft.status}
                  </span>
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] whitespace-nowrap ${draftSyncBadge.className}`}
                    style={{ fontWeight: 600 }}
                  >
                    {draftSyncBadge.label}
                  </span>
                </div>

                <div className="text-[16px] leading-7 text-foreground" style={{ fontWeight: 750 }}>
                  {title || currentDraft.title}
                </div>

                <div className="flex items-center justify-between text-[12px] text-muted-foreground">
                  <span>{draftSyncBadge.description}</span>
                  <span className="whitespace-nowrap">更新于 {articleDate}</span>
                </div>

                <div className="rounded-2xl bg-background px-3 py-3">
                  <div className="line-clamp-3 text-[12px] leading-6 text-muted-foreground">
                    {currentDraftPreview}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 border-t border-border/70 px-4 py-4">
                {currentDraftMetrics.map((item) => (
                  <div key={item.label} className="rounded-2xl border border-border/80 bg-card px-3 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] text-muted-foreground">{item.label}</div>
                      <div className="text-[11px] text-muted-foreground">{item.hint}</div>
                    </div>
                    <div className="mt-2 text-[16px] text-foreground" style={{ fontWeight: 750 }}>
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-border/70 px-4 py-3 text-[12px] leading-6 text-muted-foreground">
                {domainMeta.description}
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="text-[13px]" style={{ fontWeight: 600 }}>内容编辑</div>
              <span className="text-[11px] text-muted-foreground">{isDirty ? "未保存修改" : "已同步"}</span>
            </div>
            <div className="space-y-3">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="block text-[11px] text-muted-foreground">标题</label>
                  <span className={`text-[11px] ${isWechatTitleTooLong ? "text-red-500" : "text-muted-foreground"}`}>
                    {titleLength} / {WECHAT_TITLE_LIMIT}
                  </span>
                </div>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  aria-invalid={isWechatTitleTooLong}
                  className={`w-full rounded-lg bg-background px-3 py-2 text-[13px] outline-none focus:bg-card ${
                    isWechatTitleTooLong
                      ? "border border-red-200 text-red-600 focus:border-red-300"
                      : "border border-border focus:border-primary"
                  }`}
                />
                {isWechatTitleTooLong ? (
                  <div className="mt-1 text-[11px] text-red-500">公众号草稿箱标题最长支持 64 个字符，请缩短后再推送。</div>
                ) : null}
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-muted-foreground">导读摘要</label>
                <textarea
                  value={summary}
                  onChange={(event) => setSummary(event.target.value)}
                  className="min-h-24 w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] leading-relaxed outline-none focus:border-primary focus:bg-card"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-muted-foreground">正文内容</label>
                <textarea
                  ref={bodyTextareaRef}
                  value={body}
                  onChange={(event) => {
                    setBody(event.target.value);
                    bodySelectionRef.current = {
                      start: event.target.selectionStart ?? 0,
                      end: event.target.selectionEnd ?? 0,
                    };
                  }}
                  onClick={syncBodySelection}
                  onKeyUp={syncBodySelection}
                  onSelect={syncBodySelection}
                  className="min-h-56 w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] leading-relaxed outline-none focus:border-primary focus:bg-card"
                />
              </div>
            </div>
          </div>

          <div>
            <div className="text-[13px] mb-3" style={{ fontWeight: 600 }}>排版模板</div>
            <div className="grid grid-cols-2 gap-2">
              {templates.map((template) => (
                <button
                  key={template}
                  onClick={() => setFormatting((current) => ({ ...current, template }))}
                  className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[12px] border transition-colors ${
                    formatting.template === template
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:bg-accent"
                  }`}
                  style={{ fontWeight: 500 }}
                >
                  <span
                    className="inline-block h-2 w-2 rounded-full border align-middle"
                    style={getTemplateDotStyle(template)}
                  />
                  {template}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[13px] mb-3" style={{ fontWeight: 600 }}>排版设置</div>
            <div className="space-y-3">
              <SelectField
                label="正文字号"
                value={formatting.fontSize}
                options={["15px", "16px", "17px"]}
                onChange={(value) => setFormatting((current) => ({ ...current, fontSize: value as DraftFormatting["fontSize"] }))}
              />
              <SelectField
                label="行高"
                value={formatting.lineHeight}
                options={["1.75", "1.9", "2.0"]}
                onChange={(value) => setFormatting((current) => ({ ...current, lineHeight: value as DraftFormatting["lineHeight"] }))}
              />
              <SelectField
                label="段间距"
                value={formatting.paragraphSpacing}
                options={["16px", "20px", "24px"]}
                onChange={(value) => setFormatting((current) => ({ ...current, paragraphSpacing: value as DraftFormatting["paragraphSpacing"] }))}
              />
              <div>
                <label className="mb-1 block text-[12px] text-muted-foreground">底部引导语</label>
                <textarea
                  value={formatting.ctaText ?? settings.ctaEngage}
                  onChange={(event) => setFormatting((current) => ({ ...current, ctaText: event.target.value }))}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-[12px] leading-relaxed outline-none focus:border-primary focus:bg-card"
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
                          : "border-border bg-background text-muted-foreground hover:bg-accent"
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

          <div>
            <div className="text-[13px] mb-3" style={{ fontWeight: 600 }}>卡片样式</div>
            <div className="space-y-3">
              <ToggleField
                label="渐变金句卡"
                checked={formatting.gradientQuote}
                onChange={() => setFormatting((current) => ({ ...current, gradientQuote: !current.gradientQuote }))}
              />
              <ToggleField
                label="数字序号色块"
                checked={formatting.numberedBadge}
                onChange={() => setFormatting((current) => ({ ...current, numberedBadge: !current.numberedBadge }))}
              />
            </div>
          </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] text-muted-foreground">{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full appearance-none rounded-lg border border-border bg-background px-3 py-1.5 text-[12px]"
        >
          {options.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      </div>
    </div>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-[12px] text-muted-foreground">{label}</label>
      <button
        type="button"
        onClick={onChange}
        className={`relative h-5 w-9 cursor-pointer rounded-full transition-colors ${checked ? "bg-primary" : "bg-muted"}`}
      >
        <div className={`w-4 h-4 bg-card rounded-full absolute top-0.5 shadow-sm transition-all ${checked ? "right-0.5" : "left-0.5"}`} />
      </button>
    </div>
  );
}

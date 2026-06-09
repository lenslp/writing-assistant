"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus, Flame, Search, RefreshCw,
  ArrowUpDown, AlertCircle, LoaderCircle, X, ExternalLink, Clock
} from "lucide-react";
import { useAppStore } from "../providers/app-store";
import { type HotTopicItem } from "../lib/hot-topics";
import { buildTopicSuggestionFromHotTopic } from "../lib/article-analysis";
import {
  articleDomains,
  detectArticleDomainWithSignals,
  resolveArticleDomain,
  type ActiveArticleDomain,
} from "../lib/content-domains";
import { Skeleton } from "./ui/skeleton";

const loadingStages = ["连接热点源", "聚合平台数据", "整理可写选题"];
const HOT_TOPICS_CACHE_KEY = "wechat-writer:hot-topics:view-cache:v2";
const HOT_TOPICS_CACHE_TTL_MS = 5 * 60 * 1000;
const HOT_TOPICS_GROUPED_PAGE_SIZE = 10;
const SOURCE_PRIORITY = ["AI HOT", "GitHub Trending", "36氪", "爱范儿", "少数派", "微博", "抖音", "知乎", "今日头条", "百度"] as const;
const AI_TOPIC_PATTERN = /(ai|aigc|gpt|openai|claude|gemini|deepseek|agent|copilot|llm|mcp|人工智能|大模型|智能体|生成式|机器学习|深度学习|自动驾驶|人形机器人|豆包|kimi|千问|文心|星火|智谱|minimax|海螺|sora|runway|midjourney|llama|token)/i;
const AI_SOURCE_PATTERN = /(AI HOT|GitHub Trending|36氪|爱范儿|少数派|虎嗅|openai|anthropic|github|nvidia)/i;

type HotTopicsCachePayload = {
  items: HotTopicItem[];
  source: "database" | "live";
  restrictedCount: number;
  cachedAt: number;
};

type HotTopicsInitialData = {
  items: HotTopicItem[];
  source: "database" | "live";
  restrictedCount: number;
};

type FailedSourceItem = {
  source?: string;
  error?: string;
};

function readHotTopicsCache() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(HOT_TOPICS_CACHE_KEY);
    if (!raw) return null;

    const payload = JSON.parse(raw) as HotTopicsCachePayload;
    if (!Array.isArray(payload.items) || !payload.items.length) return null;

    return payload;
  } catch {
    return null;
  }
}

function writeHotTopicsCache(payload: Omit<HotTopicsCachePayload, "cachedAt">) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(
      HOT_TOPICS_CACHE_KEY,
      JSON.stringify({
        ...payload,
        cachedAt: Date.now(),
      } satisfies HotTopicsCachePayload),
    );
  } catch {
    // ignore cache write errors
  }
}

function getNewestFetchedAt(items: HotTopicItem[]) {
  return items.reduce((latest, item) => {
    const timestamp = new Date(item.fetchedAt).getTime();
    if (Number.isNaN(timestamp)) return latest;
    return Math.max(latest, timestamp);
  }, 0);
}

function formatFailedSourceWarning(failedSources: unknown, baseMessage = "") {
  if (!Array.isArray(failedSources) || !failedSources.length) {
    return baseMessage;
  }

  const entries = failedSources
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const failed = item as FailedSourceItem;
      const source = typeof failed.source === "string" ? failed.source.trim() : "";
      const error = typeof failed.error === "string" ? failed.error.trim() : "";
      if (!source) return "";
      if (!error) return source;
      return `${source}（${error}）`;
    })
    .filter(Boolean)
    .slice(0, 3);

  if (!entries.length) {
    return baseMessage;
  }

  const prefix = baseMessage ? `${baseMessage} ` : "";
  return `${prefix}部分来源抓取失败：${entries.join("；")}`;
}

function resolveDisplayDomain(topic: HotTopicItem): ActiveArticleDomain | null {
  const isExplicitActiveDomain = topic.domain && (articleDomains as readonly string[]).includes(topic.domain);
  const explicitDomain = isExplicitActiveDomain ? (topic.domain as ActiveArticleDomain) : null;
  const text = `${topic.title} ${topic.source} ${topic.tags.join(" ")} ${topic.summary ?? ""}`;

  // Weibo is never AI
  if (topic.source === "微博") {
    const signal = detectArticleDomainWithSignals(topic.title, topic.tags, topic.source, topic.summary ?? "");
    const resolvedSignalDomain = (articleDomains as readonly string[]).includes(signal.domain) ? (signal.domain as ActiveArticleDomain) : null;
    if (resolvedSignalDomain && signal.confidence !== "low") {
      return resolvedSignalDomain;
    }
    return null;
  }

  if (explicitDomain) {
    return explicitDomain;
  }

  const PURE_AI_SOURCE_PATTERN = /(AI HOT|GitHub Trending|openai|anthropic|github|nvidia)/i;
  const fastPathText = `${topic.title} ${topic.source} ${topic.tags.join(" ")}`;

  if (PURE_AI_SOURCE_PATTERN.test(topic.source) || AI_TOPIC_PATTERN.test(fastPathText)) {
    return "AI";
  }

  const signal = detectArticleDomainWithSignals(topic.title, topic.tags, topic.source, topic.summary ?? "");
  const resolvedSignalDomain = (articleDomains as readonly string[]).includes(signal.domain) ? (signal.domain as ActiveArticleDomain) : null;
  if (resolvedSignalDomain && signal.confidence !== "low") {
    return resolvedSignalDomain;
  }

  return null;
}

function HotTopicsLoadingShell() {
  return (
    <div className="mx-auto max-w-[1200px] space-y-5">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-28 rounded-lg bg-[#fff0e6]" />
          <Skeleton className="h-4 w-72 rounded-lg bg-[#f1eadf]" />
        </div>
        <div className="rounded-2xl border border-[#f0dfd0] bg-[linear-gradient(135deg,#fff4ea_0%,#ffffff_100%)] px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2 text-[13px] text-[#d65f2b]" style={{ fontWeight: 700 }}>
            <LoaderCircle className="h-4 w-4 animate-spin" />
            热点数据准备中
          </div>
          <div className="mt-1.5 text-[12px] text-[#8c8178]">正在连接微博、GitHub Trending、抖音、百度等来源，首次加载会稍慢一点。</div>
        </div>
      </div>

      <div className="lens-card p-4">
        <div className="grid gap-3 md:grid-cols-[1.2fr_0.9fr]">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[12px] text-[#8c8178]">
              <Skeleton className="h-4 w-4 rounded-full" />
              <Skeleton className="h-4 w-44 rounded-lg" />
            </div>
            <Skeleton className="h-10 w-full rounded-xl" />
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={`source-${index}`} className="h-7 w-16 rounded-full" />
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 7 }).map((_, index) => (
                <Skeleton key={`tag-${index}`} className="h-7 w-20 rounded-full" />
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[#f0e5da] bg-[#fffaf5] p-4">
            <div className="text-[12px] text-[#8c8178]">加载阶段</div>
            <div className="mt-3 space-y-3">
              {loadingStages.map((stage, index) => (
                <div key={stage} className="flex items-center gap-3">
                  <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${
                    index === 0 ? "bg-[#d65f2b] text-white" : "bg-white text-[#8c8178]"
                  }`} style={{ fontWeight: 600 }}>
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <div className="text-[12px] text-[#5d544c]" style={{ fontWeight: 600 }}>{stage}</div>
                    <Skeleton className="mt-1 h-2 w-full rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#eadfd4] bg-white shadow-sm">
        <div className="grid grid-cols-[1fr_100px_90px_90px_140px] border-b border-[#f0e5da] px-5 py-2.5">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={`header-${index}`} className="h-4 w-16 rounded-md" />
          ))}
        </div>
        <div className="divide-y divide-gray-50">
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={`row-${index}`} className="grid grid-cols-[1fr_100px_90px_90px_140px] items-center px-5 py-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-6 w-6 rounded-md" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-[78%] rounded-md" />
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-12 rounded-full" />
                    <Skeleton className="h-4 w-12 rounded-full" />
                    <Skeleton className="h-4 w-16 rounded-full" />
                  </div>
                </div>
              </div>
              <Skeleton className="h-6 w-12 rounded-full" />
              <Skeleton className="h-4 w-14 rounded-md" />
              <Skeleton className="h-4 w-12 rounded-md" />
              <div className="flex justify-end gap-2">
                <Skeleton className="h-8 w-16 rounded-lg" />
                <Skeleton className="h-8 w-16 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function HotTopics({ initialData }: { initialData?: HotTopicsInitialData }) {
  const [activeCategory, setActiveCategory] = useState<ActiveArticleDomain>("AI");
  const [activeSource, setActiveSource] = useState("");
  const [sortMode, setSortMode] = useState<"heat" | "trend">("heat");
  const [keyword, setKeyword] = useState("");
  const [items, setItems] = useState<HotTopicItem[]>(initialData?.items ?? []);
  const [dataSource, setDataSource] = useState<"database" | "live">(initialData?.source ?? "live");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(!(initialData?.items?.length));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshWarning, setRefreshWarning] = useState("");
  const [restrictedCount, setRestrictedCount] = useState(initialData?.restrictedCount ?? 0);
  const [groupedPages, setGroupedPages] = useState<Record<string, number>>({});
  const [isReclassifying, setIsReclassifying] = useState(false);
  const [detailTopic, setDetailTopic] = useState<HotTopicItem | null>(null);
  const autoRefreshStartedRef = useRef(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { upsertTopic } = useAppStore();

  const sortSourceOptions = useCallback((sources: string[]) =>
    [...sources].sort((left, right) => {
      const leftPriority = SOURCE_PRIORITY.indexOf(left as typeof SOURCE_PRIORITY[number]);
      const rightPriority = SOURCE_PRIORITY.indexOf(right as typeof SOURCE_PRIORITY[number]);

      if (leftPriority === -1 && rightPriority === -1) {
        return left.localeCompare(right, "zh-CN");
      }

      if (leftPriority === -1) return 1;
      if (rightPriority === -1) return -1;
      return leftPriority - rightPriority;
    }), []);

  const applyHotTopicsPayload = useCallback((payload: Record<string, unknown>) => {
    if (!Array.isArray(payload.items)) return false;

    const nextItems = payload.items as HotTopicItem[];
    const nextSource = payload.source === "database" || payload.persisted ? "database" : "live";
    const nextRestrictedCount = typeof payload.restrictedCount === "number" ? payload.restrictedCount : 0;

    setItems(nextItems);
    setDataSource(nextSource);
    setRestrictedCount(nextRestrictedCount);
    writeHotTopicsCache({
      items: nextItems,
      source: nextSource,
      restrictedCount: nextRestrictedCount,
    });

    return true;
  }, []);

  const loadLatestHotTopics = useCallback(async () => {
    const latest = await fetch("/api/hot-topics", { cache: "no-store" });
    if (!latest.ok) {
      throw new Error(`Failed to load hot topics: ${latest.status}`);
    }

    const latestPayload = await latest.json();
    applyHotTopicsPayload(latestPayload);
    return latestPayload;
  }, [applyHotTopicsPayload]);

  useEffect(() => {
    const cachedPayload = readHotTopicsCache();
    const hasFreshCache = Boolean(cachedPayload && Date.now() - cachedPayload.cachedAt <= HOT_TOPICS_CACHE_TTL_MS);
    const hasInitialData = Boolean(initialData?.items?.length);
    const initialFetchedAt = getNewestFetchedAt(initialData?.items ?? []);
    const cachedFetchedAt = getNewestFetchedAt(cachedPayload?.items ?? []);
    const shouldUseCachedPayload = Boolean(cachedPayload && cachedFetchedAt > initialFetchedAt);

    if (hasInitialData) {
      writeHotTopicsCache({
        items: initialData?.items ?? [],
        source: initialData?.source ?? "live",
        restrictedCount: initialData?.restrictedCount ?? 0,
      });
    }

    if (shouldUseCachedPayload && cachedPayload) {
      setItems(cachedPayload.items);
      setDataSource(cachedPayload.source);
      setRestrictedCount(cachedPayload.restrictedCount);
      setIsLoading(false);
    }

    const loadItems = async (background = false) => {
      if (!background) {
        setIsLoading(true);
      }

      try {
        const response = await fetch("/api/hot-topics", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Failed to load hot topics: ${response.status}`);
        }
        const payload = await response.json();
        applyHotTopicsPayload(payload);
      } catch (error) {
        console.error("Failed to load hot topics:", error);
      } finally {
        if (!background) {
          setIsLoading(false);
        }
      }
    };

    if (hasFreshCache) {
      void loadItems(true);
      return;
    }

    void loadItems(Boolean((shouldUseCachedPayload && cachedPayload) || hasInitialData));
  }, [applyHotTopicsPayload, initialData]);

  useEffect(() => {
    if (autoRefreshStartedRef.current) return;
    autoRefreshStartedRef.current = true;

    const refreshInBackground = async () => {
      try {
        const response = await fetch("/api/hot-topics/refresh", { method: "POST" });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.message ?? `Failed to refresh hot topics: ${response.status}`);
        }

        if (!payload || !applyHotTopicsPayload(payload)) {
          await loadLatestHotTopics();
        }

        const nextWarning = formatFailedSourceWarning(payload?.failedSources, typeof payload?.message === "string" ? payload.message : "");
        if (nextWarning) {
          setRefreshWarning(nextWarning);
        }
      } catch (error) {
        console.error("Failed to auto refresh hot topics:", error);
      }
    };

    void refreshInBackground();
  }, [applyHotTopicsPayload, loadLatestHotTopics]);

  const topicDomainMap = useMemo(
    () =>
      new Map<string, ActiveArticleDomain | null>(
        items.map((topic) => [topic.id, resolveDisplayDomain(topic)]),
      ),
    [items],
  );

  const sortTopics = (topicItems: HotTopicItem[]) =>
    [...topicItems].sort((left, right) => {
      if (sortMode === "trend") {
        return Number.parseInt(right.trend, 10) - Number.parseInt(left.trend, 10);
      }
      return right.heat - left.heat;
    });

  const filteredTopics = useMemo(
    () =>
      sortTopics(
        items.filter((topic) => {
          const matchesCategory = topicDomainMap.get(topic.id) === activeCategory;
          const matchesSource = activeSource ? topic.source === activeSource : true;
          const matchesKeyword = keyword
            ? topic.title.includes(keyword) || topic.tags.some((tag) => tag.includes(keyword))
            : true;
          return matchesCategory && matchesSource && matchesKeyword;
        }),
      ),
    [activeCategory, activeSource, items, keyword, sortMode, topicDomainMap],
  );
  const groupedTopics = useMemo(() => {
    const grouped = new Map<ActiveArticleDomain, HotTopicItem[]>(
      articleDomains.map((domain) => [domain, []]),
    );

    filteredTopics.forEach((topic) => {
      const domain = topicDomainMap.get(topic.id) ?? "AI";
      const group = grouped.get(domain) ?? [];
      group.push(topic);
      grouped.set(domain, group);
    });

    return articleDomains
      .map((domain) => ({
        domain,
        items: sortTopics(grouped.get(domain) ?? []),
      }))
      .filter((section) => section.items.length);
  }, [filteredTopics, sortMode, topicDomainMap]);
  const refreshStage = loadingStages[Math.min(loadingStages.length - 1, Math.floor((items.length || 0) / 10))];
  const categoryOptions = useMemo(() => [...articleDomains], []);
  const sourceOptions = useMemo(() => {
    const categorySources = items
      .filter((topic) => topicDomainMap.get(topic.id) === activeCategory)
      .map((topic) => topic.source);
    return sortSourceOptions(Array.from(new Set(categorySources)));
  }, [activeCategory, items, sortSourceOptions, topicDomainMap]);

  useEffect(() => {
    setGroupedPages({});
  }, [activeCategory, activeSource, keyword, sortMode, items]);

  useEffect(() => {
    if (!sourceOptions.length) {
      setActiveSource("");
      return;
    }

    if (!sourceOptions.includes(activeSource)) {
      setActiveSource(sourceOptions[0]);
    }
  }, [activeSource, sourceOptions]);

  useEffect(() => {
    const nextCategory = searchParams.get("category");
    if (!nextCategory) return;

    const normalizedCategory = resolveArticleDomain(nextCategory);
    if (articleDomains.includes(normalizedCategory)) {
      setActiveCategory(normalizedCategory);
      setGroupedPages((current) => ({
        ...current,
        [normalizedCategory]: 1,
      }));
    }
  }, [searchParams]);

  const openTopic = (topic: HotTopicItem, mode: "topic" | "writing") => {
    const topicId = upsertTopic(buildTopicSuggestionFromHotTopic(topic)).id;
    router.push(mode === "topic" ? `/topic-center?topicId=${topicId}` : `/writing?topicId=${topicId}&autogen=full`);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setRefreshWarning("");

    try {
      const response = await fetch("/api/hot-topics/refresh", { method: "POST" });
      if (!response.ok) {
        throw new Error(`Failed to refresh hot topics: ${response.status}`);
      }
      const payload = await response.json();
      if (!applyHotTopicsPayload(payload)) {
        await loadLatestHotTopics();
      }

      setRestrictedCount(typeof payload.restrictedCount === "number" ? payload.restrictedCount : 0);

      const nextWarning = formatFailedSourceWarning(payload.failedSources, typeof payload.message === "string" ? payload.message : "");
      if (nextWarning) {
        setRefreshWarning(nextWarning);
      }

      setNotice(
        payload.persisted
          ? "热点已抓取并入库"
          : "已拉取实时热点",
      );
      window.setTimeout(() => setNotice(""), 2000);
    } catch (error) {
      console.error("Failed to refresh hot topics:", error);
      setRefreshWarning("刷新失败，请稍后重试");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleReclassify = async () => {
    setIsReclassifying(true);
    setRefreshWarning("");

    try {
      const response = await fetch("/api/hot-topics/reclassify", { method: "POST" });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message ?? "重新归类失败");
      }

      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(HOT_TOPICS_CACHE_KEY);
      }

      const latest = await fetch("/api/hot-topics", { cache: "no-store" });
      const latestPayload = await latest.json().catch(() => null);
      if (latest.ok && Array.isArray(latestPayload?.items)) {
        setItems(latestPayload.items);
        setDataSource(latestPayload.source === "database" ? "database" : "live");
        setRestrictedCount(typeof latestPayload.restrictedCount === "number" ? latestPayload.restrictedCount : 0);
        writeHotTopicsCache({
          items: latestPayload.items,
          source: latestPayload.source === "database" ? "database" : "live",
          restrictedCount: typeof latestPayload.restrictedCount === "number" ? latestPayload.restrictedCount : 0,
        });
      }

      setNotice(`已按最新分类规则重算 ${payload.updatedCount ?? 0} 个选题`);
      window.setTimeout(() => setNotice(""), 2500);
    } catch (error) {
      setRefreshWarning(error instanceof Error ? error.message : "重新归类失败");
    } finally {
      setIsReclassifying(false);
    }
  };

  if (isLoading) {
    return <HotTopicsLoadingShell />;
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="lens-title text-[20px]">热点中心</h1>
          <p className="mt-1 text-[13px] text-[#8c8178]">聚合多来源热点，先筛出值得写的选题。</p>
        </div>
        <div className="flex items-center gap-2">
          {notice ? <span className="text-[12px] text-green-600">{notice}</span> : null}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing || isLoading}
            className="lens-btn-primary flex items-center gap-1.5 px-3.5 py-2 text-[13px]"
            style={{ fontWeight: 800 }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            {isRefreshing ? "刷新中" : "抓取热点"}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="lens-card space-y-3 p-4">
        {isRefreshing ? (
          <div className="rounded-xl border border-[#f0dfd0] bg-[linear-gradient(135deg,#fff4ea_0%,#ffffff_100%)] px-4 py-3">
            <div className="flex items-center gap-2 text-[13px] text-[#d65f2b]" style={{ fontWeight: 700 }}>
              <LoaderCircle className="h-4 w-4 animate-spin" />
              正在抓取最新热点并同步选题
            </div>
            <div className="mt-1 text-[12px] text-[#8c8178]">
              当前阶段：{refreshStage}，完成后会自动更新列表和选题池。
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/80">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-[#d65f2b]" />
            </div>
          </div>
        ) : null}
        {refreshWarning ? (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-700">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            {refreshWarning}
          </div>
        ) : null}
        <div className="lens-input flex items-center gap-2 px-3 py-2">
          <Search className="w-4 h-4 text-[#9a9086]" />
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            type="text"
            placeholder="搜索热点关键词..."
            className="w-full border-none bg-transparent text-[13px] text-[#181715] outline-none placeholder:text-[#9a9086]"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="w-12 flex-shrink-0 text-[12px] text-[#8c8178]">领域</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {categoryOptions.map((category) => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`px-3 py-1 rounded-full text-[12px] transition-colors ${
                  activeCategory === category ? "lens-chip-active" : "lens-chip"
                }`}
                style={{ fontWeight: 700 }}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-12 flex-shrink-0 text-[12px] text-[#8c8178]">数据源</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {sourceOptions.map((source) => (
              <button
                key={source}
                onClick={() => setActiveSource(source)}
                className={`px-3 py-1 rounded-full text-[12px] transition-colors ${
                  activeSource === source ? "bg-[#181715] text-white" : "lens-chip"
                }`}
                style={{ fontWeight: 700 }}
              >
                {source}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Topics list */}
      {groupedTopics.length ? (
        <div className="grid grid-cols-1 items-stretch gap-4">
          {groupedTopics.map(({ domain, items: sourceItems }) => {
            const totalPages = Math.max(1, Math.ceil(sourceItems.length / HOT_TOPICS_GROUPED_PAGE_SIZE));
            const currentPage = Math.min(groupedPages[domain] ?? 1, totalPages);
            const visibleItems = sourceItems.slice(
              (currentPage - 1) * HOT_TOPICS_GROUPED_PAGE_SIZE,
              currentPage * HOT_TOPICS_GROUPED_PAGE_SIZE,
            );

            return (
              <div key={domain} className="flex h-full flex-col overflow-hidden rounded-[22px] border border-[#eadfd4] bg-white/86 shadow-[0_12px_36px_rgba(85,57,34,0.05)]">
                <div className="flex-1 divide-y divide-[#f0e5da]">
                {visibleItems.map((topic, index) => (
                  <div key={topic.id} className="px-5 py-4 transition-colors hover:bg-[#fffaf5]">
                    <div className="flex items-center gap-4">
                      <span className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[14px] text-[13px] shadow-sm ${
                        index + (currentPage - 1) * HOT_TOPICS_GROUPED_PAGE_SIZE < 3 ? "bg-[#d65f2b] text-white" : "bg-[#f1eadf] text-[#8c8178]"
                      }`} style={{ fontWeight: 800 }}>
                        {index + 1 + (currentPage - 1) * HOT_TOPICS_GROUPED_PAGE_SIZE}
                      </span>
                      <div className="grid min-w-0 flex-1 grid-cols-[minmax(260px,1fr)_minmax(320px,0.9fr)_auto] items-center gap-4">
                        <div className="min-w-0">
                          <button
                            onClick={() => openTopic(topic, "topic")}
                            className="line-clamp-2 self-start text-left text-[14px] leading-6 text-[#181715] transition-colors hover:text-[#d65f2b]"
                            style={{ fontWeight: 700 }}
                          >
                            {topic.title}
                          </button>
                        </div>
                        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                          <div className="flex items-center gap-1 text-[12px] text-slate-500">
                            <Flame className="h-3.5 w-3.5 text-orange-400" />
                            {topic.heat.toLocaleString()}
                          </div>
                          <span className="text-[12px] text-emerald-600" style={{ fontWeight: 600 }}>{topic.trend}</span>
                          <span className="text-[12px] text-[#8c8178]">{topic.time}</span>
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setDetailTopic(topic)}
                            className="lens-btn-secondary px-3 py-1.5 text-[12px] shadow-xs"
                          >
                            详情
                          </button>
                          <button
                            onClick={() => openTopic(topic, "topic")}
                            className="lens-btn-secondary flex items-center gap-1 px-3 py-1.5 text-[12px] shadow-xs"
                          >
                            <Plus className="h-3.5 w-3.5" />选题
                          </button>
                          <button
                            onClick={() => openTopic(topic, "writing")}
                            className="lens-btn-primary px-3.5 py-1.5 text-[12px]"
                            style={{ fontWeight: 800 }}
                          >
                            生成
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {sourceItems.length > HOT_TOPICS_GROUPED_PAGE_SIZE ? (
                <div className="flex items-center justify-between border-t border-[#f0e5da] bg-[#fffaf5] px-4 py-3">
                  <span className="text-[12px] text-[#8c8178]">
                    共 {sourceItems.length} 条 · 第 {currentPage} / {totalPages} 页
                  </span>
                  <div className="flex items-center gap-2">
                  <button
                    onClick={() => setGroupedPages((current) => ({
                      ...current,
                      [domain]: Math.max(1, currentPage - 1),
                    }))}
                    disabled={currentPage === 1}
                    className="lens-btn-secondary px-3 py-1.5 text-[12px] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    上一页
                  </button>
                  <button
                    onClick={() => setGroupedPages((current) => ({
                      ...current,
                      [domain]: Math.min(totalPages, currentPage + 1),
                    }))}
                    disabled={currentPage === totalPages}
                    className="lens-btn-secondary px-3 py-1.5 text-[12px] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    下一页
                  </button>
                  </div>
                </div>
              ) : null}
            </div>
            );
          })}
        </div>
      ) : (
        <div className="lens-card px-5 py-12 text-center">
          <div className="text-[14px] text-[#181715]" style={{ fontWeight: 750 }}>没有匹配到热点</div>
          <div className="mt-1 text-[12px] text-[#8c8178]">先点击上方“抓取热点”，或调整关键词。</div>
        </div>
      )}

      {/* Hot topic detail modal */}
      {detailTopic && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setDetailTopic(null)}
        >
          <div
            className="relative mx-4 w-full max-w-lg rounded-[22px] border border-[#eadfd4] bg-white shadow-[0_24px_80px_rgba(85,57,34,0.16)] animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-[#f0e5da] px-6 py-4">
              <h2 className="text-[16px] leading-6 text-[#181715]" style={{ fontWeight: 800 }}>
                {detailTopic.title}
              </h2>
              <button
                onClick={() => setDetailTopic(null)}
                className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-[#8c8178] transition-colors hover:bg-[#fff7ef] hover:text-[#d65f2b]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="space-y-4 px-6 py-5">
              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-[#fff0e6] px-2.5 py-1 text-[12px] text-[#d65f2b]" style={{ fontWeight: 700 }}>
                  {detailTopic.source}
                </span>
                <div className="flex items-center gap-1 text-[12px] text-[#6f665d]">
                  <Flame className="h-3.5 w-3.5 text-orange-400" />
                  热度 {detailTopic.heat.toLocaleString()}
                </div>
                <span className="text-[12px] text-emerald-600" style={{ fontWeight: 600 }}>
                  {detailTopic.trend}
                </span>
                <div className="flex items-center gap-1 text-[12px] text-[#8c8178]">
                  <Clock className="h-3.5 w-3.5" />
                  {detailTopic.time}
                </div>
              </div>

              {/* Summary */}
              {detailTopic.summary ? (
                <div className="rounded-xl bg-[#fffaf5] px-4 py-3">
                  <div className="mb-1.5 text-[12px] text-[#8c8178]" style={{ fontWeight: 700 }}>摘要</div>
                  <p className="whitespace-pre-line text-[13px] leading-6 text-[#5d544c]">
                    {detailTopic.summary}
                  </p>
                </div>
              ) : (
                <div className="rounded-xl bg-[#fffaf5] px-4 py-3 text-[13px] text-[#8c8178]">
                  暂无摘要信息
                </div>
              )}

              {/* External link */}
              {detailTopic.url && (
                <a
                  href={detailTopic.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[12px] text-[#d65f2b] transition-colors hover:text-[#bf4513]"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  查看原文
                </a>
              )}
            </div>

            {/* Footer actions */}
            <div className="flex items-center justify-end gap-2 border-t border-[#f0e5da] px-6 py-3">
              <button
                onClick={() => {
                  openTopic(detailTopic, "topic");
                  setDetailTopic(null);
                }}
                className="lens-btn-secondary flex items-center gap-1 px-3.5 py-1.5 text-[12px]"
              >
                <Plus className="h-3.5 w-3.5" />
                加入选题
              </button>
              <button
                onClick={() => {
                  openTopic(detailTopic, "writing");
                  setDetailTopic(null);
                }}
                className="lens-btn-primary px-3.5 py-1.5 text-[12px]" style={{ fontWeight: 800 }}
              >
                直接生成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

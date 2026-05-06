"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  TrendingUp, Plus, Flame, Search, RefreshCw,
  ArrowUpDown, AlertCircle, LoaderCircle
} from "lucide-react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { useAppStore } from "../providers/app-store";
import { type HotTopicItem } from "../lib/hot-topics";
import { buildTopicSuggestionFromHotTopic } from "../lib/article-analysis";
import { articleDomains, type ArticleDomain } from "../lib/content-domains";
import { Skeleton } from "./ui/skeleton";

const trendData = Array.from({ length: 12 }, (_, i) => ({ v: Math.random() * 100 + 20 }));
const loadingStages = ["连接热点源", "聚合平台数据", "整理可写选题"];
const HOT_TOPICS_CACHE_KEY = "wechat-writer:hot-topics:view-cache:v2";
const HOT_TOPICS_CACHE_TTL_MS = 5 * 60 * 1000;
const HOT_TOPICS_MIXED_PAGE_SIZE = 50;
const HOT_TOPICS_GROUPED_PAGE_SIZE = 10;
const SOURCE_PRIORITY = ["微博", "Twitter/X", "GitHub Trending", "知乎", "抖音", "百度", "今日头条"] as const;
const DOMAIN_ORDER = new Map<ArticleDomain, number>(articleDomains.map((domain, index) => [domain, index]));
type HotTopicCategory = ArticleDomain | "GitHub Trending";
const GITHUB_CATEGORY = "GitHub Trending" as const;
const GITHUB_CATEGORY_ORDER = -1;

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

function HotTopicsLoadingShell() {
  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-28 rounded-lg bg-blue-100/80" />
          <Skeleton className="h-4 w-72 rounded-lg bg-gray-100" />
        </div>
        <div className="rounded-2xl border border-blue-100 bg-linear-to-r from-blue-50 via-cyan-50 to-sky-50 px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2 text-[13px] text-blue-700" style={{ fontWeight: 600 }}>
            <LoaderCircle className="h-4 w-4 animate-spin" />
            热点数据准备中
          </div>
          <div className="mt-1.5 text-[12px] text-blue-600/80">正在连接微博、GitHub Trending、抖音、百度等来源，首次加载会稍慢一点。</div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[1.2fr_0.9fr]">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[12px] text-gray-500">
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

          <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4">
            <div className="text-[12px] text-gray-500">加载阶段</div>
            <div className="mt-3 space-y-3">
              {loadingStages.map((stage, index) => (
                <div key={stage} className="flex items-center gap-3">
                  <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${
                    index === 0 ? "bg-blue-600 text-white" : "bg-white text-gray-400"
                  }`} style={{ fontWeight: 600 }}>
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <div className="text-[12px] text-gray-700" style={{ fontWeight: 500 }}>{stage}</div>
                    <Skeleton className="mt-1 h-2 w-full rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="grid grid-cols-[1fr_100px_90px_90px_140px] border-b border-gray-100 px-5 py-2.5">
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
  const [activeSource, setActiveSource] = useState("全部");
  const [activeCategory, setActiveCategory] = useState("全部");
  const [sortMode, setSortMode] = useState<"heat" | "trend">("heat");
  const [viewMode, setViewMode] = useState<"mixed" | "grouped">("mixed");
  const [keyword, setKeyword] = useState("");
  const [items, setItems] = useState<HotTopicItem[]>(initialData?.items ?? []);
  const [dataSource, setDataSource] = useState<"database" | "live">(initialData?.source ?? "live");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(!(initialData?.items?.length));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshWarning, setRefreshWarning] = useState("");
  const [restrictedCount, setRestrictedCount] = useState(initialData?.restrictedCount ?? 0);
  const [mixedPage, setMixedPage] = useState(1);
  const [groupedPages, setGroupedPages] = useState<Record<string, number>>({});
  const [isReclassifying, setIsReclassifying] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { settings, upsertTopic } = useAppStore();

  const sortSourceOptions = (sources: string[]) =>
    [...sources].sort((left, right) => {
      const leftPriority = SOURCE_PRIORITY.indexOf(left as typeof SOURCE_PRIORITY[number]);
      const rightPriority = SOURCE_PRIORITY.indexOf(right as typeof SOURCE_PRIORITY[number]);

      if (leftPriority === -1 && rightPriority === -1) {
        return left.localeCompare(right, "zh-CN");
      }

      if (leftPriority === -1) return 1;
      if (rightPriority === -1) return -1;
      return leftPriority - rightPriority;
    });

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
        if (Array.isArray(payload.items)) {
          setItems(payload.items);
          setDataSource(payload.source === "database" ? "database" : "live");
          setRestrictedCount(typeof payload.restrictedCount === "number" ? payload.restrictedCount : 0);
          writeHotTopicsCache({
            items: payload.items,
            source: payload.source === "database" ? "database" : "live",
            restrictedCount: typeof payload.restrictedCount === "number" ? payload.restrictedCount : 0,
          });
        }
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
  }, [initialData]);

  const topicDomainMap = useMemo(
    () =>
      new Map<string, HotTopicCategory>(
        items.map((topic) => [
          topic.id,
          topic.source === GITHUB_CATEGORY ? GITHUB_CATEGORY : (topic.domain ?? "其他"),
        ]),
      ),
    [items],
  );
  const techTopicCount = useMemo(
    () => items.filter((topic) => topicDomainMap.get(topic.id) === "科技").length,
    [items, topicDomainMap],
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
          const matchesSource = activeSource === "全部" ? true : topic.source === activeSource;
          const matchesCategory = activeCategory === "全部" ? true : topicDomainMap.get(topic.id) === activeCategory;
          const matchesKeyword = keyword
            ? topic.title.includes(keyword) || topic.tags.some((tag) => tag.includes(keyword))
            : true;
          return matchesSource && matchesCategory && matchesKeyword;
        }),
      ),
    [activeCategory, activeSource, items, keyword, sortMode, topicDomainMap],
  );
  const groupedTopics = useMemo(() => {
    const grouped = new Map<string, HotTopicItem[]>();

    filteredTopics.forEach((topic) => {
      const group = grouped.get(topic.source) ?? [];
      group.push(topic);
      grouped.set(topic.source, group);
    });

    return sortSourceOptions(Array.from(grouped.keys())).map((source) => ({
      source,
      items: sortTopics(grouped.get(source) ?? []),
    }));
  }, [filteredTopics, sortMode]);
  const sourceOptions = useMemo(
    () => ["全部", ...sortSourceOptions(Array.from(new Set(items.map((item) => item.source))))],
    [items],
  );
  const categoryOptions = useMemo(
    () => [
      "全部",
      ...Array.from(new Set<HotTopicCategory>([...settings.contentAreas, ...Array.from(topicDomainMap.values())]))
        .sort((left, right) => {
          const leftOrder = left === GITHUB_CATEGORY ? GITHUB_CATEGORY_ORDER : (DOMAIN_ORDER.get(left) ?? 999);
          const rightOrder = right === GITHUB_CATEGORY ? GITHUB_CATEGORY_ORDER : (DOMAIN_ORDER.get(right) ?? 999);
          return leftOrder - rightOrder;
        }),
    ],
    [settings.contentAreas, topicDomainMap],
  );
  const refreshStage = loadingStages[Math.min(loadingStages.length - 1, Math.floor((items.length || 0) / 10))];
  const mixedTotalPages = Math.max(1, Math.ceil(filteredTopics.length / HOT_TOPICS_MIXED_PAGE_SIZE));
  const mixedVisibleTopics = useMemo(
    () => filteredTopics.slice((mixedPage - 1) * HOT_TOPICS_MIXED_PAGE_SIZE, mixedPage * HOT_TOPICS_MIXED_PAGE_SIZE),
    [filteredTopics, mixedPage],
  );

  useEffect(() => {
    setMixedPage(1);
    setGroupedPages({});
  }, [activeSource, activeCategory, keyword, sortMode, viewMode, items]);

  useEffect(() => {
    const nextCategory = searchParams.get("category");

    if (nextCategory && categoryOptions.includes(nextCategory)) {
      setActiveCategory(nextCategory);
    }
  }, [categoryOptions, searchParams]);

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
      if (Array.isArray(payload.items)) {
        setItems(payload.items);
        setDataSource(payload.persisted ? "database" : "live");
        writeHotTopicsCache({
          items: payload.items,
          source: payload.persisted ? "database" : "live",
          restrictedCount: typeof payload.restrictedCount === "number" ? payload.restrictedCount : 0,
        });
      } else {
        const latest = await fetch("/api/hot-topics", { cache: "no-store" });
        if (!latest.ok) {
          throw new Error(`Failed to load hot topics: ${latest.status}`);
        }
        const latestPayload = await latest.json();
        if (Array.isArray(latestPayload.items)) {
          setItems(latestPayload.items);
          setDataSource(latestPayload.source === "database" ? "database" : "live");
          setRestrictedCount(typeof latestPayload.restrictedCount === "number" ? latestPayload.restrictedCount : 0);
          writeHotTopicsCache({
            items: latestPayload.items,
            source: latestPayload.source === "database" ? "database" : "live",
            restrictedCount: typeof latestPayload.restrictedCount === "number" ? latestPayload.restrictedCount : 0,
          });
        }
      }

      setRestrictedCount(typeof payload.restrictedCount === "number" ? payload.restrictedCount : 0);

      const nextWarning = formatFailedSourceWarning(payload.failedSources, typeof payload.message === "string" ? payload.message : "");
      if (nextWarning) {
        setRefreshWarning(nextWarning);
      }

      setNotice(
        payload.persisted
          ? `热点已抓取并入库，自动生成 ${payload.generatedTopicCount ?? 0} 个选题`
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
    <div className="max-w-[1200px] mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px]" style={{ fontWeight: 600 }}>热点中心</h1>
          <p className="text-[13px] text-gray-500 mt-1">聚合多平台热点，方便按来源、领域和关键词筛选可写内容</p>
        </div>
        <div className="flex items-center gap-2">
          {notice ? <span className="text-[12px] text-green-600">{notice}</span> : null}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing || isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-[13px] text-gray-600 hover:bg-gray-50 disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            {isRefreshing ? "刷新中" : "抓取热点"}
          </button>
          <button
            onClick={handleReclassify}
            disabled={isReclassifying || isRefreshing || isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-[13px] text-gray-600 hover:bg-gray-50 disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isReclassifying ? "animate-spin" : ""}`} />
            {isReclassifying ? "归类中" : "重新归类"}
          </button>
          <button
            onClick={() => setSortMode((current) => (current === "heat" ? "trend" : "heat"))}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-[13px] text-gray-600 hover:bg-gray-50"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            按{sortMode === "heat" ? "热度" : "增速"}排序
          </button>
          <div className="flex items-center rounded-lg border border-gray-200 bg-white p-0.5">
            <button
              onClick={() => setViewMode("grouped")}
              className={`rounded-md px-2.5 py-1 text-[12px] transition-colors ${
                viewMode === "grouped" ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              按平台分组
            </button>
            <button
              onClick={() => setViewMode("mixed")}
              className={`rounded-md px-2.5 py-1 text-[12px] transition-colors ${
                viewMode === "mixed" ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              综合混排
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        {isRefreshing ? (
          <div className="rounded-xl border border-blue-100 bg-linear-to-r from-blue-50 via-cyan-50 to-sky-50 px-4 py-3">
            <div className="flex items-center gap-2 text-[13px] text-blue-700" style={{ fontWeight: 600 }}>
              <LoaderCircle className="h-4 w-4 animate-spin" />
              正在抓取最新热点并同步选题
            </div>
            <div className="mt-1 text-[12px] text-blue-600/80">
              当前阶段：{refreshStage}，完成后会自动更新列表和选题池。
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/80">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-linear-to-r from-blue-500 via-cyan-500 to-sky-500" />
            </div>
          </div>
        ) : null}
        {refreshWarning ? (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-700">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            {refreshWarning}
          </div>
        ) : null}
        <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 border border-transparent focus-within:border-blue-200 focus-within:bg-white">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            type="text"
            placeholder="搜索热点关键词..."
            className="bg-transparent border-none outline-none text-[13px] w-full placeholder:text-gray-400"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-gray-400 w-12 flex-shrink-0">来源</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {sourceOptions.map(s => (
              <button
                key={s}
                onClick={() => setActiveSource(s)}
                className={`px-3 py-1 rounded-full text-[12px] transition-colors ${
                  activeSource === s ? "bg-blue-600 text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                }`}
                style={{ fontWeight: 500 }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-gray-400 w-12 flex-shrink-0">领域</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {categoryOptions.map(c => (
              <button
                key={c}
                onClick={() => setActiveCategory(c)}
                className={`px-3 py-1 rounded-full text-[12px] transition-colors ${
                  activeCategory === c ? "bg-blue-600 text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                }`}
                style={{ fontWeight: 500 }}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Topics list */}
      {viewMode === "mixed" ? (
        <div className="bg-white rounded-xl border border-gray-100">
          <div className="grid grid-cols-[1fr_100px_90px_90px_140px] px-5 py-2.5 border-b border-gray-100 text-[12px] text-gray-400" style={{ fontWeight: 500 }}>
            <span>热点标题</span>
            <span>来源</span>
            <span>热度</span>
            <span>趋势</span>
            <span className="text-right">操作</span>
          </div>
          <div className={`divide-y divide-gray-50 transition-opacity ${isRefreshing ? "opacity-80" : "opacity-100"}`}>
            {mixedVisibleTopics.length ? mixedVisibleTopics.map((t, i) => (
              <div key={`${t.source}-${t.id}`} className="grid grid-cols-[1fr_100px_90px_90px_140px] items-center px-5 py-3 hover:bg-gray-50/50 transition-colors group">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`w-6 h-6 rounded flex items-center justify-center text-[11px] flex-shrink-0 ${
                    i + (mixedPage - 1) * HOT_TOPICS_MIXED_PAGE_SIZE < 3 ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-500"
                  }`} style={{ fontWeight: 600 }}>{i + 1 + (mixedPage - 1) * HOT_TOPICS_MIXED_PAGE_SIZE}</span>
                  <div className="min-w-0">
                    <button
                      onClick={() => openTopic(t, "topic")}
                      className="text-[13px] truncate group-hover:text-blue-600 transition-colors cursor-pointer text-left w-full"
                      style={{ fontWeight: 500 }}
                    >
                      {t.title}
                    </button>
                    <div className="flex items-center gap-1 mt-1">
                      {t.tags.map(tag => (
                        <span key={tag} className="text-[10px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">{tag}</span>
                      ))}
                      <span className="text-[10px] text-gray-400 ml-1">{t.time}</span>
                    </div>
                  </div>
                </div>
                <span className="text-[12px] text-gray-500 bg-gray-50 px-2 py-0.5 rounded w-fit">{t.source}</span>
                <div className="flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 text-orange-400" />
                  <span className="text-[13px]" style={{ fontWeight: 500 }}>{t.heat.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-14 h-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trendData}>
                        <Area type="monotone" dataKey="v" stroke="#3b82f6" fill="#dbeafe" strokeWidth={1.5} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <span className="text-[11px] text-green-600" style={{ fontWeight: 500 }}>{t.trend}</span>
                </div>
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    onClick={() => openTopic(t, "topic")}
                    className="text-[11px] text-gray-500 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                  >
                    详情
                  </button>
                  <button
                    onClick={() => openTopic(t, "topic")}
                    className="text-[11px] text-gray-500 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50 transition-colors flex items-center gap-0.5"
                  >
                    <Plus className="w-3 h-3" />选题
                  </button>
                  <button
                    onClick={() => openTopic(t, "writing")}
                    className="text-[11px] text-white bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded transition-colors"
                  >
                    生成
                  </button>
                </div>
              </div>
            )) : (
              <div className="px-5 py-12 text-center">
                <div className="text-[14px] text-gray-800" style={{ fontWeight: 600 }}>没有匹配到热点</div>
                <div className="text-[12px] text-gray-400 mt-1">先点击上方“抓取热点”，或调整来源、领域与关键词。</div>
              </div>
            )}
          </div>
          {filteredTopics.length > HOT_TOPICS_MIXED_PAGE_SIZE ? (
            <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3">
              <div className="text-[12px] text-gray-400">
                第 {mixedPage} / {mixedTotalPages} 页 · 共 {filteredTopics.length} 条
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setMixedPage((current) => Math.max(1, current - 1))}
                  disabled={mixedPage === 1}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  上一页
                </button>
                <button
                  onClick={() => setMixedPage((current) => Math.min(mixedTotalPages, current + 1))}
                  disabled={mixedPage === mixedTotalPages}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  下一页
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : groupedTopics.length ? (
        <div className="grid items-stretch gap-4 md:grid-cols-2">
          {groupedTopics.map(({ source, items: sourceItems }) => {
            const totalPages = Math.max(1, Math.ceil(sourceItems.length / HOT_TOPICS_GROUPED_PAGE_SIZE));
            const currentPage = Math.min(groupedPages[source] ?? 1, totalPages);
            const visibleItems = sourceItems.slice(
              (currentPage - 1) * HOT_TOPICS_GROUPED_PAGE_SIZE,
              currentPage * HOT_TOPICS_GROUPED_PAGE_SIZE,
            );

            return (
            <div key={source} className="flex h-full flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
              <div className="flex items-center justify-between border-b border-gray-100 bg-linear-to-r from-slate-50 via-white to-white px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-[12px] text-blue-600" style={{ fontWeight: 600 }}>
                    {source}
                  </span>
                  <span className="text-[12px] text-gray-400">第 {currentPage} / {totalPages} 页 · 共 {sourceItems.length} 条</span>
                </div>
              </div>
              <div className="flex-1 divide-y divide-gray-50">
                {visibleItems.map((topic, index) => (
                  <div key={topic.id} className="min-h-[128px] px-5 py-4 transition-colors hover:bg-slate-50/70">
                    <div className="flex min-h-full items-start gap-3">
                      <span className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[14px] text-[13px] shadow-sm ${
                        index + (currentPage - 1) * HOT_TOPICS_GROUPED_PAGE_SIZE < 3 ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-500"
                      }`} style={{ fontWeight: 600 }}>
                        {index + 1 + (currentPage - 1) * HOT_TOPICS_GROUPED_PAGE_SIZE}
                      </span>
                      <div className="flex min-h-full min-w-0 flex-1 flex-col">
                        <button
                          onClick={() => openTopic(topic, "topic")}
                          className="line-clamp-2 self-start text-left text-[14px] leading-6 text-slate-800 transition-colors hover:text-blue-600"
                          style={{ fontWeight: 500 }}
                        >
                          {topic.title}
                        </button>
                        <div className="mt-3 flex min-h-[32px] flex-wrap items-center gap-x-3 gap-y-2">
                          <div className="flex items-center gap-1 text-[12px] text-slate-500">
                            <Flame className="h-3.5 w-3.5 text-orange-400" />
                            {topic.heat.toLocaleString()}
                          </div>
                          <span className="text-[12px] text-emerald-600" style={{ fontWeight: 600 }}>{topic.trend}</span>
                          <span className="text-[12px] text-gray-400">{topic.time}</span>
                          {topic.tags.slice(0, 2).map((tag) => (
                            <span key={`${topic.id}-${tag}`} className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] text-blue-600">
                              {tag}
                            </span>
                          ))}
                        </div>
                        <div className="mt-auto flex items-center gap-2 pt-3">
                          <button
                            onClick={() => openTopic(topic, "topic")}
                            className="rounded-lg border border-transparent px-2.5 py-1.5 text-[12px] text-gray-500 transition-colors hover:border-blue-100 hover:bg-blue-50 hover:text-blue-600"
                          >
                            详情
                          </button>
                          <button
                            onClick={() => openTopic(topic, "topic")}
                            className="flex items-center gap-0.5 rounded-lg border border-transparent px-2.5 py-1.5 text-[12px] text-gray-500 transition-colors hover:border-blue-100 hover:bg-blue-50 hover:text-blue-600"
                          >
                            <Plus className="h-3 w-3" />选题
                          </button>
                          <button
                            onClick={() => openTopic(topic, "writing")}
                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-[12px] text-white shadow-sm transition-colors hover:bg-blue-700"
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
                <div className="flex items-center justify-between border-t border-gray-100 bg-slate-50/60 px-4 py-3">
                  <span className="text-[12px] text-gray-400">
                    每页 10 条
                  </span>
                  <div className="flex items-center gap-2">
                  <button
                    onClick={() => setGroupedPages((current) => ({
                      ...current,
                      [source]: Math.max(1, currentPage - 1),
                    }))}
                    disabled={currentPage === 1}
                    className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-[12px] text-gray-600 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    上一页
                  </button>
                  <button
                    onClick={() => setGroupedPages((current) => ({
                      ...current,
                      [source]: Math.min(totalPages, currentPage + 1),
                    }))}
                    disabled={currentPage === totalPages}
                    className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-[12px] text-gray-600 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
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
        <div className="rounded-xl border border-gray-100 bg-white px-5 py-12 text-center">
          <div className="text-[14px] text-gray-800" style={{ fontWeight: 600 }}>没有匹配到热点</div>
          <div className="text-[12px] text-gray-400 mt-1">先点击上方“抓取热点”，或调整来源、领域与关键词。</div>
        </div>
      )}
    </div>
  );
}

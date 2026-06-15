"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock,
  Edit3,
  FileText,
  Palette,
  PenTool,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { buildTopicSuggestionFromHotTopic } from "../lib/article-analysis";
import { formatDraftTime } from "../lib/app-data";
import {
  articleDomains,
  domainConfigs,
  type ActiveArticleDomain,
} from "../lib/content-domains";
import { type HotTopicItem } from "../lib/hot-topics";
import { getUserDisplayName } from "../lib/user-display";
import { normalizeWorkbenchTopicCandidates } from "../lib/workbench-topics";
import { useAppStore } from "../providers/app-store";
import { useAuth } from "../providers/auth-provider";

const statusColors: Record<string, string> = {
  待修改: "bg-amber-50 text-amber-600",
  待生成: "bg-primary/10 text-primary",
  审核中: "bg-muted text-muted-foreground",
  已发布: "bg-emerald-50 text-emerald-600",
};

type AIProviderStatus = {
  configured: boolean;
  label: string;
};

type DashboardDataCache = {
  hotTopics: HotTopicItem[];
  aiProviderStatus: AIProviderStatus;
  aiImageProviderStatus: AIProviderStatus;
  cachedAt: number;
};

const DASHBOARD_DATA_CACHE_TTL_MS = 5 * 60 * 1000;
const uncheckedProviderStatus: AIProviderStatus = { configured: false, label: "未检查" };
let dashboardDataCache: DashboardDataCache | null = null;

function readDashboardDataCache() {
  if (!dashboardDataCache) return null;
  if (Date.now() - dashboardDataCache.cachedAt > DASHBOARD_DATA_CACHE_TTL_MS) {
    dashboardDataCache = null;
    return null;
  }

  return dashboardDataCache;
}

function writeDashboardDataCache(payload: Omit<DashboardDataCache, "cachedAt">) {
  dashboardDataCache = {
    ...payload,
    cachedAt: Date.now(),
  };
}

function clampScore(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function parseTrendScore(trend: string) {
  const parsed = Number.parseInt(trend.replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(parsed) ? clampScore(parsed, 0, 100) : 0;
}

function getCurrentGreeting(date = new Date()) {
  const hourPart = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Shanghai",
  })
    .formatToParts(date)
    .find((part) => part.type === "hour")?.value;
  const hour = Number.parseInt(hourPart ?? "", 10);

  if (!Number.isFinite(hour)) return "你好";
  if (hour < 5) return "凌晨好";
  if (hour < 11) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

function getFreshnessScore(topic: Pick<HotTopicItem, "fetchedAt" | "sourcePublishedAt">) {
  const timestamp = new Date(topic.sourcePublishedAt ?? topic.fetchedAt).getTime();
  if (Number.isNaN(timestamp)) return 50;

  const ageHours = Math.max(0, (Date.now() - timestamp) / (1000 * 60 * 60));
  if (ageHours <= 6) return 100;
  if (ageHours <= 24) return 82;
  if (ageHours <= 72) return 64;
  return 48;
}

function scoreHotTopicsBySourceRank<T extends Pick<HotTopicItem, "source" | "heat" | "trend" | "fetchedAt" | "sourcePublishedAt">>(topics: T[]) {
  const sourceGroups = new Map<string, T[]>();

  topics.forEach((topic) => {
    const group = sourceGroups.get(topic.source) ?? [];
    group.push(topic);
    sourceGroups.set(topic.source, group);
  });

  const sourceRankScores = new Map<T, number>();

  sourceGroups.forEach((group) => {
    [...group]
      .sort((left, right) => right.heat - left.heat)
      .forEach((topic, index, sortedGroup) => {
        const percentile = sortedGroup.length <= 1 ? 1 : 1 - index / (sortedGroup.length - 1);
        sourceRankScores.set(topic, 60 + percentile * 35);
      });
  });

  return topics
    .map((topic) => {
      const sourceRankScore = sourceRankScores.get(topic) ?? 60;
      const trendScore = parseTrendScore(topic.trend);
      const freshnessScore = getFreshnessScore(topic);
      const score = Math.round(sourceRankScore * 0.74 + trendScore * 0.16 + freshnessScore * 0.1);

      return {
        topic,
        score: clampScore(score, 58, 96),
      };
    })
    .sort((left, right) => right.score - left.score || right.topic.heat - left.topic.heat);
}

export function Dashboard({ initialHotTopics = [] }: { initialHotTopics?: HotTopicItem[] }) {
  const router = useRouter();
  const { user } = useAuth();
  const { drafts, topics, selectTopic, upsertTopic } = useAppStore();
  const cachedDashboardData = readDashboardDataCache();
  const initialDashboardHotTopics = initialHotTopics.length ? initialHotTopics : cachedDashboardData?.hotTopics ?? [];
  const [dashboardHotTopics, setDashboardHotTopics] = useState<HotTopicItem[]>(initialDashboardHotTopics);
  const [activeHotDomain, setActiveHotDomain] = useState<ActiveArticleDomain | null>(null);
  const [aiProviderStatus, setAIProviderStatus] = useState<AIProviderStatus>(cachedDashboardData?.aiProviderStatus ?? uncheckedProviderStatus);
  const [aiImageProviderStatus, setAIImageProviderStatus] = useState<AIProviderStatus>(cachedDashboardData?.aiImageProviderStatus ?? uncheckedProviderStatus);
  const [currentGreeting, setCurrentGreeting] = useState("你好");
  const [isHotTopicsLoading, setIsHotTopicsLoading] = useState(!initialDashboardHotTopics.length);
  const displayName = getUserDisplayName(user, "用户");

  useEffect(() => {
    const syncGreeting = () => setCurrentGreeting(getCurrentGreeting());

    syncGreeting();
    const timer = window.setInterval(syncGreeting, 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const loadDashboardData = async () => {
      const cachedData = readDashboardDataCache();
      if (cachedData) {
        setDashboardHotTopics(cachedData.hotTopics);
        setAIProviderStatus(cachedData.aiProviderStatus);
        setAIImageProviderStatus(cachedData.aiImageProviderStatus);
        setIsHotTopicsLoading(false);
        return;
      }

      setIsHotTopicsLoading(!initialHotTopics.length);

      let nextHotTopics = initialHotTopics;
      let nextAIProviderStatus = uncheckedProviderStatus;
      let nextAIImageProviderStatus = uncheckedProviderStatus;

      try {
        const hotTopicsPromise = initialHotTopics.length
          ? Promise.resolve(null)
          : fetch("/api/hot-topics?limit=360", { cache: "no-store" });
        const aiProviderPromise = fetch("/api/ai/provider", { cache: "no-store" });
        const aiImageProviderPromise = fetch("/api/ai/image-provider", { cache: "no-store" });

        const [hotTopicsResponse, aiProviderResponse, aiImageProviderResponse] = await Promise.all([
          hotTopicsPromise,
          aiProviderPromise,
          aiImageProviderPromise,
        ]);

        if (hotTopicsResponse) {
          const payload = await hotTopicsResponse.json().catch(() => null);
          if (hotTopicsResponse.ok && Array.isArray(payload?.items) && payload.items.length) {
            nextHotTopics = payload.items as HotTopicItem[];
            setDashboardHotTopics(nextHotTopics);
          }
        }

        const providerPayload = await aiProviderResponse.json().catch(() => null);
        const activeProfile = providerPayload?.config?.activeProfile;
        nextAIProviderStatus = {
          configured: Boolean(activeProfile?.hasApiKey),
          label: activeProfile?.name || "未配置写作模型",
        };
        setAIProviderStatus(nextAIProviderStatus);

        const imageProviderPayload = await aiImageProviderResponse.json().catch(() => null);
        const activeImageProfile = imageProviderPayload?.config?.activeProfile;
        nextAIImageProviderStatus = {
          configured: Boolean(activeImageProfile?.hasApiKey),
          label: activeImageProfile?.name || activeImageProfile?.model || "未配置图片模型",
        };
        setAIImageProviderStatus(nextAIImageProviderStatus);

        writeDashboardDataCache({
          hotTopics: nextHotTopics,
          aiProviderStatus: nextAIProviderStatus,
          aiImageProviderStatus: nextAIImageProviderStatus,
        });
      } catch (error) {
        console.error("Failed to load dashboard data:", error);
      } finally {
        setIsHotTopicsLoading(false);
      }
    };

    void loadDashboardData();
  }, [initialHotTopics.length]);

  const fallbackHotTopics = useMemo<HotTopicItem[]>(
    () =>
      topics.slice(0, 4).map((topic, index) => ({
        id: `topic-fallback-${topic.id}`,
        title: topic.title,
        source: topic.source.split(" · ")[0] ?? topic.source,
        sourceType: "derived",
        domain: topic.domain,
        heat: Math.max(6000 - index * 350, 4200),
        trend: `+${Math.max(18, topic.fit - 52)}%`,
        time: "刚刚",
        tags: topic.tags.slice(0, 2),
        summary: topic.reason,
        fetchedAt: new Date().toISOString(),
      })),
    [topics],
  );
  const resolvedHotTopics = dashboardHotTopics.length ? dashboardHotTopics : fallbackHotTopics;
  const hotTopics = useMemo(
    () => normalizeWorkbenchTopicCandidates(resolvedHotTopics).map((topic) => ({ ...topic, tags: topic.tags.slice(0, 2) })),
    [resolvedHotTopics],
  );
  const hotTopicsByDomain = useMemo(() => {
    return articleDomains
      .map((domain) => {
        const domainItems = scoreHotTopicsBySourceRank(
          hotTopics.filter((topic) => topic.domain === domain),
        );

        return {
          domain,
          total: domainItems.length,
          items: domainItems.slice(0, 6),
        };
      })
      .filter((section) => section.items.length);
  }, [hotTopics]);
  const activeHotDomainSection = useMemo(() => {
    if (!hotTopicsByDomain.length) return null;
    if (activeHotDomain) {
      const matched = hotTopicsByDomain.find((section) => section.domain === activeHotDomain);
      if (matched) return matched;
    }
    return hotTopicsByDomain.find((section) => section.domain === "AI") ?? hotTopicsByDomain[0];
  }, [activeHotDomain, hotTopicsByDomain]);

  const recentDrafts = useMemo(
    () => [...drafts].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 8),
    [drafts],
  );
  const pendingDrafts = drafts.filter((draft) => draft.status === "待生成" || !draft.body.trim()).length;
  const editableDrafts = drafts.filter((draft) => draft.status === "待修改" || draft.status === "审核中").length;
  const formatReadyDrafts = drafts.filter((draft) => draft.body.trim() && draft.status !== "已发布").length;
  const publishedCount = drafts.filter((draft) => draft.status === "已发布").length;
  const taskTotal = Math.max(pendingDrafts + editableDrafts + formatReadyDrafts + publishedCount, 1);
  const taskDone = Math.min(publishedCount, taskTotal);
  const taskProgress = Math.round((taskDone / taskTotal) * 100);
  const listedTopicRecommendations = useMemo(() => {
    return (activeHotDomainSection?.items ?? []).slice(0, 5).map(({ topic, score }, index) => ({
      topic,
      recommendation: {
        topicId: topic.id,
        score,
        angle: domainConfigs[topic.domain].writingFocus[index % domainConfigs[topic.domain].writingFocus.length] ?? "从读者最关心的问题切入",
        risks: [],
      },
    }));
  }, [activeHotDomainSection]);

  const draftWorkflowGroups = useMemo(() => {
    const groups = [
      {
        key: "editing",
        title: "正在编辑",
        description: "需要继续打磨",
        items: recentDrafts.filter((draft) => draft.status === "待修改" || draft.status === "审核中").slice(0, 3),
        actionLabel: "继续编辑",
      },
      {
        key: "completed",
        title: "已完成",
        description: "可复用为新稿",
        items: recentDrafts.filter((draft) => draft.status === "已发布").slice(0, 1),
        actionLabel: "查看排版",
      },
    ];

    return groups.filter((group) => group.items.length);
  }, [recentDrafts]);

  useEffect(() => {
    if (!hotTopicsByDomain.length) {
      if (activeHotDomain !== null) {
        setActiveHotDomain(null);
      }
      return;
    }

    if (!activeHotDomain || !hotTopicsByDomain.some((section) => section.domain === activeHotDomain)) {
      setActiveHotDomain(hotTopicsByDomain.find((section) => section.domain === "AI")?.domain ?? hotTopicsByDomain[0].domain);
    }
  }, [activeHotDomain, hotTopicsByDomain]);

  const openHotTopicAsTopic = (topic: HotTopicItem & { domain: ActiveArticleDomain }, autogen = false) => {
    const nextTopic = upsertTopic(buildTopicSuggestionFromHotTopic(topic));
    selectTopic(nextTopic.id);
    router.push(autogen ? `/writing?topicId=${nextTopic.id}&autogen=full` : `/topic-center?topicId=${nextTopic.id}`);
  };
  return (
    <div className="lens-page space-y-4">
      <section className="lens-hero p-5">
        <div className="relative z-10 min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-[12px] text-primary font-extrabold">
            <Sparkles className="h-3.5 w-3.5" />
            AI 精选工作流
          </div>
          <h1 className="mt-3 text-[30px] leading-tight tracking-tight text-foreground md:text-[38px] font-black">
            {currentGreeting}，{displayName}
            <span className="ml-2 inline-block origin-bottom-right animate-pulse">👋</span>
          </h1>
          <p className="mt-3 max-w-[660px] text-[14px] leading-7 text-muted-foreground">
            AI 正在为你发现高价值内容机会，统一从热点、选题、草稿到排版发布的创作节奏。
          </p>

        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="rounded-[22px] border border-border bg-card/90 p-5 shadow-[0_12px_36px_rgba(31,41,86,0.05)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <h2 className="text-[15px] text-foreground font-extrabold">今日任务</h2>
              </div>
              <p className="mt-1 text-[12px] text-muted-foreground">完成 {taskDone} / {taskTotal}，优先推进可发布内容。</p>
            </div>
            <Link href="/drafts" className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-primary">
              草稿箱 <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${taskProgress}%` }} />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "待生成", value: pendingDrafts, hint: "空正文或未完成", icon: PenTool, color: "text-primary", bg: "bg-primary/10", href: "/drafts" },
              { label: "待编辑", value: editableDrafts, hint: "需要继续打磨", icon: Edit3, color: "text-amber-600", bg: "bg-amber-50", href: "/drafts" },
              { label: "可排版", value: formatReadyDrafts, hint: "正文已存在", icon: Palette, color: "text-muted-foreground", bg: "bg-muted", href: "/drafts" },
              { label: "已发布", value: publishedCount, hint: "累计发布", icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50", href: "/drafts" },
            ].map((item) => (
              <button
                key={item.label}
                onClick={() => router.push(item.href)}
                className="rounded-2xl border border-border/70 bg-background p-3 text-left transition-all hover:border-primary/30 hover:bg-card hover:shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${item.bg}`}>
                    <item.icon className={`h-4.5 w-4.5 ${item.color}`} />
                  </div>
                  <div className="text-[22px] text-foreground font-extrabold">{item.value}</div>
                </div>
                <div className="mt-2 text-[12px] text-foreground font-bold">{item.label}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{item.hint}</div>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-[22px] border border-border bg-card/75 p-5">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-primary" />
            <h2 className="text-[15px] text-foreground font-extrabold">运行状态</h2>
          </div>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between rounded-2xl bg-background px-3 py-2.5">
              <div>
                <div className="text-[12px] text-foreground font-bold">写作模型</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{aiProviderStatus.label}</div>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[11px] ${aiProviderStatus.configured ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"}`}>
                {aiProviderStatus.configured ? "可用" : "待配置"}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-background px-3 py-2.5">
              <div>
                <div className="text-[12px] text-foreground font-bold">图片模型</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{aiImageProviderStatus.label}</div>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[11px] ${aiImageProviderStatus.configured ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"}`}>
                {aiImageProviderStatus.configured ? "可用" : "待配置"}
              </span>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="rounded-[22px] border border-border bg-card/90 shadow-[0_12px_36px_rgba(31,41,86,0.05)]">
          <div className="flex items-center justify-between border-b border-border/70 px-5 py-3.5">
	            <div className="flex items-center gap-2">
	              <Bot className="h-4 w-4 text-primary" />
	              <h2 className="text-[14px] text-foreground font-extrabold">推荐选题</h2>
	            </div>
            <Link href="/hot-topics" className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-primary">
              查看全部 <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="p-4">
            {isHotTopicsLoading ? (
              <div className="space-y-3">
                <div className="flex gap-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-8 w-16 animate-pulse rounded-full bg-muted" />
                  ))}
                </div>
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />
                  ))}
                </div>
              </div>
            ) : activeHotDomainSection ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {hotTopicsByDomain.map(({ domain }) => (
                    <button
                      key={domain}
                      onClick={() => setActiveHotDomain(domain)}
                      className={`rounded-full px-3 py-1.5 text-[12px] transition-colors font-bold ${
                        activeHotDomainSection.domain === domain
                          ? "bg-primary text-white"
                          : "bg-accent text-muted-foreground hover:bg-primary/10"
                      }`}
                    >
                      {domainConfigs[domain].icon} {domain}
                    </button>
                  ))}
                </div>

                <div className="overflow-hidden rounded-2xl border border-border/70">
                  {listedTopicRecommendations.length ? (
                    <div className="divide-y divide-border/70">
                      {listedTopicRecommendations.map(({ topic, recommendation }, index) => (
                        <div key={topic.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3 transition-colors hover:bg-background">
                          <button onClick={() => openHotTopicAsTopic(topic)} className="group flex min-w-0 items-start gap-3 text-left">
                            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted text-[12px] text-muted-foreground font-extrabold">
                              {index + 1}
	                            </span>
	                            <div className="min-w-0 flex-1">
	                              <div className="line-clamp-2 text-[13.5px] leading-5 text-foreground group-hover:text-primary font-bold">{topic.title}</div>
	                              <div className="mt-1 text-[11px] leading-5 text-muted-foreground font-bold">
	                                <span>切入：</span>{recommendation.angle}
	                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                <span className="rounded bg-slate-950 dark:bg-white/10 px-1.5 py-0.5 text-[11px] text-white font-bold">推荐 {recommendation.score}</span>
                                {topic.tags.slice(0, 2).map((tag) => (
                                  <span key={tag} className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary font-bold">{tag}</span>
                                ))}
                              </div>
                            </div>
                          </button>

                          <div className="flex items-center gap-2">
                            <div className="hidden text-right sm:block">
                              <div className="text-[12px] text-foreground/75 font-bold">{topic.heat.toLocaleString()}</div>
                              <div className="flex items-center justify-end gap-0.5 text-[11px] text-green-600 font-bold">
                                <TrendingUp className="h-3 w-3" /> {topic.trend}
                              </div>
                            </div>
                            <button onClick={() => openHotTopicAsTopic(topic)} className="rounded-xl border border-border px-3 py-1.5 text-[12px] text-muted-foreground hover:bg-card font-bold">
                              选题
                            </button>
                            <button onClick={() => openHotTopicAsTopic(topic, true)} className="rounded-xl bg-primary px-3 py-1.5 text-[12px] text-white hover:bg-primary/90 font-extrabold">
                              一键成文
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="px-5 py-10 text-center">
                      <div className="text-[14px] text-foreground font-bold">暂无推荐选题</div>
                      <div className="mt-1 text-[12px] text-muted-foreground">去热点中心抓取或切换领域后，会按来源归一分展示每个领域前 5 条。</div>
                      <button onClick={() => router.push("/hot-topics")} className="mt-4 rounded-xl bg-primary px-4 py-2 text-[12px] text-white hover:bg-primary/90 font-extrabold">
                        去抓热点
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="px-5 py-12 text-center">
                <div className="text-[14px] text-foreground font-bold">还没有热点</div>
                <div className="mt-1 text-[12px] text-muted-foreground">先去热点中心抓取一次实时热点。</div>
                <button onClick={() => router.push("/hot-topics")} className="mt-4 rounded-xl bg-primary px-4 py-2 text-[12px] text-white hover:bg-primary/90 font-extrabold">
                  去抓热点
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-[22px] border border-border bg-card/90 shadow-[0_12px_36px_rgba(31,41,86,0.05)]">
          <div className="flex items-center justify-between border-b border-border/70 px-5 py-3.5">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <h2 className="text-[14px] text-foreground font-extrabold">草稿工作流</h2>
            </div>
            <Link href="/drafts" className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-primary">
              全部 <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-border/70">
            {draftWorkflowGroups.length ? draftWorkflowGroups.map((group) => (
              <div key={group.key} className="px-5 py-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="text-[13px] text-foreground font-extrabold">{group.title}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{group.description}</div>
                  </div>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{group.items.length}</span>
                </div>
                <div className="space-y-3">
                  {group.items.map((draft) => {
                    const targetHref = group.key === "formatting" || group.key === "completed"
                      ? `/format-editor?draftId=${draft.id}`
                      : `/writing?draftId=${draft.id}`;

                    return (
                      <div key={`${group.key}-${draft.id}`} className="rounded-2xl bg-background p-3">
                        <button onClick={() => router.push(targetHref)} className="block w-full text-left">
                          <div className="truncate text-[13px] text-foreground font-bold">{draft.title}</div>
                          <div className="mt-1 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                            <span className={`rounded-full px-2 py-0.5 ${statusColors[draft.status]}`}>{draft.status}</span>
                            <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{formatDraftTime(draft.updatedAt).split(" ")[1]}</span>
                          </div>
                        </button>
                        <button onClick={() => router.push(targetHref)} className="mt-3 w-full rounded-xl border border-border bg-card px-3 py-1.5 text-[12px] text-muted-foreground hover:bg-accent font-bold">
                          {group.actionLabel}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )) : (
              <div className="px-5 py-12 text-center">
                <Sparkles className="mx-auto h-8 w-8 text-muted-foreground/40" />
                <div className="mt-3 text-[14px] text-foreground font-bold">还没有草稿</div>
                <div className="mt-1 text-[12px] text-muted-foreground">从热点里选一条，或手动开始写。</div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

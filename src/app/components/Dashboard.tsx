"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { normalizeWorkbenchTopicCandidates } from "../lib/workbench-topics";
import { useAppStore } from "../providers/app-store";

const statusColors: Record<string, string> = {
  待修改: "bg-amber-50 text-amber-600",
  待生成: "bg-[#fff0e6] text-[#d65f2b]",
  审核中: "bg-[#f1eadf] text-[#6f665d]",
  已发布: "bg-emerald-50 text-emerald-600",
};

type AIProviderStatus = {
  configured: boolean;
  label: string;
};

function clampScore(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function parseTrendScore(trend: string) {
  const parsed = Number.parseInt(trend.replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(parsed) ? clampScore(parsed, 0, 100) : 0;
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
  const { drafts, topics, selectTopic, upsertTopic } = useAppStore();
  const [dashboardHotTopics, setDashboardHotTopics] = useState<HotTopicItem[]>(initialHotTopics);
  const [activeHotDomain, setActiveHotDomain] = useState<ActiveArticleDomain | null>(null);
  const [aiProviderStatus, setAIProviderStatus] = useState<AIProviderStatus>({ configured: false, label: "未检查" });
  const [aiImageProviderStatus, setAIImageProviderStatus] = useState<AIProviderStatus>({ configured: false, label: "未检查" });
  const autoRefreshStartedRef = useRef(false);

  useEffect(() => {
    const loadDashboardData = async () => {
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
            setDashboardHotTopics(payload.items as HotTopicItem[]);
          }
        }

        const providerPayload = await aiProviderResponse.json().catch(() => null);
        const activeProfile = providerPayload?.config?.activeProfile;
        setAIProviderStatus({
          configured: Boolean(activeProfile?.hasApiKey),
          label: activeProfile?.name || "未配置写作模型",
        });

        const imageProviderPayload = await aiImageProviderResponse.json().catch(() => null);
        const activeImageProfile = imageProviderPayload?.config?.activeProfile;
        setAIImageProviderStatus({
          configured: Boolean(activeImageProfile?.hasApiKey),
          label: activeImageProfile?.name || activeImageProfile?.model || "未配置图片模型",
        });
      } catch (error) {
        console.error("Failed to load dashboard data:", error);
      }
    };

    void loadDashboardData();
  }, [initialHotTopics.length]);

  useEffect(() => {
    if (autoRefreshStartedRef.current) return;
    autoRefreshStartedRef.current = true;

    const refreshHotTopicsInBackground = async () => {
      try {
        const response = await fetch("/api/hot-topics/refresh", { method: "POST" });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.message ?? `Failed to refresh hot topics: ${response.status}`);
        }

        if (Array.isArray(payload?.items) && payload.items.length) {
          setDashboardHotTopics(payload.items as HotTopicItem[]);
        } else {
          const latest = await fetch("/api/hot-topics?limit=360", { cache: "no-store" });
          const latestPayload = await latest.json().catch(() => null);
          if (latest.ok && Array.isArray(latestPayload?.items) && latestPayload.items.length) {
            setDashboardHotTopics(latestPayload.items as HotTopicItem[]);
          }
        }
      } catch (error) {
        console.error("Failed to auto refresh dashboard hot topics:", error);
      }
    };

    void refreshHotTopicsInBackground();
  }, []);

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
        items: recentDrafts.filter((draft) => draft.status === "待修改" || draft.status === "审核中").slice(0, 2),
        actionLabel: "继续编辑",
      },
      {
        key: "formatting",
        title: "待排版",
        description: "正文已准备好",
        items: recentDrafts.filter((draft) => draft.body.trim() && draft.status !== "已发布").slice(0, 2),
        actionLabel: "进入排版",
      },
      {
        key: "completed",
        title: "已完成",
        description: "可复用为新稿",
        items: recentDrafts.filter((draft) => draft.status === "已发布").slice(0, 2),
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
    <div className="mx-auto max-w-[1200px] space-y-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="rounded-[22px] border border-[#eadfd4] bg-white/86 p-5 shadow-[0_12px_36px_rgba(85,57,34,0.05)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-[#d65f2b]" />
                <h2 className="text-[15px] text-[#181715]" style={{ fontWeight: 850 }}>今日任务</h2>
              </div>
              <p className="mt-1 text-[12px] text-[#8c8178]">完成 {taskDone} / {taskTotal}，优先推进可发布内容。</p>
            </div>
            <Link href="/drafts" className="flex items-center gap-1 text-[12px] text-[#8c8178] hover:text-[#d65f2b]">
              草稿箱 <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#f1eadf]">
            <div className="h-full rounded-full bg-[#d65f2b]" style={{ width: `${taskProgress}%` }} />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "待生成", value: pendingDrafts, hint: "空正文或未完成", icon: PenTool, color: "text-[#d65f2b]", bg: "bg-[#fff0e6]", href: "/drafts" },
              { label: "待编辑", value: editableDrafts, hint: "需要继续打磨", icon: Edit3, color: "text-amber-600", bg: "bg-amber-50", href: "/drafts" },
              { label: "可排版", value: formatReadyDrafts, hint: "正文已存在", icon: Palette, color: "text-[#6f665d]", bg: "bg-[#f1eadf]", href: "/drafts" },
              { label: "已发布", value: publishedCount, hint: "累计发布", icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50", href: "/drafts" },
            ].map((item) => (
              <button
                key={item.label}
                onClick={() => router.push(item.href)}
                className="rounded-2xl border border-[#f0e5da] bg-[#fffaf5] p-3 text-left transition-all hover:border-[#d65f2b]/30 hover:bg-white hover:shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${item.bg}`}>
                    <item.icon className={`h-4.5 w-4.5 ${item.color}`} />
                  </div>
                  <div className="text-[22px] text-[#181715]" style={{ fontWeight: 850 }}>{item.value}</div>
                </div>
                <div className="mt-2 text-[12px] text-[#181715]" style={{ fontWeight: 750 }}>{item.label}</div>
                <div className="mt-0.5 text-[11px] text-[#8c8178]">{item.hint}</div>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-[22px] border border-[#eadfd4] bg-white/72 p-5">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-[#d65f2b]" />
            <h2 className="text-[15px] text-[#181715]" style={{ fontWeight: 850 }}>运行状态</h2>
          </div>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between rounded-2xl bg-[#fffaf5] px-3 py-2.5">
              <div>
                <div className="text-[12px] text-[#181715]" style={{ fontWeight: 750 }}>写作模型</div>
                <div className="mt-0.5 text-[11px] text-[#8c8178]">{aiProviderStatus.label}</div>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[11px] ${aiProviderStatus.configured ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"}`}>
                {aiProviderStatus.configured ? "可用" : "待配置"}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-[#fffaf5] px-3 py-2.5">
              <div>
                <div className="text-[12px] text-[#181715]" style={{ fontWeight: 750 }}>图片模型</div>
                <div className="mt-0.5 text-[11px] text-[#8c8178]">{aiImageProviderStatus.label}</div>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[11px] ${aiImageProviderStatus.configured ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"}`}>
                {aiImageProviderStatus.configured ? "可用" : "待配置"}
              </span>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="rounded-[22px] border border-[#eadfd4] bg-white/86 shadow-[0_12px_36px_rgba(85,57,34,0.05)]">
          <div className="flex items-center justify-between border-b border-[#f0e5da] px-5 py-3.5">
	            <div className="flex items-center gap-2">
	              <Bot className="h-4 w-4 text-[#d65f2b]" />
	              <h2 className="text-[14px] text-[#181715]" style={{ fontWeight: 850 }}>推荐选题</h2>
	            </div>
            <Link href="/hot-topics" className="flex items-center gap-1 text-[12px] text-[#8c8178] hover:text-[#d65f2b]">
              查看全部 <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="p-4">
            {activeHotDomainSection ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {hotTopicsByDomain.map(({ domain }) => (
                    <button
                      key={domain}
                      onClick={() => setActiveHotDomain(domain)}
                      className={`rounded-full px-3 py-1.5 text-[12px] transition-colors ${
                        activeHotDomainSection.domain === domain
                          ? "bg-[#d65f2b] text-white"
                          : "bg-[#fff7ef] text-[#6f665d] hover:bg-[#fff0e6]"
                      }`}
                      style={{ fontWeight: 700 }}
                    >
                      {domainConfigs[domain].icon} {domain}
                    </button>
                  ))}
                </div>

                <div className="overflow-hidden rounded-2xl border border-[#f0e5da]">
                  {listedTopicRecommendations.length ? (
                    <div className="divide-y divide-[#f0e5da]">
                      {listedTopicRecommendations.map(({ topic, recommendation }, index) => (
                        <div key={topic.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3 transition-colors hover:bg-[#fffaf5]">
                          <button onClick={() => openHotTopicAsTopic(topic)} className="group flex min-w-0 items-start gap-3 text-left">
                            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[#f1eadf] text-[12px] text-[#8c8178]" style={{ fontWeight: 800 }}>
                              {index + 1}
	                            </span>
	                            <div className="min-w-0 flex-1">
	                              <div className="line-clamp-2 text-[13.5px] leading-5 text-[#181715] group-hover:text-[#d65f2b]" style={{ fontWeight: 750 }}>{topic.title}</div>
	                              <div className="mt-1 text-[11px] leading-5 text-[#8c8178]">
	                                <span className="text-[#181715]" style={{ fontWeight: 750 }}>切入：</span>{recommendation.angle}
	                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                <span className="rounded bg-[#181715] px-1.5 py-0.5 text-[11px] text-white">推荐 {recommendation.score}</span>
                                <span className="rounded bg-[#fff7ef] px-1.5 py-0.5 text-[11px] text-[#8c8178]">{topic.source}</span>
                                {topic.tags.map((tag) => (
                                  <span key={tag} className="rounded bg-[#fff0e6] px-1.5 py-0.5 text-[11px] text-[#d65f2b]">{tag}</span>
                                ))}
                              </div>
                            </div>
                          </button>

                          <div className="flex items-center gap-2">
                            <div className="hidden text-right sm:block">
                              <div className="text-[12px] text-[#5d544c]" style={{ fontWeight: 750 }}>{topic.heat.toLocaleString()}</div>
                              <div className="flex items-center justify-end gap-0.5 text-[11px] text-green-600">
                                <TrendingUp className="h-3 w-3" /> {topic.trend}
                              </div>
                            </div>
                            <button onClick={() => openHotTopicAsTopic(topic)} className="rounded-xl border border-[#eadfd4] px-3 py-1.5 text-[12px] text-[#6f665d] hover:bg-white" style={{ fontWeight: 750 }}>
                              选题
                            </button>
                            <button onClick={() => openHotTopicAsTopic(topic, true)} className="rounded-xl bg-[#d65f2b] px-3 py-1.5 text-[12px] text-white hover:bg-[#bf4513]" style={{ fontWeight: 850 }}>
                              一键成文
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="px-5 py-10 text-center">
                      <div className="text-[14px] text-[#181715]" style={{ fontWeight: 750 }}>暂无推荐选题</div>
                      <div className="mt-1 text-[12px] text-[#8c8178]">去热点中心抓取或切换领域后，会按来源归一分展示每个领域前 5 条。</div>
                      <button onClick={() => router.push("/hot-topics")} className="mt-4 rounded-xl bg-[#d65f2b] px-4 py-2 text-[12px] text-white hover:bg-[#bf4513]" style={{ fontWeight: 850 }}>
                        去抓热点
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="px-5 py-12 text-center">
                <div className="text-[14px] text-[#181715]" style={{ fontWeight: 750 }}>还没有热点</div>
                <div className="mt-1 text-[12px] text-[#8c8178]">先去热点中心抓取一次实时热点。</div>
                <button onClick={() => router.push("/hot-topics")} className="mt-4 rounded-xl bg-[#d65f2b] px-4 py-2 text-[12px] text-white hover:bg-[#bf4513]" style={{ fontWeight: 850 }}>
                  去抓热点
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-[22px] border border-[#eadfd4] bg-white/86 shadow-[0_12px_36px_rgba(85,57,34,0.05)]">
          <div className="flex items-center justify-between border-b border-[#f0e5da] px-5 py-3.5">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-[#d65f2b]" />
              <h2 className="text-[14px] text-[#181715]" style={{ fontWeight: 850 }}>草稿工作流</h2>
            </div>
            <Link href="/drafts" className="flex items-center gap-1 text-[12px] text-[#8c8178] hover:text-[#d65f2b]">
              全部 <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-[#f0e5da]">
            {draftWorkflowGroups.length ? draftWorkflowGroups.map((group) => (
              <div key={group.key} className="px-5 py-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="text-[13px] text-[#181715]" style={{ fontWeight: 850 }}>{group.title}</div>
                    <div className="mt-0.5 text-[11px] text-[#8c8178]">{group.description}</div>
                  </div>
                  <span className="rounded-full bg-[#fff0e6] px-2 py-0.5 text-[11px] text-[#d65f2b]">{group.items.length}</span>
                </div>
                <div className="space-y-3">
                  {group.items.map((draft) => {
                    const targetHref = group.key === "formatting" || group.key === "completed"
                      ? `/format-editor?draftId=${draft.id}`
                      : `/writing?draftId=${draft.id}`;

                    return (
                      <div key={`${group.key}-${draft.id}`} className="rounded-2xl bg-[#fffaf5] p-3">
                        <button onClick={() => router.push(targetHref)} className="block w-full text-left">
                          <div className="truncate text-[13px] text-[#181715]" style={{ fontWeight: 750 }}>{draft.title}</div>
                          <div className="mt-1 flex items-center justify-between gap-3 text-[11px] text-[#8c8178]">
                            <span className={`rounded-full px-2 py-0.5 ${statusColors[draft.status]}`}>{draft.status}</span>
                            <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{formatDraftTime(draft.updatedAt).split(" ")[1]}</span>
                          </div>
                        </button>
                        <button onClick={() => router.push(targetHref)} className="mt-3 w-full rounded-xl border border-[#eadfd4] bg-white px-3 py-1.5 text-[12px] text-[#6f665d] hover:bg-[#fff7ef]" style={{ fontWeight: 750 }}>
                          {group.actionLabel}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )) : (
              <div className="px-5 py-12 text-center">
                <Sparkles className="mx-auto h-8 w-8 text-[#d8cfc5]" />
                <div className="mt-3 text-[14px] text-[#181715]" style={{ fontWeight: 750 }}>还没有草稿</div>
                <div className="mt-1 text-[12px] text-[#8c8178]">从热点里选一条，或手动开始写。</div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

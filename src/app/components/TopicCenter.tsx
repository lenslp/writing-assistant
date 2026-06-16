"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  Edit3,
  Flame,
  LoaderCircle,
  PenLine,
  Search,
  Sparkles,
  WandSparkles,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { useAppStore } from "../providers/app-store";
import { buildTopicSuggestionFromHotTopic } from "../lib/article-analysis";
import { getClientErrorMessage } from "../lib/client-error";
import { articleDomains, domainConfigs, resolveArticleDomain, type ActiveArticleDomain } from "../lib/content-domains";
import type { TopicSuggestion } from "../lib/app-data";
import type { HotTopicItem } from "../lib/hot-topics";
import type { DomainTopicRecommendationGroup, TopicRecommendationItem } from "../lib/topic-recommendation";

const heatColors: Record<string, string> = {
  极高: "bg-red-50 text-red-600",
  高: "bg-orange-50 text-orange-600",
  中高: "bg-amber-50 text-amber-600",
  中: "bg-primary/10 text-primary",
};

const statusStyles = {
  generating: "bg-primary/10 text-primary",
  draft: "bg-amber-50 text-amber-600",
  published: "bg-green-50 text-green-600",
  ready: "bg-muted text-muted-foreground",
} as const;

const heatRank: Record<string, number> = {
  极高: 4,
  高: 3,
  中高: 2,
  中: 1,
};

type AISelectionState = {
  loading: boolean;
  groups: DomainTopicRecommendationGroup[];
  topics: TopicSuggestion[];
  source: "ai" | "fallback" | null;
  message: string;
};

export function TopicCenter() {
  const [activeDomain, setActiveDomain] = useState<ActiveArticleDomain>(articleDomains[0]);
  const [keyword, setKeyword] = useState("");
  const [aiSelectionEnabled, setAISelectionEnabled] = useState(false);
  const [notice, setNotice] = useState("");
  const [aiSelection, setAISelection] = useState<AISelectionState>({
    loading: false,
    groups: [],
    topics: [],
    source: null,
    message: "",
  });
  const router = useRouter();
  const searchParams = useSearchParams();
  const { topics, drafts, selectedTopic, writingTasks, selectTopic, upsertTopic, deleteTopic, createManualDraft } = useAppStore();
  const highlightedTopicId = searchParams.get("topicId") ?? selectedTopic?.id ?? null;

  useEffect(() => {
    if (!highlightedTopicId) return;
    const matchedTopic = topics.find((topic) => topic.id === highlightedTopicId);
    if (!matchedTopic) return;

    selectTopic(matchedTopic.id);
    const normalizedDomain = resolveArticleDomain(matchedTopic.domain);
    if (articleDomains.includes(normalizedDomain)) {
      setActiveDomain(normalizedDomain);
    }
  }, [highlightedTopicId, selectTopic, topics]);

  const topicStatsByDomain = useMemo(() => {
    const stats = new Map<ActiveArticleDomain, number>(articleDomains.map((domain) => [domain, 0]));

    const visibleTopics = aiSelectionEnabled ? aiSelection.topics : topics;

    visibleTopics.forEach((topic) => {
      const normalizedDomain = resolveArticleDomain(topic.domain);
      if (!articleDomains.includes(normalizedDomain)) return;
      stats.set(normalizedDomain, (stats.get(normalizedDomain) ?? 0) + 1);
    });

    return stats;
  }, [aiSelection.topics, aiSelectionEnabled, topics]);

  const draftsByTopicId = useMemo(() => {
    const grouped = new Map<string, typeof drafts[number]>();

    drafts.forEach((draft) => {
      const existingDraft = grouped.get(draft.topicId);
      if (!existingDraft || new Date(draft.updatedAt).getTime() > new Date(existingDraft.updatedAt).getTime()) {
        grouped.set(draft.topicId, draft);
      }
    });

    return grouped;
  }, [drafts]);

  useEffect(() => {
    if (!aiSelectionEnabled) {
      setAISelection({ loading: false, groups: [], topics: [], source: null, message: "" });
      return;
    }

    let cancelled = false;
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      setAISelection({
        loading: false,
        groups: [],
        topics: [],
        source: "fallback",
        message: "AI 选题超时，请稍后再试。",
      });
    }, 65000);

    setAISelection((current) => ({ ...current, loading: true, message: "" }));

    const loadAISelection = async () => {
      try {
        const hotTopicsResponse = await fetch("/api/hot-topics?limit=240", { cache: "no-store" });
        const hotTopicsPayload = await hotTopicsResponse.json().catch(() => null);
        const hotTopicItems = Array.isArray(hotTopicsPayload?.items) ? (hotTopicsPayload.items as HotTopicItem[]) : [];

        if (!hotTopicsResponse.ok || !hotTopicItems.length) {
          throw new Error("暂无可用于 AI 选题的热点数据");
        }

        const response = await fetch("/api/topic-recommendations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: hotTopicItems }),
        });
        const payload = await response.json().catch(() => null);
        if (cancelled || timedOut) return;

        if (!response.ok || !Array.isArray(payload?.groups)) {
          throw new Error(payload?.recommendation?.message || payload?.message || "AI 选题暂不可用");
        }

        const groups = (payload.groups as DomainTopicRecommendationGroup[]).filter((group) => group.source === "ai");
        if (!groups.length) {
          throw new Error(payload?.recommendation?.message || "AI 选题暂不可用，请检查模型配置。");
        }

        const hotTopicMap = new Map(hotTopicItems.map((item) => [item.id, item]));
        const recommendedTopics: TopicSuggestion[] = [];
        const normalizedGroups = groups.map((group) => ({
          ...group,
          items: group.items
            .slice(0, 5)
            .map((item) => {
              const hotTopic = hotTopicMap.get(item.topicId);
              if (!hotTopic) return null;
              const topic = buildTopicSuggestionFromHotTopic({
                ...hotTopic,
                domain: group.domain,
              });
              recommendedTopics.push(topic);
              return {
                ...item,
                topicId: topic.id,
              };
            })
            .filter((item): item is TopicRecommendationItem => Boolean(item)),
        }));

        setAISelection({
          loading: false,
          groups: normalizedGroups,
          topics: recommendedTopics,
          source: normalizedGroups.some((group) => group.source === "ai") ? "ai" : "fallback",
          message: normalizedGroups.find((group) => group.message)?.message ?? "",
        });
      } catch (error) {
        if (cancelled || timedOut) return;
        console.error("Failed to filter topics with AI:", error);
        setAISelection({
          loading: false,
          groups: [],
          topics: [],
          source: "fallback",
          message: getClientErrorMessage(error, "AI 选题暂不可用。"),
        });
      } finally {
        window.clearTimeout(timeoutId);
      }
    };

    void loadAISelection();

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [aiSelectionEnabled]);

  const aiRecommendationsByTopicId = useMemo(() => {
    const map = new Map<string, TopicRecommendationItem & { domain: ActiveArticleDomain; rank: number }>();

    aiSelection.groups.forEach((group) => {
      group.items.forEach((item, index) => {
        if (!map.has(item.topicId)) {
          map.set(item.topicId, { ...item, domain: group.domain, rank: index });
        }
      });
    });

    return map;
  }, [aiSelection.groups]);

  const filteredTopics = useMemo(
    () => {
      const visibleTopics = aiSelectionEnabled ? aiSelection.topics : topics;
      const domainTopics = visibleTopics
        .filter((topic) => resolveArticleDomain(topic.domain) === activeDomain)
        .filter((topic) => {
          const normalizedKeyword = keyword.trim();
          if (!normalizedKeyword) return true;

          return (
            topic.title.includes(normalizedKeyword) ||
            topic.source.includes(normalizedKeyword) ||
            topic.tags.some((tag) => tag.includes(normalizedKeyword)) ||
            topic.angles.some((angle) => angle.includes(normalizedKeyword))
          );
        });
      const aiRankedTopics = aiSelectionEnabled
        ? domainTopics.filter((topic) => aiRecommendationsByTopicId.has(topic.id))
        : [];
      const list = aiRankedTopics.length ? aiRankedTopics : domainTopics;

      return list.sort((left, right) => {
          const leftRecommendation = aiRecommendationsByTopicId.get(left.id);
          const rightRecommendation = aiRecommendationsByTopicId.get(right.id);
          if (aiSelectionEnabled && (leftRecommendation || rightRecommendation)) {
            return (
              (rightRecommendation?.score ?? 0) - (leftRecommendation?.score ?? 0) ||
              (leftRecommendation?.rank ?? Number.MAX_SAFE_INTEGER) - (rightRecommendation?.rank ?? Number.MAX_SAFE_INTEGER)
            );
          }

          const leftDraft = draftsByTopicId.get(left.id);
          const rightDraft = draftsByTopicId.get(right.id);
          const leftHasDraft = leftDraft ? 1 : 0;
          const rightHasDraft = rightDraft ? 1 : 0;

          return (
            rightHasDraft - leftHasDraft ||
            right.fit - left.fit ||
            (heatRank[right.heat] ?? 0) - (heatRank[left.heat] ?? 0)
          );
        });
    },
    [activeDomain, aiRecommendationsByTopicId, aiSelection.topics, aiSelectionEnabled, draftsByTopicId, keyword, topics],
  );

  const openWriting = (topic: TopicSuggestion, autoGenerate = false) => {
    const nextTopic = aiSelectionEnabled ? upsertTopic(topic) : topic;
    selectTopic(nextTopic.id);
    router.push(`/writing?topicId=${nextTopic.id}${autoGenerate ? "&autogen=full" : ""}`);
  };

  const openManualWriting = () => {
    const draft = createManualDraft(activeDomain);
    router.push(`/writing?draftId=${draft.id}`);
  };

  const handleDeleteTopic = (topicId: string) => {
    deleteTopic(topicId);
    setNotice("选题已删除");
    window.setTimeout(() => setNotice(""), 1500);

    if (highlightedTopicId === topicId) {
      router.replace("/topic-center");
    }
  };

  const emptyState = aiSelectionEnabled
    ? aiSelection.loading
      ? {
          icon: "loading" as const,
          title: "AI 选题中",
          description: "正在分析热点并为各领域筛选推荐选题，请稍候。",
        }
      : aiSelection.message
        ? {
            icon: "notice" as const,
            title: "AI 选题暂不可用",
            description: aiSelection.message,
          }
        : {
            icon: "notice" as const,
            title: "当前领域暂无 AI 推荐选题",
            description: "去热点中心抓取热点，或稍后重新开启 AI 选题。",
          }
    : {
        icon: "notice" as const,
        title: "当前领域暂无可写选题",
        description: "这里默认只展示你手动加入的选题。去热点中心加入热点，或直接手动开始写。",
      };

  return (
    <div className="lens-page flex flex-col gap-4">
      <div className="lens-card px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {articleDomains.map((domain) => {
            const count = topicStatsByDomain.get(domain) ?? 0;
            const config = domainConfigs[domain];

            return (
              <button
                key={domain}
                type="button"
                onClick={() => setActiveDomain(domain)}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] transition-colors ${
                  activeDomain === domain
                    ? "border-primary bg-primary text-white"
                    : "border-border bg-card text-muted-foreground hover:bg-accent"
                }`}
                style={{ fontWeight: 750 }}
              >
                <span>{config.icon}</span>
                {domain}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                  activeDomain === domain ? "bg-white/15 text-white" : "bg-muted text-muted-foreground"
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setAISelectionEnabled((enabled) => !enabled)}
            className={`ml-auto inline-flex h-11 items-center gap-3 rounded-full border px-4 text-[13px] shadow-sm transition-all ${
              aiSelectionEnabled
                ? "border-primary/30 bg-primary/10 text-primary shadow-[0_10px_24px_rgba(111,92,255,0.12)] hover:bg-primary/15"
                : "border-border bg-card text-muted-foreground hover:bg-accent"
            }`}
            style={{ fontWeight: 850 }}
            aria-pressed={aiSelectionEnabled}
            title="开启后会用 AI 从当前领域选题中筛出更值得写的内容"
          >
            <span className={`flex h-6 w-11 items-center rounded-full p-1 transition-colors ${
              aiSelectionEnabled ? "bg-primary" : "bg-muted"
            }`}>
              <span className={`h-4 w-4 rounded-full bg-card shadow-sm transition-transform ${
                aiSelectionEnabled ? "translate-x-5" : "translate-x-0"
              }`} />
            </span>
            {aiSelection.loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
            {aiSelectionEnabled
              ? aiSelection.loading
                ? "AI 选题中"
                : aiSelection.source === "ai"
                  ? "AI 选题已开"
                  : "AI 选题已开"
              : "AI 选题关闭"}
          </button>
          <div className="lens-input flex min-w-[260px] items-center gap-2 px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索标题、来源、角度"
              className="w-full border-none bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>
        {notice ? (
          <div className="mt-2 text-[11px] text-green-600">{notice}</div>
        ) : null}
        {aiSelectionEnabled && aiSelection.message ? (
          <div className="mt-2 text-[11px] text-muted-foreground">{aiSelection.message}</div>
        ) : null}
      </div>

      <div className="space-y-3">
        {filteredTopics.length ? filteredTopics.map((topic) => {
          const draft = draftsByTopicId.get(topic.id);
          const writingTask = draft ? writingTasks[draft.id] : undefined;
          const isHighlighted = topic.id === highlightedTopicId;
          const aiRecommendation = aiRecommendationsByTopicId.get(topic.id);
          const primaryAngle = aiRecommendation?.angle || topic.angles.find((angle) => angle.trim()) || topic.reason;
          const recommendationReason = aiRecommendation?.reason || topic.reason;
          const recommendationScore = aiRecommendation?.score ?? topic.fit;
          const statusLabel = writingTask ? "生成中" : draft ? draft.status : "未开写";
          const statusClass = writingTask
            ? statusStyles.generating
            : draft?.status === "已发布"
              ? statusStyles.published
              : draft
                ? statusStyles.draft
                : statusStyles.ready;

          return (
            <article
              key={topic.id}
              className={`rounded-[22px] border bg-card/90 p-4 transition-all ${
                isHighlighted ? "border-primary shadow-[0_0_0_3px_rgba(111,92,255,0.12)]" : "border-border hover:border-primary/35"
              }`}
            >
              <div className="flex items-stretch gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="min-w-0 text-[15px] leading-6 text-foreground" style={{ fontWeight: 800 }}>{topic.title}</h2>
                    {isHighlighted ? (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] text-white" style={{ fontWeight: 750 }}>当前推荐</span>
                    ) : null}
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusClass}`} style={{ fontWeight: 600 }}>
                      {statusLabel}
                    </span>
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <TrendingUp className="h-3.5 w-3.5" />
                      {topic.source}
                    </span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${heatColors[topic.heat] ?? "bg-gray-100 text-gray-500"}`}>
                      <Flame className="h-3 w-3" />
                      {topic.heat}
                    </span>
                    {draft ? (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        已有草稿
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3 rounded-xl bg-background px-3 py-2.5">
                    <div className="mb-1 text-[11px] text-muted-foreground" style={{ fontWeight: 700 }}>
                      {aiRecommendation ? "AI 推荐切入" : "推荐切入角度"}
                    </div>
                    <p className="text-[13px] leading-6 text-foreground/75">{primaryAngle}</p>
                    {aiRecommendation ? (
                      <p className="mt-1 text-[12px] leading-5 text-muted-foreground">{recommendationReason}</p>
                    ) : null}
                  </div>

                  {topic.tags.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {topic.tags.slice(0, 4).map((tag) => (
                        <span key={tag} className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{tag}</span>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="flex w-[150px] shrink-0 flex-col items-end justify-center gap-3">
                  <div className="flex items-baseline gap-1 text-primary">
                    <Sparkles className="h-4 w-4" />
                    <span className="text-[20px] leading-none" style={{ fontWeight: 750 }}>{recommendationScore}%</span>
                    <span className="text-[11px] text-muted-foreground">{aiRecommendation ? "AI 评分" : "匹配"}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (draft) {
                        router.push(`/writing?draftId=${draft.id}`);
                        return;
                      }
                      openWriting(topic, false);
                    }}
                    className="group inline-flex h-10 w-[132px] items-center justify-center gap-2 rounded-full border border-primary/20 bg-primary px-4 text-[12px] text-white shadow-[0_10px_22px_rgba(111,92,255,0.16)] transition-all hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-[0_14px_26px_rgba(111,92,255,0.2)]"
                    style={{ fontWeight: 850 }}
                  >
                    {draft ? <Edit3 className="h-3.5 w-3.5 transition-transform group-hover:rotate-[-8deg]" /> : <PenLine className="h-3.5 w-3.5 transition-transform group-hover:rotate-[-8deg]" />}
                    {draft ? (writingTask ? "查看生成" : "继续编辑") : "开始写作"}
                  </button>
                  {!aiSelectionEnabled ? (
                    <button
                      type="button"
                      onClick={() => handleDeleteTopic(topic.id)}
                      className="inline-flex h-8 w-[132px] items-center justify-center gap-1.5 rounded-full border border-border bg-card px-3 text-[12px] text-muted-foreground transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                      style={{ fontWeight: 750 }}
                      title="删除这个选题"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      删除选题
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          );
        }) : (
          <div className="rounded-[22px] border border-dashed border-border bg-card/90 px-6 py-14 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              {emptyState.icon === "loading" ? (
                <LoaderCircle className="h-5 w-5 animate-spin text-primary" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-primary" />
              )}
            </div>
            <div className="text-[14px] text-foreground" style={{ fontWeight: 750 }}>{emptyState.title}</div>
            <div className="mt-1 text-[12px] text-muted-foreground">{emptyState.description}</div>
            <div className="mt-4 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => router.push(`/hot-topics?category=${encodeURIComponent(activeDomain)}`)}
                className="lens-btn-secondary px-3.5 py-2 text-[12px]"
                style={{ fontWeight: 750 }}
              >
                去热点中心
              </button>
              <button
                type="button"
                onClick={openManualWriting}
                className="lens-btn-primary px-3.5 py-2 text-[12px]"
                style={{ fontWeight: 850 }}
              >
                手动写文章
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

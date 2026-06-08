"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  Edit3,
  Flame,
  PenLine,
  PenTool,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { useAppStore } from "../providers/app-store";
import { articleDomains, domainConfigs, resolveArticleDomain, type ActiveArticleDomain } from "../lib/content-domains";

const heatColors: Record<string, string> = {
  极高: "bg-red-50 text-red-600",
  高: "bg-orange-50 text-orange-600",
  中高: "bg-amber-50 text-amber-600",
  中: "bg-[#fff0e6] text-[#d65f2b]",
};

const statusStyles = {
  generating: "bg-[#fff0e6] text-[#d65f2b]",
  draft: "bg-amber-50 text-amber-600",
  published: "bg-green-50 text-green-600",
  ready: "bg-[#f1eadf] text-[#6f665d]",
} as const;

const heatRank: Record<string, number> = {
  极高: 4,
  高: 3,
  中高: 2,
  中: 1,
};

export function TopicCenter() {
  const [activeDomain, setActiveDomain] = useState<ActiveArticleDomain>(articleDomains[0]);
  const [keyword, setKeyword] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { topics, drafts, selectedTopic, writingTasks, selectTopic, createManualDraft } = useAppStore();
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

    topics.forEach((topic) => {
      const normalizedDomain = resolveArticleDomain(topic.domain);
      if (!articleDomains.includes(normalizedDomain)) return;
      stats.set(normalizedDomain, (stats.get(normalizedDomain) ?? 0) + 1);
    });

    return stats;
  }, [topics]);

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

  const filteredTopics = useMemo(
    () =>
      topics
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
        })
        .sort((left, right) => {
          const leftDraft = draftsByTopicId.get(left.id);
          const rightDraft = draftsByTopicId.get(right.id);
          const leftHasDraft = leftDraft ? 1 : 0;
          const rightHasDraft = rightDraft ? 1 : 0;

          return (
            rightHasDraft - leftHasDraft ||
            right.fit - left.fit ||
            (heatRank[right.heat] ?? 0) - (heatRank[left.heat] ?? 0)
          );
        }),
    [activeDomain, draftsByTopicId, keyword, topics],
  );

  const totalTopicCount = topics.filter((topic) => articleDomains.includes(resolveArticleDomain(topic.domain))).length;
  const draftTopicCount = useMemo(
    () => topics.filter((topic) => draftsByTopicId.has(topic.id)).length,
    [draftsByTopicId, topics],
  );
  const activeWritingTaskCount = Object.keys(writingTasks).length;

  const openWriting = (topicId: string, autoGenerate = false) => {
    selectTopic(topicId);
    router.push(`/writing?topicId=${topicId}${autoGenerate ? "&autogen=full" : ""}`);
  };

  const openManualWriting = () => {
    const draft = createManualDraft(activeDomain);
    router.push(`/writing?draftId=${draft.id}`);
  };

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-5">
      <div className="lens-card-strong flex items-start justify-between gap-4 p-5">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#f0dfd0] bg-white/78 px-3 py-1.5 text-[12px] text-[#d65f2b] shadow-sm">
            <Sparkles className="h-3.5 w-3.5" /> Topic Lens
          </div>
          <h1 className="lens-title mt-3 text-[22px]">选题中心</h1>
          <p className="mt-1 text-[13px] text-[#6f665d]">把已入库热点整理成可直接开写的多平台选题队列。</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push("/hot-topics")}
            className="lens-btn-secondary inline-flex items-center gap-1.5 px-3.5 py-2 text-[12px]"
            style={{ fontWeight: 750 }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            热点中心
          </button>
          <button
            type="button"
            onClick={openManualWriting}
            className="lens-btn-primary inline-flex items-center gap-1.5 px-3.5 py-2 text-[12px]"
            style={{ fontWeight: 850 }}
          >
            <Plus className="h-3.5 w-3.5" />
            手动写文章
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "可写选题", value: totalTopicCount, hint: "来自热点中心" },
          { label: "已有草稿", value: draftTopicCount, hint: "可继续编辑" },
          { label: "生成中", value: activeWritingTaskCount, hint: "离开页面后仍可恢复状态" },
        ].map((item) => (
          <div key={item.label} className="lens-card-subtle px-4 py-3">
            <div className="text-[12px] text-[#8c8178]">{item.label}</div>
            <div className="mt-1 flex items-end gap-2">
              <span className="text-[22px] leading-none text-[#d65f2b]" style={{ fontWeight: 850 }}>{item.value}</span>
              <span className="text-[11px] text-[#8c8178]">{item.hint}</span>
            </div>
          </div>
        ))}
      </div>

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
                    ? "border-[#d65f2b] bg-[#d65f2b] text-white"
                    : "border-[#eadfd4] bg-white text-[#6f665d] hover:bg-[#fff7ef]"
                }`}
                style={{ fontWeight: 750 }}
              >
                <span>{config.icon}</span>
                {domain}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                  activeDomain === domain ? "bg-white/15 text-white" : "bg-[#f1eadf] text-[#8c8178]"
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
          <div className="lens-input ml-auto flex min-w-[260px] items-center gap-2 px-3 py-2">
            <Search className="h-4 w-4 text-[#9a9086]" />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索标题、来源、角度"
              className="w-full border-none bg-transparent text-[13px] text-[#181715] outline-none placeholder:text-[#9a9086]"
            />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {filteredTopics.length ? filteredTopics.map((topic) => {
          const draft = draftsByTopicId.get(topic.id);
          const writingTask = draft ? writingTasks[draft.id] : undefined;
          const isHighlighted = topic.id === highlightedTopicId;
          const primaryAngle = topic.angles.find((angle) => angle.trim()) ?? topic.reason;
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
              className={`rounded-[22px] border bg-white/86 p-4 transition-all ${
                isHighlighted ? "border-[#d65f2b] shadow-[0_0_0_3px_rgba(214,95,43,0.12)]" : "border-[#eadfd4] hover:border-[#d65f2b]/35"
              }`}
            >
              <div className="flex items-start gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="min-w-0 text-[15px] leading-6 text-[#181715]" style={{ fontWeight: 800 }}>{topic.title}</h2>
                    {isHighlighted ? (
                      <span className="rounded-full bg-[#d65f2b] px-2 py-0.5 text-[11px] text-white" style={{ fontWeight: 750 }}>当前推荐</span>
                    ) : null}
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusClass}`} style={{ fontWeight: 600 }}>
                      {statusLabel}
                    </span>
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[#8c8178]">
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

                  <div className="mt-3 rounded-xl bg-[#fffaf5] px-3 py-2.5">
                    <div className="mb-1 text-[11px] text-[#8c8178]" style={{ fontWeight: 700 }}>推荐切入角度</div>
                    <p className="text-[13px] leading-6 text-[#5d544c]">{primaryAngle}</p>
                  </div>

                  {topic.tags.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {topic.tags.slice(0, 4).map((tag) => (
                        <span key={tag} className="rounded bg-[#fff0e6] px-1.5 py-0.5 text-[10px] text-[#d65f2b]">{tag}</span>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="flex w-[210px] flex-col items-end gap-2">
                  <div className="flex items-center gap-1 text-[#d65f2b]">
                    <Sparkles className="h-4 w-4" />
                    <span className="text-[20px] leading-none" style={{ fontWeight: 750 }}>{topic.fit}%</span>
                    <span className="text-[11px] text-[#8c8178]">匹配</span>
                  </div>

                  {draft ? (
                    <button
                      type="button"
                      onClick={() => router.push(`/writing?draftId=${draft.id}`)}
                      className="lens-btn-primary inline-flex w-full items-center justify-center gap-1.5 px-3 py-2 text-[12px]"
                      style={{ fontWeight: 850 }}
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      {writingTask ? "查看生成" : "继续编辑"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openWriting(topic.id, true)}
                      className="lens-btn-primary inline-flex w-full items-center justify-center gap-1.5 px-3 py-2 text-[12px]"
                      style={{ fontWeight: 850 }}
                    >
                      <PenTool className="h-3.5 w-3.5" />
                      一键成文
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => openWriting(topic.id, false)}
                    className="lens-btn-secondary inline-flex w-full items-center justify-center gap-1.5 px-3 py-2 text-[12px]"
                    style={{ fontWeight: 750 }}
                  >
                    <PenLine className="h-3.5 w-3.5" />
                    打开编辑
                  </button>
                </div>
              </div>
            </article>
          );
        }) : (
          <div className="rounded-[22px] border border-dashed border-[#eadfd4] bg-white/86 px-6 py-14 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#fff0e6]">
              <CheckCircle2 className="h-5 w-5 text-[#d65f2b]" />
            </div>
            <div className="text-[14px] text-[#181715]" style={{ fontWeight: 750 }}>当前领域暂无可写选题</div>
            <div className="mt-1 text-[12px] text-[#8c8178]">去热点中心选择热点，或直接手动开始写。</div>
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

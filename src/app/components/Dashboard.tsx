"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Flame, TrendingUp, ArrowUpRight, Clock, FileText,
  Lightbulb, Sparkles, ChevronRight, Zap, BarChart2, Palette, DatabaseZap,
} from "lucide-react";
import { buildTopicSuggestionFromHotTopic } from "../lib/article-analysis";
import { formatDraftTime } from "../lib/app-data";
import { articleDomains, domainConfigs, type ArticleDomain } from "../lib/content-domains";
import { type HotTopicItem } from "../lib/hot-topics";
import { buildTopicIdentityKey } from "../lib/topic-utils";
import { useAppStore } from "../providers/app-store";

const statusColors: Record<string, string> = {
  待修改: "bg-amber-50 text-amber-600",
  待生成: "bg-blue-50 text-blue-600",
  已发布: "bg-green-50 text-green-600",
};
const DOMAIN_ORDER = new Map<ArticleDomain, number>(articleDomains.map((domain, index) => [domain, index]));

export function Dashboard({ initialHotTopics = [] }: { initialHotTopics?: HotTopicItem[] }) {
  const router = useRouter();
  const { drafts, topics, settings, selectTopic, upsertTopic } = useAppStore();
  const [dashboardHotTopics, setDashboardHotTopics] = useState<HotTopicItem[]>(initialHotTopics);
  const [activeHotDomain, setActiveHotDomain] = useState<ArticleDomain | null>(null);
  const [fetchJobs, setFetchJobs] = useState<Array<{
    id: string;
    status: string;
    source: string | null;
    insertedCount: number;
    message: string | null;
    createdAt: string;
  }>>([]);

  useEffect(() => {
    const loadDashboardHotTopics = async () => {
      if (initialHotTopics.length) {
        return;
      }

      try {
        const response = await fetch("/api/hot-topics?limit=24", { cache: "no-store" });
        const payload = await response.json();

        if (!response.ok || !Array.isArray(payload.items)) {
          throw new Error("Failed to load dashboard hot topics");
        }

        if ((payload.items as HotTopicItem[]).length) {
          setDashboardHotTopics(payload.items as HotTopicItem[]);
        }
      } catch (error) {
        console.error("Failed to load dashboard hot topics:", error);
      }
    };

    const loadFetchJobs = async () => {
      try {
        const response = await fetch("/api/fetch-jobs?limit=4", { cache: "no-store" });
        const payload = await response.json();
        if (Array.isArray(payload.items)) {
          setFetchJobs(payload.items);
        }
      } catch (error) {
        console.error("Failed to load fetch jobs:", error);
      }
    };

    void loadDashboardHotTopics();
    void loadFetchJobs();
  }, []);

  const uniqueTopics = useMemo(
    () => Array.from(new Map(topics.map((topic) => [buildTopicIdentityKey(topic), topic])).values()),
    [topics],
  );
  const recommendedTopics = useMemo(
    () =>
      [...uniqueTopics]
        .sort((left, right) => {
          const heatRank: Record<string, number> = { 极高: 4, 高: 3, 中高: 2, 中: 1 };
          if (right.fit !== left.fit) return right.fit - left.fit;
          if (right.heat !== left.heat) return (heatRank[right.heat] ?? 0) - (heatRank[left.heat] ?? 0);
          return left.title.localeCompare(right.title, "zh-CN");
        })
        .slice(0, 10),
    [uniqueTopics],
  );
  const fallbackHotTopics = useMemo<HotTopicItem[]>(
    () =>
      uniqueTopics.slice(0, 4).map((topic, index) => ({
        id: `topic-fallback-${topic.id}`,
        title: topic.title,
        source: topic.source.split(" · ")[0] ?? topic.source,
        sourceType: "derived",
        heat: Math.max(6000 - index * 350, 4200),
        trend: `+${Math.max(18, topic.fit - 52)}%`,
        time: "刚刚",
        tags: topic.tags.slice(0, 2),
        summary: topic.reason,
        fetchedAt: new Date().toISOString(),
      })),
    [uniqueTopics],
  );
  const recentDrafts = [...drafts].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 3);
  const resolvedDashboardHotTopics = dashboardHotTopics.length ? dashboardHotTopics : fallbackHotTopics;
  const hotTopics = useMemo(
    () =>
      resolvedDashboardHotTopics.map((topic) => ({
        ...topic,
        domain: topic.domain ?? "其他",
        tags: topic.tags.slice(0, 2),
      })),
    [resolvedDashboardHotTopics],
  );
  const hotTopicsByDomain = useMemo(() => {
    const orderedDomains = Array.from(new Set<ArticleDomain>([
      ...settings.contentAreas,
      ...hotTopics.map((topic) => topic.domain),
    ])).sort((left, right) => (DOMAIN_ORDER.get(left) ?? 999) - (DOMAIN_ORDER.get(right) ?? 999));

    return orderedDomains
      .map((domain) => {
        const domainItems = hotTopics
          .filter((topic) => topic.domain === domain)
          .sort((left, right) => right.heat - left.heat);

        return {
          domain,
          total: domainItems.length,
          items: domainItems.slice(0, 5),
        };
      })
      .filter((section) => section.items.length);
  }, [hotTopics, settings.contentAreas]);
  const activeHotDomainSection = useMemo(() => {
    if (!hotTopicsByDomain.length) return null;
    if (activeHotDomain) {
      const matched = hotTopicsByDomain.find((section) => section.domain === activeHotDomain);
      if (matched) return matched;
    }
    const techSection = hotTopicsByDomain.find((section) => section.domain === "科技");
    if (techSection) return techSection;
    return hotTopicsByDomain[0];
  }, [activeHotDomain, hotTopicsByDomain]);
  const publishedCount = drafts.filter((draft) => draft.status === "已发布").length;
  const needsFormatting = drafts.filter((draft) => draft.status !== "已发布").length;

  useEffect(() => {
    if (!hotTopicsByDomain.length) {
      if (activeHotDomain !== null) {
        setActiveHotDomain(null);
      }
      return;
    }

    if (!activeHotDomain || !hotTopicsByDomain.some((section) => section.domain === activeHotDomain)) {
      setActiveHotDomain(hotTopicsByDomain.find((section) => section.domain === "科技")?.domain ?? hotTopicsByDomain[0].domain);
    }
  }, [activeHotDomain, hotTopicsByDomain]);

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px]" style={{ fontWeight: 600 }}>工作台</h1>
          <p className="text-[13px] text-gray-500 mt-1">欢迎回来，{settings.accountName}。今天有 {hotTopics.length} 个新热点，先挑一个值得写的开始。</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/topic-center")}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-[13px] hover:bg-blue-700"
            style={{ fontWeight: 500 }}
          >
            去选题写作
          </button>
          <button
            onClick={() => router.push("/drafts")}
            className="px-4 py-2 rounded-lg border border-gray-200 text-[13px] text-gray-600 hover:bg-gray-50"
            style={{ fontWeight: 500 }}
          >
            查看草稿箱
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "今日热点", value: String(hotTopics.length), icon: Flame, color: "text-orange-500", bg: "bg-orange-50", href: "/hot-topics" },
          { label: "推荐选题", value: String(uniqueTopics.length), icon: Lightbulb, color: "text-blue-500", bg: "bg-blue-50", href: "/topic-center" },
          { label: "草稿数量", value: String(drafts.length), icon: FileText, color: "text-purple-500", bg: "bg-purple-50", href: "/drafts" },
          { label: "本周发布", value: String(publishedCount), icon: BarChart2, color: "text-green-500", bg: "bg-green-50", href: "/published" },
        ].map((item) => (
          <button
            key={item.label}
            onClick={() => router.push(item.href)}
            className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3 hover:border-blue-200 hover:shadow-sm transition-all text-left"
          >
            <div className={`w-10 h-10 rounded-lg ${item.bg} flex items-center justify-center`}>
              <item.icon className={`w-5 h-5 ${item.color}`} />
            </div>
            <div>
              <div className="text-[22px]" style={{ fontWeight: 600 }}>{item.value}</div>
              <div className="text-[12px] text-gray-500">{item.label}</div>
            </div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          <div className="bg-white rounded-xl border border-gray-100">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-50">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-orange-500" />
                <span className="text-[14px]" style={{ fontWeight: 600 }}>今日热点</span>
              </div>
              <Link href="/hot-topics" className="text-[12px] text-gray-400 hover:text-blue-600 flex items-center gap-0.5">
                查看全部 <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="p-4">
              {hotTopicsByDomain.length && activeHotDomainSection ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {hotTopicsByDomain.map(({ domain, total }) => (
                      <button
                        key={domain}
                        onClick={() => setActiveHotDomain(domain)}
                        className={`rounded-full px-3 py-1.5 text-[12px] transition-colors ${
                          activeHotDomainSection.domain === domain
                            ? "bg-blue-600 text-white"
                            : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                        }`}
                        style={{ fontWeight: 500 }}
                      >
                        {domainConfigs[domain].icon} {domain}
                        <span className={`ml-1.5 ${activeHotDomainSection.domain === domain ? "text-blue-100" : "text-gray-400"}`}>
                          {total}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="overflow-hidden rounded-xl border border-gray-100 bg-gray-50/40">
                    <div className="flex items-center justify-between border-b border-gray-100 bg-white/80 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-gray-900 px-2.5 py-1 text-[11px] text-white">
                          {domainConfigs[activeHotDomainSection.domain].icon} {activeHotDomainSection.domain}
                        </span>
                        <span className="text-[11px] text-gray-400">Top 5 / 共 {activeHotDomainSection.total} 条</span>
                      </div>
                      <button
                        onClick={() => router.push(`/hot-topics?category=${encodeURIComponent(activeHotDomainSection.domain)}`)}
                        className="text-[11px] text-gray-500 hover:text-blue-600"
                      >
                        查看该领域
                      </button>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {activeHotDomainSection.items.map((topic, index) => (
                        <div key={topic.id} className="px-4 py-3 hover:bg-white/80 transition-colors">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => {
                                const nextTopic = upsertTopic(buildTopicSuggestionFromHotTopic(topic));
                                selectTopic(nextTopic.id);
                                router.push(`/topic-center?topicId=${nextTopic.id}`);
                              }}
                              className="flex items-center gap-3 flex-1 min-w-0 text-left group"
                            >
                              <span className={`w-6 h-6 rounded flex items-center justify-center text-[12px] ${
                                index < 3 ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-500"
                              }`} style={{ fontWeight: 600 }}>{index + 1}</span>
                              <div className="flex-1 min-w-0">
                                <div className="text-[13.5px] truncate group-hover:text-blue-600 transition-colors" style={{ fontWeight: 500 }}>{topic.title}</div>
                                <div className="mt-1 flex items-center gap-2 overflow-hidden">
                                  <span className="text-[11px] text-gray-400 bg-white px-1.5 py-0.5 rounded">{topic.source}</span>
                                  {topic.tags.map((tag) => (
                                    <span key={tag} className="text-[11px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">{tag}</span>
                                  ))}
                                </div>
                              </div>
                            </button>
                            <div className="text-right flex-shrink-0">
                              <div className="text-[13px] text-gray-700" style={{ fontWeight: 500 }}>{topic.heat.toLocaleString()}</div>
                              <div className="text-[11px] text-green-600 flex items-center justify-end gap-0.5">
                                <TrendingUp className="w-3 h-3" />{topic.trend}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="px-5 py-10 text-center">
                  <div className="text-[14px] text-gray-800" style={{ fontWeight: 600 }}>还没有热点选题</div>
                  <div className="text-[12px] text-gray-400 mt-1">先去热点中心抓取实时热点，再回来查看。</div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-50">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-blue-500" />
                <span className="text-[14px]" style={{ fontWeight: 600 }}>推荐选题</span>
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-600">Top 10</span>
              </div>
              <Link href="/topic-center" className="text-[12px] text-gray-400 hover:text-blue-600 flex items-center gap-0.5">
                查看全部 <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="p-4 space-y-3">
              {recommendedTopics.length ? recommendedTopics.map((topic) => (
                <div key={topic.id} className="border border-gray-100 rounded-lg p-4 hover:border-blue-200 hover:shadow-sm transition-all">
                  <div className="flex items-start justify-between gap-4">
                    <button
                      onClick={() => {
                        selectTopic(topic.id);
                        router.push(`/topic-center?topicId=${topic.id}`);
                      }}
                      className="flex-1 text-left group"
                    >
                      <div className="text-[13.5px] group-hover:text-blue-600 transition-colors" style={{ fontWeight: 500 }}>{topic.title}</div>
                      <div className="text-[12px] text-gray-400 mt-1">{topic.reason}</div>
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        <span className="text-[11px] bg-gray-900 text-white px-2 py-0.5 rounded-full">{domainConfigs[topic.domain].icon} {topic.domain}</span>
                        {topic.angles.map((angle) => (
                          <span key={angle} className="text-[11px] bg-gray-50 text-gray-600 px-2 py-0.5 rounded-full border border-gray-100">{angle}</span>
                        ))}
                      </div>
                    </button>
                    <div className="flex flex-col items-end gap-2">
                      <div className="flex items-center gap-1 ml-4 flex-shrink-0">
                        <Zap className="w-3.5 h-3.5 text-blue-500" />
                        <span className="text-[13px] text-blue-600" style={{ fontWeight: 600 }}>{topic.fit}%</span>
                      </div>
                      <button
                        onClick={() => {
                          selectTopic(topic.id);
                          router.push(`/writing?topicId=${topic.id}&autogen=full`);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-[12px] hover:bg-blue-700"
                        style={{ fontWeight: 500 }}
                      >
                        一键成文
                      </button>
                    </div>
                  </div>
                </div>
              )) : (
                <div className="rounded-lg border border-dashed border-gray-200 px-4 py-10 text-center">
                  <div className="text-[14px] text-gray-800" style={{ fontWeight: 600 }}>暂无可写选题</div>
                  <div className="text-[12px] text-gray-400 mt-1">请先从热点中心抓取并点击“选题”或“生成”。</div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-100">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-50">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-purple-500" />
                <span className="text-[14px]" style={{ fontWeight: 600 }}>最近草稿</span>
              </div>
              <Link href="/drafts" className="text-[12px] text-gray-400 hover:text-blue-600 flex items-center gap-0.5">
                全部 <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="divide-y divide-gray-50">
              {recentDrafts.length ? recentDrafts.map((draft) => (
                <div key={draft.id} className="px-5 py-3 hover:bg-gray-50/50 transition-colors">
                  <button onClick={() => router.push(`/writing?draftId=${draft.id}`)} className="block w-full text-left">
                    <div className="flex items-center gap-2">
                      <div className="text-[13px] truncate" style={{ fontWeight: 500 }}>{draft.title}</div>
                      <span className="inline-flex items-center gap-1 rounded-full bg-gray-900 px-2 py-0.5 text-[10px] text-white flex-shrink-0">
                        <span>{domainConfigs[draft.domain].icon}</span>
                        {draft.domain}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${statusColors[draft.status]}`} style={{ fontWeight: 500 }}>{draft.status}</span>
                      <div className="flex items-center gap-2 text-[11px] text-gray-400">
                        <span>{draft.words.toLocaleString()} 字</span>
                        <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" />{formatDraftTime(draft.updatedAt).split(" ")[1]}</span>
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center gap-2 mt-3">
                    <button
                      onClick={() => router.push(`/writing?draftId=${draft.id}`)}
                      className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] text-gray-600 hover:bg-gray-50"
                    >
                      继续编辑
                    </button>
                    <button
                      onClick={() => router.push(`/format-editor?draftId=${draft.id}`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-[12px] hover:bg-blue-700"
                    >
                      <Palette className="w-3.5 h-3.5" /> 排版
                    </button>
                  </div>
                </div>
              )) : (
                <div className="px-5 py-10 text-center">
                  <div className="text-[14px] text-gray-800" style={{ fontWeight: 600 }}>还没有草稿</div>
                  <div className="text-[12px] text-gray-400 mt-1">从热点或选题开始，一键生成第一篇文章。</div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-50">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span className="text-[14px]" style={{ fontWeight: 600 }}>创作建议</span>
              </div>
            </div>
            <div className="p-4 space-y-3">
              {[
                "先在热点中心抓取真实热点，再筛选适合账号定位的选题。",
                "对实时热点优先走“热点 → 选题 → 写作 → 排版 → 发布”的流程。",
                `当前还有 ${needsFormatting} 篇草稿待排版，建议优先处理待修改中的文章`,
              ].map((tip) => (
                <div key={tip} className="flex items-start gap-2.5 text-[12.5px] text-gray-600 leading-relaxed">
                  <ArrowUpRight className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  {tip}
                </div>
              ))}
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => router.push("/published")}
                  className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-[12px] text-white hover:bg-blue-700"
                >
                  查看发布管理
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-50">
              <div className="flex items-center gap-2">
                <DatabaseZap className="w-4 h-4 text-blue-500" />
                <span className="text-[14px]" style={{ fontWeight: 600 }}>抓取任务</span>
              </div>
            </div>
            <div className="divide-y divide-gray-50">
              {fetchJobs.length ? fetchJobs.map((job) => (
                <div key={job.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${
                      job.status === "success"
                        ? "bg-green-50 text-green-600"
                        : job.status === "failed"
                          ? "bg-red-50 text-red-600"
                          : "bg-blue-50 text-blue-600"
                    }`}>
                      {job.status}
                    </span>
                    <span className="text-[11px] text-gray-400">{formatDraftTime(job.createdAt)}</span>
                  </div>
                  <div className="mt-2 text-[12px] text-gray-700">{job.message ?? "热点抓取任务"}</div>
                  <div className="mt-1 text-[11px] text-gray-400">
                    来源：{job.source ?? "all"} · 入库 {job.insertedCount} 条
                  </div>
                </div>
              )) : (
                <div className="px-5 py-8 text-center text-[12px] text-gray-400">
                  暂无抓取记录，先去热点中心执行一次抓取。
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

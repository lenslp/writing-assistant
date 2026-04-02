"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Zap, TrendingUp, Flame, PenTool, FileText, ListTree, ChevronRight } from "lucide-react";
import { useAppStore } from "../providers/app-store";

const tabs = ["全部", "热点型", "常青型", "行业型"] as const;

const heatColors: Record<string, string> = {
  极高: "bg-red-50 text-red-600",
  高: "bg-orange-50 text-orange-600",
  中高: "bg-amber-50 text-amber-600",
  中: "bg-blue-50 text-blue-600",
};

const typeColors: Record<string, string> = {
  热点型: "bg-red-50 text-red-500",
  常青型: "bg-green-50 text-green-600",
  行业型: "bg-purple-50 text-purple-600",
};

export function TopicCenter() {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("全部");
  const [activeDomain, setActiveDomain] = useState("全部");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { topics, selectedTopic, selectTopic } = useAppStore();
  const highlightedTopicId = searchParams.get("topicId") ?? selectedTopic?.id ?? null;

  useEffect(() => {
    if (!highlightedTopicId) return;
    const matchedTopic = topics.find((topic) => topic.id === highlightedTopicId);
    if (!matchedTopic) return;
    selectTopic(matchedTopic.id);
    setActiveTab(matchedTopic.type);
  }, [highlightedTopicId, selectTopic, topics]);

  const filtered = useMemo(
    () =>
      topics.filter((topic) => {
        const matchesType = activeTab === "全部" ? true : topic.type === activeTab;
        const matchesDomain = activeDomain === "全部" ? true : topic.domain === activeDomain;
        return matchesType && matchesDomain;
      }),
    [activeDomain, activeTab, topics],
  );
  const domainTabs = useMemo(() => ["全部", ...Array.from(new Set(topics.map((topic) => topic.domain)))], [topics]);

  const openWriting = (topicId: string, autoGenerate?: "title" | "outline" | "body" | "full") => {
    selectTopic(topicId);
    const suffix = autoGenerate ? `&autogen=${autoGenerate}` : "";
    router.push(`/writing?topicId=${topicId}${suffix}`);
  };

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px]" style={{ fontWeight: 600 }}>选题中心</h1>
          <p className="text-[13px] text-gray-500 mt-1">基于热点和账号定位，智能推荐选题与写作角度</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-full text-[13px] transition-colors ${
              activeTab === tab ? "bg-blue-600 text-white" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
            }`}
            style={{ fontWeight: 500 }}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {domainTabs.map((domain) => (
          <button
            key={domain}
            onClick={() => setActiveDomain(domain)}
            className={`px-3 py-1.5 rounded-full text-[12px] transition-colors ${
              activeDomain === domain ? "bg-gray-900 text-white" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
            }`}
            style={{ fontWeight: 500 }}
          >
            {domain}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {filtered.length ? filtered.map((topic) => {
          const isHighlighted = topic.id === highlightedTopicId;
          return (
          <div
            key={topic.id}
            className={`bg-white rounded-xl border p-5 transition-all ${
              isHighlighted
                ? "border-blue-300 shadow-[0_0_0_3px_rgba(59,130,246,0.12)]"
                : "border-gray-100 hover:border-blue-200 hover:shadow-sm"
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-[15px]" style={{ fontWeight: 600 }}>{topic.title}</h3>
                  {isHighlighted ? (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-600 text-white" style={{ fontWeight: 500 }}>
                      当前推荐
                    </span>
                  ) : null}
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-900 text-white" style={{ fontWeight: 500 }}>{topic.domain}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${typeColors[topic.type]}`} style={{ fontWeight: 500 }}>{topic.type}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${heatColors[topic.heat]}`} style={{ fontWeight: 500 }}>
                    <Flame className="w-3 h-3 inline mr-0.5" />热度{topic.heat}
                  </span>
                </div>
                <div className="flex items-center gap-1 mt-1.5 text-[12px] text-gray-400">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>来源：{topic.source}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 ml-4 flex-shrink-0">
                <Zap className="w-4 h-4 text-blue-500" />
                <span className="text-[18px] text-blue-600" style={{ fontWeight: 700 }}>{topic.fit}%</span>
                <span className="text-[11px] text-gray-400">匹配度</span>
              </div>
            </div>

            <div className="mt-3 bg-blue-50/50 rounded-lg p-3">
              <div className="text-[12px] text-gray-500 mb-1" style={{ fontWeight: 500 }}>推荐理由</div>
              <div className="text-[12.5px] text-gray-700">{topic.reason}</div>
            </div>

            <div className="mt-3">
              <div className="text-[12px] text-gray-500 mb-2" style={{ fontWeight: 500 }}>可写角度</div>
              <div className="space-y-1.5">
                {topic.angles.map((angle, index) => (
                  <div key={angle} className="flex items-center gap-2 text-[12.5px] text-gray-700">
                    <span className="w-5 h-5 rounded bg-gray-100 text-gray-500 flex items-center justify-center text-[11px] flex-shrink-0" style={{ fontWeight: 600 }}>
                      {index + 1}
                    </span>
                    {angle}
                    <ChevronRight className="w-3.5 h-3.5 text-gray-300 ml-auto flex-shrink-0" />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-50">
              <button
                onClick={() => openWriting(topic.id, "full")}
                className="flex items-center gap-1.5 bg-blue-600 text-white px-3.5 py-1.5 rounded-lg text-[12px] hover:bg-blue-700"
                style={{ fontWeight: 500 }}
              >
                <PenTool className="w-3.5 h-3.5" /> 一键成文
              </button>
              <button
                onClick={() => openWriting(topic.id, "title")}
                className="flex items-center gap-1.5 border border-gray-200 px-3.5 py-1.5 rounded-lg text-[12px] text-gray-600 hover:bg-gray-50"
                style={{ fontWeight: 500 }}
              >
                <FileText className="w-3.5 h-3.5" /> 生成标题
              </button>
              <button
                onClick={() => openWriting(topic.id, "outline")}
                className="flex items-center gap-1.5 border border-gray-200 px-3.5 py-1.5 rounded-lg text-[12px] text-gray-600 hover:bg-gray-50"
                style={{ fontWeight: 500 }}
              >
                <ListTree className="w-3.5 h-3.5" /> 生成大纲
              </button>
            </div>
          </div>
        )}) : (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white px-6 py-14 text-center">
            <div className="text-[14px] text-gray-800" style={{ fontWeight: 600 }}>暂无真实选题</div>
            <div className="text-[12px] text-gray-400 mt-1">请先去热点中心抓取数据，系统会自动生成一批可写选题。</div>
          </div>
        )}
      </div>
    </div>
  );
}

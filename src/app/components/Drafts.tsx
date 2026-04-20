"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Search, Filter, LayoutGrid, List, Trash2,
  Clock, Edit3, ArrowRightCircle, Palette, CheckCircle2,
} from "lucide-react";
import { formatDraftTime, type DraftStatus } from "../lib/app-data";
import { domainConfigs } from "../lib/content-domains";
import { useAppStore } from "../providers/app-store";

const statusTabs: Array<"全部" | DraftStatus> = ["全部", "待生成", "待修改", "已发布"];
const statusOrder: DraftStatus[] = ["待生成", "待修改", "已发布"];

const statusStyles: Record<DraftStatus, { bg: string; dot: string }> = {
  待生成: { bg: "bg-blue-50 text-blue-600", dot: "bg-blue-500" },
  待修改: { bg: "bg-amber-50 text-amber-600", dot: "bg-amber-500" },
  审核中: { bg: "bg-purple-50 text-purple-600", dot: "bg-purple-500" },
  已发布: { bg: "bg-green-50 text-green-600", dot: "bg-green-500" },
};

export function Drafts() {
  const { drafts, updateDraftStatus, deleteDraft } = useAppStore();
  const [activeStatus, setActiveStatus] = useState<(typeof statusTabs)[number]>("全部");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [keyword, setKeyword] = useState("");
  const [sortMode, setSortMode] = useState<"latest" | "words">("latest");
  const [notice, setNotice] = useState("");

  const filtered = useMemo(() => {
    return drafts
      .filter((draft) => {
        if (activeStatus === "全部") return true;
        if (activeStatus === "待修改") return draft.status === "待修改" || draft.status === "审核中";
        return draft.status === activeStatus;
      })
      .filter((draft) =>
        keyword
          ? draft.title.includes(keyword) || draft.topic.includes(keyword) || draft.tags.some((tag) => tag.includes(keyword))
          : true,
      )
      .sort((a, b) =>
        sortMode === "latest"
          ? new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          : b.words - a.words,
      );
  }, [activeStatus, drafts, keyword, sortMode]);

  const moveToNextStatus = (draftId: string, currentStatus: DraftStatus) => {
    if (currentStatus === "已发布") {
      setNotice("当前草稿已是最终状态");
      window.setTimeout(() => setNotice(""), 1800);
      return;
    }

    const currentIndex = statusOrder.indexOf(currentStatus);
    const normalizedCurrentIndex = currentIndex === -1 ? statusOrder.indexOf("待修改") : currentIndex;
    const nextStatus = statusOrder[Math.min(normalizedCurrentIndex + 1, statusOrder.length - 1)];
    if (nextStatus === currentStatus) {
      setNotice("当前草稿已是最终状态");
      window.setTimeout(() => setNotice(""), 1500);
      return;
    }
    updateDraftStatus(draftId, nextStatus);
    setNotice(`已流转到「${nextStatus}」`);
    window.setTimeout(() => setNotice(""), 1500);
  };

  const handleDelete = (draftId: string) => {
    deleteDraft(draftId);
    setNotice("草稿已删除");
    window.setTimeout(() => setNotice(""), 1500);
  };

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px]" style={{ fontWeight: 600 }}>草稿箱</h1>
          <p className="text-[13px] text-gray-500 mt-1">管理所有已生成和正在编辑的文章</p>
        </div>
        <div className="flex items-center gap-2">
          {notice ? <span className="text-[12px] text-green-600">{notice}</span> : null}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setViewMode("list")} className={`p-1.5 rounded ${viewMode === "list" ? "bg-white shadow-sm" : ""}`}>
              <List className="w-4 h-4 text-gray-500" />
            </button>
            <button onClick={() => setViewMode("grid")} className={`p-1.5 rounded ${viewMode === "grid" ? "bg-white shadow-sm" : ""}`}>
              <LayoutGrid className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 flex-wrap">
          {statusTabs.map((status) => (
            <button
              key={status}
              onClick={() => setActiveStatus(status)}
              className={`px-3 py-1.5 rounded-lg text-[13px] transition-colors ${
                activeStatus === status ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"
              }`}
              style={{ fontWeight: 500 }}
            >
              {status}
              {status !== "全部" && <span className="ml-1 text-[11px] opacity-70">{drafts.filter((draft) => draft.status === status).length}</span>}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5 border border-transparent focus-within:border-blue-200 focus-within:bg-white w-64">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            type="text"
            placeholder="搜索草稿..."
            className="bg-transparent border-none outline-none text-[13px] w-full placeholder:text-gray-400"
          />
        </div>
        <button
          onClick={() => setSortMode((current) => (current === "latest" ? "words" : "latest"))}
          className="flex items-center gap-1.5 border border-gray-200 px-3 py-1.5 rounded-lg text-[13px] text-gray-600 hover:bg-gray-50"
        >
          <Filter className="w-3.5 h-3.5" /> {sortMode === "latest" ? "按最近排序" : "按字数排序"}
        </button>
      </div>

      {viewMode === "list" ? (
        <div className="bg-white rounded-xl border border-gray-100">
          <div className="grid grid-cols-[1fr_100px_120px_80px_80px_112px] px-5 py-2.5 border-b border-gray-100 text-[12px] text-gray-400" style={{ fontWeight: 500 }}>
            <span>标题</span>
            <span>状态</span>
            <span>更新时间</span>
            <span>字数</span>
            <span>标签</span>
            <span className="text-right">操作</span>
          </div>
          <div className="divide-y divide-gray-50">
            {filtered.length ? filtered.map((draft) => {
              const statusStyle = statusStyles[draft.status];
              return (
                <div key={draft.id} className="grid grid-cols-[1fr_100px_120px_80px_80px_112px] items-center px-5 py-3 hover:bg-gray-50/50 transition-colors group">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="text-[13px] truncate group-hover:text-blue-600 transition-colors" style={{ fontWeight: 500 }}>{draft.title}</div>
                      <span className="inline-flex items-center gap-1 rounded-full bg-gray-900 px-2 py-0.5 text-[10px] text-white flex-shrink-0">
                        <span>{domainConfigs[draft.domain].icon}</span>
                        {draft.domain}
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-400 mt-0.5">来源：{draft.topic}</div>
                  </div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full w-fit flex items-center gap-1 ${statusStyle.bg}`} style={{ fontWeight: 500 }}>
                    <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
                    {draft.status}
                  </span>
                  <span className="text-[12px] text-gray-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />{formatDraftTime(draft.updatedAt).split(" ")[1]}
                  </span>
                  <span className="text-[12px] text-gray-500">{draft.words.toLocaleString()}</span>
                  <div className="flex items-center gap-1">
                    {draft.tags.slice(0, 1).map((tag) => (
                      <span key={tag} className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{tag}</span>
                    ))}
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={`/writing?draftId=${draft.id}`}
                      title="继续写作"
                      aria-label="继续写作"
                      className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-gray-400" />
                    </Link>
                    <Link
                      href={`/format-editor?draftId=${draft.id}`}
                      title="排版编辑"
                      aria-label="排版编辑"
                      className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100"
                    >
                      <Palette className="w-3.5 h-3.5 text-gray-400" />
                    </Link>
                    <button
                      onClick={() => moveToNextStatus(draft.id, draft.status)}
                      title="推进流程"
                      aria-label="推进流程"
                      className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100"
                    >
                      <ArrowRightCircle className="w-3.5 h-3.5 text-gray-400" />
                    </button>
                    <button
                      onClick={() => handleDelete(draft.id)}
                      title="删除草稿"
                      aria-label="删除草稿"
                      className="w-7 h-7 flex items-center justify-center rounded text-red-400 hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            }) : (
              <div className="px-5 py-12 text-center">
                <div className="inline-flex w-10 h-10 items-center justify-center rounded-full bg-gray-100 mb-3">
                  <CheckCircle2 className="w-5 h-5 text-gray-400" />
                </div>
                <div className="text-[14px] text-gray-800" style={{ fontWeight: 600 }}>没有匹配到草稿</div>
                <div className="text-[12px] text-gray-400 mt-1">试试切换状态筛选，或到写作页生成新文章。</div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {filtered.length ? filtered.map((draft) => {
            const statusStyle = statusStyles[draft.status];
            return (
              <div key={draft.id} className="bg-white rounded-xl border border-gray-100 p-4 hover:border-blue-200 hover:shadow-sm transition-all cursor-pointer group">
                <div className="flex items-start justify-between mb-2">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full flex items-center gap-1 ${statusStyle.bg}`} style={{ fontWeight: 500 }}>
                    <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
                    {draft.status}
                  </span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                    <Link
                      href={`/format-editor?draftId=${draft.id}`}
                      title="排版编辑"
                      aria-label="排版编辑"
                      className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100"
                    >
                      <Palette className="w-3.5 h-3.5 text-gray-400" />
                    </Link>
                    <button
                      onClick={() => moveToNextStatus(draft.id, draft.status)}
                      title="推进流程"
                      aria-label="推进流程"
                      className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100"
                    >
                      <ArrowRightCircle className="w-3.5 h-3.5 text-gray-400" />
                    </button>
                    <button
                      onClick={() => handleDelete(draft.id)}
                      title="删除草稿"
                      aria-label="删除草稿"
                      className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-50 text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <Link href={`/writing?draftId=${draft.id}`} className="block">
                  <h3 className="text-[13px] mb-2 line-clamp-2 group-hover:text-blue-600 transition-colors" style={{ fontWeight: 500 }}>{draft.title}</h3>
                </Link>
                <div className="text-[11px] text-gray-400 mb-3">来源：{draft.topic}</div>
                <div className="flex items-center gap-1 mb-3 flex-wrap">
                  <span className="text-[10px] rounded-full bg-gray-900 px-2 py-0.5 text-white">
                    {domainConfigs[draft.domain].icon} {draft.domain}
                  </span>
                  {draft.tags.map((tag) => (
                    <span key={tag} className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{tag}</span>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-gray-50 text-[11px] text-gray-400">
                  <span>{draft.words.toLocaleString()} 字</span>
                  <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" />{formatDraftTime(draft.updatedAt).split(" ")[0]}</span>
                </div>
              </div>
            );
          }) : (
            <div className="col-span-3 bg-white rounded-xl border border-gray-100 px-6 py-12 text-center">
              <div className="inline-flex w-10 h-10 items-center justify-center rounded-full bg-gray-100 mb-3">
                <CheckCircle2 className="w-5 h-5 text-gray-400" />
              </div>
              <div className="text-[14px] text-gray-800" style={{ fontWeight: 600 }}>当前筛选条件下暂无草稿</div>
              <div className="text-[12px] text-gray-400 mt-1">可以调整搜索关键词，或从热点中心直接一键成文。</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

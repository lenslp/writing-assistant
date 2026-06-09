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
  待生成: { bg: "bg-primary/10 text-primary", dot: "bg-primary" },
  待修改: { bg: "bg-amber-50 text-amber-600", dot: "bg-amber-500" },
  审核中: { bg: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
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
    <div className="lens-page space-y-4">
      <div className="lens-card-strong flex items-center justify-between p-5">
        <div>
          <h1 className="lens-title text-[20px]">草稿箱</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">管理所有已生成和正在编辑的多平台内容草稿。</p>
        </div>
        <div className="flex items-center gap-2">
          {notice ? <span className="text-[12px] text-green-600">{notice}</span> : null}
          <div className="flex items-center rounded-xl bg-muted p-0.5">
            <button onClick={() => setViewMode("list")} className={`rounded-lg p-1.5 ${viewMode === "list" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}>
              <List className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode("grid")} className={`rounded-lg p-1.5 ${viewMode === "grid" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}>
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="lens-card flex items-center gap-3 px-4 py-3">
        <div className="flex items-center gap-1 flex-wrap">
          {statusTabs.map((status) => (
            <button
              key={status}
              onClick={() => setActiveStatus(status)}
              className={`px-3 py-1.5 rounded-lg text-[13px] transition-colors ${
                activeStatus === status ? "bg-primary text-white" : "text-muted-foreground hover:bg-accent"
              }`}
              style={{ fontWeight: 750 }}
            >
              {status}
              {status !== "全部" && <span className="ml-1 text-[11px] opacity-70">{drafts.filter((draft) => draft.status === status).length}</span>}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <div className="lens-input flex w-64 items-center gap-2 px-3 py-1.5">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            type="text"
            placeholder="搜索草稿..."
            className="w-full border-none bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
        <button
          onClick={() => setSortMode((current) => (current === "latest" ? "words" : "latest"))}
          className="lens-btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-[13px]"
        >
          <Filter className="w-3.5 h-3.5" /> {sortMode === "latest" ? "按最近排序" : "按字数排序"}
        </button>
      </div>

      {viewMode === "list" ? (
        <div className="overflow-hidden rounded-[22px] border border-border bg-card/90">
          <div className="grid grid-cols-[1fr_100px_120px_80px_80px_112px] border-b border-border/70 px-5 py-2.5 text-[12px] text-muted-foreground" style={{ fontWeight: 700 }}>
            <span>标题</span>
            <span>状态</span>
            <span>更新时间</span>
            <span>字数</span>
            <span>标签</span>
            <span className="text-right">操作</span>
          </div>
          <div className="divide-y divide-border/70">
            {filtered.length ? filtered.map((draft) => {
              const statusStyle = statusStyles[draft.status];
              return (
                <div key={draft.id} className="group grid grid-cols-[1fr_100px_120px_80px_80px_112px] items-center px-5 py-3 transition-colors hover:bg-background">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="truncate text-[13px] text-foreground transition-colors group-hover:text-primary" style={{ fontWeight: 700 }}>{draft.title}</div>
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-950 dark:bg-white/10 px-2 py-0.5 text-[10px] text-white flex-shrink-0">
                        <span>{domainConfigs[draft.domain].icon}</span>
                        {draft.domain}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">来源：{draft.topic}</div>
                  </div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full w-fit flex items-center gap-1 ${statusStyle.bg}`} style={{ fontWeight: 500 }}>
                    <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
                    {draft.status}
                  </span>
                  <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
                    <Clock className="w-3 h-3" />{formatDraftTime(draft.updatedAt).split(" ")[1]}
                  </span>
                  <span className="text-[12px] text-muted-foreground">{draft.words.toLocaleString()}</span>
                  <div className="flex items-center gap-1">
                    {draft.tags.slice(0, 1).map((tag) => (
                      <span key={tag} className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{tag}</span>
                    ))}
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={`/writing?draftId=${draft.id}`}
                      title="继续写作"
                      aria-label="继续写作"
                      className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-primary"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </Link>
                    <Link
                      href={`/format-editor?draftId=${draft.id}`}
                      title="排版编辑"
                      aria-label="排版编辑"
                      className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-primary"
                    >
                      <Palette className="w-3.5 h-3.5" />
                    </Link>
                    <button
                      onClick={() => moveToNextStatus(draft.id, draft.status)}
                      title="推进流程"
                      aria-label="推进流程"
                      className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-primary"
                    >
                      <ArrowRightCircle className="w-3.5 h-3.5" />
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
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                </div>
                <div className="text-[14px] text-foreground" style={{ fontWeight: 750 }}>没有匹配到草稿</div>
                <div className="mt-1 text-[12px] text-muted-foreground">试试切换状态筛选，或到写作页生成新文章。</div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {filtered.length ? filtered.map((draft) => {
            const statusStyle = statusStyles[draft.status];
            return (
              <div key={draft.id} className="group cursor-pointer rounded-[22px] border border-border bg-card/90 p-4 transition-all hover:border-primary/35 hover:shadow-sm">
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
                      className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-primary"
                    >
                      <Palette className="w-3.5 h-3.5" />
                    </Link>
                    <button
                      onClick={() => moveToNextStatus(draft.id, draft.status)}
                      title="推进流程"
                      aria-label="推进流程"
                      className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-primary"
                    >
                      <ArrowRightCircle className="w-3.5 h-3.5" />
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
                  <h3 className="mb-2 line-clamp-2 text-[13px] text-foreground transition-colors group-hover:text-primary" style={{ fontWeight: 700 }}>{draft.title}</h3>
                </Link>
                <div className="mb-3 text-[11px] text-muted-foreground">来源：{draft.topic}</div>
                <div className="flex items-center gap-1 mb-3 flex-wrap">
                  <span className="text-[10px] rounded-full bg-slate-950 dark:bg-white/10 px-2 py-0.5 text-white">
                    {domainConfigs[draft.domain].icon} {draft.domain}
                  </span>
                  {draft.tags.map((tag) => (
                    <span key={tag} className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{tag}</span>
                  ))}
                </div>
                <div className="flex items-center justify-between border-t border-border/70 pt-2 text-[11px] text-muted-foreground">
                  <span>{draft.words.toLocaleString()} 字</span>
                  <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" />{formatDraftTime(draft.updatedAt).split(" ")[0]}</span>
                </div>
              </div>
            );
          }) : (
            <div className="col-span-3 rounded-[22px] border border-border bg-card/90 px-6 py-12 text-center">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <CheckCircle2 className="w-5 h-5 text-primary" />
              </div>
              <div className="text-[14px] text-foreground" style={{ fontWeight: 750 }}>当前筛选条件下暂无草稿</div>
              <div className="mt-1 text-[12px] text-muted-foreground">可以调整搜索关键词，或从热点中心直接一键成文。</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

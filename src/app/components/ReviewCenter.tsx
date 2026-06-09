"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCheck, Clock3, FilePenLine, RefreshCcw, Send } from "lucide-react";
import { useAppStore } from "../providers/app-store";
import { formatDraftTime } from "../lib/app-data";
import { domainConfigs } from "../lib/content-domains";

export function ReviewCenter() {
  const searchParams = useSearchParams();
  const { drafts, submitDraftReview, returnDraftToEditing } = useAppStore();
  const reviewingDrafts = drafts.filter((draft) => draft.status === "待修改" || draft.status === "审核中");
  const readyToPublishCount = drafts.filter((draft) => draft.status === "审核中").length;
  const highlightedDraftId = searchParams.get("draftId");

  return (
    <div className="lens-page space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="lens-title text-[20px]">审核中心</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">集中处理待修改与审核中的稿件，确保发布前内容完整。</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          {
            label: "待修改",
            value: drafts.filter((draft) => draft.status === "待修改").length,
            icon: FilePenLine,
            color: "text-primary",
            bg: "bg-primary/10",
          },
          {
            label: "审核中",
            value: drafts.filter((draft) => draft.status === "审核中").length,
            icon: Clock3,
            color: "text-muted-foreground",
            bg: "bg-muted",
          },
          {
            label: "可发布",
            value: readyToPublishCount,
            icon: CheckCheck,
            color: "text-primary",
            bg: "bg-accent",
          },
        ].map((item) => (
          <div key={item.label} className="lens-card flex items-center gap-3 p-4">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${item.bg}`}>
              <item.icon className={`h-5 w-5 ${item.color}`} />
            </div>
            <div>
              <div className="text-[20px] text-foreground" style={{ fontWeight: 850 }}>{item.value}</div>
              <div className="text-[12px] text-muted-foreground">{item.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-[22px] border border-border bg-card/90 shadow-[0_12px_36px_rgba(31,41,86,0.05)]">
        <div className="grid grid-cols-[1fr_90px_120px_150px] border-b border-border/70 px-5 py-3 text-[12px] text-muted-foreground" style={{ fontWeight: 700 }}>
          <span>稿件</span>
          <span>状态</span>
          <span>更新时间</span>
          <span className="text-right">操作</span>
        </div>
        <div className="divide-y divide-border/70">
          {reviewingDrafts.length ? reviewingDrafts.map((draft) => (
            <div
              key={draft.id}
              className={`grid grid-cols-[1fr_90px_120px_150px] items-center px-5 py-4 transition-colors hover:bg-background ${
                draft.id === highlightedDraftId ? "bg-primary/10" : ""
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="truncate text-[13px] text-foreground" style={{ fontWeight: 700 }}>{draft.title}</div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-950 dark:bg-white/10 px-2 py-0.5 text-[10px] text-white">
                    <span>{domainConfigs[draft.domain].icon}</span>
                    {draft.domain}
                  </span>
                  {draft.id === highlightedDraftId ? (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] text-white" style={{ fontWeight: 700 }}>
                      当前稿件
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">{draft.topic}</div>
              </div>
              <span className={`w-fit rounded-full px-2 py-0.5 text-[11px] ${
                draft.status === "审核中" ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
              }`}>
                {draft.status}
              </span>
              <span className="text-[12px] text-muted-foreground">{formatDraftTime(draft.updatedAt)}</span>
              <div className="flex items-center justify-end gap-2">
                <Link
                  href={`/writing?draftId=${draft.id}`}
                  className="text-[12px] text-muted-foreground hover:text-primary"
                >
                  编辑
                </Link>
                {draft.status === "待修改" ? (
                  <button
                    onClick={() => submitDraftReview(draft.id)}
                    className="lens-btn-primary flex items-center gap-1 px-3 py-1.5 text-[12px]"
                  >
                    <Send className="w-3.5 h-3.5" /> 提交审核
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => returnDraftToEditing(draft.id)}
                      className="lens-btn-secondary flex items-center gap-1 px-3 py-1.5 text-[12px]"
                    >
                      <RefreshCcw className="w-3.5 h-3.5" /> 退回修改
                    </button>
                    <Link
                      href={`/format-editor?draftId=${draft.id}`}
                      className="lens-btn-primary px-3 py-1.5 text-[12px]"
                    >
                      去排版发布
                    </Link>
                  </>
                )}
              </div>
            </div>
          )) : (
            <div className="px-6 py-12 text-center">
              <div className="text-[14px] text-foreground" style={{ fontWeight: 750 }}>当前没有待审核稿件</div>
              <div className="mt-1 text-[12px] text-muted-foreground">先去写作页生成内容，或在草稿箱中推进状态。</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

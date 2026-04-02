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
    <div className="max-w-[1200px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px]" style={{ fontWeight: 600 }}>审核中心</h1>
          <p className="text-[13px] text-gray-500 mt-1">集中处理待修改与审核中的稿件，确保发布前内容完整。</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          {
            label: "待修改",
            value: drafts.filter((draft) => draft.status === "待修改").length,
            icon: FilePenLine,
            color: "text-amber-600",
            bg: "bg-amber-50",
          },
          {
            label: "审核中",
            value: drafts.filter((draft) => draft.status === "审核中").length,
            icon: Clock3,
            color: "text-purple-600",
            bg: "bg-purple-50",
          },
          {
            label: "可发布",
            value: readyToPublishCount,
            icon: CheckCheck,
            color: "text-blue-600",
            bg: "bg-blue-50",
          },
        ].map((item) => (
          <div key={item.label} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${item.bg} flex items-center justify-center`}>
              <item.icon className={`w-5 h-5 ${item.color}`} />
            </div>
            <div>
              <div className="text-[20px]" style={{ fontWeight: 600 }}>{item.value}</div>
              <div className="text-[12px] text-gray-500">{item.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="grid grid-cols-[1fr_90px_120px_150px] px-5 py-3 border-b border-gray-100 text-[12px] text-gray-400" style={{ fontWeight: 500 }}>
          <span>稿件</span>
          <span>状态</span>
          <span>更新时间</span>
          <span className="text-right">操作</span>
        </div>
        <div className="divide-y divide-gray-50">
          {reviewingDrafts.length ? reviewingDrafts.map((draft) => (
            <div
              key={draft.id}
              className={`grid grid-cols-[1fr_90px_120px_150px] items-center px-5 py-4 hover:bg-gray-50/60 ${
                draft.id === highlightedDraftId ? "bg-purple-50/70" : ""
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-[13px] truncate" style={{ fontWeight: 500 }}>{draft.title}</div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-gray-900 px-2 py-0.5 text-[10px] text-white">
                    <span>{domainConfigs[draft.domain].icon}</span>
                    {draft.domain}
                  </span>
                  {draft.id === highlightedDraftId ? (
                    <span className="rounded-full bg-purple-600 px-2 py-0.5 text-[10px] text-white" style={{ fontWeight: 600 }}>
                      当前稿件
                    </span>
                  ) : null}
                </div>
                <div className="text-[11px] text-gray-400 mt-1">{draft.topic}</div>
              </div>
              <span className={`text-[11px] px-2 py-0.5 rounded-full w-fit ${
                draft.status === "审核中" ? "bg-purple-50 text-purple-600" : "bg-amber-50 text-amber-600"
              }`}>
                {draft.status}
              </span>
              <span className="text-[12px] text-gray-500">{formatDraftTime(draft.updatedAt)}</span>
              <div className="flex items-center justify-end gap-2">
                <Link
                  href={`/writing?draftId=${draft.id}`}
                  className="text-[12px] text-gray-500 hover:text-blue-600"
                >
                  编辑
                </Link>
                {draft.status === "待修改" ? (
                  <button
                    onClick={() => submitDraftReview(draft.id)}
                    className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-[12px] text-white hover:bg-blue-700"
                  >
                    <Send className="w-3.5 h-3.5" /> 提交审核
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => returnDraftToEditing(draft.id)}
                      className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] text-gray-600 hover:bg-gray-50"
                    >
                      <RefreshCcw className="w-3.5 h-3.5" /> 退回修改
                    </button>
                    <Link
                      href={`/format-editor?draftId=${draft.id}`}
                      className="rounded-lg bg-green-600 px-3 py-1.5 text-[12px] text-white hover:bg-green-700"
                    >
                      去排版发布
                    </Link>
                  </>
                )}
              </div>
            </div>
          )) : (
            <div className="px-6 py-12 text-center">
              <div className="text-[14px] text-gray-800" style={{ fontWeight: 600 }}>当前没有待审核稿件</div>
              <div className="text-[12px] text-gray-400 mt-1">先去写作页生成内容，或在草稿箱中推进状态。</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { CheckCircle2, Copy, ExternalLink, Palette } from "lucide-react";
import { useAppStore } from "../providers/app-store";
import { formatDraftTime } from "../lib/app-data";
import { domainConfigs } from "../lib/content-domains";

export function PublishedCenter() {
  const { drafts, duplicateDraft } = useAppStore();
  const publishedDrafts = drafts
    .filter((draft) => draft.status === "已发布")
    .sort((a, b) => new Date(b.publishedAt ?? b.updatedAt).getTime() - new Date(a.publishedAt ?? a.updatedAt).getTime());

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px]" style={{ fontWeight: 600 }}>发布管理</h1>
          <p className="text-[13px] text-gray-500 mt-1">查看已发布文章，支持再次排版或复制为新稿。</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {publishedDrafts.map((draft) => (
          <div key={draft.id} className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[11px] text-green-600">
                    <CheckCircle2 className="w-3.5 h-3.5" /> 已发布
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-gray-900 px-2 py-0.5 text-[11px] text-white">
                    <span>{domainConfigs[draft.domain].icon}</span>
                    {draft.domain}
                  </span>
                  {draft.publishedChannel ? (
                    <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-600">
                      {draft.publishedChannel}
                    </span>
                  ) : null}
                </div>
                <h3 className="text-[14px] mt-2" style={{ fontWeight: 600 }}>{draft.title}</h3>
                <div className="text-[12px] text-gray-400 mt-1">{draft.topic}</div>
              </div>
            </div>

            <div className="text-[12px] text-gray-500 leading-relaxed line-clamp-3">{draft.summary}</div>

            <div className="flex items-center gap-1 flex-wrap">
              {draft.tags.map((tag) => (
                <span key={tag} className="rounded bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">{tag}</span>
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-gray-100 pt-3 text-[12px] text-gray-400">
              <span>发布时间：{formatDraftTime(draft.publishedAt ?? draft.updatedAt)}</span>
              <span>{draft.words.toLocaleString()} 字</span>
            </div>

            {draft.lastExportedAt ? (
              <div className="rounded-lg bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
                最近导出：{draft.lastExportFormat?.toUpperCase() ?? "WECHAT"} · {formatDraftTime(draft.lastExportedAt)}
              </div>
            ) : null}

            <div className="flex items-center gap-2">
              <Link
                href={`/format-editor?draftId=${draft.id}`}
                className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] text-gray-600 hover:bg-gray-50"
              >
                <Palette className="w-3.5 h-3.5" /> 重新排版
              </Link>
              <button
                onClick={() => duplicateDraft(draft.id)}
                className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] text-gray-600 hover:bg-gray-50"
              >
                <Copy className="w-3.5 h-3.5" /> 复制新稿
              </button>
              <Link
                href={`/writing?draftId=${draft.id}`}
                className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-[12px] text-white hover:bg-blue-700"
              >
                <ExternalLink className="w-3.5 h-3.5" /> 查看内容
              </Link>
            </div>
          </div>
        ))}
      </div>

      {!publishedDrafts.length ? (
        <div className="rounded-xl border border-gray-100 bg-white px-6 py-12 text-center">
          <div className="text-[14px] text-gray-800" style={{ fontWeight: 600 }}>还没有已发布内容</div>
          <div className="text-[12px] text-gray-400 mt-1">去排版页点击“标记发布”后，这里会自动展示文章。</div>
        </div>
      ) : null}
    </div>
  );
}

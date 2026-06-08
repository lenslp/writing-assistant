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
    <div className="mx-auto max-w-[1200px] space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="lens-title text-[20px]">发布管理</h1>
          <p className="mt-1 text-[13px] text-[#6f665d]">查看已发布文章，支持再次排版或复制为新稿。</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {publishedDrafts.map((draft) => (
          <div key={draft.id} className="lens-card space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#fff0e6] px-2 py-0.5 text-[11px] text-[#d65f2b]">
                    <CheckCircle2 className="w-3.5 h-3.5" /> 已发布
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#181715] px-2 py-0.5 text-[11px] text-white">
                    <span>{domainConfigs[draft.domain].icon}</span>
                    {draft.domain}
                  </span>
                  {draft.publishedChannel ? (
                    <span className="inline-flex items-center rounded-full bg-[#f1eadf] px-2 py-0.5 text-[11px] text-[#6f665d]">
                      {draft.publishedChannel}
                    </span>
                  ) : null}
                </div>
                <h3 className="mt-2 text-[14px] text-[#181715]" style={{ fontWeight: 750 }}>{draft.title}</h3>
                <div className="mt-1 text-[12px] text-[#8c8178]">{draft.topic}</div>
              </div>
            </div>

            <div className="line-clamp-3 text-[12px] leading-relaxed text-[#6f665d]">{draft.summary}</div>

            <div className="flex items-center gap-1 flex-wrap">
              {draft.tags.map((tag) => (
                <span key={tag} className="rounded bg-[#fff0e6] px-2 py-0.5 text-[11px] text-[#d65f2b]">{tag}</span>
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-[#f0e5da] pt-3 text-[12px] text-[#8c8178]">
              <span>发布时间：{formatDraftTime(draft.publishedAt ?? draft.updatedAt)}</span>
              <span>{draft.words.toLocaleString()} 字</span>
            </div>

            {draft.lastExportedAt ? (
              <div className="rounded-lg bg-[#fffaf5] px-3 py-2 text-[11px] text-[#8c8178]">
                最近导出：{draft.lastExportFormat?.toUpperCase() ?? "WECHAT"} · {formatDraftTime(draft.lastExportedAt)}
              </div>
            ) : null}

            <div className="flex items-center gap-2">
              <Link
                href={`/format-editor?draftId=${draft.id}`}
                className="lens-btn-secondary flex items-center gap-1 px-3 py-1.5 text-[12px]"
              >
                <Palette className="w-3.5 h-3.5" /> 重新排版
              </Link>
              <button
                onClick={() => duplicateDraft(draft.id)}
                className="lens-btn-secondary flex items-center gap-1 px-3 py-1.5 text-[12px]"
              >
                <Copy className="w-3.5 h-3.5" /> 复制新稿
              </button>
              <Link
                href={`/writing?draftId=${draft.id}`}
                className="lens-btn-primary flex items-center gap-1 px-3 py-1.5 text-[12px]"
              >
                <ExternalLink className="w-3.5 h-3.5" /> 查看内容
              </Link>
            </div>
          </div>
        ))}
      </div>

      {!publishedDrafts.length ? (
        <div className="lens-card px-6 py-12 text-center">
          <div className="text-[14px] text-[#181715]" style={{ fontWeight: 750 }}>还没有已发布内容</div>
          <div className="mt-1 text-[12px] text-[#8c8178]">去排版页点击“标记发布”后，这里会自动展示文章。</div>
        </div>
      ) : null}
    </div>
  );
}

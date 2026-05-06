"use client";

import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Type, Heading2, AlignLeft, Quote, Minus, Image, Sparkles, Heart,
  Save, Copy, Download, FileCode, ChevronDown, Palette, Smartphone, Monitor, RotateCcw, ArrowUp, Send, RefreshCcw,
  Upload, Link2, WandSparkles, X, LoaderCircle, MoreHorizontal, Search,
} from "lucide-react";
import {
  colorSchemes,
  createDefaultFormatting,
  formatDraftTime,
  templates,
  type Draft,
  type DraftStatus,
  type DraftFormatting,
} from "../lib/app-data";
import { buildAutoImageCaption, buildAutoImagePrompt, buildAutoImageSearchQuery, buildImageSnippet, shouldPreferRealImage } from "../lib/article-auto-image";
import { normalizeStructuredBodyText } from "../lib/body-structure";
import { domainConfigs, type ArticleDomain } from "../lib/content-domains";
import { useAppStore } from "../providers/app-store";

const publishChannels = ["公众号", "知乎", "微博", "头条", "小红书"] as const;
const previewModes = ["mobile", "desktop"] as const;
const WECHAT_TITLE_LIMIT = 64;

const moduleTools = [
  { icon: Type, label: "标题" },
  { icon: Heading2, label: "小标题" },
  { icon: AlignLeft, label: "段落" },
  { icon: Quote, label: "引用块" },
  { icon: Minus, label: "分割线" },
  { icon: Image, label: "图片" },
  { icon: Sparkles, label: "金句卡片" },
  { icon: Heart, label: "CTA" },
] as const;

const draftStatusStyles: Record<DraftStatus, { chip: string; dot: string }> = {
  待生成: { chip: "bg-blue-50 text-blue-600", dot: "bg-blue-500" },
  待修改: { chip: "bg-amber-50 text-amber-600", dot: "bg-amber-500" },
  审核中: { chip: "bg-purple-50 text-purple-600", dot: "bg-purple-500" },
  已发布: { chip: "bg-green-50 text-green-600", dot: "bg-green-500" },
};

type ContentBlock =
  | { type: "heading"; content: string }
  | { type: "quote"; content: string }
  | { type: "divider" }
  | { type: "image"; content: string; src?: string; alt?: string; caption?: string; isPlaceholder?: boolean }
  | { type: "code"; content: string; language: string }
  | { type: "golden"; content: string }
  | { type: "highlight"; content: string }
  | { type: "unordered-list"; items: string[] }
  | { type: "ordered-list"; items: string[] }
  | { type: "paragraph"; content: string };

type InlineToken = {
  start: number;
  end: number;
  kind: "bold" | "quote" | "highlight";
  content: string;
};

type ImageInsertMode = "auto" | "cursor" | "end";
type ImagePanelTab = "upload" | "link" | "search" | "ai";

type WechatAccountView = {
  id: string;
  name: string;
  appIdMasked: string;
};

type RealImageSearchItem = {
  url: string;
  source: string;
  query: string;
  title?: string;
  pageUrl?: string;
  thumbnailUrl?: string;
};

type WechatDraftCheckItem = {
  key: string;
  label: string;
  ok: boolean;
  message: string;
};

const AUTO_HIGHLIGHT_PATTERNS = [
  /(?:先说结论|结论先说|一句话总结|核心在于|关键在于|本质上|更重要的是|最重要的是|真正重要的是|真正的问题是|需要注意的是|说白了|简单来说|换句话说|归根结底|一定要记住|记住一句话)/g,
  /不是[^，。；！？\n]{1,30}而是[^，。；！？\n]{1,40}/g,
];

const IMAGE_MARKDOWN_PATTERN = /^!\[(.*?)\]\((.+)\)$/;
const IMAGE_CAPTION_PATTERN = /^(?:图注|说明|caption)[:：]\s*(.+)$/i;
const CODE_BLOCK_PATTERN = /^```(\w+)?\s*\n([\s\S]*?)\n```$/;

function getInlineHighlightStyle(primary: string, accent: string): CSSProperties {
  return {
    backgroundImage: `linear-gradient(180deg, transparent 58%, color-mix(in srgb, ${accent} 28%, white) 58%)`,
    padding: "0 1px",
    color: primary,
  };
}

function getInlineHighlightHtmlStyle(primary: string, accent: string) {
  return `background-image:linear-gradient(180deg, transparent 58%, color-mix(in srgb, ${accent} 28%, white) 58%);padding:0 1px;color:${primary};`;
}

function collectInlineTokens(text: string, autoHighlight = false) {
  const tokens: InlineToken[] = [];

  for (const match of text.matchAll(/__([^_]+)__/g)) {
    if (typeof match.index !== "number") continue;
    tokens.push({
      start: match.index,
      end: match.index + match[0].length,
      kind: "bold",
      content: match[1],
    });
  }

  for (const match of text.matchAll(/「[^」]+」/g)) {
    if (typeof match.index !== "number") continue;
    tokens.push({
      start: match.index,
      end: match.index + match[0].length,
      kind: "quote",
      content: match[0],
    });
  }

  if (autoHighlight) {
    for (const pattern of AUTO_HIGHLIGHT_PATTERNS) {
      for (const match of text.matchAll(pattern)) {
        if (typeof match.index !== "number") continue;
        tokens.push({
          start: match.index,
          end: match.index + match[0].length,
          kind: "highlight",
          content: match[0],
        });
      }
    }
  }

  const priority = { bold: 0, quote: 1, highlight: 2 } as const;

  return tokens
    .sort((left, right) => left.start - right.start || priority[left.kind] - priority[right.kind] || right.end - left.end)
    .reduce<InlineToken[]>((result, token) => {
      const previous = result[result.length - 1];

      if (previous && token.start < previous.end) {
        return result;
      }

      result.push(token);
      return result;
    }, []);
}

function escapeHtml(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function parseImageSection(section: string) {
  const lines = section.split("\n").map((line) => line.trim()).filter(Boolean);
  const firstLine = lines[0] ?? "";
  const imageMatch = firstLine.match(IMAGE_MARKDOWN_PATTERN);

  if (imageMatch) {
    const alt = imageMatch[1].trim();
    const src = imageMatch[2].trim();
    const captionLine = lines.slice(1).find((line) => IMAGE_CAPTION_PATTERN.test(line));
    const caption = captionLine?.match(IMAGE_CAPTION_PATTERN)?.[1]?.trim() ?? alt;

    return {
      type: "image" as const,
      content: caption || alt || "配图",
      src,
      alt,
      caption,
      isPlaceholder: false,
    };
  }

  if (section.startsWith("[图片占位")) {
    return {
      type: "image" as const,
      content: section,
      alt: "配图占位",
      caption: section,
      isPlaceholder: true,
    };
  }

  return null;
}

function splitBodySections(body: string) {
  const normalized = normalizeStructuredBodyText(body).replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const sections: string[] = [];
  let buffer: string[] = [];
  let inCodeBlock = false;

  const flush = () => {
    const section = buffer.join("\n").trim();
    if (section) sections.push(section);
    buffer = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      if (!inCodeBlock && buffer.length) flush();
      buffer.push(trimmed);
      inCodeBlock = !inCodeBlock;
      if (!inCodeBlock) flush();
      continue;
    }

    if (!inCodeBlock && !trimmed) {
      flush();
      continue;
    }

    buffer.push(trimmed);
  }

  flush();
  return sections;
}

function renderInlineHtml(text: string, options?: { autoHighlight?: boolean; highlightStyle?: string }) {
  const tokens = collectInlineTokens(text, options?.autoHighlight);

  if (!tokens.length) {
    return escapeHtml(text);
  }

  let cursor = 0;
  let html = "";

  for (const token of tokens) {
    if (token.start > cursor) {
      html += escapeHtml(text.slice(cursor, token.start));
    }

    if (token.kind === "bold") {
      html += `<strong>${escapeHtml(token.content)}</strong>`;
    } else if (token.kind === "quote") {
      html += `<span style="color:#2563eb;">${escapeHtml(token.content)}</span>`;
    } else {
      html += `<span style="${options?.highlightStyle ?? ""}">${escapeHtml(token.content)}</span>`;
    }

    cursor = token.end;
  }

  if (cursor < text.length) {
    html += escapeHtml(text.slice(cursor));
  }

  return html;
}

function renderInlineNodes(text: string, options?: { autoHighlight?: boolean; highlightStyle?: CSSProperties }) {
  const tokens = collectInlineTokens(text, options?.autoHighlight);

  if (!tokens.length) {
    return [<span key={`${text}-plain`}>{text}</span>];
  }

  const nodes: JSX.Element[] = [];
  let cursor = 0;

  tokens.forEach((token, index) => {
    if (token.start > cursor) {
      nodes.push(<span key={`plain-${index}-${cursor}`}>{text.slice(cursor, token.start)}</span>);
    }

    if (token.kind === "bold") {
      nodes.push(<strong key={`bold-${index}`}>{token.content}</strong>);
    } else if (token.kind === "quote") {
      nodes.push(<span key={`quote-${index}`} style={{ color: "#2563eb" }}>{token.content}</span>);
    } else {
      nodes.push(<span key={`highlight-${index}`} style={options?.highlightStyle}>{token.content}</span>);
    }

    cursor = token.end;
  });

  if (cursor < text.length) {
    nodes.push(<span key={`plain-tail-${cursor}`}>{text.slice(cursor)}</span>);
  }

  return nodes;
}

function extractContentBlocks(body: string): ContentBlock[] {
  return splitBodySections(body)
    .filter(Boolean)
    .map((section) => {
      const lines = section.split("\n").map((line) => line.trim()).filter(Boolean);
      const codeMatch = section.match(CODE_BLOCK_PATTERN);
      const imageBlock = parseImageSection(section);

      if (codeMatch) {
        return {
          type: "code",
          language: codeMatch[1]?.trim() || "",
          content: codeMatch[2].trim(),
        } satisfies ContentBlock;
      }

      if (imageBlock) {
        return imageBlock satisfies ContentBlock;
      }

      if (section.startsWith("## ")) {
        return { type: "heading", content: section.slice(3).trim() } satisfies ContentBlock;
      }

      if (section.startsWith(">")) {
        return { type: "quote", content: section.replace(/^>\s?/gm, "").trim() } satisfies ContentBlock;
      }

      if (section === "---") {
        return { type: "divider" } satisfies ContentBlock;
      }

      if (section.startsWith("【金句】")) {
        return { type: "golden", content: section.replace("【金句】", "").trim() } satisfies ContentBlock;
      }

      if (section.startsWith("【重点】")) {
        return { type: "highlight", content: section.replace("【重点】", "").trim() } satisfies ContentBlock;
      }

      if (lines.length > 1 && lines.every((line) => line.startsWith("- "))) {
        return {
          type: "unordered-list",
          items: lines.map((line) => line.replace(/^- /, "").trim()),
        } satisfies ContentBlock;
      }

      if (lines.length > 1 && lines.every((line) => /^\d+[.)、]\s+/.test(line))) {
        return {
          type: "ordered-list",
          items: lines.map((line) => line.replace(/^\d+[.)、]\s+/, "").trim()),
        } satisfies ContentBlock;
      }

      return { type: "paragraph", content: section } satisfies ContentBlock;
    });
}

function buildWechatText(draft: Draft, body: string, settingsCta: string) {
  const plainBody = extractContentBlocks(body)
    .map((block) => {
      if (block.type === "image") {
        if (block.isPlaceholder) {
          return block.content;
        }

        return [`[配图] ${block.caption || block.alt || "配图"}`, block.src ? `图片链接：${block.src}` : ""]
          .filter(Boolean)
          .join("\n");
      }

      if (block.type === "code") {
        return [`\`\`\`${block.language || ""}`, block.content, "```"].filter(Boolean).join("\n");
      }

      if (block.type === "unordered-list") {
        return block.items.map((item) => `- ${item}`).join("\n");
      }

      if (block.type === "ordered-list") {
        return block.items.map((item, index) => `${index + 1}. ${item}`).join("\n");
      }

      if (block.type === "divider") {
        return "---";
      }

      return block.content;
    })
    .join("\n\n");

  return [draft.title, "", draft.summary, "", plainBody, "", settingsCta].filter(Boolean).join("\n");
}

function buildMarkdown(draft: Draft, body: string) {
  return [`# ${draft.title}`, "", draft.summary, "", body].filter(Boolean).join("\n");
}

function buildHtml(
  draft: Draft,
  body: string,
  formatting: DraftFormatting,
  primary: string,
  accent: string,
  publishChannel: Draft["publishedChannel"],
  accountName: string,
  domain: ArticleDomain,
) {
  const isWechatChannel = publishChannel === "公众号";
  const metaDate = formatDraftTime(draft.publishedAt ?? draft.updatedAt).split(" ")[0];
  const inlineHighlightHtmlStyle = getInlineHighlightHtmlStyle(primary, accent);
  const domainStyle = getWechatDomainPreviewStyle(domain, primary, accent);
  const htmlSections = extractContentBlocks(body)
    .map((block) => {
      if (block.type === "heading") {
        if (!isWechatChannel) {
          return `<h2 style="font-size:20px;font-weight:700;margin:24px 0 12px;color:${primary};">${renderInlineHtml(block.content, { autoHighlight: isWechatChannel, highlightStyle: inlineHighlightHtmlStyle })}</h2>`;
        }

        if (domainStyle.headingMode === "underline") {
          return `<h2 style="font-size:18px;font-weight:${domainStyle.headingFontWeight};line-height:1.75;margin:30px 0 15px;color:${domainStyle.headingTextColor};display:inline-block;padding-bottom:6px;border-bottom:2px solid ${primary};font-family:${domainStyle.headingFontFamily};">${renderInlineHtml(block.content, { autoHighlight: true, highlightStyle: inlineHighlightHtmlStyle })}</h2>`;
        }

        if (domainStyle.headingMode === "center") {
          return `<div style="text-align:center;margin:34px 0 18px;"><h2 style="display:inline-block;font-size:18px;font-weight:${domainStyle.headingFontWeight};line-height:1.8;margin:0;color:${domainStyle.headingTextColor};padding-bottom:6px;border-bottom:2px solid ${accent};font-family:${domainStyle.headingFontFamily};">${renderInlineHtml(block.content, { autoHighlight: true, highlightStyle: inlineHighlightHtmlStyle })}</h2></div>`;
        }

        if (domainStyle.headingMode === "card") {
          return `<div style="margin:30px 0 15px;padding:12px 16px;border-radius:16px;background:linear-gradient(135deg, color-mix(in srgb, ${accent} 22%, white), color-mix(in srgb, ${primary} 18%, white));border:1px solid color-mix(in srgb, ${primary} 18%, white);"><h2 style="font-size:18px;font-weight:${domainStyle.headingFontWeight};line-height:1.7;margin:0;color:${domainStyle.headingTextColor};font-family:${domainStyle.headingFontFamily};">${renderInlineHtml(block.content, { autoHighlight: true, highlightStyle: inlineHighlightHtmlStyle })}</h2></div>`;
        }

        return `<div style="display:flex;align-items:flex-start;gap:12px;margin:30px 0 15px;"><span style="display:inline-block;width:6px;height:32px;border-radius:999px;background:linear-gradient(180deg, ${primary}, ${accent});opacity:0.9;flex-shrink:0;margin-top:2px;"></span><h2 style="font-size:18px;font-weight:${domainStyle.headingFontWeight};line-height:1.75;margin:0;color:${domainStyle.headingTextColor};font-family:${domainStyle.headingFontFamily};">${renderInlineHtml(block.content, { autoHighlight: true, highlightStyle: inlineHighlightHtmlStyle })}</h2></div>`;
      }

      if (block.type === "quote") {
        return isWechatChannel
          ? `<blockquote style="margin:24px 0;padding:16px 18px;background:${domainStyle.quoteBackground};border-radius:12px;font-size:15px;line-height:1.8;color:${domainStyle.quoteTextColor};">${renderInlineHtml(block.content, { autoHighlight: isWechatChannel, highlightStyle: inlineHighlightHtmlStyle })}</blockquote>`
          : `<blockquote style="margin:24px 0;padding:16px 18px;border-left:4px solid ${primary};background:#f8fbff;border-radius:${formatting.roundedQuote ? "0 12px 12px 0" : "0"};line-height:1.9;color:#475569;">${renderInlineHtml(block.content, { autoHighlight: isWechatChannel, highlightStyle: inlineHighlightHtmlStyle })}</blockquote>`;
      }

      if (block.type === "divider") {
        return `<hr style="margin:28px 0;border:none;border-top:1px solid ${domainStyle.dividerColor};" />`;
      }

      if (block.type === "image") {
        if (block.src) {
          const caption = block.caption || block.alt || "配图";
          return isWechatChannel
            ? `<figure style="margin:24px 0;"><img src="${escapeHtml(block.src)}" alt="${escapeHtml(block.alt || caption)}" style="display:block;width:100%;height:auto;border-radius:${String(domainStyle.imageFrameStyle.borderRadius)};border:1px solid ${String(domainStyle.imageFrameStyle.borderColor)};background:${String(domainStyle.imageFrameStyle.background)};box-shadow:${String(domainStyle.imageFrameStyle.boxShadow)};object-fit:cover;" /><figcaption style="margin-top:10px;text-align:center;color:${domainStyle.imageCaptionColor};font-size:12px;line-height:1.7;">${escapeHtml(caption)}</figcaption></figure>`
            : `<figure style="margin:24px 0;"><img src="${escapeHtml(block.src)}" alt="${escapeHtml(block.alt || caption)}" style="display:block;width:100%;height:auto;border-radius:20px;border:1px solid #cbd5e1;background:#fff;object-fit:cover;" /><figcaption style="margin-top:10px;text-align:center;color:#6b7280;font-size:12px;line-height:1.7;">${escapeHtml(caption)}</figcaption></figure>`;
        }

        return isWechatChannel
          ? `<div style="margin:24px 0;border-radius:${String(domainStyle.imageFrameStyle.borderRadius)};overflow:hidden;border:1px solid ${String(domainStyle.imageFrameStyle.borderColor)};background:${String(domainStyle.imageFrameStyle.background)};box-shadow:${String(domainStyle.imageFrameStyle.boxShadow)};"><div style="height:180px;background:${String(domainStyle.imageFrameStyle.background)};display:flex;align-items:center;justify-content:center;"><span style="display:inline-flex;align-items:center;justify-content:center;padding:8px 16px;border-radius:999px;border:1px solid ${String(domainStyle.imagePlaceholderChipStyle.borderColor)};background:${String(domainStyle.imagePlaceholderChipStyle.background)};color:${String(domainStyle.imagePlaceholderChipStyle.color)};font-size:12px;">配图占位</span></div><div style="padding:10px 12px;text-align:center;color:${domainStyle.imageCaptionColor};font-size:12px;">${escapeHtml(block.content)}</div></div>`
          : `<div style="margin:24px 0;padding:28px 16px;border:1px dashed #cbd5e1;border-radius:16px;text-align:center;color:#94a3b8;">${escapeHtml(block.content)}</div>`;
      }

      if (block.type === "code") {
        const language = block.language ? escapeHtml(block.language) : "code";
        return isWechatChannel
          ? `<figure style="margin:24px 0;border:1px solid ${domainStyle.highlightBorderColor};border-radius:16px;overflow:hidden;background:#0f172a;box-shadow:0 10px 26px rgba(15,23,42,0.08);"><div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:rgba(255,255,255,0.05);border-bottom:1px solid rgba(255,255,255,0.08);color:#cbd5e1;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;"><span>示例代码</span><span>${language}</span></div><pre style="margin:0;padding:16px 14px 18px;overflow:auto;color:#e2e8f0;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;font-size:13px;line-height:1.75;white-space:pre-wrap;word-break:break-word;"><code>${escapeHtml(block.content)}</code></pre></figure>`
          : `<figure style="margin:24px 0;border:1px solid #cbd5e1;border-radius:16px;overflow:hidden;background:#0f172a;box-shadow:0 10px 26px rgba(15,23,42,0.08);"><div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:rgba(255,255,255,0.05);border-bottom:1px solid rgba(255,255,255,0.08);color:#cbd5e1;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;"><span>示例代码</span><span>${language}</span></div><pre style="margin:0;padding:16px 14px 18px;overflow:auto;color:#e2e8f0;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;font-size:13px;line-height:1.75;white-space:pre-wrap;word-break:break-word;"><code>${escapeHtml(block.content)}</code></pre></figure>`;
      }

      if (block.type === "golden") {
        return isWechatChannel
          ? `<div style="margin:24px 0;padding:16px 18px;border-radius:10px;background:${domainStyle.goldenBackground};border-left:3px solid ${domainStyle.goldenBorderColor};color:${domainStyle.goldenTextColor};font-weight:600;line-height:1.85;text-align:${domainStyle.goldenTextAlign};">${renderInlineHtml(block.content, { autoHighlight: isWechatChannel, highlightStyle: inlineHighlightHtmlStyle })}</div>`
          : `<div style="margin:24px 0;padding:20px 18px;border-radius:18px;background:linear-gradient(135deg, ${primary}15, ${accent}22);color:#111827;font-weight:600;">${renderInlineHtml(block.content, { autoHighlight: isWechatChannel, highlightStyle: inlineHighlightHtmlStyle })}</div>`;
      }

      if (block.type === "highlight") {
        return isWechatChannel
          ? `<div style="margin:22px 0;padding:14px 16px;border-radius:14px;border:1px solid ${domainStyle.highlightBorderColor};background:${domainStyle.highlightBackground};color:#1f2937;line-height:1.85;">${renderInlineHtml(block.content, { autoHighlight: isWechatChannel, highlightStyle: inlineHighlightHtmlStyle })}</div>`
          : `<div style="margin:20px 0;padding:16px 18px;border-radius:16px;border:1px solid ${primary}20;background:${primary}08;color:#1f2937;">${renderInlineHtml(block.content, { autoHighlight: isWechatChannel, highlightStyle: inlineHighlightHtmlStyle })}</div>`;
      }

      if (block.type === "unordered-list") {
        return `<ul style="margin:20px 0 24px;padding-left:20px;color:${isWechatChannel ? "#4a4a4a" : "#1f2937"};line-height:${isWechatChannel ? "1.85" : "1.9"};">${block.items.map((item) => `<li style="margin-bottom:8px;">${renderInlineHtml(item, { autoHighlight: isWechatChannel, highlightStyle: inlineHighlightHtmlStyle })}</li>`).join("")}</ul>`;
      }

      if (block.type === "ordered-list") {
        return `<ol style="margin:20px 0 24px;padding-left:20px;color:${isWechatChannel ? "#4a4a4a" : "#1f2937"};line-height:${isWechatChannel ? "1.85" : "1.9"};">${block.items.map((item) => `<li style="margin-bottom:8px;">${renderInlineHtml(item, { autoHighlight: isWechatChannel, highlightStyle: inlineHighlightHtmlStyle })}</li>`).join("")}</ol>`;
      }

      return isWechatChannel
        ? `<p style="font-size:${domainStyle.paragraphFontSize};line-height:${domainStyle.paragraphLineHeight};margin:0 0 18px;color:${domainStyle.paragraphColor};letter-spacing:${domainStyle.paragraphLetterSpacing};font-family:${domainStyle.paragraphFontFamily};">${renderInlineHtml(block.content, { autoHighlight: isWechatChannel, highlightStyle: inlineHighlightHtmlStyle })}</p>`
        : `<p style="font-size:${formatting.fontSize};line-height:${formatting.lineHeight};margin:0 0 ${formatting.paragraphSpacing};color:#1f2937;">${renderInlineHtml(block.content, { autoHighlight: isWechatChannel, highlightStyle: inlineHighlightHtmlStyle })}</p>`;
    })
    .join("");

  if (isWechatChannel) {
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${draft.title}</title></head><body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Segoe UI',sans-serif;background:#f5f5f5;padding:24px 14px;color:#4a4a4a;"><article style="max-width:720px;margin:0 auto;background:#fff;padding:28px 22px;border-radius:8px;border:1px solid #ededed;"><div style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;background:${primary};background-image:linear-gradient(135deg, ${primary}, ${accent});color:#fff;font-size:12px;font-weight:700;margin-bottom:16px;">${escapeHtml(domainStyle.badgeText)}</div><h1 style="font-size:${domainStyle.titleStyle.fontSize};line-height:${domainStyle.titleStyle.lineHeight};margin:0 0 14px;color:${String(domainStyle.titleStyle.color)};font-weight:${String(domainStyle.titleStyle.fontWeight)};letter-spacing:${String(domainStyle.titleStyle.letterSpacing)};text-align:${String(domainStyle.titleStyle.textAlign)};font-family:${String(domainStyle.titleStyle.fontFamily)};">${draft.title}</h1><div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:20px;color:#8c8c8c;justify-content:${domainStyle.metaAlign};"><span style="font-size:15px;line-height:20px;color:rgba(0,0,0,0.72);font-weight:400;">${escapeHtml(accountName)}</span><span style="font-size:12px;">·</span><span style="font-size:13px;line-height:20px;">${metaDate}</span></div>${draft.summary ? `<div style="margin:0 0 18px;background:${String(domainStyle.summaryStyle.background)};border:${String(domainStyle.summaryStyle.border)};border-radius:${String(domainStyle.summaryStyle.borderRadius)};padding:${String(domainStyle.summaryStyle.padding)};color:${String(domainStyle.summaryStyle.color)};text-align:${domainStyle.summaryTextAlign};font-style:${domainStyle.summaryFontStyle};">${renderInlineHtml(draft.summary, { autoHighlight: true, highlightStyle: inlineHighlightHtmlStyle })}</div>` : ""}${htmlSections}</article></body></html>`;
  }

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8" /><title>${draft.title}</title></head><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f7fb;padding:24px;"><article style="max-width:720px;margin:0 auto;background:#fff;border-radius:24px;padding:32px;border:1px solid #e5e7eb;"><h1 style="font-size:32px;line-height:1.35;margin-bottom:16px;color:#111827;">${draft.title}</h1><p style="font-size:16px;line-height:1.9;margin-bottom:24px;color:#4b5563;">${draft.summary}</p>${htmlSections}</article></body></html>`;
}

function getTemplatePreviewStyle(template: DraftFormatting["template"], primary: string, accent: string) {
  if (template === "暖色调") {
    return {
      shellGradient: "linear-gradient(180deg, rgba(255,247,237,0.98), rgba(255,255,255,1))",
      shellTint: "radial-gradient(circle at top left, rgba(251,146,60,0.16), transparent 42%)",
      heroGradient: `linear-gradient(145deg, ${primary}18, ${accent}28 55%, rgba(255,255,255,0.92))`,
      heroBorder: `${primary}28`,
      sectionBackground: "rgba(255,247,237,0.72)",
      bodyOverlay: "radial-gradient(circle at top right, rgba(251,146,60,0.10), transparent 30%)",
      accentSoft: "rgba(251,146,60,0.14)",
    };
  }

  if (template === "商务灰") {
    return {
      shellGradient: "linear-gradient(180deg, rgba(248,250,252,0.98), rgba(255,255,255,1))",
      shellTint: "radial-gradient(circle at top left, rgba(124,58,237,0.12), transparent 44%)",
      heroGradient: `linear-gradient(145deg, rgba(255,255,255,0.96), ${accent}14 52%, ${primary}10)`,
      heroBorder: "rgba(148,163,184,0.28)",
      sectionBackground: "rgba(248,250,252,0.9)",
      bodyOverlay: "linear-gradient(180deg, rgba(15,23,42,0.02), transparent 18%)",
      accentSoft: "rgba(124,58,237,0.10)",
    };
  }

  if (template === "深色") {
    return {
      shellGradient: "linear-gradient(180deg, rgba(2,6,23,0.98), rgba(15,23,42,1))",
      shellTint: "radial-gradient(circle at top left, rgba(16,185,129,0.18), transparent 46%)",
      heroGradient: `linear-gradient(150deg, rgba(15,23,42,0.98), ${primary}18 58%, rgba(15,23,42,0.94))`,
      heroBorder: "rgba(71,85,105,0.5)",
      sectionBackground: "rgba(15,23,42,0.7)",
      bodyOverlay: "radial-gradient(circle at top right, rgba(16,185,129,0.10), transparent 32%)",
      accentSoft: "rgba(16,185,129,0.12)",
    };
  }

  if (template === "极简白") {
    return {
      shellGradient: "linear-gradient(180deg, rgba(255,255,255,0.99), rgba(249,250,251,1))",
      shellTint: "radial-gradient(circle at top left, rgba(37,99,235,0.08), transparent 42%)",
      heroGradient: `linear-gradient(145deg, rgba(255,255,255,0.95), ${primary}10 60%, rgba(255,255,255,1))`,
      heroBorder: "rgba(226,232,240,0.9)",
      sectionBackground: "rgba(248,250,252,0.9)",
      bodyOverlay: "linear-gradient(180deg, rgba(148,163,184,0.06), transparent 16%)",
      accentSoft: "rgba(37,99,235,0.10)",
    };
  }

  return {
    shellGradient: "linear-gradient(180deg, rgba(239,246,255,0.98), rgba(255,255,255,1))",
    shellTint: "radial-gradient(circle at top left, rgba(59,130,246,0.14), transparent 44%)",
    heroGradient: `linear-gradient(145deg, rgba(255,255,255,0.96), ${primary}16 56%, ${accent}10)`,
    heroBorder: `${primary}20`,
    sectionBackground: "rgba(239,246,255,0.78)",
    bodyOverlay: "radial-gradient(circle at top right, rgba(59,130,246,0.10), transparent 30%)",
    accentSoft: "rgba(59,130,246,0.10)",
  };
}

function getWechatDomainPreviewStyle(domain: ArticleDomain, primary: string, accent: string) {
  const config = domainConfigs[domain];

  const base = {
    badgeText: `${config.icon} ${config.label}`,
    badgeStyle: {
      background: `linear-gradient(135deg, ${primary}, ${accent})`,
      color: "#ffffff",
    } as CSSProperties,
    titleStyle: {
      color: "rgba(0,0,0,0.9)",
      fontWeight: 500,
      fontFamily: "inherit",
      textAlign: "left" as const,
      fontSize: "24px",
      lineHeight: 1.45,
      letterSpacing: "0.01em",
    },
    metaAlign: "flex-start" as const,
    summaryStyle: {
      background: "#f8fafc",
      border: `1px solid ${primary}18`,
      color: "#4a4a4a",
      borderRadius: "14px",
      padding: "16px 18px",
    } as CSSProperties,
    summaryTextAlign: "left" as const,
    summaryFontStyle: "normal" as const,
    headingMode: "bar" as "bar" | "underline" | "center" | "card",
    headingTextColor: "rgba(0,0,0,0.9)",
    headingFontWeight: 700,
    headingFontFamily: "inherit",
    paragraphColor: "#4a4a4a",
    paragraphFontSize: "16px",
    paragraphLineHeight: 1.88,
    paragraphLetterSpacing: "0.018em",
    paragraphFontFamily: "inherit",
    quoteBackground: "#efefef",
    quoteTextColor: "rgba(0,0,0,0.58)",
    highlightBackground: "#f8f8f8",
    highlightBorderColor: `${primary}22`,
    goldenBackground: "#f6f7f9",
    goldenBorderColor: primary,
    goldenTextColor: "#1f2937",
    goldenTextAlign: "left" as const,
    dividerColor: "#efefef",
    imageFrameStyle: {
      borderColor: "#f0f0f0",
      background: "#fafafa",
      borderRadius: "10px",
      boxShadow: "none",
    } as CSSProperties,
    imageCaptionColor: "#999999",
    imagePlaceholderChipStyle: {
      borderColor: "#e5e7eb",
      background: "#ffffff",
      color: "#888888",
    } as CSSProperties,
  };

  if (domain === "教育") {
    return {
      ...base,
      titleStyle: {
        ...base.titleStyle,
        fontWeight: 700,
        color: "#2f3a2f",
        letterSpacing: "0.015em",
      },
      summaryStyle: {
        background: "linear-gradient(135deg, #fff5eb, #ffe8d9)",
        border: "none",
        color: "#4b5563",
        borderRadius: "16px",
        padding: "16px 18px",
      } as CSSProperties,
      headingMode: "bar" as const,
      headingTextColor: "#2c3e50",
      headingFontWeight: 700,
      paragraphColor: "#555555",
      paragraphLineHeight: 1.95,
      quoteBackground: "#fffaf1",
      quoteTextColor: "#6b5f55",
      highlightBackground: "#fff7ed",
      highlightBorderColor: "#fdba74",
      goldenBackground: "linear-gradient(135deg, #fff7ed, #ffedd5)",
      goldenBorderColor: "#fb923c",
      goldenTextColor: "#7c4a03",
      dividerColor: "#f3dfc8",
      imageFrameStyle: {
        borderColor: "#f6d7b8",
        background: "#fffaf5",
        borderRadius: "14px",
        boxShadow: "0 8px 24px rgba(251,146,60,0.08)",
      } as CSSProperties,
    };
  }

  if (domain === "旅游") {
    return {
      ...base,
      titleStyle: {
        ...base.titleStyle,
        color: "#1f4d63",
        fontWeight: 700,
        letterSpacing: "0.02em",
      },
      summaryStyle: {
        background: "linear-gradient(135deg, #e0f2fe, #dbeafe)",
        border: "none",
        color: "#33536b",
        borderRadius: "18px",
        padding: "16px 18px",
      } as CSSProperties,
      headingMode: "underline" as const,
      headingTextColor: "#1e3a5f",
      headingFontWeight: 700,
      paragraphColor: "#475569",
      paragraphLineHeight: 1.95,
      paragraphLetterSpacing: "0.022em",
      quoteBackground: "#f0f9ff",
      quoteTextColor: "#486274",
      highlightBackground: "#f0f9ff",
      highlightBorderColor: "#7dd3fc",
      goldenBackground: "linear-gradient(135deg, #eef9ff, #dff6ff)",
      goldenBorderColor: "#38bdf8",
      goldenTextColor: "#0f4c5f",
      dividerColor: "#d7ecf7",
      imageFrameStyle: {
        borderColor: "#d6eef8",
        background: "#f6fcff",
        borderRadius: "18px",
        boxShadow: "0 10px 30px rgba(14,165,233,0.10)",
      } as CSSProperties,
      imageCaptionColor: "#7b99aa",
    };
  }

  if (domain === "情感") {
    return {
      ...base,
      titleStyle: {
        color: "#3d3d3d",
        fontWeight: 600,
        fontFamily: "Georgia, 'Songti SC', 'STSong', serif",
        textAlign: "center" as const,
        fontSize: "25px",
        lineHeight: 1.58,
        letterSpacing: "0.025em",
      },
      metaAlign: "center" as const,
      summaryStyle: {
        background: "transparent",
        border: "none",
        color: "#666666",
        borderRadius: "0px",
        padding: "12px 0 0",
      } as CSSProperties,
      summaryTextAlign: "center" as const,
      summaryFontStyle: "italic" as const,
      headingMode: "center" as const,
      headingTextColor: "#3d3d3d",
      headingFontWeight: 600,
      headingFontFamily: "Georgia, 'Songti SC', 'STSong', serif",
      paragraphColor: "#555555",
      paragraphLineHeight: 2.02,
      paragraphLetterSpacing: "0.028em",
      paragraphFontFamily: "Georgia, 'Songti SC', 'STSong', serif",
      quoteBackground: "#fffafb",
      quoteTextColor: "#7a6b70",
      highlightBackground: "#fff1f2",
      highlightBorderColor: "#f9a8d4",
      goldenBackground: "linear-gradient(135deg, #fff6f8, #fff1f2)",
      goldenBorderColor: "#ec4899",
      goldenTextColor: "#7a284d",
      goldenTextAlign: "center" as const,
      dividerColor: "#f4d7df",
      imageFrameStyle: {
        borderColor: "#f2d7df",
        background: "#fffafb",
        borderRadius: "18px",
        boxShadow: "0 10px 28px rgba(244,114,182,0.08)",
      } as CSSProperties,
      imageCaptionColor: "#a17f89",
    };
  }

  if (domain === "社会") {
    return {
      ...base,
      titleStyle: {
        color: "#1a1a1a",
        fontWeight: 800,
        fontFamily: "inherit",
        textAlign: "center" as const,
        fontSize: "25px",
        lineHeight: 1.42,
        letterSpacing: "0.012em",
      },
      metaAlign: "center" as const,
      summaryStyle: {
        background: "linear-gradient(135deg, #fff9e6, #fff3e0)",
        border: "2px dashed #ffd93d",
        color: "#333333",
        borderRadius: "18px",
        padding: "16px 18px",
      } as CSSProperties,
      summaryTextAlign: "center" as const,
      headingMode: "card" as const,
      headingTextColor: "#1a1a1a",
      headingFontWeight: 800,
      paragraphColor: "#333333",
      paragraphLineHeight: 1.92,
      paragraphLetterSpacing: "0.015em",
      quoteBackground: "#f7f7f2",
      quoteTextColor: "#5d6058",
      highlightBackground: "#fff9e6",
      highlightBorderColor: "#facc15",
      goldenBackground: "linear-gradient(135deg, #fffef0, #fff7cc)",
      goldenBorderColor: "#eab308",
      goldenTextColor: "#5f4600",
      dividerColor: "#e6dcc2",
      imageFrameStyle: {
        borderColor: "#e8dfc6",
        background: "#fffdf7",
        borderRadius: "12px",
        boxShadow: "0 10px 26px rgba(234,179,8,0.08)",
      } as CSSProperties,
    };
  }

  if (domain === "汽车") {
    return {
      ...base,
      titleStyle: {
        ...base.titleStyle,
        color: "#111827",
        fontWeight: 800,
        letterSpacing: "0.005em",
      },
      summaryStyle: {
        background: "linear-gradient(135deg, #1e293b, #334155)",
        border: "none",
        color: "#e2e8f0",
        borderRadius: "18px",
        padding: "18px 18px",
      } as CSSProperties,
      headingMode: "bar" as const,
      headingTextColor: "#1a1a1a",
      headingFontWeight: 800,
      paragraphColor: "#333333",
      paragraphLineHeight: 1.84,
      paragraphLetterSpacing: "0.012em",
      quoteBackground: "#f3f6fa",
      quoteTextColor: "#4b5563",
      highlightBackground: "#eff6ff",
      highlightBorderColor: "#93c5fd",
      goldenBackground: "linear-gradient(135deg, #f8fbff, #e8f1ff)",
      goldenBorderColor: "#3b82f6",
      goldenTextColor: "#1e3a8a",
      dividerColor: "#d9e3ef",
      imageFrameStyle: {
        borderColor: "#cbd5e1",
        background: "#f8fafc",
        borderRadius: "12px",
        boxShadow: "0 12px 26px rgba(15,23,42,0.10)",
      } as CSSProperties,
      imageCaptionColor: "#7b8794",
    };
  }

  if (domain === "科技") {
    return {
      ...base,
      titleStyle: {
        ...base.titleStyle,
        color: "#0f172a",
        fontWeight: 800,
        letterSpacing: "-0.005em",
      },
      summaryStyle: {
        background: "linear-gradient(135deg, #eff6ff, #eef2ff)",
        border: `1px solid ${primary}18`,
        color: "#334155",
        borderRadius: "16px",
        padding: "16px 18px",
      } as CSSProperties,
      headingTextColor: "#0f172a",
      headingFontWeight: 800,
      paragraphColor: "#334155",
      paragraphLineHeight: 1.86,
      paragraphLetterSpacing: "0.012em",
      quoteBackground: "#f4f8ff",
      quoteTextColor: "#475569",
      highlightBackground: "#eef4ff",
      highlightBorderColor: "#93c5fd",
      goldenBackground: "linear-gradient(135deg, #f8fbff, #edf4ff)",
      goldenBorderColor: "#2563eb",
      goldenTextColor: "#1e40af",
      dividerColor: "#dbe6f5",
      imageFrameStyle: {
        borderColor: "#d8e5f7",
        background: "#f8fbff",
        borderRadius: "14px",
        boxShadow: "0 10px 28px rgba(37,99,235,0.08)",
      } as CSSProperties,
      imageCaptionColor: "#7b8da5",
    };
  }

  return base;
}

export function FormatEditor() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { drafts, settings, getDraftById, updateDraft, publishDraft } = useAppStore();
  const latestDraft = useMemo(
    () => [...drafts].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0],
    [drafts],
  );
  const draftId = searchParams.get("draftId");
  const currentDraft = draftId ? getDraftById(draftId) ?? latestDraft : latestDraft;

  const [title, setTitle] = useState(currentDraft?.title ?? "");
  const [summary, setSummary] = useState(currentDraft?.summary ?? "");
  const [body, setBody] = useState(currentDraft?.body ?? "");
  const [formatting, setFormatting] = useState<DraftFormatting>(
    currentDraft?.formatting ?? createDefaultFormatting(settings.defaultTemplate),
  );
  const [publishChannel, setPublishChannel] = useState<(typeof publishChannels)[number]>(currentDraft?.publishedChannel ?? "公众号");
  const [notice, setNotice] = useState("");
  const [previewMode, setPreviewMode] = useState<(typeof previewModes)[number]>("mobile");
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const bodySelectionRef = useRef({ start: 0, end: 0 });
  const toolbarMoreRef = useRef<HTMLDivElement>(null);
  const toolbarMoreMenuRef = useRef<HTMLDivElement>(null);
  const toolbarActionRef = useRef<HTMLDivElement>(null);
  const toolbarActionMenuRef = useRef<HTMLDivElement>(null);
  const [isImagePanelOpen, setIsImagePanelOpen] = useState(false);
  const [activeImageTab, setActiveImageTab] = useState<ImagePanelTab>("upload");
  const [imageUrl, setImageUrl] = useState("");
  const [imageCaption, setImageCaption] = useState("");
  const [imageSearchQuery, setImageSearchQuery] = useState("");
  const [imageSearchResults, setImageSearchResults] = useState<RealImageSearchItem[]>([]);
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageInsertMode, setImageInsertMode] = useState<ImageInsertMode>("auto");
  const [imageLoading, setImageLoading] = useState<"upload" | "search" | "generate" | null>(null);
  const [wechatDraftLoading, setWechatDraftLoading] = useState(false);
  const [wechatDraftChecking, setWechatDraftChecking] = useState(false);
  const [wechatDraftCheckItems, setWechatDraftCheckItems] = useState<WechatDraftCheckItem[]>([]);
  const [wechatAccounts, setWechatAccounts] = useState<WechatAccountView[]>([]);
  const [selectedWechatAccountId, setSelectedWechatAccountId] = useState<string | null>(null);
  const [isToolbarMoreOpen, setIsToolbarMoreOpen] = useState(false);
  const [toolbarMoreMenuPosition, setToolbarMoreMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [isToolbarActionOpen, setIsToolbarActionOpen] = useState(false);
  const [toolbarActionMenuPosition, setToolbarActionMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const selectedWechatAccount = useMemo(
    () => wechatAccounts.find((account) => account.id === selectedWechatAccountId) ?? wechatAccounts[0] ?? null,
    [selectedWechatAccountId, wechatAccounts],
  );
  const previewAccountName = selectedWechatAccount?.name || settings.accountName;
  const previewAccountInitials = previewAccountName.slice(0, 2);

  useEffect(() => {
    if (draftId || !currentDraft) return;

    startTransition(() => {
      router.replace(`/format-editor?draftId=${currentDraft.id}`);
    });
  }, [currentDraft, draftId, router]);

  useEffect(() => {
    if (!currentDraft) return;
    setTitle(currentDraft.title);
    setSummary(currentDraft.summary);
    setBody(currentDraft.body);
    setFormatting(currentDraft.formatting ?? createDefaultFormatting(settings.defaultTemplate));
    setPublishChannel(currentDraft.publishedChannel ?? "公众号");
  }, [currentDraft, settings.defaultTemplate]);

  useEffect(() => {
    let ignore = false;

    const loadWechatAccounts = async () => {
      try {
        const response = await fetch("/api/wechat/accounts", { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload || ignore) return;

        setWechatAccounts(Array.isArray(payload.accounts) ? payload.accounts as WechatAccountView[] : []);
        setSelectedWechatAccountId(typeof payload.selectedAccountId === "string" ? payload.selectedAccountId : null);
      } catch {
        if (!ignore) {
          setWechatAccounts([]);
          setSelectedWechatAccountId(null);
        }
      }
    };

    void loadWechatAccounts();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!isToolbarMoreOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!toolbarMoreRef.current?.contains(target) && !toolbarMoreMenuRef.current?.contains(target)) {
        setIsToolbarMoreOpen(false);
      }
    };

    const updateToolbarMoreMenuPosition = () => {
      const rect = toolbarMoreRef.current?.getBoundingClientRect();
      if (!rect) return;

      const menuWidth = 188;
      const viewportPadding = 12;
      const maxLeft = Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding);
      setToolbarMoreMenuPosition({
        top: rect.bottom + 8,
        left: Math.min(rect.left, maxLeft),
      });
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsToolbarMoreOpen(false);
      }
    };

    updateToolbarMoreMenuPosition();
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("resize", updateToolbarMoreMenuPosition);
    window.addEventListener("scroll", updateToolbarMoreMenuPosition, true);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("resize", updateToolbarMoreMenuPosition);
      window.removeEventListener("scroll", updateToolbarMoreMenuPosition, true);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isToolbarMoreOpen]);

  useEffect(() => {
    if (!isToolbarActionOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!toolbarActionRef.current?.contains(target) && !toolbarActionMenuRef.current?.contains(target)) {
        setIsToolbarActionOpen(false);
      }
    };

    const updateToolbarActionMenuPosition = () => {
      const rect = toolbarActionRef.current?.getBoundingClientRect();
      if (!rect) return;

      const menuWidth = 196;
      const viewportPadding = 12;
      const maxLeft = Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding);
      setToolbarActionMenuPosition({
        top: rect.bottom + 8,
        left: Math.min(rect.left, maxLeft),
      });
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsToolbarActionOpen(false);
      }
    };

    updateToolbarActionMenuPosition();
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("resize", updateToolbarActionMenuPosition);
    window.addEventListener("scroll", updateToolbarActionMenuPosition, true);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("resize", updateToolbarActionMenuPosition);
      window.removeEventListener("scroll", updateToolbarActionMenuPosition, true);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isToolbarActionOpen]);

  const activeScheme = colorSchemes.find((item) => item.name === formatting.colorScheme) ?? colorSchemes[0];
  const deferredBody = useDeferredValue(body);
  const previewBlocks = useMemo(() => extractContentBlocks(deferredBody), [deferredBody]);
  const articleDate = currentDraft ? formatDraftTime(currentDraft.updatedAt).split(" ")[0] : formatDraftTime(new Date().toISOString()).split(" ")[0];
  const isWechatChannel = publishChannel === "公众号";
  const articleDomain = currentDraft?.domain ?? "科技";
  const domainMeta = domainConfigs[articleDomain];
  const readingMinutes = Math.max(3, Math.ceil(body.replace(/\s+/g, "").length / 350));
  const bodyWords = body.replace(/\s+/g, "").length;
  const normalizedTitle = title.trim();
  const titleLength = normalizedTitle.length;
  const isWechatTitleTooLong = titleLength > WECHAT_TITLE_LIMIT;
  const isDarkTemplate = formatting.template === "深色";
  const textPrimary = isWechatChannel ? "rgba(0,0,0,0.9)" : isDarkTemplate ? "#f9fafb" : "#111827";
  const textSecondary = isWechatChannel ? "#4a4a4a" : isDarkTemplate ? "#d1d5db" : "#4b5563";
  const textMuted = isWechatChannel ? "#8c8c8c" : isDarkTemplate ? "#94a3b8" : "#9ca3af";
  const surfaceBackground = isWechatChannel ? "#ffffff" : isDarkTemplate ? "#0f172a" : "#ffffff";
  const phoneShellBackground = isWechatChannel ? "#ffffff" : isDarkTemplate ? "#0b1120" : "#ffffff";
  const previewWidth = previewMode === "mobile" ? 390 : 760;
  const domainPreviewStyle = useMemo(
    () => getWechatDomainPreviewStyle(articleDomain, activeScheme.primary, activeScheme.accent),
    [activeScheme.accent, activeScheme.primary, articleDomain],
  );
  const highlightBackground = isWechatChannel
    ? domainPreviewStyle.highlightBackground
    : isDarkTemplate
      ? "rgba(59,130,246,0.12)"
      : `${activeScheme.primary}08`;
  const previewThemeStyle = useMemo(
    () => getTemplatePreviewStyle(formatting.template, activeScheme.primary, activeScheme.accent),
    [activeScheme.accent, activeScheme.primary, formatting.template],
  );
  const inlineHighlightStyle = useMemo(
    () => getInlineHighlightStyle(activeScheme.primary, activeScheme.accent),
    [activeScheme.accent, activeScheme.primary],
  );
  const headingCount = useMemo(() => previewBlocks.filter((block) => block.type === "heading").length, [previewBlocks]);
  const leadParagraphIndex = useMemo(() => previewBlocks.findIndex((block) => block.type === "paragraph"), [previewBlocks]);
  const estimatedCards = Math.max(1, previewBlocks.filter((block) => block.type === "golden" || block.type === "highlight" || block.type === "quote").length);
  const isDirty = Boolean(
    currentDraft &&
      (
        currentDraft.title !== title ||
        currentDraft.summary !== summary ||
        currentDraft.body !== body ||
        currentDraft.publishedChannel !== publishChannel ||
        JSON.stringify(currentDraft.formatting) !== JSON.stringify(formatting)
      ),
  );
  const currentDraftStatusStyle = draftStatusStyles[currentDraft.status];
  const currentDraftPreview =
    summary.trim() ||
    body
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) ||
    domainMeta.description;
  const currentDraftMetrics = [
    { label: "字数", value: bodyWords.toLocaleString(), hint: "正文" },
    { label: "阅读", value: `${readingMinutes} 分钟`, hint: "预估" },
    { label: "章节", value: String(Math.max(headingCount, body.trim() ? 1 : 0)), hint: "小标题" },
    { label: "重点", value: String(estimatedCards), hint: "高亮卡片" },
  ] as const;
  const draftSyncBadge = isDirty
    ? {
        label: "待保存",
        description: "当前内容有改动",
        className: "border-amber-200 bg-amber-50 text-amber-700",
      }
    : {
        label: "已同步",
        description: "草稿内容已落盘",
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      };

  const openImagePanel = () => {
    setIsImagePanelOpen(true);
    setActiveImageTab(shouldPreferRealImage(articleDomain) ? "search" : "ai");
    setImageCaption((current) => current || title || currentDraft?.title || "文章配图");
    setImageSearchResults([]);
    setImageSearchQuery((current) => current || buildAutoImageSearchQuery({
      title: title || currentDraft?.title || "",
      summary,
      body,
      domain: articleDomain,
    }));
    setImagePrompt((current) => current || `${articleDomain}主题公众号文章配图，呼应标题《${title || currentDraft?.title || "未命名文章"}》，简洁高级，适合中文内容封面插图`);
  };

  const syncBodySelection = () => {
    const textarea = bodyTextareaRef.current;
    if (!textarea) return;
    bodySelectionRef.current = {
      start: textarea.selectionStart ?? 0,
      end: textarea.selectionEnd ?? 0,
    };
  };

  const insertImageToBody = (url: string, caption: string) => {
    const snippet = buildImageSnippet(url, caption);

    setBody((currentBody) => {
      const placeholderPattern = /\[图片占位[^\]]*\]/;
      const { start, end } = bodySelectionRef.current;
      const safeStart = Math.max(0, Math.min(start, currentBody.length));
      const safeEnd = Math.max(safeStart, Math.min(end, currentBody.length));

      if (imageInsertMode === "auto" && placeholderPattern.test(currentBody)) {
        return currentBody.replace(placeholderPattern, snippet);
      }

      if (imageInsertMode !== "end") {
        const before = currentBody.slice(0, safeStart).replace(/\s*$/, "");
        const after = currentBody.slice(safeEnd).replace(/^\s*/, "");

        if (before || after) {
          return [before, snippet, after].filter(Boolean).join("\n\n");
        }
      }

      return [currentBody.replace(/\s+$/, ""), snippet].filter(Boolean).join("\n\n");
    });

    setImageUrl("");
    setImageCaption(caption);
    setNotice(
      imageInsertMode === "auto"
        ? "图片已插入正文"
        : imageInsertMode === "cursor"
          ? "图片已插入到当前光标位置"
          : "图片已追加到正文末尾",
    );
    window.setTimeout(() => setNotice(""), 2000);
  };

  const searchImages = async (query: string) => {
    setImageLoading("search");

    try {
      const response = await fetch("/api/images/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          title: title || currentDraft?.title || "",
          summary,
          body,
          domain: articleDomain,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.url) {
        throw new Error(payload?.message ?? "联网搜图失败");
      }

      const results = Array.isArray(payload.results) ? payload.results as RealImageSearchItem[] : [];
      setImageSearchResults(results);
      return {
        url: payload.url as string,
        results,
      };
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "联网搜图失败");
    } finally {
      setImageLoading(null);
    }
  };

  const handleInsertImageByUrl = () => {
    if (!imageUrl.trim()) {
      setNotice("请先输入图片链接");
      window.setTimeout(() => setNotice(""), 2000);
      return;
    }

    insertImageToBody(imageUrl, imageCaption || title || "文章配图");
    setIsImagePanelOpen(false);
  };

  const handleUploadImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImageLoading("upload");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/images/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error((await response.json().catch(() => null))?.message ?? "上传失败");
      }

      const payload = await response.json();
      insertImageToBody(payload.url as string, imageCaption || file.name.replace(/\.[^.]+$/, "") || "文章配图");
      setIsImagePanelOpen(false);
    } catch {
      const reader = new FileReader();

      reader.onload = () => {
        if (typeof reader.result === "string") {
          insertImageToBody(reader.result, imageCaption || file.name.replace(/\.[^.]+$/, "") || "文章配图");
          setIsImagePanelOpen(false);
        } else {
          setNotice("图片插入失败");
          window.setTimeout(() => setNotice(""), 2000);
        }
      };

      reader.onerror = () => {
        setNotice("图片插入失败");
        window.setTimeout(() => setNotice(""), 2000);
      };

      reader.readAsDataURL(file);
    } finally {
      setImageLoading(null);
      event.target.value = "";
    }
  };

  const handleGenerateImage = async () => {
    if (!imagePrompt.trim()) {
      setNotice("请先补充图片提示词");
      window.setTimeout(() => setNotice(""), 2000);
      return;
    }

    await generateImageAndInsert(imagePrompt, imageCaption || title || "AI 配图");
  };

  const handleSearchImage = async () => {
    if (!imageSearchQuery.trim()) {
      setNotice("请先补充搜图关键词");
      window.setTimeout(() => setNotice(""), 2000);
      return;
    }

    try {
      const payload = await searchImages(imageSearchQuery);
      if (!payload.results.length) {
        throw new Error("暂时没有找到合适的真实图片");
      }
      setNotice("已找到候选图片，点选即可插入");
      window.setTimeout(() => setNotice(""), 2200);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "联网搜图失败");
      window.setTimeout(() => setNotice(""), 2600);
    }
  };

  const generateImageAndInsert = async (prompt: string, caption: string) => {
    setImageLoading("generate");

    try {
      const response = await fetch("/api/ai/image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          title: title || currentDraft?.title || "",
          summary,
          domain: articleDomain,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.url) {
        throw new Error(payload?.message ?? "AI 图片生成失败");
      }

      insertImageToBody(payload.url as string, caption);
      setIsImagePanelOpen(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "AI 图片生成失败");
      window.setTimeout(() => setNotice(""), 2600);
    } finally {
      setImageLoading(null);
    }
  };

  const handleAutoGenerateImage = async () => {
    const articleTitle = title || currentDraft?.title || "";
    const query = buildAutoImageSearchQuery({
      title: articleTitle,
      summary,
      body,
      domain: articleDomain,
    });
    const prompt = buildAutoImagePrompt({
      title: articleTitle,
      summary,
      body,
      domain: articleDomain,
    });
    const caption = imageCaption || buildAutoImageCaption({
      title: articleTitle,
      summary,
      domain: articleDomain,
    });

    setImageSearchQuery(query);
    setImagePrompt(prompt);
    setImageCaption(caption);

    if (shouldPreferRealImage(articleDomain)) {
      try {
        const payload = await searchImages(query);
        if (payload.url) {
          insertImageToBody(payload.url, caption);
          setIsImagePanelOpen(false);
          return;
        }
        return;
      } catch {
        setNotice("未找到合适实拍图，已自动回退到 AI 配图");
        window.setTimeout(() => setNotice(""), 2400);
      }
    }

    await generateImageAndInsert(prompt, caption);
  };

  const appendBlock = (label: (typeof moduleTools)[number]["label"]) => {
    if (label === "图片") {
      openImagePanel();
      return;
    }

    const snippets: Record<(typeof moduleTools)[number]["label"], string> = {
      标题: `${title}｜排版版`,
      小标题: "## 新增小节标题",
      段落: "请在这里补充一段更适合公众号排版阅读的正文内容。",
      引用块: "> 这里是一段适合高亮展示的引用或观点。",
      分割线: "---",
      图片: "[图片占位：请在公众号后台替换真实配图]",
      金句卡片: "【金句】好的内容，不是堆信息，而是帮读者快速建立判断。",
      CTA: settings.ctaEngage,
    };

    if (label === "标题") {
      setTitle(snippets[label]);
      return;
    }

    setBody((currentBody) => [currentBody, snippets[label]].filter(Boolean).join("\n\n"));
  };

  const handleSave = () => {
    if (!currentDraft) return;
    updateDraft(currentDraft.id, {
      title,
      summary,
      body,
      formatting,
      publishedChannel: publishChannel,
    });
    setNotice("排版已保存");
    window.setTimeout(() => setNotice(""), 2000);
  };

  const handleRestoreDraft = () => {
    if (!currentDraft) return;
    setIsToolbarMoreOpen(false);
    setTitle(currentDraft.title);
    setSummary(currentDraft.summary);
    setBody(currentDraft.body);
    setFormatting(currentDraft.formatting ?? createDefaultFormatting(settings.defaultTemplate));
    setPublishChannel(currentDraft.publishedChannel ?? "公众号");
    setNotice("已恢复到草稿原始内容");
    window.setTimeout(() => setNotice(""), 2000);
  };

  const handleScrollPreviewTop = () => {
    previewScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCopy = async () => {
    if (!currentDraft) return;
    setIsToolbarMoreOpen(false);
    await navigator.clipboard.writeText(buildWechatText({ ...currentDraft, title, summary }, body, settings.ctaEngage));
    updateDraft(currentDraft.id, {
      title,
      summary,
      body,
      formatting,
      publishedChannel: publishChannel,
      lastExportFormat: "wechat",
      lastExportedAt: new Date().toISOString(),
    });
    setNotice("已复制公众号格式");
    window.setTimeout(() => setNotice(""), 2000);
  };

  const handleExport = (type: "html" | "md") => {
    if (!currentDraft) return;
    setIsToolbarMoreOpen(false);
    const fileName = `${title || currentDraft.title}.${type === "html" ? "html" : "md"}`;
    const content =
      type === "html"
        ? buildHtml(
            { ...currentDraft, title, summary },
            body,
            formatting,
            activeScheme.primary,
            activeScheme.accent,
            publishChannel,
            previewAccountName,
            articleDomain,
          )
        : buildMarkdown({ ...currentDraft, title, summary }, body);

    const blob = new Blob([content], { type: type === "html" ? "text/html;charset=utf-8" : "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    updateDraft(currentDraft.id, {
      title,
      summary,
      body,
      formatting,
      publishedChannel: publishChannel,
      lastExportFormat: type,
      lastExportedAt: new Date().toISOString(),
    });
    setNotice(type === "html" ? "HTML 已导出" : "Markdown 已导出");
    window.setTimeout(() => setNotice(""), 2000);
  };

  const handlePublish = () => {
    if (!currentDraft) return;
    setIsToolbarActionOpen(false);
    publishDraft(currentDraft.id, {
      title,
      summary,
      body,
      formatting,
      publishedChannel: publishChannel,
      lastExportFormat: publishChannel === "公众号" ? "wechat" : currentDraft.lastExportFormat,
    });
    setNotice("已标记为已发布");
    window.setTimeout(() => setNotice(""), 2000);
    router.push("/published");
  };

  const runWechatDraftCheck = async () => {
    const response = await fetch("/api/wechat/draft/check", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        summary,
        body,
        author: selectedWechatAccount?.name || settings.accountName,
        domain: articleDomain,
        accountId: selectedWechatAccountId,
      }),
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok || !Array.isArray(payload?.items)) {
      throw new Error(payload?.message ?? "推送前检查失败");
    }

    const items = payload.items as WechatDraftCheckItem[];
    setWechatDraftCheckItems(items);
    return {
      ok: Boolean(payload.ok),
      items,
    };
  };

  const handleCheckWechatDraft = async () => {
    if (!currentDraft || wechatDraftChecking) return;

    setWechatDraftChecking(true);

    try {
      const result = await runWechatDraftCheck();
      if (result.ok) {
        toast.success("推送前检查通过");
      } else {
        const firstIssue = result.items.find((item) => !item.ok);
        toast.error(firstIssue?.message ?? "推送前检查未通过");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "推送前检查失败");
    } finally {
      setWechatDraftChecking(false);
    }
  };

  const handlePushToWechatDraft = async () => {
    if (!currentDraft || wechatDraftLoading) return;

    setWechatDraftLoading(true);

    try {
      const checkResult = await runWechatDraftCheck();
      if (!checkResult.ok) {
        const firstIssue = checkResult.items.find((item) => !item.ok);
        throw new Error(firstIssue?.message ?? "推送前检查未通过");
      }

      const response = await fetch("/api/wechat/draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          summary,
          body,
          author: selectedWechatAccount?.name || settings.accountName,
          domain: articleDomain,
          accountId: selectedWechatAccountId,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message ?? "推送公众号草稿箱失败");
      }

      updateDraft(currentDraft.id, {
        title,
        summary,
        body,
        formatting,
        publishedChannel: "公众号",
        lastExportFormat: "wechat",
        lastExportedAt: new Date().toISOString(),
      });

      setPublishChannel("公众号");
      toast.success(
        `已推送到公众号草稿箱${payload?.accountName ? ` · ${payload.accountName}` : ""}${payload?.digestTruncated ? " · 摘要已自动截断" : ""}${payload?.mediaId ? ` · media_id: ${payload.mediaId}` : ""}`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "推送公众号草稿箱失败");
    } finally {
      setWechatDraftLoading(false);
    }
  };

  const handleBackToWriting = () => {
    if (!currentDraft) return;
    setIsToolbarActionOpen(false);
    router.push(`/writing?draftId=${currentDraft.id}`);
  };

  if (!currentDraft) {
    return (
      <div className="max-w-[720px] mx-auto py-16 text-center space-y-4">
        <div className="text-[22px]" style={{ fontWeight: 600 }}>还没有可排版的草稿</div>
        <p className="text-[14px] text-gray-500">先去生成一篇文章草稿，再回来做公众号排版。</p>
        <div className="flex items-center justify-center gap-3">
          <Link href="/topic-center" className="px-4 py-2 rounded-lg bg-blue-600 text-white text-[13px]">去选题中心</Link>
          <Link href="/drafts" className="px-4 py-2 rounded-lg border border-gray-200 text-[13px] text-gray-600">查看草稿箱</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-gray-200 bg-white overflow-x-auto overflow-y-hidden">
        <div className="flex min-w-max items-center gap-2 px-4 py-2">
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={handleSave} disabled={!isDirty} className="flex shrink-0 items-center gap-1.5 whitespace-nowrap border border-gray-200 px-3 py-1.5 rounded-lg text-[12px] text-gray-600 hover:bg-gray-50 disabled:text-gray-300 disabled:bg-gray-50 disabled:cursor-not-allowed" style={{ fontWeight: 500 }}>
            <Save className="w-3.5 h-3.5" /> 保存排版
          </button>
          {wechatAccounts.length ? (
            <div className="relative shrink-0">
              <select
                value={selectedWechatAccountId ?? wechatAccounts[0]?.id ?? ""}
                onChange={(event) => setSelectedWechatAccountId(event.target.value || null)}
                className="w-[168px] appearance-none rounded-lg border border-emerald-200 bg-white px-3 py-1.5 pr-8 text-[12px] text-gray-700"
              >
                {wechatAccounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            </div>
          ) : null}
          <button
            onClick={() => void handleCheckWechatDraft()}
            disabled={wechatDraftChecking || wechatDraftLoading}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap border border-emerald-200 text-emerald-700 px-3 py-1.5 rounded-lg text-[12px] hover:bg-emerald-50 disabled:opacity-60"
            style={{ fontWeight: 500 }}
          >
            {wechatDraftChecking ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5" />}
            推送检查
          </button>
          <button
            onClick={() => void handlePushToWechatDraft()}
            disabled={wechatDraftLoading}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-[12px] hover:bg-emerald-700 disabled:bg-emerald-300 disabled:cursor-not-allowed"
            style={{ fontWeight: 500 }}
          >
            {wechatDraftLoading ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            推送草稿箱
          </button>
        </div>
        <div className="w-px h-6 bg-gray-200 mx-1 shrink-0" />
        <div className="flex items-center gap-1 shrink-0">
          <div className="relative shrink-0">
            <select
              value={publishChannel}
              onChange={(event) => setPublishChannel(event.target.value as (typeof publishChannels)[number])}
              className="w-[110px] appearance-none rounded-lg border border-gray-200 bg-white px-3 py-1.5 pr-8 text-[12px] text-gray-600"
            >
              {publishChannels.map((channel) => (
                <option key={channel} value={channel}>{channel}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          </div>
          <div ref={toolbarMoreRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setIsToolbarMoreOpen((current) => !current)}
              className="flex shrink-0 items-center gap-1 whitespace-nowrap border border-gray-200 px-2.5 py-1.5 rounded-lg text-[12px] text-gray-600 hover:bg-gray-50"
              style={{ fontWeight: 500 }}
            >
              <MoreHorizontal className="w-3.5 h-3.5" /> 更多
            </button>
          </div>
          <div ref={toolbarActionRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setIsToolbarActionOpen((current) => !current)}
              className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-[12px] text-white hover:bg-slate-800"
              style={{ fontWeight: 500 }}
            >
              发布操作 <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {notice ? <span className="shrink-0 text-[12px] text-green-600 whitespace-nowrap px-1">{notice}</span> : null}
        </div>
      </div>
      {wechatDraftCheckItems.length ? (
        <div className="border-b border-emerald-100 bg-emerald-50/70 px-4 py-2">
          <div className="flex flex-wrap gap-2">
            {wechatDraftCheckItems.map((item) => (
              <span
                key={item.key}
                className={`rounded-full px-2.5 py-1 text-[11px] ${
                  item.ok ? "bg-white text-emerald-700" : "bg-red-50 text-red-600"
                }`}
                title={item.message}
              >
                {item.ok ? "通过" : "需处理"} · {item.label}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {isToolbarMoreOpen && toolbarMoreMenuPosition ? createPortal(
        <div
          ref={toolbarMoreMenuRef}
          className="fixed z-50 min-w-[188px] rounded-xl border border-gray-200 bg-white p-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.12)]"
          style={{
            top: toolbarMoreMenuPosition.top,
            left: toolbarMoreMenuPosition.left,
          }}
        >
          <button
            type="button"
            onClick={handleRestoreDraft}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] text-gray-700 hover:bg-gray-50"
          >
            <RotateCcw className="h-3.5 w-3.5" /> 恢复原稿
          </button>
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] text-gray-700 hover:bg-gray-50"
          >
            <Copy className="h-3.5 w-3.5" /> 复制公众号格式
          </button>
          <button
            type="button"
            onClick={() => handleExport("html")}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] text-gray-700 hover:bg-gray-50"
          >
            <FileCode className="h-3.5 w-3.5" /> 导出 HTML
          </button>
          <button
            type="button"
            onClick={() => handleExport("md")}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] text-gray-700 hover:bg-gray-50"
          >
            <Download className="h-3.5 w-3.5" /> 导出 Markdown
          </button>
        </div>,
        document.body,
      ) : null}
      {isToolbarActionOpen && toolbarActionMenuPosition ? createPortal(
        <div
          ref={toolbarActionMenuRef}
          className="fixed z-50 min-w-[196px] rounded-xl border border-gray-200 bg-white p-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.12)]"
          style={{
            top: toolbarActionMenuPosition.top,
            left: toolbarActionMenuPosition.left,
          }}
        >
          <button
            type="button"
            onClick={handlePublish}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] text-gray-700 hover:bg-gray-50"
          >
            <Save className="h-3.5 w-3.5" /> 直接发布
          </button>
          <button
            type="button"
            onClick={handleBackToWriting}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] text-gray-700 hover:bg-gray-50"
          >
            <Palette className="h-3.5 w-3.5" /> 返回编辑
          </button>
        </div>,
        document.body,
      ) : null}

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUploadImage} />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="w-[72px] min-w-[72px] bg-white border-r border-gray-100 py-3 flex flex-col items-center gap-1">
          {moduleTools.map(({ icon: Icon, label }) => {
            const isImageToolActive = label === "图片" && isImagePanelOpen;

            return (
              <button
                key={label}
                onClick={() => appendBlock(label)}
                aria-pressed={isImageToolActive}
                className={`w-14 h-14 flex flex-col items-center justify-center rounded-lg transition-colors gap-1 ${
                  isImageToolActive
                    ? "bg-blue-50 text-blue-600 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.12)]"
                    : "text-gray-500 hover:bg-gray-50 hover:text-blue-600"
                }`}
              >
                <Icon className="w-4.5 h-4.5" />
                <span className="text-[10px]" style={{ fontWeight: 500 }}>{label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex-1 min-h-0 overflow-hidden bg-[#eef0f4] px-4 py-5">
          <div className="mx-auto flex h-full max-w-[980px] min-h-0 flex-col">
            <div className="mb-4 flex items-center justify-between rounded-2xl border border-white/60 bg-white/75 px-4 py-3 backdrop-blur">
              <div>
                <div className="text-[14px] text-gray-900" style={{ fontWeight: 600 }}>排版预览</div>
                <div className="text-[12px] text-gray-500">独立滚动预览，支持移动端与桌面宽度切换</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewMode("mobile")}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] transition-colors ${
                    previewMode === "mobile" ? "border-blue-200 bg-blue-50 text-blue-600" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                  style={{ fontWeight: 500 }}
                >
                  <Smartphone className="h-3.5 w-3.5" /> 手机
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode("desktop")}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] transition-colors ${
                    previewMode === "desktop" ? "border-blue-200 bg-blue-50 text-blue-600" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                  style={{ fontWeight: 500 }}
                >
                  <Monitor className="h-3.5 w-3.5" /> 桌面
                </button>
                <button
                  type="button"
                  onClick={handleScrollPreviewTop}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[12px] text-gray-600 hover:bg-gray-50"
                  style={{ fontWeight: 500 }}
                >
                  <ArrowUp className="h-3.5 w-3.5" /> 回到顶部
                </button>
              </div>
            </div>

            <div
              className={`flex-1 min-h-0 overflow-hidden rounded-[28px] border p-5 ${
                isWechatChannel
                  ? "border-[#e5e7eb] bg-white shadow-[0_18px_60px_rgba(15,23,42,0.06)]"
                  : "border-white/70 bg-gradient-to-br from-white/80 to-slate-100/70 shadow-[0_20px_80px_rgba(15,23,42,0.08)]"
              }`}
            >
              <div className="flex h-full min-h-0 justify-center overflow-hidden">
                <div
                  className="h-full min-h-0 rounded-[28px] border shadow-lg overflow-hidden"
                  style={{
                    width: previewWidth,
                    background: phoneShellBackground,
                    color: textPrimary,
                    borderColor: isDarkTemplate ? "#1f2937" : "#e5e7eb",
                  }}
                >
                  <div className="flex h-full min-h-0 flex-col">
                    <div
                      className="px-4 py-3 flex items-center gap-2 border-b"
                      style={{
                        background: isWechatChannel
                          ? "#ffffff"
                          : formatting.template === "暖色调"
                            ? "#fff7ed"
                            : formatting.template === "商务灰"
                              ? "#f3f4f6"
                              : formatting.template === "深色"
                                ? "#111827"
                                : "#ededed",
                        borderColor: isWechatChannel
                          ? "#efefef"
                          : formatting.template === "深色"
                            ? "#374151"
                            : "#e5e7eb",
                      }}
                    >
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-[10px]"
                        style={{
                          fontWeight: 500,
                          background: isWechatChannel ? "#111827" : activeScheme.primary,
                          color: "#ffffff",
                        }}
                      >
                        {previewAccountInitials}
                      </div>
                      <div>
                        <div
                          className={isWechatChannel ? "text-[13px]" : "text-[12px]"}
                          style={{ fontWeight: isWechatChannel ? 400 : 500, color: textPrimary }}
                        >
                          {previewAccountName}
                        </div>
                        <div className="text-[10px]" style={{ color: textMuted }}>
                          {articleDate}
                        </div>
                      </div>
                    </div>

                    <div ref={previewScrollRef} className="flex-1 min-h-0 overflow-y-auto">
                      <div
                        className={isWechatChannel ? "bg-white px-4 py-5" : "px-6 py-6"}
                        style={
                          isWechatChannel
                            ? { background: surfaceBackground }
                            : {
                                background: surfaceBackground,
                                backgroundImage: `${previewThemeStyle.bodyOverlay}, repeating-linear-gradient(180deg, transparent 0, transparent 34px, ${isDarkTemplate ? "rgba(148,163,184,0.03)" : "rgba(148,163,184,0.05)"} 35px)`,
                              }
                        }
                      >
                        {isWechatChannel ? (
                          <div className="mx-auto max-w-[640px]">
                            <div className="border-b pb-5" style={{ borderColor: "#f1f1f1" }}>
                              <h1
                                className="tracking-[0.01em]"
                                style={{
                                  fontSize: String(domainPreviewStyle.titleStyle.fontSize),
                                  lineHeight: Number(domainPreviewStyle.titleStyle.lineHeight),
                                  letterSpacing: String(domainPreviewStyle.titleStyle.letterSpacing),
                                  color: String(domainPreviewStyle.titleStyle.color),
                                  fontWeight: Number(domainPreviewStyle.titleStyle.fontWeight),
                                  textAlign: domainPreviewStyle.titleStyle.textAlign,
                                  fontFamily: String(domainPreviewStyle.titleStyle.fontFamily),
                                }}
                              >
                                {title}
                              </h1>
                              <div
                                className="mt-3 flex flex-wrap items-center gap-2 text-[12px]"
                                style={{
                                  color: textMuted,
                                  justifyContent: domainPreviewStyle.metaAlign,
                                }}
                              >
                                <span className="text-[15px]" style={{ fontWeight: 400, color: "rgba(0,0,0,0.72)" }}>{previewAccountName}</span>
                                <span>·</span>
                                <span>{articleDate}</span>
                              </div>
                            </div>

                            {summary ? (
                              <div className="pt-5">
                                <div
                                  className="text-[16px] leading-[1.85]"
                                  style={{
                                    ...domainPreviewStyle.summaryStyle,
                                    textAlign: domainPreviewStyle.summaryTextAlign,
                                    fontStyle: domainPreviewStyle.summaryFontStyle,
                                  }}
                                >
                                  {renderInlineNodes(summary, { autoHighlight: true, highlightStyle: inlineHighlightStyle })}
                                </div>
                              </div>
                            ) : null}

                            <div className="pt-5">
                              {previewBlocks.map((block, index) => {
                                if (block.type === "heading") {
                                  if (domainPreviewStyle.headingMode === "underline") {
                                    return (
                                      <div key={`${block.type}-${block.content}-${index}`} className="mb-[15px] mt-[30px]">
                                        <h2
                                          className="inline-block border-b-2 pb-[6px] text-[20px] leading-[1.7]"
                                          style={{
                                            borderColor: activeScheme.primary,
                                            color: domainPreviewStyle.headingTextColor,
                                            fontWeight: domainPreviewStyle.headingFontWeight,
                                            fontFamily: domainPreviewStyle.headingFontFamily,
                                          }}
                                        >
                                          {renderInlineNodes(block.content, { autoHighlight: true, highlightStyle: inlineHighlightStyle })}
                                        </h2>
                                      </div>
                                    );
                                  }

                                  if (domainPreviewStyle.headingMode === "center") {
                                    return (
                                      <div key={`${block.type}-${block.content}-${index}`} className="mb-[18px] mt-[34px] text-center">
                                        <h2
                                          className="inline-block border-b-2 pb-[6px] text-[20px] leading-[1.8]"
                                          style={{
                                            borderColor: activeScheme.accent,
                                            color: domainPreviewStyle.headingTextColor,
                                            fontWeight: domainPreviewStyle.headingFontWeight,
                                            fontFamily: domainPreviewStyle.headingFontFamily,
                                          }}
                                        >
                                          {renderInlineNodes(block.content, { autoHighlight: true, highlightStyle: inlineHighlightStyle })}
                                        </h2>
                                      </div>
                                    );
                                  }

                                  if (domainPreviewStyle.headingMode === "card") {
                                    return (
                                      <div
                                        key={`${block.type}-${block.content}-${index}`}
                                        className="mb-[15px] mt-[30px] rounded-[18px] border px-4 py-3"
                                        style={{
                                          background: `linear-gradient(135deg, color-mix(in srgb, ${activeScheme.accent} 22%, white), color-mix(in srgb, ${activeScheme.primary} 18%, white))`,
                                          borderColor: `color-mix(in srgb, ${activeScheme.primary} 18%, white)`,
                                        }}
                                      >
                                        <h2
                                          className="text-[20px] leading-[1.7]"
                                          style={{ fontWeight: domainPreviewStyle.headingFontWeight, color: domainPreviewStyle.headingTextColor, fontFamily: domainPreviewStyle.headingFontFamily }}
                                        >
                                          {renderInlineNodes(block.content, { autoHighlight: true, highlightStyle: inlineHighlightStyle })}
                                        </h2>
                                      </div>
                                    );
                                  }

                                  return (
                                    <div key={`${block.type}-${block.content}-${index}`} className="mb-[15px] mt-[30px] flex items-start gap-3">
                                      <span
                                        className="mt-[8px] inline-block h-[22px] w-[6px] rounded-full flex-shrink-0"
                                        style={{
                                          background: `linear-gradient(180deg, ${activeScheme.primary}, ${activeScheme.accent})`,
                                          opacity: 0.9,
                                        }}
                                      />
                                      <h2
                                        className="text-[20px] leading-[1.75]"
                                        style={{ fontWeight: domainPreviewStyle.headingFontWeight, color: domainPreviewStyle.headingTextColor, fontFamily: domainPreviewStyle.headingFontFamily }}
                                      >
                                        {renderInlineNodes(block.content, { autoHighlight: true, highlightStyle: inlineHighlightStyle })}
                                      </h2>
                                    </div>
                                  );
                                }

                                if (block.type === "quote") {
                                  return (
                                    <div
                                      key={`${block.type}-${block.content}-${index}`}
                                      className="my-6 rounded-[12px] px-4 py-4"
                                      style={{ background: domainPreviewStyle.quoteBackground }}
                                    >
                                      <p className="text-[15px] leading-[1.85]" style={{ color: domainPreviewStyle.quoteTextColor }}>
                                        {renderInlineNodes(block.content, { autoHighlight: true, highlightStyle: inlineHighlightStyle })}
                                      </p>
                                    </div>
                                  );
                                }

                                if (block.type === "divider") {
                                  return <div key={`${block.type}-${index}`} className="my-7 h-px" style={{ background: domainPreviewStyle.dividerColor }} />;
                                }

                                if (block.type === "image") {
                                  if (block.src) {
                                    return (
                                      <figure
                                        key={`${block.type}-${block.src}-${index}`}
                                        className="my-7 overflow-hidden"
                                      >
                                        <img
                                          src={block.src}
                                          alt={block.alt || block.caption || "文章配图"}
                                          className="block w-full rounded-[10px] border object-cover"
                                          style={{
                                            borderColor: String(domainPreviewStyle.imageFrameStyle.borderColor),
                                            borderRadius: String(domainPreviewStyle.imageFrameStyle.borderRadius),
                                            background: String(domainPreviewStyle.imageFrameStyle.background),
                                            boxShadow: String(domainPreviewStyle.imageFrameStyle.boxShadow),
                                          }}
                                        />
                                        <figcaption className="px-2 pt-3 text-center text-[12px]" style={{ color: domainPreviewStyle.imageCaptionColor }}>
                                          {block.caption || block.alt || "文章配图"}
                                        </figcaption>
                                      </figure>
                                    );
                                  }

                                  return (
                                    <div
                                      key={`${block.type}-${block.content}-${index}`}
                                      className="my-7 overflow-hidden rounded-[8px] border"
                                      style={{
                                        borderColor: String(domainPreviewStyle.imageFrameStyle.borderColor),
                                        background: String(domainPreviewStyle.imageFrameStyle.background),
                                        borderRadius: String(domainPreviewStyle.imageFrameStyle.borderRadius),
                                        boxShadow: String(domainPreviewStyle.imageFrameStyle.boxShadow),
                                      }}
                                    >
                                      <div
                                        className="flex h-44 items-center justify-center"
                                        style={{ background: String(domainPreviewStyle.imageFrameStyle.background) }}
                                      >
                                        <div
                                          className="rounded-full border px-4 py-2 text-[12px]"
                                          style={domainPreviewStyle.imagePlaceholderChipStyle}
                                        >
                                          配图占位
                                        </div>
                                      </div>
                                      <div className="px-4 py-3 text-center text-[12px]" style={{ color: domainPreviewStyle.imageCaptionColor }}>
                                        {block.content}
                                      </div>
                                    </div>
                                  );
                                }

                                if (block.type === "golden") {
                                  return (
                                    <div
                                      key={`${block.type}-${block.content}-${index}`}
                                      className="my-6 rounded-[10px] border-l-[3px] px-4 py-4"
                                      style={{ borderColor: domainPreviewStyle.goldenBorderColor, background: domainPreviewStyle.goldenBackground }}
                                    >
                                      <p className="text-[16px] leading-[1.85]" style={{ color: domainPreviewStyle.goldenTextColor, fontWeight: 600, textAlign: domainPreviewStyle.goldenTextAlign }}>
                                        {renderInlineNodes(block.content, { autoHighlight: true, highlightStyle: inlineHighlightStyle })}
                                      </p>
                                    </div>
                                  );
                                }

                                if (block.type === "highlight") {
                                  return (
                                    <div
                                      key={`${block.type}-${block.content}-${index}`}
                                      className="my-6 rounded-[10px] border px-4 py-4"
                                      style={{ background: highlightBackground, borderColor: domainPreviewStyle.highlightBorderColor }}
                                    >
                                      <p className="text-[16px] leading-[1.85]" style={{ color: "#1f2937", fontWeight: 500 }}>
                                        {renderInlineNodes(block.content, { autoHighlight: true, highlightStyle: inlineHighlightStyle })}
                                      </p>
                                    </div>
                                  );
                                }

                                if (block.type === "unordered-list") {
                                  return (
                                    <ul key={`${block.type}-${index}`} className="my-5 space-y-3">
                                      {block.items.map((item, itemIndex) => (
                                        <li
                                          key={`${item}-${itemIndex}`}
                                          className="flex items-start gap-3 text-[16px] leading-[1.8]"
                                          style={{ color: textSecondary }}
                                        >
                                          <span className="mt-[11px] h-[5px] w-[5px] rounded-full bg-[#6b7280] flex-shrink-0" />
                                          <span>{renderInlineNodes(item, { autoHighlight: true, highlightStyle: inlineHighlightStyle })}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  );
                                }

                                if (block.type === "ordered-list") {
                                  return (
                                    <ol key={`${block.type}-${index}`} className="my-5 space-y-3">
                                      {block.items.map((item, itemIndex) => (
                                        <li
                                          key={`${item}-${itemIndex}`}
                                          className="flex items-start gap-3 text-[16px] leading-[1.8]"
                                          style={{ color: textSecondary }}
                                        >
                                          <span className="min-w-[18px] text-[15px] leading-[1.8] text-[#6b7280]">
                                            {itemIndex + 1}.
                                          </span>
                                          <span>{renderInlineNodes(item, { autoHighlight: true, highlightStyle: inlineHighlightStyle })}</span>
                                        </li>
                                      ))}
                                    </ol>
                                  );
                                }

                                return (
                                  <p
                                    key={`${block.type}-${block.content}-${index}`}
                                    className="mb-[18px] text-[16px] leading-[1.8] tracking-[0.02em]"
                                    style={{
                                      color: domainPreviewStyle.paragraphColor,
                                      fontWeight: 400,
                                      fontSize: domainPreviewStyle.paragraphFontSize,
                                      lineHeight: domainPreviewStyle.paragraphLineHeight,
                                      letterSpacing: domainPreviewStyle.paragraphLetterSpacing,
                                      fontFamily: domainPreviewStyle.paragraphFontFamily,
                                    }}
                                  >
                                    {renderInlineNodes(block.content, { autoHighlight: true, highlightStyle: inlineHighlightStyle })}
                                  </p>
                                );
                              })}
                            </div>

                          </div>
                        ) : (
                          <>
                            <div
                              className="relative overflow-hidden rounded-[28px] border px-5 pb-5 pt-5"
                              style={{
                                background: `${previewThemeStyle.shellTint}, ${previewThemeStyle.shellGradient}`,
                                borderColor: previewThemeStyle.heroBorder,
                                boxShadow: isDarkTemplate
                                  ? "0 20px 60px rgba(2,6,23,0.35)"
                                  : "0 20px 60px rgba(15,23,42,0.08)",
                              }}
                            >
                              <div
                                className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full blur-3xl"
                                style={{ background: `${activeScheme.accent}35` }}
                              />
                              <div
                                className="pointer-events-none absolute -left-10 bottom-8 h-24 w-24 rounded-full blur-3xl"
                                style={{ background: `${activeScheme.primary}18` }}
                              />

                              <div className="relative flex items-center gap-3">
                                <div
                                  className="flex h-11 w-11 items-center justify-center rounded-full text-[12px] text-white"
                                  style={{
                                    background: `linear-gradient(135deg, ${activeScheme.primary}, ${activeScheme.accent})`,
                                    fontWeight: 700,
                                    boxShadow: `0 12px 24px ${activeScheme.primary}24`,
                                  }}
                                >
                                  {previewAccountInitials}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-[14px] truncate" style={{ color: textPrimary, fontWeight: 700 }}>
                                    {previewAccountName}
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: textMuted }}>
                                    <span>{articleDate}</span>
                                    <span>·</span>
                                    <span>{publishChannel}</span>
                                  </div>
                                </div>
                              </div>

                              <div
                                className="relative mt-4 overflow-hidden rounded-[24px] border px-5 py-6"
                                style={{
                                  background: previewThemeStyle.heroGradient,
                                  borderColor: previewThemeStyle.heroBorder,
                                }}
                              >
                                <h1 className="max-w-[92%] text-[23px] leading-[1.35] tracking-[-0.02em]" style={{ fontWeight: 800, color: textPrimary }}>
                                  {title}
                                </h1>
                                <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px]" style={{ color: textMuted }}>
                                  <span>作者：{previewAccountName}</span>
                                  <span>·</span>
                                  <span>{settings.accountPosition.slice(0, 20)}{settings.accountPosition.length > 20 ? "…" : ""}</span>
                                </div>
                              </div>

                              {summary ? (
                                <div
                                  className="mt-5 rounded-[24px] border px-4 py-4"
                                  style={{
                                    background: previewThemeStyle.sectionBackground,
                                    borderColor: `${activeScheme.primary}18`,
                                  }}
                                >
                                  <div className="mb-2 flex items-center gap-2">
                                    <span
                                      className="inline-flex h-2.5 w-2.5 rounded-full"
                                      style={{ background: activeScheme.primary }}
                                    />
                                    <div className="text-[11px] uppercase tracking-[0.2em]" style={{ color: activeScheme.primary, fontWeight: 700 }}>
                                      导读
                                    </div>
                                  </div>
                                  <p className="text-[13px] leading-[1.9]" style={{ color: textSecondary }}>
                                    {summary}
                                  </p>
                                </div>
                              ) : null}
                            </div>

                            <div className="mt-6 space-y-1">
                              <div className="mb-4 flex items-center justify-between">
                                <div className="text-[11px] uppercase tracking-[0.24em]" style={{ color: textMuted, fontWeight: 700 }}>
                                  正文
                                </div>
                                <div className="text-[11px]" style={{ color: textMuted }}>
                                  {headingCount || 1} 个章节 · {estimatedCards} 处重点信息
                                </div>
                              </div>

                              {previewBlocks.map((block, index) => {
                                if (block.type === "heading") {
                                  const displayIndex = previewBlocks.slice(0, index + 1).filter((item) => item.type === "heading").length;

                                  return (
                                    <div key={`${block.type}-${block.content}-${index}`} className="my-8">
                                      <div className="mb-2 flex items-center gap-3">
                                        <span
                                          className="inline-flex h-8 min-w-8 items-center justify-center rounded-2xl px-2 text-[11px]"
                                          style={{
                                            background: formatting.numberedBadge ? activeScheme.primary : isDarkTemplate ? "#334155" : "#e2e8f0",
                                            color: "#ffffff",
                                            fontWeight: 700,
                                            boxShadow: `0 12px 28px ${activeScheme.primary}22`,
                                          }}
                                        >
                                          {String(displayIndex).padStart(2, "0")}
                                        </span>
                                        <div className="h-px flex-1" style={{ background: `${activeScheme.primary}24` }} />
                                      </div>
                                      <h2
                                        className="text-[18px] leading-[1.5] tracking-[-0.01em]"
                                        style={{ fontWeight: 800, color: textPrimary }}
                                      >
                                        {renderInlineNodes(block.content)}
                                      </h2>
                                    </div>
                                  );
                                }

                                if (block.type === "quote") {
                                  return (
                                    <div
                                      key={`${block.type}-${block.content}-${index}`}
                                      className="px-4 py-4 my-6"
                                      style={{
                                        borderLeft: `4px solid ${activeScheme.primary}`,
                                        background: formatting.gradientQuote
                                          ? `linear-gradient(135deg, ${activeScheme.primary}14, ${activeScheme.accent}0f)`
                                          : `${activeScheme.primary}12`,
                                        borderRadius: formatting.roundedQuote ? "0 14px 14px 0" : "0",
                                        boxShadow: isDarkTemplate ? "none" : "0 10px 30px rgba(15,23,42,0.04)",
                                      }}
                                    >
                                      <div className="mb-2 text-[10px] uppercase tracking-[0.24em]" style={{ color: activeScheme.primary, fontWeight: 700 }}>
                                        引用
                                      </div>
                                      <p className="text-[14px] leading-[1.8]" style={{ color: textSecondary }}>{renderInlineNodes(block.content)}</p>
                                    </div>
                                  );
                                }

                                if (block.type === "divider") {
                                  return (
                                    <div key={`${block.type}-${index}`} className="flex items-center gap-3 my-6">
                                      <div className="flex-1 h-px" style={{ background: isDarkTemplate ? "#334155" : "#e5e7eb" }} />
                                      <span className="text-[11px]" style={{ color: textMuted }}>✦</span>
                                      <div className="flex-1 h-px" style={{ background: isDarkTemplate ? "#334155" : "#e5e7eb" }} />
                                    </div>
                                  );
                                }

                                if (block.type === "image") {
                                  if (block.src) {
                                    return (
                                      <figure
                                        key={`${block.type}-${block.src}-${index}`}
                                        className="my-7 overflow-hidden rounded-[24px]"
                                      >
                                        <img
                                          src={block.src}
                                          alt={block.alt || block.caption || "文章配图"}
                                          className="block w-full rounded-[24px] border object-cover"
                                          style={{ borderColor: isDarkTemplate ? "#475569" : "#cbd5e1" }}
                                        />
                                        <figcaption className="px-2 pt-3 text-center text-[12px]" style={{ color: textMuted }}>
                                          {block.caption || block.alt || "文章配图"}
                                        </figcaption>
                                      </figure>
                                    );
                                  }

                                  return (
                                    <div
                                      key={`${block.type}-${block.content}-${index}`}
                                      className="my-7 overflow-hidden rounded-[24px] border"
                                      style={{ borderColor: isDarkTemplate ? "#475569" : "#cbd5e1" }}
                                    >
                                      <div
                                        className="flex h-40 items-center justify-center"
                                        style={{
                                          background: `linear-gradient(135deg, ${activeScheme.primary}12, ${activeScheme.accent}20)`,
                                        }}
                                      >
                                        <div className="rounded-full border px-4 py-2 text-[12px]" style={{ color: textSecondary, borderColor: `${activeScheme.primary}28` }}>
                                          图片视觉区
                                        </div>
                                      </div>
                                      <div className="border-t border-dashed px-4 py-3 text-center text-[12px]" style={{ color: textMuted, borderColor: isDarkTemplate ? "#475569" : "#cbd5e1" }}>
                                        {block.content}
                                      </div>
                                    </div>
                                  );
                                }

                                if (block.type === "golden") {
                                  return (
                                    <div
                                      key={`${block.type}-${block.content}-${index}`}
                                      className="rounded-xl p-5 my-6 text-center border"
                                      style={{
                                        borderColor: `${activeScheme.primary}25`,
                                        background: formatting.gradientQuote
                                          ? `linear-gradient(135deg, ${activeScheme.primary}12, ${activeScheme.accent}22)`
                                          : `${activeScheme.primary}10`,
                                        boxShadow: isDarkTemplate ? "none" : "0 18px 40px rgba(15,23,42,0.06)",
                                      }}
                                    >
                                      <div className="text-[11px] mb-2" style={{ color: activeScheme.primary, fontWeight: 500 }}>✦ 金句 ✦</div>
                                      <p className="text-[15px] leading-[1.7]" style={{ fontWeight: 600, color: textPrimary }}>
                                        {renderInlineNodes(block.content)}
                                      </p>
                                    </div>
                                  );
                                }

                                if (block.type === "highlight") {
                                  return (
                                    <div
                                      key={`${block.type}-${block.content}-${index}`}
                                      className="my-6 rounded-2xl border px-4 py-4"
                                      style={{ borderColor: `${activeScheme.primary}22`, background: highlightBackground }}
                                    >
                                      <div className="mb-2 text-[10px] uppercase tracking-[0.2em]" style={{ color: activeScheme.primary, fontWeight: 700 }}>
                                        重点
                                      </div>
                                      <p className="text-[14px] leading-[1.85]" style={{ color: textPrimary, fontWeight: 600 }}>
                                        {renderInlineNodes(block.content)}
                                      </p>
                                    </div>
                                  );
                                }

                                if (block.type === "unordered-list") {
                                  return (
                                    <ul key={`${block.type}-${index}`} className="my-5 space-y-3">
                                      {block.items.map((item, itemIndex) => (
                                        <li key={`${item}-${itemIndex}`} className="flex items-start gap-3 text-[14px] leading-[1.85]" style={{ color: textPrimary }}>
                                          <span
                                            className="mt-2 h-2.5 w-2.5 rounded-full flex-shrink-0"
                                            style={{ background: activeScheme.primary }}
                                          />
                                          <span>{renderInlineNodes(item)}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  );
                                }

                                if (block.type === "ordered-list") {
                                  return (
                                    <ol key={`${block.type}-${index}`} className="my-5 space-y-3">
                                      {block.items.map((item, itemIndex) => (
                                        <li key={`${item}-${itemIndex}`} className="flex items-start gap-3 text-[14px] leading-[1.85]" style={{ color: textPrimary }}>
                                          <span
                                            className="inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[11px] text-white"
                                            style={{ background: activeScheme.primary, fontWeight: 700 }}
                                          >
                                            {itemIndex + 1}
                                          </span>
                                          <span>{renderInlineNodes(item)}</span>
                                        </li>
                                      ))}
                                    </ol>
                                  );
                                }

                                return (
                                  <p
                                    key={`${block.type}-${block.content}-${index}`}
                                    className={index === leadParagraphIndex ? "first-letter:mr-2 first-letter:float-left first-letter:text-[34px] first-letter:leading-none first-letter:font-bold" : undefined}
                                    style={{
                                      fontSize: formatting.fontSize,
                                      lineHeight: formatting.lineHeight,
                                      marginBottom: formatting.paragraphSpacing,
                                      color: index === leadParagraphIndex ? textSecondary : textPrimary,
                                      fontWeight: index === leadParagraphIndex ? 500 : 400,
                                    }}
                                  >
                                    {renderInlineNodes(block.content)}
                                  </p>
                                );
                              })}
                            </div>

                            {currentDraft.outline.length ? (
                              <div
                                className="mt-10 rounded-[24px] border px-4 py-4 space-y-3"
                                style={{
                                  background: previewThemeStyle.sectionBackground,
                                  borderColor: `${activeScheme.primary}16`,
                                }}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="text-[12px]" style={{ color: textMuted, fontWeight: 700 }}>结构提示</div>
                                  <div className="text-[11px]" style={{ color: textMuted }}>适合继续扩写的节奏线</div>
                                </div>
                                {currentDraft.outline.slice(0, 3).map((item, index) => (
                                  <div key={item} className="flex items-start gap-2">
                                    <span
                                      className="inline-flex h-6 min-w-6 items-center justify-center rounded px-1.5 text-[11px] text-white"
                                      style={{
                                        background: formatting.numberedBadge ? activeScheme.primary : "#9ca3af",
                                        fontWeight: 600,
                                      }}
                                    >
                                      {index + 1}
                                    </span>
                                    <span className="text-[13px]" style={{ color: textSecondary }}>{item}</span>
                                  </div>
                                ))}
                              </div>
                            ) : null}

                            <div
                              className="mt-10 rounded-[28px] border px-5 py-6 text-center"
                              style={{
                                background: `linear-gradient(145deg, ${activeScheme.primary}10, ${activeScheme.accent}18)`,
                                borderColor: `${activeScheme.primary}18`,
                              }}
                            >
                              <div className="text-[11px] uppercase tracking-[0.24em]" style={{ color: activeScheme.primary, fontWeight: 700 }}>
                                互动收束
                              </div>
                              <p className="mt-3 text-[15px] leading-[1.9]" style={{ color: textSecondary }}>
                                {settings.ctaEngage}
                              </p>
                              <div className="mt-5 flex items-center justify-center gap-3 text-[12px]" style={{ color: textPrimary }}>
                                {[settings.ctaFollow, "欢迎留言交流", settings.ctaShare].map((item) => (
                                  <span
                                    key={item}
                                    className="rounded-full px-3 py-1.5"
                                    style={{
                                      background: isDarkTemplate ? "rgba(15,23,42,0.34)" : "rgba(255,255,255,0.72)",
                                      border: `1px solid ${previewThemeStyle.heroBorder}`,
                                      fontWeight: 600,
                                    }}
                                  >
                                    {item}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          className={`bg-white border-l border-gray-100 overflow-y-auto p-4 ${isImagePanelOpen ? "w-[360px] min-w-[360px] xl:w-[380px] xl:min-w-[380px]" : "w-[352px] min-w-[352px] xl:w-[368px] xl:min-w-[368px]"} space-y-5`}
        >
          {isImagePanelOpen ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[18px] text-gray-900" style={{ fontWeight: 700 }}>插入图片</div>
                  <div className="mt-1 text-[12px] leading-6 text-gray-500">侧栏插图不会打断中间预览区，适合边看正文边决定插入位置。</div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsImagePanelOpen(false)}
                  className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

                <div className="rounded-2xl border border-gray-100 bg-gradient-to-br from-slate-50 to-white p-3">
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { key: "upload" as const, label: "本地上传", icon: Upload, color: "text-blue-600" },
                    { key: "link" as const, label: "图片链接", icon: Link2, color: "text-emerald-600" },
                    { key: "search" as const, label: "联网搜图", icon: Search, color: "text-amber-600" },
                    { key: "ai" as const, label: "AI 配图", icon: WandSparkles, color: "text-purple-600" },
                  ].map(({ key, label, icon: Icon, color }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setActiveImageTab(key)}
                      className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                        activeImageTab === key
                          ? "border-blue-200 bg-blue-50"
                          : "border-transparent bg-white hover:bg-gray-50"
                      }`}
                    >
                      <Icon className={`mb-2 h-4 w-4 ${color}`} />
                      <div className="text-[12px] text-gray-900" style={{ fontWeight: 600 }}>{label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {activeImageTab === "upload" ? (
                <div className="rounded-2xl border border-gray-200 bg-white p-4">
                  <div className="text-[14px] text-gray-900" style={{ fontWeight: 600 }}>本地上传</div>
                  <p className="mt-2 text-[12px] leading-6 text-gray-500">上传后会直接插入正文；若云存储未配置，会退化为本地内嵌图片。</p>
                  <button
                    type="button"
                    disabled={imageLoading === "upload"}
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-[12px] text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                    style={{ fontWeight: 500 }}
                  >
                    {imageLoading === "upload" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    选择图片并插入
                  </button>
                </div>
              ) : null}

              {activeImageTab === "link" ? (
                <div className="rounded-2xl border border-gray-200 bg-white p-4">
                  <div className="text-[14px] text-gray-900" style={{ fontWeight: 600 }}>图片链接</div>
                  <div className="mt-3 space-y-3">
                    <input
                      value={imageUrl}
                      onChange={(event) => setImageUrl(event.target.value)}
                      placeholder="https://example.com/image.jpg"
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-[12px] outline-none placeholder:text-gray-400 focus:border-blue-300"
                    />
                    <button
                      type="button"
                      onClick={handleInsertImageByUrl}
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-[12px] text-gray-700 hover:bg-gray-50"
                      style={{ fontWeight: 500 }}
                    >
                      <Link2 className="h-3.5 w-3.5" /> 插入链接图片
                    </button>
                  </div>
                </div>
              ) : null}

              {activeImageTab === "search" ? (
                <div className="rounded-2xl border border-gray-200 bg-white p-4">
                  <div className="text-[14px] text-gray-900" style={{ fontWeight: 600 }}>联网搜图</div>
                  <div className="mt-2 rounded-xl border border-amber-100 bg-amber-50/70 p-3">
                    <div className="text-[12px] text-amber-700" style={{ fontWeight: 600 }}>更真实的配图</div>
                    <p className="mt-1 text-[12px] leading-6 text-amber-700/80">所有领域默认优先找真实摄影图；默认不加文字，找不到再回退 AI。</p>
                  </div>
                  <div className="mt-3 space-y-3">
                    <input
                      value={imageSearchQuery}
                      onChange={(event) => setImageSearchQuery(event.target.value)}
                      placeholder="例如：travel landscape street photography"
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-[12px] outline-none placeholder:text-gray-400 focus:border-blue-300"
                    />
                    <button
                      type="button"
                      disabled={imageLoading === "search"}
                      onClick={handleSearchImage}
                      className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-[12px] text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-amber-300"
                      style={{ fontWeight: 500 }}
                    >
                      {imageLoading === "search" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                      搜索真实图片
                    </button>
                    {imageSearchResults.length ? (
                      <div className="grid grid-cols-2 gap-3 pt-1">
                        {imageSearchResults.slice(0, 4).map((item) => (
                          <button
                            key={item.url}
                            type="button"
                            onClick={() => {
                              insertImageToBody(item.url, imageCaption || title || "文章配图");
                              setIsImagePanelOpen(false);
                            }}
                            className="overflow-hidden rounded-xl border border-gray-200 bg-white text-left transition hover:border-blue-300 hover:shadow-sm"
                          >
                            <img src={item.thumbnailUrl || item.url} alt="真实图片候选" className="h-28 w-full object-cover" loading="lazy" />
                            <div className="space-y-1 px-3 py-2">
                              <div className="line-clamp-2 text-[11px] text-gray-700">{item.title || "真实图片候选"}</div>
                              <div className="text-[11px] text-gray-500">点击插入</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {activeImageTab === "ai" ? (
                <div className="rounded-2xl border border-gray-200 bg-white p-4">
                  <div className="text-[14px] text-gray-900" style={{ fontWeight: 600 }}>AI 配图</div>
                  <div className="mt-3 space-y-3">
                    <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3">
                      <div className="text-[12px] text-blue-700" style={{ fontWeight: 600 }}>智能配图</div>
                      <p className="mt-1 text-[12px] leading-6 text-blue-700/80">会根据文章内容自动配图；默认优先联网搜真实图，失败时再回退 AI。</p>
                      <button
                        type="button"
                        disabled={imageLoading === "generate" || imageLoading === "search"}
                        onClick={handleAutoGenerateImage}
                        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-[12px] text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                        style={{ fontWeight: 500 }}
                      >
                        {imageLoading === "generate" || imageLoading === "search" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        智能配图并插入
                      </button>
                    </div>

                    <textarea
                      value={imagePrompt}
                      onChange={(event) => setImagePrompt(event.target.value)}
                      rows={6}
                      placeholder="描述你想要的配图风格、主体和氛围"
                      className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-[12px] leading-6 outline-none placeholder:text-gray-400 focus:border-blue-300"
                    />
                    <button
                      type="button"
                      disabled={imageLoading === "generate" || imageLoading === "search"}
                      onClick={handleGenerateImage}
                      className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-[12px] text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-purple-300"
                      style={{ fontWeight: 500 }}
                    >
                      {imageLoading === "generate" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <WandSparkles className="h-3.5 w-3.5" />}
                      AI 生成并插入
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-4">
                <div>
                  <div className="mb-2 text-[13px] text-gray-900" style={{ fontWeight: 600 }}>图注</div>
                  <input
                    value={imageCaption}
                    onChange={(event) => setImageCaption(event.target.value)}
                    placeholder="图片说明 / 图注"
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-[12px] outline-none placeholder:text-gray-400 focus:border-blue-300"
                  />
                </div>

                <div>
                  <div className="mb-2 text-[13px] text-gray-900" style={{ fontWeight: 600 }}>插入位置</div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: "auto" as const, label: "智能插入" },
                      { value: "cursor" as const, label: "插入到光标处" },
                      { value: "end" as const, label: "追加到末尾" },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setImageInsertMode(option.value)}
                        className={`rounded-full border px-3 py-1.5 text-[12px] transition-colors ${
                          imageInsertMode === option.value
                            ? "border-blue-200 bg-blue-50 text-blue-600"
                            : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                        }`}
                        style={{ fontWeight: 500 }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[12px] leading-6 text-gray-500">默认优先替换图片占位；如果没有占位，就插入到正文当前光标位置。</p>
                </div>
              </div>
            </>
          ) : (
            <>
          <div>
            <div className="text-[13px] mb-3" style={{ fontWeight: 600 }}>当前草稿</div>
            <div className="rounded-[24px] border border-slate-200 bg-white shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
              <div className="space-y-4 px-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] whitespace-nowrap"
                    style={{
                      background: `linear-gradient(135deg, ${activeScheme.primary}, ${activeScheme.accent})`,
                      color: "#ffffff",
                      fontWeight: 700,
                    }}
                  >
                    <span>{domainMeta.icon}</span>
                    {articleDomain}
                  </span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] whitespace-nowrap ${currentDraftStatusStyle.chip}`} style={{ fontWeight: 600 }}>
                    <span className={`h-1.5 w-1.5 rounded-full ${currentDraftStatusStyle.dot}`} />
                    {currentDraft.status}
                  </span>
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] whitespace-nowrap ${draftSyncBadge.className}`}
                    style={{ fontWeight: 600 }}
                  >
                    {draftSyncBadge.label}
                  </span>
                </div>

                <div className="text-[16px] leading-7 text-slate-900" style={{ fontWeight: 700 }}>
                  {title || currentDraft.title}
                </div>

                <div className="flex items-center justify-between text-[12px] text-slate-500">
                  <span>{draftSyncBadge.description}</span>
                  <span className="whitespace-nowrap">更新于 {articleDate}</span>
                </div>

                <div className="rounded-2xl bg-slate-50 px-3 py-3">
                  <div className="line-clamp-3 text-[12px] leading-6 text-slate-600">
                    {currentDraftPreview}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 border-t border-slate-100 px-4 py-4">
                {currentDraftMetrics.map((item) => (
                  <div key={item.label} className="rounded-2xl border border-slate-200/80 bg-white px-3 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] text-slate-400">{item.label}</div>
                      <div className="text-[11px] text-slate-400">{item.hint}</div>
                    </div>
                    <div className="mt-2 text-[16px] text-slate-900" style={{ fontWeight: 700 }}>
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-100 px-4 py-3 text-[12px] leading-6 text-slate-500">
                {domainMeta.description}
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="text-[13px]" style={{ fontWeight: 600 }}>内容编辑</div>
              <span className="text-[11px] text-gray-400">{isDirty ? "未保存修改" : "已同步"}</span>
            </div>
            <div className="space-y-3">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="block text-[11px] text-gray-500">标题</label>
                  <span className={`text-[11px] ${isWechatTitleTooLong ? "text-red-500" : "text-gray-400"}`}>
                    {titleLength} / {WECHAT_TITLE_LIMIT}
                  </span>
                </div>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  aria-invalid={isWechatTitleTooLong}
                  className={`w-full rounded-lg bg-gray-50 px-3 py-2 text-[13px] outline-none focus:bg-white ${
                    isWechatTitleTooLong
                      ? "border border-red-200 text-red-600 focus:border-red-300"
                      : "border border-gray-200 focus:border-blue-200"
                  }`}
                />
                {isWechatTitleTooLong ? (
                  <div className="mt-1 text-[11px] text-red-500">公众号草稿箱标题最长支持 64 个字符，请缩短后再推送。</div>
                ) : null}
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-gray-500">导读摘要</label>
                <textarea
                  value={summary}
                  onChange={(event) => setSummary(event.target.value)}
                  className="min-h-24 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] leading-relaxed outline-none focus:border-blue-200 focus:bg-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-gray-500">正文内容</label>
                <textarea
                  ref={bodyTextareaRef}
                  value={body}
                  onChange={(event) => {
                    setBody(event.target.value);
                    bodySelectionRef.current = {
                      start: event.target.selectionStart ?? 0,
                      end: event.target.selectionEnd ?? 0,
                    };
                  }}
                  onClick={syncBodySelection}
                  onKeyUp={syncBodySelection}
                  onSelect={syncBodySelection}
                  className="min-h-56 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] leading-relaxed outline-none focus:border-blue-200 focus:bg-white"
                />
              </div>
            </div>
          </div>

          <div>
            <div className="text-[13px] mb-3" style={{ fontWeight: 600 }}>排版模板</div>
            <div className="grid grid-cols-2 gap-2">
              {templates.map((template) => (
                <button
                  key={template}
                  onClick={() => setFormatting((current) => ({ ...current, template }))}
                  className={`px-3 py-2 rounded-lg text-[12px] border transition-colors ${
                    formatting.template === template
                      ? "bg-blue-50 border-blue-200 text-blue-600"
                      : "bg-gray-50 border-gray-100 text-gray-600 hover:bg-gray-100"
                  }`}
                  style={{ fontWeight: 500 }}
                >
                  {template}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[13px] mb-3" style={{ fontWeight: 600 }}>配色方案</div>
            <div className="space-y-2">
              {colorSchemes.map((scheme) => (
                <button
                  key={scheme.name}
                  onClick={() => setFormatting((current) => ({ ...current, colorScheme: scheme.name }))}
                  className={`w-full flex items-center gap-2 p-2 rounded-lg cursor-pointer border transition-colors ${
                    formatting.colorScheme === scheme.name ? "border-blue-200 bg-blue-50/60" : "border-transparent hover:bg-gray-50"
                  }`}
                >
                  <div className="w-6 h-6 rounded-full" style={{ background: scheme.primary }} />
                  <div className="w-6 h-6 rounded-full" style={{ background: scheme.accent }} />
                  <span className="text-[12px] text-gray-600" style={{ fontWeight: 500 }}>{scheme.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[13px] mb-3" style={{ fontWeight: 600 }}>排版设置</div>
            <div className="space-y-3">
              <SelectField
                label="正文字号"
                value={formatting.fontSize}
                options={["15px", "16px", "17px"]}
                onChange={(value) => setFormatting((current) => ({ ...current, fontSize: value as DraftFormatting["fontSize"] }))}
              />
              <SelectField
                label="行高"
                value={formatting.lineHeight}
                options={["1.75", "1.9", "2.0"]}
                onChange={(value) => setFormatting((current) => ({ ...current, lineHeight: value as DraftFormatting["lineHeight"] }))}
              />
              <SelectField
                label="段间距"
                value={formatting.paragraphSpacing}
                options={["16px", "20px", "24px"]}
                onChange={(value) => setFormatting((current) => ({ ...current, paragraphSpacing: value as DraftFormatting["paragraphSpacing"] }))}
              />
            </div>
          </div>

          <div>
            <div className="text-[13px] mb-3" style={{ fontWeight: 600 }}>卡片样式</div>
            <div className="space-y-3">
              <ToggleField
                label="圆角引用块"
                checked={formatting.roundedQuote}
                onChange={() => setFormatting((current) => ({ ...current, roundedQuote: !current.roundedQuote }))}
              />
              <ToggleField
                label="渐变金句卡"
                checked={formatting.gradientQuote}
                onChange={() => setFormatting((current) => ({ ...current, gradientQuote: !current.gradientQuote }))}
              />
              <ToggleField
                label="数字序号色块"
                checked={formatting.numberedBadge}
                onChange={() => setFormatting((current) => ({ ...current, numberedBadge: !current.numberedBadge }))}
              />
            </div>
          </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="text-[11px] text-gray-500 mb-1 block">{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-[12px] appearance-none"
        >
          {options.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>
    </div>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-[12px] text-gray-500">{label}</label>
      <button
        type="button"
        onClick={onChange}
        className={`w-9 h-5 rounded-full relative cursor-pointer transition-colors ${checked ? "bg-blue-600" : "bg-gray-300"}`}
      >
        <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 shadow-sm transition-all ${checked ? "right-0.5" : "left-0.5"}`} />
      </button>
    </div>
  );
}

import type { CSSProperties } from "react";

import {
  formatDraftTime,
  type Draft,
  type DraftFormatting,
} from "./app-data";
import { normalizeStructuredBodyText } from "./body-structure";
import { domainConfigs, type ArticleDomain } from "./content-domains";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContentBlock =
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

export type InlineToken = {
  start: number;
  end: number;
  kind: "bold" | "quote" | "highlight";
  content: string;
};

type HtmlDraft = Pick<Draft, "title" | "summary" | "updatedAt"> & {
  publishedAt?: Draft["publishedAt"];
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const AUTO_HIGHLIGHT_PATTERNS = [
  /(?:先说结论|结论先说|一句话总结|核心在于|关键在于|本质上|更重要的是|最重要的是|真正重要的是|真正的问题是|需要注意的是|说白了|简单来说|换句话说|归根结底|一定要记住|记住一句话)/g,
  /不是[^，。；！？\n]{1,30}而是[^，。；！？\n]{1,40}/g,
];

export const IMAGE_MARKDOWN_PATTERN = /^!\[(.*?)\]\((.+)\)$/;
export const IMAGE_CAPTION_PATTERN = /^(?:图注|说明|caption)[:：]\s*(.+)$/i;
export const CODE_BLOCK_PATTERN = /^```(\w+)?\s*\n([\s\S]*?)\n```$/;

// ---------------------------------------------------------------------------
// Inline highlight style helpers
// ---------------------------------------------------------------------------

export function getInlineHighlightStyle(primary: string, accent: string): CSSProperties {
  return {
    backgroundImage: `linear-gradient(180deg, transparent 58%, color-mix(in srgb, ${accent} 28%, white) 58%)`,
    padding: "0 1px",
    color: primary,
  };
}

export function getInlineHighlightHtmlStyle(primary: string, accent: string) {
  return `background-image:linear-gradient(180deg, transparent 58%, color-mix(in srgb, ${accent} 28%, white) 58%);padding:0 1px;color:${primary};`;
}

// ---------------------------------------------------------------------------
// Inline token collection
// ---------------------------------------------------------------------------

export function collectInlineTokens(text: string, autoHighlight = false) {
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

// ---------------------------------------------------------------------------
// HTML escaping
// ---------------------------------------------------------------------------

export function escapeHtml(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// ---------------------------------------------------------------------------
// Image section parsing
// ---------------------------------------------------------------------------

export function parseImageSection(section: string) {
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

// ---------------------------------------------------------------------------
// Body section splitting
// ---------------------------------------------------------------------------

export function splitBodySections(body: string) {
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

// ---------------------------------------------------------------------------
// Inline HTML rendering
// ---------------------------------------------------------------------------

export function renderInlineHtml(text: string, options?: { autoHighlight?: boolean; highlightStyle?: string }) {
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

// ---------------------------------------------------------------------------
// Content block extraction
// ---------------------------------------------------------------------------

export function extractContentBlocks(body: string): ContentBlock[] {
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

// ---------------------------------------------------------------------------
// WeChat plain text export
// ---------------------------------------------------------------------------

export function buildWechatText(
  draft: HtmlDraft,
  body: string,
  settingsCta: string,
  options?: { includeTitle?: boolean; includeCta?: boolean },
) {
  const includeTitle = options?.includeTitle ?? true;
  const includeCta = options?.includeCta ?? true;
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

  return [
    includeTitle ? draft.title : "",
    "",
    draft.summary,
    "",
    plainBody,
    "",
    includeCta ? settingsCta : "",
  ].filter(Boolean).join("\n");
}

// ---------------------------------------------------------------------------
// Markdown export
// ---------------------------------------------------------------------------

export function buildMarkdown(draft: Draft, body: string) {
  return [`# ${draft.title}`, "", draft.summary, "", body].filter(Boolean).join("\n");
}

// ---------------------------------------------------------------------------
// Full HTML export
// ---------------------------------------------------------------------------

export function buildHtml(
  draft: HtmlDraft,
  body: string,
  formatting: DraftFormatting,
  primary: string,
  accent: string,
  publishChannel: NonNullable<Draft["publishedChannel"]>,
  accountName: string,
  domain: ArticleDomain,
  options?: { includeHeader?: boolean },
) {
  const isWechatChannel = publishChannel === "公众号";
  const includeHeader = options?.includeHeader ?? true;
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
    const headerHtml = includeHeader
      ? `<div style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;background:${primary};background-image:linear-gradient(135deg, ${primary}, ${accent});color:#fff;font-size:12px;font-weight:700;margin-bottom:16px;">${escapeHtml(domainStyle.badgeText)}</div><h1 style="font-size:${domainStyle.titleStyle.fontSize};line-height:${domainStyle.titleStyle.lineHeight};margin:0 0 14px;color:${String(domainStyle.titleStyle.color)};font-weight:${String(domainStyle.titleStyle.fontWeight)};letter-spacing:${String(domainStyle.titleStyle.letterSpacing)};text-align:${String(domainStyle.titleStyle.textAlign)};font-family:${String(domainStyle.titleStyle.fontFamily)};">${draft.title}</h1><div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:20px;color:#8c8c8c;justify-content:${domainStyle.metaAlign};"><span style="font-size:15px;line-height:20px;color:rgba(0,0,0,0.72);font-weight:400;">${escapeHtml(accountName)}</span><span style="font-size:12px;">·</span><span style="font-size:13px;line-height:20px;">${metaDate}</span></div>${draft.summary ? `<div style="margin:0 0 18px;background:${String(domainStyle.summaryStyle.background)};border:${String(domainStyle.summaryStyle.border)};border-radius:${String(domainStyle.summaryStyle.borderRadius)};padding:${String(domainStyle.summaryStyle.padding)};color:${String(domainStyle.summaryStyle.color)};text-align:${domainStyle.summaryTextAlign};font-style:${domainStyle.summaryFontStyle};">${renderInlineHtml(draft.summary, { autoHighlight: true, highlightStyle: inlineHighlightHtmlStyle })}</div>` : ""}`
      : "";
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${draft.title}</title></head><body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Segoe UI',sans-serif;background:#f5f5f5;padding:24px 14px;color:#4a4a4a;"><article style="max-width:720px;margin:0 auto;background:#fff;padding:28px 22px;border-radius:8px;border:1px solid #ededed;">${headerHtml}${htmlSections}</article></body></html>`;
  }

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8" /><title>${draft.title}</title></head><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f7fb;padding:24px;"><article style="max-width:720px;margin:0 auto;background:#fff;border-radius:24px;padding:32px;border:1px solid #e5e7eb;"><h1 style="font-size:32px;line-height:1.35;margin-bottom:16px;color:#111827;">${draft.title}</h1><p style="font-size:16px;line-height:1.9;margin-bottom:24px;color:#4b5563;">${draft.summary}</p>${htmlSections}</article></body></html>`;
}

export function buildWechatArticleHtml(
  draft: HtmlDraft,
  body: string,
  formatting: DraftFormatting,
  primary: string,
  accent: string,
  accountName: string,
  domain: ArticleDomain,
  options?: { includeHeader?: boolean },
) {
  return buildHtml(draft, body, formatting, primary, accent, "公众号", accountName, domain, options);
}

// ---------------------------------------------------------------------------
// Template preview style
// ---------------------------------------------------------------------------

type TemplatePreviewBase = {
  shellGradient: string;
  shellTint: string;
  heroGradient: string;
  heroBorder: string;
  sectionBackground: string;
  bodyOverlay: string;
  accentSoft: string;
};

function createTemplatePreviewStyle(
  base: TemplatePreviewBase,
  options?: {
    dark?: boolean;
    panelBackground?: string;
    panelBorder?: string;
    badgeColor?: string;
  },
) {
  const panelBackground = options?.panelBackground ?? (options?.dark ? "rgba(15,23,42,0.78)" : "rgba(255,255,255,0.82)");
  const panelBorder = options?.panelBorder ?? base.heroBorder;

  return {
    ...base,
    deviceBorder: options?.dark ? "rgba(71,85,105,0.58)" : "rgba(226,232,240,0.92)",
    deviceHeaderBackground: options?.dark ? "rgba(15,23,42,0.92)" : "rgba(248,250,252,0.92)",
    deviceHeaderBorder: options?.dark ? "rgba(71,85,105,0.46)" : "rgba(226,232,240,0.86)",
    titlePanelBackground: panelBackground,
    titlePanelBorder: panelBorder,
    titlePanelShadow: options?.dark ? "0 18px 50px rgba(2,6,23,0.24)" : "0 18px 50px rgba(15,23,42,0.08)",
    badgeBackground: base.heroGradient,
    badgeColor: options?.badgeColor ?? (options?.dark ? "#e2e8f0" : "#0f172a"),
    badgeBorder: `1px solid ${panelBorder}`,
    contentCardBackground: options?.dark ? "rgba(15,23,42,0.66)" : "rgba(255,255,255,0.78)",
    contentCardBorder: panelBorder,
  };
}

export function getTemplatePreviewStyle(template: DraftFormatting["template"], primary: string, accent: string) {
  if (template === "暖色调") {
    return createTemplatePreviewStyle({
      shellGradient: "linear-gradient(180deg, rgba(255,247,237,0.98), rgba(255,255,255,1))",
      shellTint: "radial-gradient(circle at top left, rgba(251,146,60,0.16), transparent 42%)",
      heroGradient: `linear-gradient(145deg, ${primary}18, ${accent}28 55%, rgba(255,255,255,0.92))`,
      heroBorder: `${primary}28`,
      sectionBackground: "rgba(255,247,237,0.72)",
      bodyOverlay: "radial-gradient(circle at top right, rgba(251,146,60,0.10), transparent 30%)",
      accentSoft: "rgba(251,146,60,0.14)",
    }, { panelBackground: "rgba(255,247,237,0.82)", panelBorder: `${primary}26` });
  }

  if (template === "商务灰") {
    return createTemplatePreviewStyle({
      shellGradient: "linear-gradient(180deg, rgba(248,250,252,0.98), rgba(255,255,255,1))",
      shellTint: "radial-gradient(circle at top left, rgba(124,58,237,0.12), transparent 44%)",
      heroGradient: `linear-gradient(145deg, rgba(255,255,255,0.96), ${accent}14 52%, ${primary}10)`,
      heroBorder: "rgba(148,163,184,0.28)",
      sectionBackground: "rgba(248,250,252,0.9)",
      bodyOverlay: "linear-gradient(180deg, rgba(15,23,42,0.02), transparent 18%)",
      accentSoft: "rgba(124,58,237,0.10)",
    }, { panelBorder: "rgba(148,163,184,0.32)" });
  }

  if (template === "深色") {
    return createTemplatePreviewStyle({
      shellGradient: "linear-gradient(180deg, rgba(2,6,23,0.98), rgba(15,23,42,1))",
      shellTint: "radial-gradient(circle at top left, rgba(16,185,129,0.18), transparent 46%)",
      heroGradient: `linear-gradient(150deg, rgba(15,23,42,0.98), ${primary}18 58%, rgba(15,23,42,0.94))`,
      heroBorder: "rgba(71,85,105,0.5)",
      sectionBackground: "rgba(15,23,42,0.7)",
      bodyOverlay: "radial-gradient(circle at top right, rgba(16,185,129,0.10), transparent 32%)",
      accentSoft: "rgba(16,185,129,0.12)",
    }, { dark: true, panelBackground: "rgba(15,23,42,0.82)", panelBorder: "rgba(71,85,105,0.5)", badgeColor: "#f8fafc" });
  }

  if (template === "极简白") {
    return createTemplatePreviewStyle({
      shellGradient: "linear-gradient(180deg, rgba(255,255,255,0.99), rgba(249,250,251,1))",
      shellTint: "radial-gradient(circle at top left, rgba(37,99,235,0.08), transparent 42%)",
      heroGradient: `linear-gradient(145deg, rgba(255,255,255,0.95), ${primary}10 60%, rgba(255,255,255,1))`,
      heroBorder: "rgba(226,232,240,0.9)",
      sectionBackground: "rgba(248,250,252,0.9)",
      bodyOverlay: "linear-gradient(180deg, rgba(148,163,184,0.06), transparent 16%)",
      accentSoft: "rgba(37,99,235,0.10)",
    }, { panelBackground: "rgba(255,255,255,0.92)", panelBorder: "rgba(226,232,240,0.9)" });
  }

  return createTemplatePreviewStyle({
    shellGradient: "linear-gradient(180deg, rgba(239,246,255,0.98), rgba(255,255,255,1))",
    shellTint: "radial-gradient(circle at top left, rgba(59,130,246,0.14), transparent 44%)",
    heroGradient: `linear-gradient(145deg, rgba(255,255,255,0.96), ${primary}16 56%, ${accent}10)`,
    heroBorder: `${primary}20`,
    sectionBackground: "rgba(239,246,255,0.78)",
    bodyOverlay: "radial-gradient(circle at top right, rgba(59,130,246,0.10), transparent 30%)",
    accentSoft: "rgba(59,130,246,0.10)",
  }, { panelBackground: "rgba(239,246,255,0.82)", panelBorder: `${primary}22` });
}

// ---------------------------------------------------------------------------
// WeChat domain-specific preview style
// ---------------------------------------------------------------------------

export function getWechatDomainPreviewStyle(domain: ArticleDomain, primary: string, accent: string) {
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

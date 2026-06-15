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
  | { type: "subheading"; content: string }
  | { type: "quote"; content: string }
  | { type: "divider" }
  | { type: "image"; content: string; src?: string; alt?: string; caption?: string; isPlaceholder?: boolean }
  | { type: "code"; content: string; language: string }
  | { type: "golden"; content: string }
  | { type: "highlight"; content: string }
  | { type: "cta"; content: string }
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
const CTA_BLOCK_PATTERN = /(?:在看|点赞|关注|转发|分享|留言|评论|收藏|有启发|有帮助|更多人看到|欢迎交流)/;

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

function hexToRgb(color: string) {
  const normalized = color.trim();
  const shortHexMatch = normalized.match(/^#([\da-f]{3})$/i);
  if (shortHexMatch) {
    const expanded = shortHexMatch[1].split("").map((item) => item + item).join("");
    return {
      r: Number.parseInt(expanded.slice(0, 2), 16),
      g: Number.parseInt(expanded.slice(2, 4), 16),
      b: Number.parseInt(expanded.slice(4, 6), 16),
    };
  }

  const hexMatch = normalized.match(/^#([\da-f]{6})$/i);
  if (hexMatch) {
    return {
      r: Number.parseInt(hexMatch[1].slice(0, 2), 16),
      g: Number.parseInt(hexMatch[1].slice(2, 4), 16),
      b: Number.parseInt(hexMatch[1].slice(4, 6), 16),
    };
  }

  return null;
}

function withAlpha(color: string, alpha: number) {
  const rgb = hexToRgb(color);
  if (!rgb) return color;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function mixWithWhite(color: string, ratio: number) {
  const rgb = hexToRgb(color);
  if (!rgb) return color;
  const mix = (channel: number) => Math.round(channel * ratio + 255 * (1 - ratio));
  return `rgb(${mix(rgb.r)}, ${mix(rgb.g)}, ${mix(rgb.b)})`;
}

// ---------------------------------------------------------------------------
// Inline highlight style helpers
// ---------------------------------------------------------------------------

export function getInlineHighlightStyle(primary: string, accent: string): CSSProperties {
  return {
    backgroundImage: `linear-gradient(180deg, transparent 58%, ${withAlpha(accent, 0.28)} 58%)`,
    padding: "0 1px",
    color: primary,
  };
}

export function getInlineHighlightHtmlStyle(primary: string, accent: string) {
  return `background-image:linear-gradient(180deg, transparent 58%, ${withAlpha(accent, 0.28)} 58%);padding:0 1px;color:${primary};`;
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

export function renderInlineHtml(text: string, options?: { autoHighlight?: boolean; highlightStyle?: string; quoteColor?: string }) {
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
      html += `<span style="color:${options?.quoteColor ?? "#2563eb"};">${escapeHtml(token.content)}</span>`;
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
  const sections = splitBodySections(body).filter(Boolean);
  const lastSectionIndex = sections.length - 1;

  return sections
    .filter(Boolean)
    .map((section, sectionIndex) => {
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

      if (section.startsWith("### ")) {
        return { type: "subheading", content: section.slice(4).trim() } satisfies ContentBlock;
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

      if (
        sectionIndex === lastSectionIndex &&
        lines.length === 1 &&
        section.length <= 90 &&
        CTA_BLOCK_PATTERN.test(section)
      ) {
        return { type: "cta", content: section } satisfies ContentBlock;
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
  options?: {
    includeTitle?: boolean;
    includeSummary?: boolean;
    includeCta?: boolean;
    ctaText?: string;
  },
) {
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

      if (block.type === "cta") {
        return options?.ctaText?.trim() || block.content;
      }

      return block.content;
    })
    .join("\n\n");

  const sections = [
    options?.includeTitle === false ? "" : draft.title,
    options?.includeSummary === false ? "" : draft.summary,
    plainBody,
    options?.includeCta === false ? "" : settingsCta,
  ].filter(Boolean);

  return sections.join("\n\n");
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

type TemplateHeaderVariant = "plain" | "hero" | "minimal" | "warm" | "dark";

type ExportTemplateTheme = {
  headerVariant: TemplateHeaderVariant;
  pageBackground: string;
  articleBackground: string;
  articleBorder: string;
  articleRadius: string;
  articlePadding: string;
  articleShadow: string;
  bodyTextColor: string;
  mutedTextColor: string;
  titleColor?: string;
  badgeBackground: string;
  badgeColor: string;
  badgeBorder: string;
  summaryBackground?: string;
  summaryBorder?: string;
  summaryColor?: string;
  summaryRadius?: string;
  summaryPadding?: string;
  quoteBackground?: string;
  quoteTextColor?: string;
  quoteBorderColor?: string;
  highlightBackground: string;
  highlightBorderColor: string;
  highlightTextColor: string;
  goldenBackground: string;
  goldenBorderColor: string;
  goldenTextColor: string;
  dividerColor?: string;
  imageBorderColor?: string;
  imageBackground?: string;
  imageShadow?: string;
  imageRadius?: string;
  imageCaptionColor?: string;
  headingCardBackground: string;
  headingCardBorderColor: string;
  headerBackground?: string;
  headerBorder?: string;
  headerShadow?: string;
  headerTitleColor?: string;
  headerMetaColor?: string;
};

function getTemplateExportTheme(template: DraftFormatting["template"], primary: string, accent: string): ExportTemplateTheme {
  if (template === "杂志绿") {
    return {
      headerVariant: "minimal",
      pageBackground: "#ffffff",
      articleBackground: "#ffffff",
      articleBorder: "1px solid #e5e7eb",
      articleRadius: "18px",
      articlePadding: "34px 24px",
      articleShadow: "0 16px 36px rgba(15,23,42,0.04)",
      bodyTextColor: "#202124",
      mutedTextColor: "#777777",
      titleColor: "#111827",
      badgeBackground: "#187b45",
      badgeColor: "#ffffff",
      badgeBorder: "none",
      summaryBackground: "#f3faf6",
      summaryBorder: "1px solid #d7eadf",
      summaryColor: "#2f5f45",
      summaryRadius: "12px",
      summaryPadding: "16px 18px",
      quoteBackground: "#f8eee9",
      quoteTextColor: "#b45309",
      quoteBorderColor: "#f59e0b",
      highlightBackground: "#f3faf6",
      highlightBorderColor: "#cfe8d9",
      highlightTextColor: "#187b45",
      goldenBackground: "#f8eee9",
      goldenBorderColor: "#f59e0b",
      goldenTextColor: "#b45309",
      dividerColor: "#e5e7eb",
      imageBorderColor: "#e5e7eb",
      imageBackground: "#ffffff",
      imageShadow: "none",
      imageRadius: "12px",
      imageCaptionColor: "#777777",
      headingCardBackground: "#ffffff",
      headingCardBorderColor: "#d7eadf",
    };
  }

  if (template === "科技蓝") {
    return {
      headerVariant: "hero",
      pageBackground: `linear-gradient(180deg, ${mixWithWhite(primary, 0.08)} 0%, ${mixWithWhite(accent, 0.08)} 45%, #ffffff 100%)`,
      articleBackground: "#ffffff",
      articleBorder: `1px solid ${withAlpha(primary, 0.16)}`,
      articleRadius: "26px",
      articlePadding: "30px 24px",
      articleShadow: `0 20px 48px ${withAlpha(primary, 0.12)}`,
      bodyTextColor: "#334155",
      mutedTextColor: "#64748b",
      badgeBackground: withAlpha("#ffffff", 0.16),
      badgeColor: "#ffffff",
      badgeBorder: `1px solid ${withAlpha("#ffffff", 0.22)}`,
      summaryBackground: mixWithWhite(accent, 0.10),
      summaryBorder: `1px solid ${withAlpha(primary, 0.14)}`,
      summaryColor: "#33536b",
      summaryRadius: "18px",
      summaryPadding: "18px 18px",
      quoteBackground: mixWithWhite(primary, 0.08),
      quoteTextColor: "#486274",
      quoteBorderColor: primary,
      highlightBackground: mixWithWhite(accent, 0.08),
      highlightBorderColor: withAlpha(primary, 0.22),
      highlightTextColor: "#1e3a5f",
      goldenBackground: `linear-gradient(135deg, ${mixWithWhite(primary, 0.10)}, ${mixWithWhite(accent, 0.16)})`,
      goldenBorderColor: accent,
      goldenTextColor: "#0f4c5f",
      dividerColor: withAlpha(primary, 0.12),
      imageBorderColor: withAlpha(primary, 0.14),
      imageBackground: mixWithWhite(primary, 0.08),
      imageShadow: `0 14px 30px ${withAlpha(primary, 0.10)}`,
      imageRadius: "18px",
      imageCaptionColor: "#6b8ba4",
      headingCardBackground: `linear-gradient(135deg, ${mixWithWhite(accent, 0.16)}, ${mixWithWhite(primary, 0.12)})`,
      headingCardBorderColor: withAlpha(primary, 0.18),
      headerBackground: `linear-gradient(135deg, ${primary}, ${accent})`,
      headerBorder: `1px solid ${withAlpha(primary, 0.12)}`,
      headerShadow: `0 18px 36px ${withAlpha(primary, 0.22)}`,
      headerTitleColor: "#ffffff",
      headerMetaColor: "rgba(255,255,255,0.82)",
    };
  }

  if (template === "商务灰") {
    return {
      headerVariant: "minimal",
      pageBackground: "linear-gradient(180deg, #f3f4f6 0%, #ffffff 100%)",
      articleBackground: "#ffffff",
      articleBorder: "1px solid #d6dbe4",
      articleRadius: "18px",
      articlePadding: "30px 24px",
      articleShadow: "0 18px 36px rgba(15,23,42,0.06)",
      bodyTextColor: "#334155",
      mutedTextColor: "#6b7280",
      titleColor: "#111827",
      badgeBackground: "#111827",
      badgeColor: "#f8fafc",
      badgeBorder: "1px solid #111827",
      summaryBackground: "#f8fafc",
      summaryBorder: "1px solid #d6dbe4",
      summaryColor: "#4b5563",
      summaryRadius: "14px",
      summaryPadding: "16px 18px",
      quoteBackground: "#f8fafc",
      quoteTextColor: "#475569",
      quoteBorderColor: "#64748b",
      highlightBackground: "#f8fafc",
      highlightBorderColor: "#cbd5e1",
      highlightTextColor: "#1f2937",
      goldenBackground: "linear-gradient(135deg, #ffffff, #f3f4f6)",
      goldenBorderColor: "#64748b",
      goldenTextColor: "#111827",
      dividerColor: "#e5e7eb",
      imageBorderColor: "#d6dbe4",
      imageBackground: "#ffffff",
      imageShadow: "0 10px 24px rgba(15,23,42,0.05)",
      imageRadius: "14px",
      imageCaptionColor: "#6b7280",
      headingCardBackground: "#f8fafc",
      headingCardBorderColor: "#d6dbe4",
    };
  }

  if (template === "活力橙") {
    return {
      headerVariant: "warm",
      pageBackground: "linear-gradient(180deg, #fff7ed 0%, #fffaf5 50%, #ffffff 100%)",
      articleBackground: "#fffdf9",
      articleBorder: "1px solid #fed7aa",
      articleRadius: "24px",
      articlePadding: "30px 24px",
      articleShadow: "0 18px 40px rgba(251,146,60,0.10)",
      bodyTextColor: "#4b5563",
      mutedTextColor: "#8b6b52",
      badgeBackground: `linear-gradient(135deg, ${primary}, ${accent})`,
      badgeColor: "#ffffff",
      badgeBorder: "none",
      summaryBackground: "#fff7ed",
      summaryBorder: "1px solid #fed7aa",
      summaryColor: "#7c4a03",
      summaryRadius: "18px",
      summaryPadding: "16px 18px",
      quoteBackground: "#fffaf1",
      quoteTextColor: "#7c5c44",
      quoteBorderColor: "#fb923c",
      highlightBackground: "#fff7ed",
      highlightBorderColor: "#fdba74",
      highlightTextColor: "#7c4a03",
      goldenBackground: "linear-gradient(135deg, #fff7ed, #ffedd5)",
      goldenBorderColor: "#fb923c",
      goldenTextColor: "#7c4a03",
      dividerColor: "#f3dfc8",
      imageBorderColor: "#f6d7b8",
      imageBackground: "#fffaf5",
      imageShadow: "0 10px 26px rgba(251,146,60,0.08)",
      imageRadius: "18px",
      imageCaptionColor: "#9f7a56",
      headingCardBackground: "linear-gradient(135deg, #fff7ed, #ffedd5)",
      headingCardBorderColor: "#fdba74",
      headerBackground: `linear-gradient(135deg, ${mixWithWhite(primary, 0.18)}, ${mixWithWhite(accent, 0.12)})`,
      headerBorder: "1px solid #fed7aa",
      headerShadow: "0 12px 30px rgba(251,146,60,0.10)",
    };
  }

  if (template === "曜石黑") {
    return {
      headerVariant: "dark",
      pageBackground: "linear-gradient(180deg, #020617 0%, #0f172a 100%)",
      articleBackground: "#0f172a",
      articleBorder: "1px solid #334155",
      articleRadius: "24px",
      articlePadding: "30px 24px",
      articleShadow: "0 24px 56px rgba(2,6,23,0.42)",
      bodyTextColor: "#e2e8f0",
      mutedTextColor: "#94a3b8",
      titleColor: "#f8fafc",
      badgeBackground: `linear-gradient(135deg, ${primary}, ${accent})`,
      badgeColor: "#f8fafc",
      badgeBorder: "1px solid #475569",
      summaryBackground: "#111827",
      summaryBorder: "1px solid #334155",
      summaryColor: "#dbeafe",
      summaryRadius: "18px",
      summaryPadding: "18px 18px",
      quoteBackground: "#111827",
      quoteTextColor: "#cbd5e1",
      quoteBorderColor: "#475569",
      highlightBackground: "#111827",
      highlightBorderColor: "#334155",
      highlightTextColor: "#f8fafc",
      goldenBackground: "linear-gradient(135deg, #111827, #1e293b)",
      goldenBorderColor: "#475569",
      goldenTextColor: "#f8fafc",
      dividerColor: "#334155",
      imageBorderColor: "#475569",
      imageBackground: "#111827",
      imageShadow: "0 14px 30px rgba(2,6,23,0.35)",
      imageRadius: "18px",
      imageCaptionColor: "#94a3b8",
      headingCardBackground: "#111827",
      headingCardBorderColor: "#334155",
      headerBackground: "linear-gradient(135deg, #111827, #1e293b)",
      headerBorder: "1px solid #334155",
      headerShadow: "0 14px 32px rgba(2,6,23,0.36)",
      headerTitleColor: "#f8fafc",
      headerMetaColor: "#cbd5e1",
    };
  }

  return {
    headerVariant: "plain",
    pageBackground: "linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)",
    articleBackground: "#ffffff",
    articleBorder: "1px solid #e5e7eb",
    articleRadius: "18px",
    articlePadding: "30px 24px",
    articleShadow: "0 16px 36px rgba(15,23,42,0.05)",
    bodyTextColor: "#1f2937",
    mutedTextColor: "#8c8c8c",
    titleColor: "#111827",
    badgeBackground: `linear-gradient(135deg, ${primary}, ${accent})`,
    badgeColor: "#ffffff",
    badgeBorder: "none",
    summaryBackground: "#f8fafc",
    summaryBorder: `1px solid ${withAlpha(primary, 0.16)}`,
    summaryColor: "#4a4a4a",
    summaryRadius: "14px",
    summaryPadding: "16px 18px",
    quoteBackground: "#f8fafc",
    quoteTextColor: "#475569",
    quoteBorderColor: primary,
    highlightBackground: mixWithWhite(primary, 0.08),
    highlightBorderColor: withAlpha(primary, 0.14),
    highlightTextColor: "#1f2937",
    goldenBackground: `linear-gradient(135deg, ${mixWithWhite(primary, 0.10)}, ${mixWithWhite(accent, 0.12)})`,
    goldenBorderColor: primary,
    goldenTextColor: "#111827",
    dividerColor: "#e5e7eb",
    imageBorderColor: "#dbe2ea",
    imageBackground: "#ffffff",
    imageShadow: "0 10px 24px rgba(15,23,42,0.04)",
    imageRadius: "16px",
    imageCaptionColor: "#6b7280",
    headingCardBackground: `linear-gradient(135deg, ${mixWithWhite(accent, 0.16)}, ${mixWithWhite(primary, 0.12)})`,
    headingCardBorderColor: withAlpha(primary, 0.16),
  };
}

function renderExportHeader(args: {
  badgeText: string;
  title: string;
  accountName: string;
  metaDate: string;
  domainStyle: ReturnType<typeof getWechatDomainPreviewStyle>;
  templateTheme: ExportTemplateTheme;
}) {
  const { badgeText, title, accountName, metaDate, domainStyle, templateTheme } = args;
  const badgeHtml = `<div style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;background:${templateTheme.badgeBackground};color:${templateTheme.badgeColor};border:${templateTheme.badgeBorder};font-size:12px;font-weight:700;margin-bottom:16px;">${escapeHtml(badgeText)}</div>`;
  const titleColor = templateTheme.headerTitleColor ?? templateTheme.titleColor ?? String(domainStyle.titleStyle.color);
  const metaColor = templateTheme.headerMetaColor ?? templateTheme.mutedTextColor;
  const titleHtml = `<h1 style="font-size:${domainStyle.titleStyle.fontSize};line-height:${domainStyle.titleStyle.lineHeight};margin:0 0 14px;color:${titleColor};font-weight:${String(domainStyle.titleStyle.fontWeight)};letter-spacing:${String(domainStyle.titleStyle.letterSpacing)};text-align:${String(domainStyle.titleStyle.textAlign)};font-family:${String(domainStyle.titleStyle.fontFamily)};">${escapeHtml(title)}</h1>`;
  const metaHtml = `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;color:${metaColor};justify-content:${domainStyle.metaAlign};"><span style="font-size:15px;line-height:20px;font-weight:400;">${escapeHtml(accountName)}</span><span style="font-size:12px;">·</span><span style="font-size:13px;line-height:20px;">${metaDate}</span></div>`;

  if (templateTheme.headerVariant === "hero" || templateTheme.headerVariant === "warm" || templateTheme.headerVariant === "dark") {
    return `<header style="margin:0 0 22px;padding:22px 20px;border-radius:20px;background:${templateTheme.headerBackground};border:${templateTheme.headerBorder};box-shadow:${templateTheme.headerShadow};">${badgeHtml}${titleHtml}${metaHtml}</header>`;
  }

  if (templateTheme.headerVariant === "minimal") {
    return `<header style="margin:0 0 22px;">${badgeHtml}${titleHtml}${metaHtml}<div style="margin-top:16px;height:1px;background:${templateTheme.dividerColor};"></div></header>`;
  }

  return `<header style="margin:0 0 20px;">${badgeHtml}${titleHtml}${metaHtml}</header>`;
}

type WechatBodyStyleContext = {
  template: DraftFormatting["template"];
  primary: string;
  accent: string;
  headingIndex: number;
  headingTextColor: string;
  paragraphFontFamily: string;
  quoteBackground: string;
  quoteTextColor: string;
  quoteBorderColor: string;
  highlightBackground: string;
  highlightBorderColor: string;
  highlightTextColor: string;
  goldenBackground: string;
  goldenBorderColor: string;
  goldenTextColor: string;
};

function renderWechatHeading(contentHtml: string, context: WechatBodyStyleContext) {
  const { template, primary, accent, headingIndex, headingTextColor, paragraphFontFamily } = context;

  if (template === "杂志绿") {
    return `<section style="margin:34px 0 18px;"><div style="display:flex;align-items:center;gap:10px;"><span style="display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:999px;background:#187b45;color:#ffffff;font-size:14px;font-weight:800;line-height:30px;flex:0 0 auto;">${headingIndex}</span><h2 style="margin:0;font-size:22px;font-weight:900;line-height:1.35;color:#191919;letter-spacing:0;font-family:${paragraphFontFamily};">${contentHtml}</h2></div></section>`;
  }

  if (template === "科技蓝") {
    return `<section style="margin:42px 0 22px;"><div style="padding:14px 16px;border:1px solid ${withAlpha(primary, 0.14)};border-radius:12px;background:linear-gradient(135deg, ${mixWithWhite(primary, 0.08)}, ${mixWithWhite(accent, 0.10)});"><h2 style="margin:0;font-size:21px;font-weight:800;line-height:1.4;color:#18324a;letter-spacing:0;font-family:${paragraphFontFamily};">${contentHtml}</h2></div></section>`;
  }

  if (template === "商务灰") {
    return `<section style="margin:42px 0 22px;"><h2 style="display:inline-block;margin:0;padding:0 0 9px;border-bottom:2px solid #111827;font-size:21px;font-weight:800;line-height:1.42;color:#111827;letter-spacing:0;font-family:${paragraphFontFamily};">${contentHtml}</h2></section>`;
  }

  if (template === "活力橙") {
    return `<section style="margin:42px 0 22px;"><h2 style="margin:0;padding:12px 16px;border-radius:14px;background:#fff7ed;border:1px solid #fed7aa;font-size:21px;font-weight:800;line-height:1.42;color:#7c4a03;letter-spacing:0;font-family:${paragraphFontFamily};">${contentHtml}</h2></section>`;
  }

  if (template === "曜石黑") {
    return `<section style="margin:42px 0 22px;"><h2 style="margin:0;padding:13px 16px;border-radius:12px;background:#111827;border:1px solid #334155;font-size:21px;font-weight:800;line-height:1.42;color:#f8fafc;letter-spacing:0;font-family:${paragraphFontFamily};">${contentHtml}</h2></section>`;
  }

  return `<section style="margin:44px 0 22px;"><h2 style="margin:0;font-size:22px;font-weight:800;line-height:1.35;color:${headingTextColor};letter-spacing:0;font-family:${paragraphFontFamily};">${contentHtml}</h2></section>`;
}

function renderWechatSubheading(contentHtml: string, context: WechatBodyStyleContext) {
  const { template, accent, paragraphFontFamily } = context;

  if (template === "杂志绿") {
    return `<h3 style="margin:28px 0 16px;font-size:19px;font-weight:800;line-height:1.55;color:#187b45;letter-spacing:0;font-family:${paragraphFontFamily};">${contentHtml}</h3>`;
  }

  if (template === "商务灰") {
    return `<h3 style="margin:24px 0 16px;padding-left:10px;border-left:3px solid #94a3b8;font-size:18px;font-weight:800;line-height:1.55;color:#334155;letter-spacing:0;font-family:${paragraphFontFamily};">${contentHtml}</h3>`;
  }

  if (template === "活力橙") {
    return `<h3 style="margin:24px 0 16px;font-size:18px;font-weight:800;line-height:1.55;color:#9a5a16;letter-spacing:0;font-family:${paragraphFontFamily};">${contentHtml}</h3>`;
  }

  if (template === "曜石黑") {
    return `<h3 style="margin:24px 0 16px;font-size:18px;font-weight:800;line-height:1.55;color:#0f766e;letter-spacing:0;font-family:${paragraphFontFamily};">${contentHtml}</h3>`;
  }

  return `<h3 style="margin:22px 0 16px;font-size:18px;font-weight:800;line-height:1.55;color:${accent};letter-spacing:0;font-family:${paragraphFontFamily};">${contentHtml}</h3>`;
}

function renderWechatQuote(contentHtml: string, context: WechatBodyStyleContext) {
  const { template, quoteBackground, quoteTextColor, quoteBorderColor } = context;

  if (template === "杂志绿") {
    return `<blockquote style="margin:34px 0;padding:22px 24px;background:#f8eee9;border-left:5px solid #f59e0b;border-radius:0;font-size:17px;line-height:1.95;color:#b45309;letter-spacing:0.01em;font-weight:700;">${contentHtml}</blockquote>`;
  }

  if (template === "商务灰") {
    return `<blockquote style="margin:28px 0;padding:16px 0 16px 18px;background:#ffffff;border-left:4px solid #64748b;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;border-radius:0;font-size:16px;line-height:1.9;color:#475569;letter-spacing:0.01em;">${contentHtml}</blockquote>`;
  }

  if (template === "曜石黑") {
    return `<blockquote style="margin:28px 0;padding:16px 18px;background:#111827;border:1px solid #334155;border-left:4px solid ${quoteBorderColor};border-radius:0;font-size:16px;line-height:1.9;color:#cbd5e1;letter-spacing:0.01em;">${contentHtml}</blockquote>`;
  }

  return `<blockquote style="margin:28px 0;padding:16px 20px;background:${quoteBackground};border-left:4px solid ${quoteBorderColor};border-radius:0;font-size:16px;line-height:1.9;color:${quoteTextColor};letter-spacing:0.01em;">${contentHtml}</blockquote>`;
}

function renderWechatFeatureBlock(kind: "golden" | "highlight", contentHtml: string, context: WechatBodyStyleContext) {
  const { template, accent, paragraphFontFamily, highlightBackground, highlightBorderColor, highlightTextColor, goldenBackground, goldenBorderColor, goldenTextColor } = context;
  const isGolden = kind === "golden";

  if (template === "杂志绿") {
    return isGolden
      ? `<blockquote style="margin:34px 0;padding:22px 24px;background:#f8eee9;border-left:5px solid #f59e0b;border-radius:0;color:#b45309;font-size:17px;line-height:1.95;font-weight:800;letter-spacing:0;">${contentHtml}</blockquote>`
      : `<div style="margin:26px 0;padding:18px 20px;background:#f3faf6;border-radius:12px;color:#187b45;font-size:17px;line-height:1.95;font-weight:700;letter-spacing:0;">${contentHtml}</div>`;
  }

  if (template === "极简白") {
    return isGolden
      ? `<p style="margin:28px 0;padding:0 0 0 14px;border-left:3px solid ${accent};font-size:19px;line-height:1.65;color:${accent};font-weight:800;letter-spacing:0;font-family:${paragraphFontFamily};">${contentHtml}</p>`
      : `<div style="margin:24px 0;padding:14px 16px;background:#f8fafc;color:#3f3f46;font-size:16px;line-height:1.85;font-weight:600;">${contentHtml}</div>`;
  }

  if (template === "商务灰") {
    return `<div style="margin:${isGolden ? "28px" : "24px"} 0;padding:${isGolden ? "18px 0" : "16px 18px"};background:${isGolden ? "#ffffff" : "#f8fafc"};border-top:1px solid #d1d5db;border-bottom:1px solid #d1d5db;color:${isGolden ? "#111827" : "#334155"};font-size:${isGolden ? "18px" : "16px"};line-height:${isGolden ? "1.75" : "1.85"};font-weight:${isGolden ? "800" : "600"};letter-spacing:0;">${contentHtml}</div>`;
  }

  if (template === "曜石黑") {
    return `<div style="margin:${isGolden ? "28px" : "24px"} 0;padding:${isGolden ? "18px 20px" : "16px 18px"};border-radius:14px;background:${isGolden ? goldenBackground : "#111827"};border:1px solid ${isGolden ? goldenBorderColor : highlightBorderColor};color:${isGolden ? goldenTextColor : "#dbeafe"};font-size:${isGolden ? "18px" : "16px"};line-height:${isGolden ? "1.75" : "1.85"};font-weight:${isGolden ? "800" : "600"};letter-spacing:0;">${contentHtml}</div>`;
  }

  return `<div style="margin:${isGolden ? "28px" : "24px"} 0;padding:${isGolden ? "18px 20px" : "16px 18px"};border-radius:${template === "活力橙" ? "16px" : "14px"};background:${isGolden ? goldenBackground : highlightBackground};border:1px solid ${isGolden ? goldenBorderColor : highlightBorderColor};color:${isGolden ? goldenTextColor : highlightTextColor};font-size:${isGolden ? "18px" : "16px"};line-height:${isGolden ? "1.75" : "1.85"};font-weight:${isGolden ? "800" : "600"};letter-spacing:0;">${contentHtml}</div>`;
}

function renderWechatCta(contentHtml: string, context: WechatBodyStyleContext, formatting: DraftFormatting) {
  const { template, primary, accent, paragraphFontFamily } = context;
  const style = formatting.ctaStyle ?? "简洁";
  const isDark = template === "曜石黑";
  const isDarkMinimal = isDark && style === "简洁";
  const textColor = isDarkMinimal ? "#4b5563" : isDark ? "#e2e8f0" : style === "强调" ? primary : "#4b5563";
  const borderColor = isDarkMinimal ? "#334155" : withAlpha(isDark ? accent : primary, style === "强调" ? 0.28 : 0.16);
  const background = style === "简洁"
    ? "transparent"
    : isDark
      ? "#111827"
      : style === "强调"
        ? mixWithWhite(primary, 0.08)
      : "#f8fafc";

  if (style === "简洁") {
    return `<section style="margin:34px 0 0;padding-top:18px;border-top:1px solid ${borderColor};text-align:center;color:${textColor};font-size:15px;line-height:1.85;letter-spacing:0.01em;font-family:${paragraphFontFamily};">${contentHtml}</section>`;
  }

  return `<section style="margin:34px 0 0;padding:16px 18px;border:1px solid ${borderColor};border-radius:${style === "强调" ? "14px" : "12px"};background:${background};text-align:center;color:${textColor};font-size:15px;line-height:1.85;font-weight:${style === "强调" ? "700" : "500"};letter-spacing:0.01em;font-family:${paragraphFontFamily};">${contentHtml}</section>`;
}

type WechatRichHtmlOptions = {
  includeDocumentShell?: boolean;
  includeHeader?: boolean;
  includeSummary?: boolean;
  imageSrcMap?: Record<string, string>;
};

type RichHtmlBuildArgs = {
  draft: HtmlDraft;
  body: string;
  formatting: DraftFormatting;
  primary: string;
  accent: string;
  publishChannel: NonNullable<Draft["publishedChannel"]>;
  accountName: string;
  domain: ArticleDomain;
  includeDocumentShell: boolean;
  includeHeader: boolean;
  includeSummary: boolean;
  imageSrcMap?: Record<string, string>;
};

function buildRichHtml(args: RichHtmlBuildArgs) {
  const {
    draft,
    body,
    formatting,
    primary,
    accent,
    publishChannel,
    accountName,
    domain,
    includeDocumentShell,
    includeHeader,
    includeSummary,
    imageSrcMap,
  } = args;
  const isWechatChannel = publishChannel === "公众号";
  let wechatHeadingIndex = 0;
  const metaDate = formatDraftTime(draft.publishedAt ?? draft.updatedAt ?? new Date().toISOString()).split(" ")[0];
  const inlineHighlightHtmlStyle = getInlineHighlightHtmlStyle(primary, accent);
  const domainStyle = getWechatDomainPreviewStyle(domain, primary, accent);
  const templateTheme = getTemplateExportTheme(formatting.template, primary, accent);
  const wechatAccent = accent || primary;
  const wechatBodyTextColor = "#242424";
  const wechatHeadingTextColor = "#1f2329";
  const wechatMutedTextColor = "#8c8c8c";
  const wechatParagraphFontSize = "17px";
  const wechatParagraphLineHeight = 1.95;
  const wechatParagraphLetterSpacing = "0.02em";
  const wechatParagraphFontFamily = "-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Segoe UI',sans-serif";
  const paragraphColor = isWechatChannel ? wechatBodyTextColor : templateTheme.bodyTextColor;
  const headingTextColor = isWechatChannel ? wechatHeadingTextColor : templateTheme.titleColor ?? templateTheme.bodyTextColor ?? domainStyle.headingTextColor;
  const quoteBackground = isWechatChannel ? templateTheme.quoteBackground ?? "#f7f7f7" : templateTheme.quoteBackground ?? domainStyle.quoteBackground;
  const quoteTextColor = isWechatChannel ? templateTheme.quoteTextColor ?? "#4d4d4d" : templateTheme.quoteTextColor ?? domainStyle.quoteTextColor;
  const quoteBorderColor = isWechatChannel ? templateTheme.quoteBorderColor ?? wechatAccent : templateTheme.quoteBorderColor ?? primary;
  const dividerColor = isWechatChannel ? "#eeeeee" : templateTheme.dividerColor ?? domainStyle.dividerColor;
  const imageBorderColor = isWechatChannel ? templateTheme.imageBorderColor ?? "#eef0f3" : templateTheme.imageBorderColor ?? String(domainStyle.imageFrameStyle.borderColor);
  const imageBackground = isWechatChannel ? templateTheme.imageBackground ?? "#ffffff" : templateTheme.imageBackground ?? String(domainStyle.imageFrameStyle.background);
  const imageShadow = isWechatChannel ? templateTheme.imageShadow ?? "none" : templateTheme.imageShadow ?? String(domainStyle.imageFrameStyle.boxShadow);
  const imageRadius = isWechatChannel ? templateTheme.imageRadius ?? "10px" : templateTheme.imageRadius ?? String(domainStyle.imageFrameStyle.borderRadius);
  const imageCaptionColor = isWechatChannel ? templateTheme.imageCaptionColor ?? wechatMutedTextColor : templateTheme.imageCaptionColor ?? domainStyle.imageCaptionColor;
  const wechatBodyStyleContext: WechatBodyStyleContext = {
    template: formatting.template,
    primary,
    accent: wechatAccent,
    headingIndex: 0,
    headingTextColor,
    paragraphFontFamily: wechatParagraphFontFamily,
    quoteBackground,
    quoteTextColor,
    quoteBorderColor,
    highlightBackground: templateTheme.highlightBackground,
    highlightBorderColor: templateTheme.highlightBorderColor,
    highlightTextColor: templateTheme.highlightTextColor,
    goldenBackground: templateTheme.goldenBackground,
    goldenBorderColor: templateTheme.goldenBorderColor,
    goldenTextColor: templateTheme.goldenTextColor,
  };
  const summaryBackground = templateTheme.summaryBackground ?? String(domainStyle.summaryStyle.background);
  const summaryBorder = templateTheme.summaryBorder ?? String(domainStyle.summaryStyle.border);
  const summaryColor = templateTheme.summaryColor ?? String(domainStyle.summaryStyle.color);
  const summaryRadius = templateTheme.summaryRadius ?? String(domainStyle.summaryStyle.borderRadius);
  const summaryPadding = templateTheme.summaryPadding ?? String(domainStyle.summaryStyle.padding);
  const headerHtml = includeHeader
    ? renderExportHeader({
        badgeText: domainStyle.badgeText,
        title: draft.title,
        accountName,
        metaDate,
        domainStyle,
        templateTheme,
      })
    : "";
  const htmlSections = extractContentBlocks(body)
    .map((block) => {
      const resolvedImageSrc = block.type === "image" && block.src ? imageSrcMap?.[block.src] ?? block.src : undefined;

      if (block.type === "heading") {
        const contentHtml = renderInlineHtml(block.content, { autoHighlight: isWechatChannel, highlightStyle: inlineHighlightHtmlStyle });

        if (!isWechatChannel) {
          return `<h2 style="font-size:20px;font-weight:700;margin:24px 0 12px;color:${primary};">${contentHtml}</h2>`;
        }

        wechatHeadingIndex += 1;
        return renderWechatHeading(contentHtml, { ...wechatBodyStyleContext, headingIndex: wechatHeadingIndex });
      }

      if (block.type === "quote") {
        const contentHtml = renderInlineHtml(block.content, { autoHighlight: isWechatChannel, highlightStyle: inlineHighlightHtmlStyle });
        return isWechatChannel
          ? renderWechatQuote(contentHtml, wechatBodyStyleContext)
          : `<blockquote style="margin:24px 0;padding:16px 18px;border-left:4px solid ${quoteBorderColor};background:${quoteBackground};border-radius:0;line-height:1.9;color:${quoteTextColor};">${contentHtml}</blockquote>`;
      }

      if (block.type === "subheading") {
        const contentHtml = renderInlineHtml(block.content, { autoHighlight: isWechatChannel, highlightStyle: inlineHighlightHtmlStyle });
        return isWechatChannel
          ? renderWechatSubheading(contentHtml, wechatBodyStyleContext)
          : `<h3 style="font-size:18px;font-weight:700;margin:22px 0 10px;color:${primary};">${contentHtml}</h3>`;
      }

      if (block.type === "divider") {
        return `<hr style="margin:${isWechatChannel ? "34px" : "28px"} 0;border:none;border-top:1px solid ${dividerColor};" />`;
      }

      if (block.type === "image") {
        if (resolvedImageSrc) {
          const caption = block.caption || block.alt || "配图";
          if (isWechatChannel && formatting.template === "杂志绿") {
            return `<figure style="margin:34px 0 36px;"><img src="${escapeHtml(resolvedImageSrc)}" alt="${escapeHtml(block.alt || caption)}" style="display:block;width:100%;height:auto;border-radius:12px;border:1px solid #e5e7eb;background:#ffffff;box-shadow:none;object-fit:cover;" /><figcaption style="margin-top:12px;text-align:center;color:#777777;font-size:13px;line-height:1.7;">${escapeHtml(caption)}</figcaption></figure>`;
          }

          return isWechatChannel
            ? `<figure style="margin:30px 0;"><img src="${escapeHtml(resolvedImageSrc)}" alt="${escapeHtml(block.alt || caption)}" style="display:block;width:100%;height:auto;border-radius:${imageRadius};border:1px solid ${imageBorderColor};background:${imageBackground};box-shadow:${imageShadow};object-fit:cover;" /><figcaption style="margin-top:10px;text-align:center;color:${imageCaptionColor};font-size:13px;line-height:1.7;">${escapeHtml(caption)}</figcaption></figure>`
            : `<figure style="margin:24px 0;"><img src="${escapeHtml(resolvedImageSrc)}" alt="${escapeHtml(block.alt || caption)}" style="display:block;width:100%;height:auto;border-radius:${imageRadius};border:1px solid ${imageBorderColor};background:${imageBackground};box-shadow:${imageShadow};object-fit:cover;" /><figcaption style="margin-top:10px;text-align:center;color:${imageCaptionColor};font-size:12px;line-height:1.7;">${escapeHtml(caption)}</figcaption></figure>`;
        }

        return isWechatChannel
          ? `<div style="margin:30px 0;border-radius:${imageRadius};overflow:hidden;border:1px solid ${imageBorderColor};background:${imageBackground};box-shadow:${imageShadow};"><div style="height:180px;background:#fafafa;display:flex;align-items:center;justify-content:center;"><span style="display:inline-flex;align-items:center;justify-content:center;padding:8px 16px;border-radius:999px;border:1px solid ${String(domainStyle.imagePlaceholderChipStyle.borderColor)};background:${String(domainStyle.imagePlaceholderChipStyle.background)};color:${String(domainStyle.imagePlaceholderChipStyle.color)};font-size:12px;">配图占位</span></div><div style="padding:10px 12px;text-align:center;color:${imageCaptionColor};font-size:13px;">${escapeHtml(block.content)}</div></div>`
          : `<div style="margin:24px 0;padding:28px 16px;border:1px dashed ${imageBorderColor};border-radius:${imageRadius};text-align:center;color:${imageCaptionColor};background:${imageBackground};">${escapeHtml(block.content)}</div>`;
      }

      if (block.type === "code") {
        const language = block.language ? escapeHtml(block.language) : "code";
        return isWechatChannel
          ? `<figure style="margin:24px 0;border:1px solid ${templateTheme.highlightBorderColor};border-radius:16px;overflow:hidden;background:#0f172a;box-shadow:0 10px 26px rgba(15,23,42,0.12);"><div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:rgba(255,255,255,0.05);border-bottom:1px solid rgba(255,255,255,0.08);color:#cbd5e1;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;"><span>示例代码</span><span>${language}</span></div><pre style="margin:0;padding:16px 14px 18px;overflow:auto;color:#e2e8f0;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;font-size:13px;line-height:1.75;white-space:pre-wrap;word-break:break-word;"><code>${escapeHtml(block.content)}</code></pre></figure>`
          : `<figure style="margin:24px 0;border:1px solid ${templateTheme.highlightBorderColor};border-radius:16px;overflow:hidden;background:#0f172a;box-shadow:0 10px 26px rgba(15,23,42,0.12);"><div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:rgba(255,255,255,0.05);border-bottom:1px solid rgba(255,255,255,0.08);color:#cbd5e1;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;"><span>示例代码</span><span>${language}</span></div><pre style="margin:0;padding:16px 14px 18px;overflow:auto;color:#e2e8f0;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;font-size:13px;line-height:1.75;white-space:pre-wrap;word-break:break-word;"><code>${escapeHtml(block.content)}</code></pre></figure>`;
      }

      if (block.type === "golden") {
        const contentHtml = renderInlineHtml(block.content, { autoHighlight: isWechatChannel, highlightStyle: inlineHighlightHtmlStyle });
        return isWechatChannel
          ? renderWechatFeatureBlock("golden", contentHtml, wechatBodyStyleContext)
          : `<div style="margin:24px 0;padding:20px 18px;border-radius:18px;background:${templateTheme.goldenBackground};border-left:3px solid ${templateTheme.goldenBorderColor};color:${templateTheme.goldenTextColor};font-weight:600;line-height:1.85;text-align:${domainStyle.goldenTextAlign};">${contentHtml}</div>`;
      }

      if (block.type === "highlight") {
        const contentHtml = renderInlineHtml(block.content, { autoHighlight: isWechatChannel, highlightStyle: inlineHighlightHtmlStyle });
        return isWechatChannel
          ? renderWechatFeatureBlock("highlight", contentHtml, wechatBodyStyleContext)
          : `<div style="margin:20px 0;padding:16px 18px;border-radius:16px;border:1px solid ${templateTheme.highlightBorderColor};background:${templateTheme.highlightBackground};color:${templateTheme.highlightTextColor};line-height:1.85;">${contentHtml}</div>`;
      }

      if (block.type === "cta") {
        const ctaContent = formatting.ctaText?.trim() || block.content;
        const contentHtml = renderInlineHtml(ctaContent, {
          autoHighlight: isWechatChannel,
          highlightStyle: inlineHighlightHtmlStyle,
          quoteColor: formatting.template === "曜石黑" && (formatting.ctaStyle ?? "简洁") === "简洁" ? "#4b5563" : undefined,
        });
        return isWechatChannel
          ? renderWechatCta(contentHtml, wechatBodyStyleContext, formatting)
          : `<div style="margin:28px 0 0;padding:14px 16px;border-radius:14px;border:1px solid ${templateTheme.highlightBorderColor};background:${templateTheme.highlightBackground};color:${templateTheme.highlightTextColor};line-height:1.8;text-align:center;">${contentHtml}</div>`;
      }

      if (block.type === "unordered-list") {
        return `<ul style="margin:${isWechatChannel ? "24px" : "20px"} 0 ${isWechatChannel ? "30px" : "24px"};padding-left:${isWechatChannel ? "24px" : "20px"};color:${paragraphColor};font-size:${isWechatChannel ? wechatParagraphFontSize : formatting.fontSize};line-height:${isWechatChannel ? wechatParagraphLineHeight : "1.9"};letter-spacing:${isWechatChannel ? wechatParagraphLetterSpacing : "normal"};font-family:${isWechatChannel ? wechatParagraphFontFamily : "inherit"};">${block.items.map((item) => `<li style="margin-bottom:${isWechatChannel ? "10px" : "8px"};">${renderInlineHtml(item, { autoHighlight: isWechatChannel, highlightStyle: inlineHighlightHtmlStyle })}</li>`).join("")}</ul>`;
      }

      if (block.type === "ordered-list") {
        return `<ol style="margin:${isWechatChannel ? "24px" : "20px"} 0 ${isWechatChannel ? "30px" : "24px"};padding-left:${isWechatChannel ? "24px" : "20px"};color:${paragraphColor};font-size:${isWechatChannel ? wechatParagraphFontSize : formatting.fontSize};line-height:${isWechatChannel ? wechatParagraphLineHeight : "1.9"};letter-spacing:${isWechatChannel ? wechatParagraphLetterSpacing : "normal"};font-family:${isWechatChannel ? wechatParagraphFontFamily : "inherit"};">${block.items.map((item) => `<li style="margin-bottom:${isWechatChannel ? "10px" : "8px"};">${renderInlineHtml(item, { autoHighlight: isWechatChannel, highlightStyle: inlineHighlightHtmlStyle })}</li>`).join("")}</ol>`;
      }

      return isWechatChannel
        ? `<p style="font-size:${wechatParagraphFontSize};line-height:${wechatParagraphLineHeight};margin:0 0 28px;color:${paragraphColor};letter-spacing:${wechatParagraphLetterSpacing};font-family:${wechatParagraphFontFamily};font-weight:400;">${renderInlineHtml(block.content, { autoHighlight: isWechatChannel, highlightStyle: inlineHighlightHtmlStyle })}</p>`
        : `<p style="font-size:${formatting.fontSize};line-height:${formatting.lineHeight};margin:0 0 ${formatting.paragraphSpacing};color:${paragraphColor};">${renderInlineHtml(block.content, { autoHighlight: isWechatChannel, highlightStyle: inlineHighlightHtmlStyle })}</p>`;
    })
    .join("");

  const summaryHtml = includeSummary && draft.summary
    ? `<div style="margin:0 0 18px;background:${summaryBackground};border:${summaryBorder};border-radius:${summaryRadius};padding:${summaryPadding};color:${summaryColor};text-align:${domainStyle.summaryTextAlign};font-style:${domainStyle.summaryFontStyle};">${renderInlineHtml(draft.summary, { autoHighlight: true, highlightStyle: inlineHighlightHtmlStyle })}</div>`
    : "";

  if (!includeDocumentShell) {
    return `<section style="font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Segoe UI',sans-serif;color:${templateTheme.bodyTextColor};">${headerHtml}${summaryHtml}${htmlSections}</section>`;
  }

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8" />${isWechatChannel ? '<meta name="viewport" content="width=device-width, initial-scale=1" />' : ""}<title>${escapeHtml(draft.title)}</title></head><body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Segoe UI',sans-serif;background:${templateTheme.pageBackground};padding:${isWechatChannel ? "24px 14px" : "32px 18px"};color:${templateTheme.bodyTextColor};"><article style="max-width:720px;margin:0 auto;background:${templateTheme.articleBackground};padding:${templateTheme.articlePadding};border-radius:${templateTheme.articleRadius};border:${templateTheme.articleBorder};box-shadow:${templateTheme.articleShadow};">${headerHtml}${summaryHtml}${htmlSections}</article></body></html>`;
}

export function buildHtml(
  draft: HtmlDraft,
  body: string,
  formatting: DraftFormatting,
  primary: string,
  accent: string,
  publishChannel: NonNullable<Draft["publishedChannel"]>,
  accountName: string,
  domain: ArticleDomain,
  options?: { includeHeader?: boolean; includeSummary?: boolean },
) {
  return buildRichHtml({
    draft,
    body,
    formatting,
    primary,
    accent,
    publishChannel,
    accountName,
    domain,
    includeDocumentShell: true,
    includeHeader: options?.includeHeader ?? true,
    includeSummary: options?.includeSummary ?? publishChannel !== "公众号",
  });
}

export function buildWechatArticleHtml(
  draft: HtmlDraft,
  body: string,
  formatting: DraftFormatting,
  primary: string,
  accent: string,
  accountName: string,
  domain: ArticleDomain,
  options: WechatRichHtmlOptions = {},
) {
  return buildRichHtml({
    draft,
    body,
    formatting,
    primary,
    accent,
    publishChannel: "公众号",
    accountName,
    domain,
    includeDocumentShell: options.includeDocumentShell ?? false,
    includeHeader: options.includeHeader ?? false,
    includeSummary: options.includeSummary ?? false,
    imageSrcMap: options.imageSrcMap,
  });
}

// ---------------------------------------------------------------------------
// Template preview style
// ---------------------------------------------------------------------------

export function getTemplatePreviewStyle(template: DraftFormatting["template"], primary: string, accent: string) {
  if (template === "杂志绿") {
    return {
      shellGradient: "linear-gradient(180deg, rgba(255,255,255,0.99), rgba(248,250,248,1))",
      shellTint: "radial-gradient(circle at top left, rgba(24,123,69,0.10), transparent 42%)",
      heroGradient: "linear-gradient(145deg, rgba(255,255,255,0.98), rgba(243,250,246,0.95))",
      heroBorder: "rgba(24,123,69,0.18)",
      sectionBackground: "rgba(248,250,248,0.92)",
      bodyOverlay: "linear-gradient(180deg, rgba(24,123,69,0.035), transparent 18%)",
      accentSoft: "rgba(24,123,69,0.10)",
      deviceBorder: "#d7eadf",
      deviceHeaderBackground: "#f8fbf9",
      deviceHeaderBorder: "#d7eadf",
      titlePanelBackground: "linear-gradient(180deg, rgba(255,255,255,1), rgba(248,250,248,0.98))",
      titlePanelBorder: "#d7eadf",
      titlePanelShadow: "0 14px 28px rgba(24,123,69,0.06)",
      badgeBackground: "#187b45",
      badgeColor: "#ffffff",
      badgeBorder: "none",
      contentCardBackground: "rgba(255,255,255,0.92)",
      contentCardBorder: "#d7eadf",
    };
  }

  if (template === "活力橙") {
    return {
      shellGradient: "linear-gradient(180deg, rgba(255,247,237,0.98), rgba(255,255,255,1))",
      shellTint: "radial-gradient(circle at top left, rgba(251,146,60,0.16), transparent 42%)",
      heroGradient: `linear-gradient(145deg, ${primary}18, ${accent}28 55%, rgba(255,255,255,0.92))`,
      heroBorder: `${primary}28`,
      sectionBackground: "rgba(255,247,237,0.72)",
      bodyOverlay: "radial-gradient(circle at top right, rgba(251,146,60,0.10), transparent 30%)",
      accentSoft: "rgba(251,146,60,0.14)",
      deviceBorder: "#f3caa5",
      deviceHeaderBackground: "#fff4e8",
      deviceHeaderBorder: "#f7d2b1",
      titlePanelBackground: "linear-gradient(135deg, rgba(255,250,245,0.98), rgba(255,237,213,0.92))",
      titlePanelBorder: "#f6d2ae",
      titlePanelShadow: "0 18px 36px rgba(251,146,60,0.10)",
      badgeBackground: "linear-gradient(135deg, #fb923c, #f59e0b)",
      badgeColor: "#fffaf5",
      badgeBorder: "none",
      contentCardBackground: "rgba(255,250,245,0.82)",
      contentCardBorder: "#f4d8c0",
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
      deviceBorder: "#cfd6df",
      deviceHeaderBackground: "#f5f7fa",
      deviceHeaderBorder: "#d7dde6",
      titlePanelBackground: "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(243,244,246,0.96))",
      titlePanelBorder: "#d7dde6",
      titlePanelShadow: "0 14px 28px rgba(15,23,42,0.05)",
      badgeBackground: "#111827",
      badgeColor: "#f8fafc",
      badgeBorder: "1px solid #111827",
      contentCardBackground: "rgba(248,250,252,0.92)",
      contentCardBorder: "#dbe1e8",
    };
  }

  if (template === "曜石黑") {
    return {
      shellGradient: "linear-gradient(180deg, rgba(2,6,23,0.98), rgba(15,23,42,1))",
      shellTint: "radial-gradient(circle at top left, rgba(148,163,184,0.14), transparent 46%)",
      heroGradient: `linear-gradient(150deg, rgba(15,23,42,0.98), ${primary}18 58%, rgba(15,23,42,0.94))`,
      heroBorder: "rgba(71,85,105,0.5)",
      sectionBackground: "rgba(15,23,42,0.7)",
      bodyOverlay: "radial-gradient(circle at top right, rgba(148,163,184,0.10), transparent 32%)",
      accentSoft: "rgba(148,163,184,0.12)",
      deviceBorder: "transparent",
      deviceHeaderBackground: "#111827",
      deviceHeaderBorder: "#374151",
      titlePanelBackground: "linear-gradient(145deg, rgba(15,23,42,0.98), rgba(30,41,59,0.96))",
      titlePanelBorder: "rgba(71,85,105,0.62)",
      titlePanelShadow: "0 20px 44px rgba(2,6,23,0.40)",
      badgeBackground: "linear-gradient(135deg, rgba(71,85,105,0.44), rgba(15,23,42,0.36))",
      badgeColor: "#e2e8f0",
      badgeBorder: "1px solid rgba(148,163,184,0.28)",
      contentCardBackground: "rgba(15,23,42,0.46)",
      contentCardBorder: "rgba(71,85,105,0.56)",
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
      deviceBorder: "#e2e8f0",
      deviceHeaderBackground: "#ffffff",
      deviceHeaderBorder: "#edf2f7",
      titlePanelBackground: "linear-gradient(180deg, rgba(255,255,255,1), rgba(248,250,252,0.96))",
      titlePanelBorder: "#edf2f7",
      titlePanelShadow: "0 14px 28px rgba(15,23,42,0.04)",
      badgeBackground: "rgba(37,99,235,0.08)",
      badgeColor: "#1d4ed8",
      badgeBorder: "1px solid rgba(37,99,235,0.12)",
      contentCardBackground: "rgba(255,255,255,0.90)",
      contentCardBorder: "#edf2f7",
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
    deviceBorder: "#bfdbfe",
    deviceHeaderBackground: "#eff6ff",
    deviceHeaderBorder: "#dbeafe",
    titlePanelBackground: "linear-gradient(145deg, rgba(239,246,255,0.98), rgba(255,255,255,0.96))",
    titlePanelBorder: "#dbeafe",
    titlePanelShadow: "0 18px 36px rgba(37,99,235,0.10)",
    badgeBackground: "linear-gradient(135deg, #2563eb, #38bdf8)",
    badgeColor: "#eff6ff",
    badgeBorder: "none",
    contentCardBackground: "rgba(248,251,255,0.92)",
    contentCardBorder: "#dbeafe",
  };
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

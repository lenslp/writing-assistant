import { readWechatAccountSecret } from "./app-config-db";
import { domainConfigs, type ArticleDomain } from "./content-domains";

type WechatConfig = {
  configured: boolean;
  appId: string;
  appSecret: string;
  defaultAuthor: string;
  contentSourceUrl: string;
  accountId: string | null;
  accountName: string;
};

type DraftImage = {
  alt: string;
  src: string;
  caption: string;
};

type DraftBlock =
  | { type: "heading"; content: string }
  | { type: "quote"; content: string }
  | { type: "divider" }
  | { type: "image"; image: DraftImage }
  | { type: "code"; content: string; language: string }
  | { type: "unordered-list"; items: string[] }
  | { type: "ordered-list"; items: string[] }
  | { type: "paragraph"; content: string }
  | { type: "golden"; content: string }
  | { type: "highlight"; content: string };

type WechatApiError = {
  errcode?: number;
  errmsg?: string;
};

type WechatDraftInput = {
  title: string;
  summary: string;
  body: string;
  author: string;
  domain: ArticleDomain;
  accountId?: string | null;
};

export type WechatDraftPrecheckItem = {
  key: string;
  label: string;
  ok: boolean;
  message: string;
};

const WECHAT_API_BASE = "https://api.weixin.qq.com";
const WECHAT_DIGEST_LIMIT = 120;
const IMAGE_MARKDOWN_PATTERN = /^!\[(.*?)\]\((.+)\)$/;
const CODE_BLOCK_PATTERN = /^```(\w+)?\s*\n([\s\S]*?)\n```$/;
const IMAGE_CAPTION_PATTERN = /^(?:图注|说明|caption)[:：]\s*(.+)$/i;
const AUTO_HIGHLIGHT_PATTERNS = [
  /(?:先说结论|结论先说|一句话总结|核心在于|关键在于|本质上|更重要的是|最重要的是|真正重要的是|真正的问题是|需要注意的是|说白了|简单来说|换句话说|归根结底|一定要记住|记住一句话)/g,
  /不是[^，。；！？\n]{1,30}而是[^，。；！？\n]{1,40}/g,
] as const;

declare global {
  var __wechatAccessTokenCache__:
    | Record<
        string,
        {
          token: string;
          expiresAt: number;
        }
      >
    | undefined;
}

function getEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

function getWechatConfigFromEnv(): WechatConfig {
  const appId = getEnv("WECHAT_OFFICIAL_APP_ID");
  const appSecret = getEnv("WECHAT_OFFICIAL_APP_SECRET");

  return {
    configured: Boolean(appId && appSecret),
    appId,
    appSecret,
    defaultAuthor: getEnv("WECHAT_DEFAULT_AUTHOR"),
    contentSourceUrl: getEnv("WECHAT_CONTENT_SOURCE_URL"),
    accountId: null,
    accountName: "",
  };
}

export async function getWechatConfig(accountId?: string | null) {
  const stored = await readWechatAccountSecret(accountId);
  if (stored.account?.appId && stored.account?.appSecret) {
    return {
      configured: true,
      appId: stored.account.appId,
      appSecret: stored.account.appSecret,
      defaultAuthor: stored.account.defaultAuthor,
      contentSourceUrl: stored.account.contentSourceUrl,
      accountId: stored.account.id,
      accountName: stored.account.name,
    };
  }

  const envConfig = getWechatConfigFromEnv();
  return {
    ...envConfig,
    accountId: null,
    accountName: envConfig.configured ? "环境变量默认账号" : "",
  };
}

export async function verifyWechatAccountConnection(accountId?: string | null) {
  const config = await getWechatConfig(accountId);
  if (!config.configured) {
    throw new Error("微信公众号配置未完成，请先在设置页配置公众号账号，或补充环境变量 WECHAT_OFFICIAL_APP_ID / WECHAT_OFFICIAL_APP_SECRET。");
  }

  await getAccessToken(config);

  return {
    accountId: config.accountId,
    accountName: config.accountName,
    configured: true,
  };
}

function escapeHtml(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderInlineText(text: string) {
  return renderInlineTextWithStyle(text);
}

type InlineToken = {
  start: number;
  end: number;
  kind: "bold" | "quote" | "highlight";
  content: string;
};

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

function renderInlineTextWithStyle(
  text: string,
  options?: { autoHighlight?: boolean; highlightStyle?: string; quoteColor?: string },
) {
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

function parseImageSection(section: string) {
  const lines = section.split("\n").map((line) => line.trim()).filter(Boolean);
  const firstLine = lines[0] ?? "";
  const imageMatch = firstLine.match(IMAGE_MARKDOWN_PATTERN);

  if (!imageMatch) {
    return null;
  }

  const alt = imageMatch[1].trim();
  const src = imageMatch[2].trim();
  const captionLine = lines.slice(1).find((line) => IMAGE_CAPTION_PATTERN.test(line));
  const caption = captionLine?.match(IMAGE_CAPTION_PATTERN)?.[1]?.trim() ?? alt;

  return {
    alt,
    src,
    caption: caption || alt || "配图",
  } satisfies DraftImage;
}

function extractBlocks(body: string): DraftBlock[] {
  return body
    .split(/\n{2,}/)
    .map((section) => section.trim())
    .filter(Boolean)
    .map((section) => {
      const codeMatch = section.match(CODE_BLOCK_PATTERN);
      if (codeMatch) {
        return {
          type: "code",
          language: codeMatch[1]?.trim() || "",
          content: codeMatch[2].trim(),
        } satisfies DraftBlock;
      }

      const image = parseImageSection(section);
      if (image) {
        return { type: "image", image } satisfies DraftBlock;
      }

      if (section.startsWith("## ")) {
        return { type: "heading", content: section.slice(3).trim() } satisfies DraftBlock;
      }

      if (section.startsWith(">")) {
        return { type: "quote", content: section.replace(/^>\s?/gm, "").trim() } satisfies DraftBlock;
      }

      if (section === "---") {
        return { type: "divider" } satisfies DraftBlock;
      }

      if (section.startsWith("【金句】") || section.startsWith("【重点】")) {
        if (section.startsWith("【金句】")) {
          return {
            type: "golden",
            content: section.replace(/^【金句】/, "").trim(),
          } satisfies DraftBlock;
        }

        return {
          type: "highlight",
          content: section.replace(/^【重点】/, "").trim(),
        } satisfies DraftBlock;
      }

      const lines = section.split("\n").map((line) => line.trim()).filter(Boolean);
      if (lines.length > 1 && lines.every((line) => line.startsWith("- "))) {
        return {
          type: "unordered-list",
          items: lines.map((line) => line.replace(/^- /, "").trim()),
        } satisfies DraftBlock;
      }

      if (lines.length > 1 && lines.every((line) => /^\d+[.)、]\s+/.test(line))) {
        return {
          type: "ordered-list",
          items: lines.map((line) => line.replace(/^\d+[.)、]\s+/, "").trim()),
        } satisfies DraftBlock;
      }

      return { type: "paragraph", content: section } satisfies DraftBlock;
    });
}

function inferFileExtension(contentType: string, fallback = "png") {
  if (contentType.includes("jpeg")) return "jpg";
  if (contentType.includes("png")) return "png";
  if (contentType.includes("gif")) return "gif";
  return fallback;
}

function detectImageContentType(buffer: Buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  const header = buffer.subarray(0, 12).toString("ascii");
  if (header.startsWith("GIF87a") || header.startsWith("GIF89a")) {
    return "image/gif";
  }

  if (header.startsWith("RIFF") && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }

  if (buffer.length >= 12) {
    const ftyp = buffer.subarray(4, 12).toString("ascii");
    if (ftyp.startsWith("ftypavif") || ftyp.startsWith("ftypavis")) {
      return "image/avif";
    }
  }

  return "";
}

function normalizeWechatImageFile(file: { buffer: Buffer; contentType: string }) {
  const sniffedType = detectImageContentType(file.buffer);
  const normalizedContentType = (() => {
    if (sniffedType) return sniffedType;
    if (/image\/jpeg/i.test(file.contentType)) return "image/jpeg";
    if (/image\/png/i.test(file.contentType)) return "image/png";
    if (/image\/gif/i.test(file.contentType)) return "image/gif";
    if (/image\/webp/i.test(file.contentType)) return "image/webp";
    if (/image\/avif/i.test(file.contentType)) return "image/avif";
    return file.contentType.toLowerCase();
  })();

  if (!["image/jpeg", "image/png", "image/gif"].includes(normalizedContentType)) {
    throw new Error("微信公众号草稿暂不支持该图片格式，请使用 jpg、png 或 gif 图片。");
  }

  return {
    buffer: file.buffer,
    contentType: normalizedContentType,
    fileName: `image.${inferFileExtension(normalizedContentType, "jpg")}`,
  };
}

function formatWechatApiErrorMessage(error: WechatApiError) {
  const rawMessage = error.errmsg?.trim() || `微信接口返回错误：${error.errcode ?? "unknown"}`;
  const whitelistMatch = rawMessage.match(/invalid ip\s+([^\s,]+)(?:\s+ipv6\s+([^\s,]+))?/i);

  if (whitelistMatch) {
    const ipv4 = whitelistMatch[1];
    const ipv6 = whitelistMatch[2];
    const ipLabel = ipv6 ? `${ipv4}（IPv6 映射 ${ipv6}）` : ipv4;

    return `微信接口拒绝访问：当前服务器出口 IP ${ipLabel} 不在公众号后台白名单中。请到微信公众平台 -> 开发接口管理，将该 IP 加入白名单后重试。`;
  }

  return rawMessage;
}

function validateWechatDraftTitle(title: string) {
  const normalizedTitle = title.trim();

  if (!normalizedTitle) {
    throw new Error("标题不能为空。");
  }

  if (normalizedTitle.length > 64) {
    throw new Error("标题过长，请缩短到 64 个字符内再推送公众号草稿箱。");
  }
}

function getWechatDraftTitleIssue(title: string) {
  const normalizedTitle = title.trim();

  if (!normalizedTitle) {
    return "标题不能为空。";
  }

  if (normalizedTitle.length > 64) {
    return `标题过长，当前 ${normalizedTitle.length} / 64。`;
  }

  return "";
}

function normalizeWechatDigest(summary: string) {
  const normalizedSummary = summary.trim();

  if (!normalizedSummary) {
    return {
      digest: "",
      truncated: false,
    };
  }

  if (normalizedSummary.length <= WECHAT_DIGEST_LIMIT) {
    return {
      digest: normalizedSummary,
      truncated: false,
    };
  }

  return {
    digest: normalizedSummary.slice(0, WECHAT_DIGEST_LIMIT).trim(),
    truncated: true,
  };
}

async function readImageBuffer(imageUrl: string) {
  if (imageUrl.startsWith("data:")) {
    const match = imageUrl.match(/^data:(.+?);base64,(.+)$/);
    if (!match) {
      throw new Error("不支持的 data URL 图片格式。");
    }

    const contentType = match[1];
    const buffer = Buffer.from(match[2], "base64");
    return normalizeWechatImageFile({
      buffer,
      contentType,
    });
  }

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`下载文章图片失败：${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || "";

  return normalizeWechatImageFile({
    buffer,
    contentType,
  });
}

async function fetchWechatJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => null)) as (T & WechatApiError) | null;

  if (!response.ok) {
    throw new Error(payload ? formatWechatApiErrorMessage(payload) : `微信接口请求失败：${response.status}`);
  }

  if (payload && typeof payload === "object" && typeof payload.errcode === "number" && payload.errcode !== 0) {
    throw new Error(formatWechatApiErrorMessage(payload));
  }

  if (!payload) {
    throw new Error("微信接口返回为空。");
  }

  return payload;
}

async function getAccessToken(config: WechatConfig) {
  const cacheKey = config.appId;
  const cache = global.__wechatAccessTokenCache__?.[cacheKey];
  if (cache && cache.expiresAt > Date.now() + 60_000) {
    return cache.token;
  }

  const search = new URLSearchParams({
    grant_type: "client_credential",
    appid: config.appId,
    secret: config.appSecret,
  });
  const payload = await fetchWechatJson<{ access_token: string; expires_in: number }>(
    `${WECHAT_API_BASE}/cgi-bin/token?${search.toString()}`,
  );

  global.__wechatAccessTokenCache__ ??= {};
  global.__wechatAccessTokenCache__[cacheKey] = {
    token: payload.access_token,
    expiresAt: Date.now() + payload.expires_in * 1000,
  };

  return payload.access_token;
}

async function uploadImageAsWechatArticleImage(accessToken: string, imageUrl: string) {
  const file = await readImageBuffer(imageUrl);
  const formData = new FormData();
  formData.append("media", new File([new Uint8Array(file.buffer)], file.fileName, { type: file.contentType }));

  const payload = await fetchWechatJson<{ url: string }>(
    `${WECHAT_API_BASE}/cgi-bin/media/uploadimg?access_token=${accessToken}`,
    {
      method: "POST",
      body: formData,
    },
  );

  return payload.url;
}

async function uploadImageAsWechatCover(accessToken: string, imageUrl: string) {
  const file = await readImageBuffer(imageUrl);
  const formData = new FormData();
  formData.append("media", new File([new Uint8Array(file.buffer)], file.fileName, { type: file.contentType }));

  const payload = await fetchWechatJson<{ media_id: string }>(
    `${WECHAT_API_BASE}/cgi-bin/material/add_material?access_token=${accessToken}&type=image`,
    {
      method: "POST",
      body: formData,
    },
  );

  return payload.media_id;
}

function getWechatTheme(domain: ArticleDomain) {
  if (domain === "教育") return { primary: "#ea580c", accent: "#fb923c" };
  if (domain === "旅游") return { primary: "#0f766e", accent: "#14b8a6" };
  if (domain === "情感") return { primary: "#db2777", accent: "#f472b6" };
  if (domain === "社会") return { primary: "#d97706", accent: "#fbbf24" };
  if (domain === "汽车") return { primary: "#2563eb", accent: "#475569" };
  return { primary: "#2563eb", accent: "#3b82f6" };
}

function getWechatDomainStyle(domain: ArticleDomain, primary: string, accent: string) {
  const config = domainConfigs[domain];
  const base = {
    badgeText: `${config.icon} ${config.label}`,
    headingMode: "bar" as "bar" | "underline" | "center" | "card",
    headingTextColor: "rgba(0,0,0,0.9)",
    paragraphColor: "#4a4a4a",
    quoteBackground: "#f3f4f6",
    quoteTextColor: "rgba(0,0,0,0.58)",
    quoteBorderColor: primary,
    highlightBackground: "#f8fafc",
    goldenBackground: "#f6f7f9",
    goldenBorderColor: primary,
    goldenTextColor: "#1f2937",
    goldenTextAlign: "left" as const,
    summaryBackground: "#f8fafc",
    summaryBorder: `1px solid ${primary}22`,
    summaryColor: "#4a4a4a",
  };

  if (domain === "教育") {
    return {
      ...base,
      headingTextColor: "#2c3e50",
      paragraphColor: "#555555",
      quoteTextColor: "#6b5f55",
      highlightBackground: "#fff7ed",
      goldenBackground: "linear-gradient(135deg, #fff7ed, #ffedd5)",
      goldenBorderColor: "#fb923c",
      goldenTextColor: "#7c4a03",
      summaryBackground: "#fff7ed",
      summaryBorder: "1px solid #fed7aa",
      summaryColor: "#4b5563",
    };
  }

  if (domain === "旅游") {
    return {
      ...base,
      headingMode: "underline" as const,
      headingTextColor: "#1e3a5f",
      paragraphColor: "#475569",
      quoteTextColor: "#486274",
      highlightBackground: "#f0fdfa",
      goldenBackground: "linear-gradient(135deg, #eef9ff, #dff6ff)",
      goldenBorderColor: "#38bdf8",
      goldenTextColor: "#0f4c5f",
      summaryBackground: "#eff6ff",
      summaryBorder: "1px solid #bfdbfe",
      summaryColor: "#33536b",
    };
  }

  if (domain === "情感") {
    return {
      ...base,
      headingMode: "center" as const,
      headingTextColor: "#3d3d3d",
      paragraphColor: "#555555",
      quoteBackground: "#fffafb",
      quoteTextColor: "#7a6b70",
      highlightBackground: "#fff1f2",
      goldenBackground: "linear-gradient(135deg, #fff6f8, #fff1f2)",
      goldenBorderColor: "#ec4899",
      goldenTextColor: "#7a284d",
      goldenTextAlign: "center" as const,
      summaryBackground: "#fffafc",
      summaryBorder: "1px solid #fbcfe8",
      summaryColor: "#666666",
    };
  }

  if (domain === "社会") {
    return {
      ...base,
      headingMode: "card" as const,
      headingTextColor: "#1a1a1a",
      paragraphColor: "#333333",
      highlightBackground: "#fff9e6",
      goldenBackground: "linear-gradient(135deg, #fffef0, #fff7cc)",
      goldenBorderColor: "#eab308",
      goldenTextColor: "#5f4600",
      summaryBackground: "#fff9e6",
      summaryBorder: "2px dashed #fcd34d",
      summaryColor: "#333333",
    };
  }

  if (domain === "汽车") {
    return {
      ...base,
      paragraphColor: "#333333",
      quoteBackground: "#f8fafc",
      quoteTextColor: "#4b5563",
      highlightBackground: "#eff6ff",
      goldenBackground: "linear-gradient(135deg, #f8fbff, #e8f1ff)",
      goldenBorderColor: "#3b82f6",
      goldenTextColor: "#1e3a8a",
      summaryBackground: "#1e293b",
      summaryBorder: "1px solid #334155",
      summaryColor: "#e2e8f0",
    };
  }

  return base;
}

function renderWechatArticleHtml(title: string, summary: string, blocks: DraftBlock[], domain: ArticleDomain) {
  const { primary, accent } = getWechatTheme(domain);
  const domainStyle = getWechatDomainStyle(domain, primary, accent);
  const highlightStyle = `background-color:${accent}22;padding:0 2px;color:${primary};`;
  const sections: string[] = [];

  if (summary.trim()) {
    sections.push(
      `<section style="margin:0 0 18px;padding:16px 18px;background:${domainStyle.summaryBackground};border:${domainStyle.summaryBorder};border-radius:16px;color:${domainStyle.summaryColor};line-height:1.85;">${renderInlineTextWithStyle(summary.trim(), {
        autoHighlight: true,
        highlightStyle,
        quoteColor: primary,
      })}</section>`,
    );
  }

  blocks.forEach((block) => {
    if (block.type === "heading") {
      if (domainStyle.headingMode === "underline") {
        sections.push(
          `<h2 style="display:inline-block;margin:30px 0 15px;padding-bottom:6px;border-bottom:2px solid ${primary};font-size:18px;font-weight:700;line-height:1.75;color:${domainStyle.headingTextColor};">${renderInlineTextWithStyle(block.content, { autoHighlight: true, highlightStyle, quoteColor: primary })}</h2>`,
        );
        return;
      }

      if (domainStyle.headingMode === "center") {
        sections.push(
          `<div style="text-align:center;margin:34px 0 18px;"><h2 style="display:inline-block;margin:0;padding-bottom:6px;border-bottom:2px solid ${accent};font-size:18px;font-weight:600;line-height:1.8;color:${domainStyle.headingTextColor};font-family:Georgia,'Songti SC','STSong',serif;">${renderInlineTextWithStyle(block.content, { autoHighlight: true, highlightStyle, quoteColor: primary })}</h2></div>`,
        );
        return;
      }

      if (domainStyle.headingMode === "card") {
        sections.push(
          `<div style="margin:30px 0 15px;padding:12px 16px;border-radius:16px;background:#fff7ed;border:1px solid #fed7aa;"><h2 style="margin:0;font-size:18px;font-weight:800;line-height:1.7;color:${domainStyle.headingTextColor};">${renderInlineTextWithStyle(block.content, { autoHighlight: true, highlightStyle, quoteColor: primary })}</h2></div>`,
        );
        return;
      }

      sections.push(
        `<div style="margin:30px 0 15px;line-height:0;"><span style="display:inline-block;vertical-align:top;margin:8px 12px 0 0;width:6px;height:22px;border-radius:999px;background:${primary};"></span><h2 style="display:inline-block;vertical-align:top;margin:0;font-size:18px;font-weight:700;line-height:1.75;color:${domainStyle.headingTextColor};max-width:calc(100% - 24px);">${renderInlineTextWithStyle(block.content, { autoHighlight: true, highlightStyle, quoteColor: primary })}</h2></div>`,
      );
      return;
    }

    if (block.type === "quote") {
      sections.push(
        `<blockquote style="margin:24px 0;padding:16px 18px;background:${domainStyle.quoteBackground};border-left:4px solid ${domainStyle.quoteBorderColor};border-radius:0 12px 12px 0;color:${domainStyle.quoteTextColor};font-size:15px;line-height:1.8;"><p style="margin:0;">${renderInlineTextWithStyle(block.content, { autoHighlight: true, highlightStyle, quoteColor: primary })}</p></blockquote>`,
      );
      return;
    }

    if (block.type === "divider") {
      sections.push('<hr style="margin:28px 0;border:none;border-top:1px solid #e5e7eb;" />');
      return;
    }

    if (block.type === "image") {
      sections.push(
        `<figure style="margin:24px 0;"><img src="${escapeHtml(block.image.src)}" alt="${escapeHtml(block.image.alt || block.image.caption || title)}" style="display:block;width:100%;height:auto;border-radius:10px;border:1px solid #f0f0f0;background:#fafafa;" />${
          block.image.caption
            ? `<figcaption style="margin-top:10px;text-align:center;color:#999;font-size:12px;line-height:1.7;">${renderInlineTextWithStyle(block.image.caption, { quoteColor: primary })}</figcaption>`
            : ""
        }</figure>`,
      );
      return;
    }

    if (block.type === "code") {
      sections.push(
        `<pre style="margin:24px 0;padding:16px 18px;overflow:auto;border-radius:12px;background:#0f172a;color:#e2e8f0;line-height:1.75;font-size:13px;"><code>${escapeHtml(block.content)}</code></pre>`,
      );
      return;
    }

    if (block.type === "unordered-list") {
      sections.push(
        `<ul style="margin:20px 0 24px;padding-left:20px;color:${domainStyle.paragraphColor};line-height:1.85;">${block.items.map((item) => `<li style="margin-bottom:8px;">${renderInlineTextWithStyle(item, { autoHighlight: true, highlightStyle, quoteColor: primary })}</li>`).join("")}</ul>`,
      );
      return;
    }

    if (block.type === "ordered-list") {
      sections.push(
        `<ol style="margin:20px 0 24px;padding-left:20px;color:${domainStyle.paragraphColor};line-height:1.85;">${block.items.map((item) => `<li style="margin-bottom:8px;">${renderInlineTextWithStyle(item, { autoHighlight: true, highlightStyle, quoteColor: primary })}</li>`).join("")}</ol>`,
      );
      return;
    }

    if (block.type === "golden") {
      sections.push(
        `<div style="margin:24px 0;padding:16px 18px;border-radius:10px;background:${domainStyle.goldenBackground};border-left:3px solid ${domainStyle.goldenBorderColor};color:${domainStyle.goldenTextColor};font-weight:600;line-height:1.85;text-align:${domainStyle.goldenTextAlign};">${renderInlineTextWithStyle(block.content, { autoHighlight: true, highlightStyle, quoteColor: primary })}</div>`,
      );
      return;
    }

    if (block.type === "highlight") {
      sections.push(
        `<div style="margin:22px 0;padding:14px 16px;border-radius:14px;background:${domainStyle.highlightBackground};color:#1f2937;line-height:1.85;">${renderInlineTextWithStyle(block.content, { autoHighlight: true, highlightStyle, quoteColor: primary })}</div>`,
      );
      return;
    }

    sections.push(
      `<p style="font-size:16px;line-height:1.8;margin:0 0 18px;color:${domainStyle.paragraphColor};letter-spacing:0.02em;">${renderInlineTextWithStyle(block.content, {
        autoHighlight: true,
        highlightStyle,
        quoteColor: primary,
      })}</p>`,
    );
  });

  return `<section style="font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Segoe UI',sans-serif;color:${domainStyle.paragraphColor};">${sections.join("")}</section>`;
}

export async function pushArticleToWechatDraft(input: WechatDraftInput) {
  const config = await getWechatConfig(input.accountId);
  if (!config.configured) {
    throw new Error("微信公众号配置未完成，请先在页面中配置公众号账号，或补充环境变量 WECHAT_OFFICIAL_APP_ID / WECHAT_OFFICIAL_APP_SECRET。");
  }

  validateWechatDraftTitle(input.title);
  const digestInfo = normalizeWechatDigest(input.summary);

  const blocks = extractBlocks(input.body);
  const imageBlocks = blocks.filter((block): block is Extract<DraftBlock, { type: "image" }> => block.type === "image");

  if (!imageBlocks.length) {
    throw new Error("推送到公众号草稿箱前，请先在正文中插入至少一张图片。");
  }

  const accessToken = await getAccessToken(config);
  const uploadedImageMap = new Map<string, string>();

  for (const block of imageBlocks) {
    if (uploadedImageMap.has(block.image.src)) continue;
    const wechatUrl = await uploadImageAsWechatArticleImage(accessToken, block.image.src);
    uploadedImageMap.set(block.image.src, wechatUrl);
  }

  const normalizedBlocks = blocks.map((block) => {
    if (block.type !== "image") return block;
    return {
      ...block,
      image: {
        ...block.image,
        src: uploadedImageMap.get(block.image.src) ?? block.image.src,
      },
    };
  });

  const thumbMediaId = await uploadImageAsWechatCover(accessToken, imageBlocks[0].image.src);
  const content = renderWechatArticleHtml(input.title, input.summary, normalizedBlocks, input.domain);
  const payload = await fetchWechatJson<{ media_id: string }>(
    `${WECHAT_API_BASE}/cgi-bin/draft/add?access_token=${accessToken}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        articles: [
          {
            title: input.title,
            author: input.author || config.defaultAuthor || "公众号作者",
            digest: digestInfo.digest,
            content,
            content_source_url: config.contentSourceUrl,
            thumb_media_id: thumbMediaId,
            need_open_comment: 0,
            only_fans_can_comment: 0,
          },
        ],
      }),
    },
  );

  return {
    accountId: "accountId" in config ? config.accountId : null,
    accountName: "accountName" in config ? config.accountName : "",
    mediaId: payload.media_id,
    articleCount: 1,
    digestTruncated: digestInfo.truncated,
  };
}

export async function precheckWechatDraft(input: WechatDraftInput) {
  const items: WechatDraftPrecheckItem[] = [];
  const config = await getWechatConfig(input.accountId);

  items.push({
    key: "account",
    label: "公众号账号",
    ok: config.configured,
    message: config.configured
      ? `已配置${config.accountName ? `：${config.accountName}` : ""}`
      : "未配置公众号账号或 AppSecret。",
  });

  const titleIssue = getWechatDraftTitleIssue(input.title);
  items.push({
    key: "title",
    label: "标题长度",
    ok: !titleIssue,
    message: titleIssue || `标题长度 ${input.title.trim().length} / 64。`,
  });

  const digestInfo = normalizeWechatDigest(input.summary);
  items.push({
    key: "summary",
    label: "摘要",
    ok: true,
    message: digestInfo.truncated ? `摘要会自动截断到 ${WECHAT_DIGEST_LIMIT} 字。` : "摘要长度可用。",
  });

  const body = input.body.trim();
  items.push({
    key: "body",
    label: "正文",
    ok: Boolean(body),
    message: body ? "正文已填写。" : "正文不能为空。",
  });

  const blocks = extractBlocks(body);
  const imageBlocks = blocks.filter((block): block is Extract<DraftBlock, { type: "image" }> => block.type === "image");
  items.push({
    key: "image",
    label: "正文图片",
    ok: imageBlocks.length > 0,
    message: imageBlocks.length ? `已检测到 ${imageBlocks.length} 张图片。` : "推送前至少插入一张图片。",
  });

  if (config.configured) {
    try {
      await getAccessToken(config);
      items.push({
        key: "credential",
        label: "微信凭证",
        ok: true,
        message: "AppID / AppSecret 可用。",
      });
    } catch (error) {
      items.push({
        key: "credential",
        label: "微信凭证",
        ok: false,
        message: error instanceof Error ? error.message : "微信凭证校验失败。",
      });
    }
  }

  const ok = items.every((item) => item.ok);

  return {
    ok,
    accountId: config.accountId,
    accountName: config.accountName,
    digestTruncated: digestInfo.truncated,
    imageCount: imageBlocks.length,
    items,
  };
}

import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import * as cheerio from "cheerio";
import sharp from "sharp";
import { resolveArticleDomain, type ArticleDomain } from "./content-domains";
import { buildAutoImageSearchQuery } from "./article-auto-image";
import { readAIProviderSecret } from "./app-config-db";
import { readLatestHotTopicForTopic } from "./hot-topic-db";

type RealImageSearchInput = {
  query?: string;
  title?: string;
  summary?: string;
  body?: string;
  domain?: string;
  count?: number;
  source?: string;
};

type ImageSearchSource = "source-page" | "source-screenshot" | "github" | "bing";
type ImageSearchConfidence = "high" | "medium" | "low";

export type RealImageSearchResult = {
  url: string;
  source: ImageSearchSource;
  query: string;
  score: number;
  confidence: ImageSearchConfidence;
  reason: string;
  title?: string;
  pageUrl?: string;
  thumbnailUrl?: string;
};

type BingImageEntry = {
  url: string;
  thumbnailUrl: string;
  pageUrl: string;
  title: string;
  desc: string;
};

const execFileAsync = promisify(execFile);
const SEARCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  "Cache-Control": "no-cache",
} as const;

// 增加搜索结果数量限制
const MAX_SEARCH_RESULTS = 12;
const MAX_CANDIDATES_TO_CHECK = 24;
const MAX_IMAGE_DOWNLOAD_BYTES = 8 * 1024 * 1024;
const NORMALIZED_IMAGE_MIME = "image/jpeg";
const NORMALIZED_IMAGE_QUALITY = 86;
const VISION_MATCH_THRESHOLD = 72;
const VALID_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
]);

const BLOCKED_HOST_PATTERNS = [
  /shetu66\.com/i,
  /58pic\.com/i,
  /588ku\.com/i,
  /699pic\.com/i,
  /pngtree\.com/i,
  /nipic\.com/i,
  /huitu\.com/i,
  /vecteezy\.com/i,
  /shutterstock\.com/i,
  /dreamstime\.com/i,
  /freepik\.com/i,
  /alicdn\.com/i,
  /huaban\.com/i,
  /qiantucdn\.com/i,
  /ntimg\.cn/i,
  /nximg\.cn/i,
  /tukuppt\.com/i,
  /zhaotu\.com/i,
  /96weixin\.com/i,
  /dashangu\.com/i,
  /design006\.com/i,
  /photophoto\.cn/i,
  /ooopic\.com/i,
  /enterdesk\.com/i,
  /vcg\.com/i,
  /gettyimages\./i,
  /istockphoto\./i,
];

const BLOCKED_TEXT_PATTERNS = [
  /ai-generated/i,
  /illustration/i,
  /vector/i,
  /poster/i,
  /banner/i,
  /logo/i,
  /icon/i,
  /watermark/i,
  /copyright/i,
  /all rights reserved/i,
  /素材/i,
  /海报/i,
  /模板/i,
  /千库网/i,
  /摄图网/i,
  /包图网/i,
  /我图网/i,
  /昵图网/i,
  /视觉中国/i,
  /盖帝图像/i,
  /公众号/i,
  /图库/i,
  /壁纸/i,
  /头像/i,
  /表情包/i,
  /写真/i,
  /人像/i,
  /肖像/i,
  /证件照/i,
  /帅哥/i,
  /美女/i,
  /模特/i,
  /portrait/i,
  /close-up/i,
  /headshot/i,
];

const AUTO_BRANDS = [
  ["比亚迪", "byd"],
  ["极氪", "zeekr"],
  ["吉利", "geely"],
  ["长城", "great wall", "哈弗", "haval", "坦克"],
  ["奇瑞", "chery", "捷途", "星途"],
  ["长安", "changan", "深蓝", "阿维塔"],
  ["理想", "li auto", "lixiang"],
  ["蔚来", "nio"],
  ["小鹏", "xpeng"],
  ["问界", "aito", "鸿蒙智行"],
  ["零跑", "leapmotor"],
  ["特斯拉", "tesla"],
  ["大众", "volkswagen", "vw"],
  ["丰田", "toyota"],
  ["本田", "honda"],
  ["日产", "nissan"],
  ["奔驰", "mercedes", "benz"],
  ["宝马", "bmw"],
  ["奥迪", "audi"],
  ["现代", "hyundai"],
  ["起亚", "kia"],
] as const;

const GENERIC_STOPWORDS = new Set([
  "图片",
  "配图",
  "文章",
  "正文",
  "内容",
  "实拍",
  "真实",
  "高清",
  "春天",
  "风景",
  "旅行",
  "旅游",
  "汽车",
  "社会",
  "新闻",
  "一张",
  "适合",
  "不要",
  "文字",
  "海报",
  "标题",
  "摘要",
  "主题",
  "值得",
  "一张",
  "正文插图",
  "海报",
  "文字",
  "普通人",
  "怎么",
  "怎么办",
  "入场",
  "建议",
  "实操",
  "政策",
  "利好",
  "爆发",
  "变化",
  "时代",
]);

const CORE_TOPIC_STOPWORDS = new Set([
  ...GENERIC_STOPWORDS,
  "今天",
  "明天",
  "昨天",
  "今年",
  "去年",
  "明年",
  "五一",
  "十一",
  "假期",
  "周末",
  "突然",
  "开始",
  "已经",
  "正在",
  "为什么",
  "怎么办",
  "不是",
  "只是",
  "可以",
  "可能",
  "需要",
  "没有",
  "超过",
  "上线",
  "预售",
  "发布",
  "一篇",
  "这个",
  "那个",
  "这种",
  "这类",
  "怎样",
  "如何",
  "避开",
]);

const LATIN_SEARCH_STOPWORDS = new Set([
  "real",
  "photo",
  "image",
  "picture",
  "no",
  "watermark",
  "event",
  "scene",
  "news",
  "article",
]);

function decodeHtmlUrl(value: string) {
  return value.replace(/&amp;/g, "&").trim();
}

function decodeHtmlText(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/|/g, "")
    .trim();
}

function buildSearchQuery(input: RealImageSearchInput) {
  if (input.query?.trim()) {
    return input.query.trim();
  }

  const domain = resolveArticleDomain(input.domain) as ArticleDomain;
  return buildAutoImageSearchQuery({
    title: input.title?.trim() || "",
    summary: input.summary?.trim() || "",
    body: input.body?.trim() || "",
    domain,
  });
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s+-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractWeightedTerms(input: RealImageSearchInput) {
  const sourceGroups = [
    { text: input.query?.trim() || "", weight: 6 },
    { text: input.title?.trim() || "", weight: 5 },
    { text: input.summary?.trim() || "", weight: 3 },
    { text: input.body?.trim() || "", weight: 1 },
  ];

  const weighted = new Map<string, number>();

  for (const { text, weight } of sourceGroups) {
    if (!text) continue;

    const hanTerms = text.match(/[\u4e00-\u9fa5]{2,8}/g) ?? [];
    const latinTerms = text.match(/[A-Za-z0-9][A-Za-z0-9+.-]{1,20}/g) ?? [];

    for (const term of [...hanTerms, ...latinTerms]) {
      const normalized = term.trim();
      if (!normalized || GENERIC_STOPWORDS.has(normalized)) continue;
      weighted.set(normalized, Math.max(weighted.get(normalized) ?? 0, weight));
    }

    for (const phrase of hanTerms) {
      if (phrase.length <= 4) continue;
      for (let size = 2; size <= 4; size += 1) {
        for (let index = 0; index <= phrase.length - size; index += 1) {
          const term = phrase.slice(index, index + size).trim();
          if (!term || GENERIC_STOPWORDS.has(term)) continue;
          weighted.set(term, Math.max(weighted.get(term) ?? 0, Math.max(1, weight - 1)));
        }
      }
    }
  }

  return [...weighted.entries()]
    .sort((left, right) => right[1] - left[1] || right[0].length - left[0].length)
    .slice(0, 10);
}

function extractAnchorTerms(input: RealImageSearchInput) {
  const sourceTexts = [input.query?.trim() || "", input.title?.trim() || "", input.summary?.trim() || ""].filter(Boolean);
  const anchors = new Map<string, number>();

  for (const text of sourceTexts) {
    const hanTerms = text.match(/[\u4e00-\u9fa5]{2,8}/g) ?? [];
    const latinTerms = text.match(/[A-Za-z0-9][A-Za-z0-9+.-]{1,20}/g) ?? [];

    for (const term of [...hanTerms, ...latinTerms]) {
      const normalized = term.trim();
      if (!normalized || GENERIC_STOPWORDS.has(normalized)) continue;
      anchors.set(normalized, Math.max(anchors.get(normalized) ?? 0, normalized.length >= 4 ? 3 : 2));
    }

    for (const phrase of hanTerms) {
      if (phrase.length <= 4) continue;
      for (let size = 2; size <= 4; size += 1) {
        for (let index = 0; index <= phrase.length - size; index += 1) {
          const term = phrase.slice(index, index + size).trim();
          if (!term || GENERIC_STOPWORDS.has(term)) continue;
          anchors.set(term, Math.max(anchors.get(term) ?? 0, 1));
        }
      }
    }
  }

  return [...anchors.entries()]
    .sort((left, right) => right[1] - left[1] || right[0].length - left[0].length)
    .slice(0, 8);
}

function extractCoreTopicAnchors(input: RealImageSearchInput) {
  const sourceGroups = [
    { text: input.title?.trim() || "", weight: 8 },
    { text: input.summary?.trim() || "", weight: 5 },
    { text: input.body?.trim().slice(0, 600) || "", weight: 2 },
    { text: input.query?.trim() || "", weight: 1 },
  ];
  const anchors = new Map<string, number>();

  const addAnchor = (rawTerm: string, weight: number) => {
    const term = rawTerm
      .replace(/^[第这那一二三四五六七八九十]+/, "")
      .replace(/[的了着和与及或在从到为把被让只更最也都就会能可]+$/g, "")
      .trim();
    const normalized = normalizeText(term);

    if (!term || term.length < 2 || term.length > 18) return;
    if (CORE_TOPIC_STOPWORDS.has(term) || CORE_TOPIC_STOPWORDS.has(normalized)) return;
    if (/^\d+$/.test(term)) return;
    if (LATIN_SEARCH_STOPWORDS.has(normalized)) return;

    anchors.set(term, Math.max(anchors.get(term) ?? 0, weight + Math.min(4, term.length)));
  };

  for (const { text, weight } of sourceGroups) {
    if (!text) continue;

    for (const match of text.matchAll(/[A-Za-z0-9][A-Za-z0-9+.-]{1,30}/g)) {
      addAnchor(match[0], weight + 1);
    }

    for (const match of text.matchAll(/(?:《|「|“)([^》」”]{2,18})(?:》|」|”)/g)) {
      addAnchor(match[1], weight + 4);
    }

    const titleLikeText = text
      .replace(/[，。！？；、,.!?;:：()[\]（）【】《》「」“”]/g, " ")
      .split(/\s+/)
      .filter(Boolean);

    for (const phrase of titleLikeText) {
      if (/[\u4e00-\u9fa5]{2,12}/.test(phrase)) {
        addAnchor(phrase, weight);
        for (const part of phrase.split(/(?:去|到|在|从|和|与|及|的|了|着|怎样|如何|避开|为什么|怎么办)/).filter(Boolean)) {
          addAnchor(part, Math.max(1, weight - 1));
        }
      }
    }
  }

  return [...anchors.entries()]
    .sort((left, right) => right[1] - left[1] || right[0].length - left[0].length)
    .map(([term]) => term)
    .filter((term, index, list) => !list.slice(0, index).some((existing) => existing.includes(term) || term.includes(existing)))
    .slice(0, 8);
}

function countCoreTopicAnchorMatches(entryText: string, input: RealImageSearchInput) {
  const normalizedEntry = normalizeText(entryText);
  const anchors = extractCoreTopicAnchors(input);
  const matchedAnchors = anchors.filter((term) => normalizedEntry.includes(normalizeText(term)));

  return {
    anchors,
    matchedAnchors,
    matchedCount: matchedAnchors.length,
  };
}

function hasArticleContext(input: RealImageSearchInput) {
  return Boolean(input.title?.trim() || input.summary?.trim() || input.body?.trim());
}

function shouldAvoidPortraitForSearch(input: RealImageSearchInput) {
  const text = `${input.title || ""} ${input.summary || ""} ${input.body || ""}`;
  if (/(比亚迪|理想|蔚来|小鹏|特斯拉|问界|极氪|大众|丰田|本田|宝马|奔驰|奥迪)/.test(text)) {
    return false;
  }

  if (/(海边|沙滩|山川|古镇|公路|车内|车外|书桌|课堂|办公室|会议室|录音棚|键盘|耳机|麦克风|合同|版权|电脑|屏幕|文件|桌面|设备)/.test(text)) {
    return true;
  }

  return /(有人|男子|女子|男生|女生|年轻人|中年人|普通人|创作者|博主|歌手|作者|老板|家长|孩子|母亲|父亲|儿子|女儿|一人公司|打工人|创业者|用户)/.test(text);
}

function findAutoBrand(text: string) {
  const normalized = normalizeText(text);
  return AUTO_BRANDS.find((aliases) => aliases.some((alias) => normalized.includes(normalizeText(alias)))) ?? null;
}

function hasDifferentAutoBrand(text: string, expectedBrand: readonly string[]) {
  const normalized = normalizeText(text);
  return AUTO_BRANDS.some(
    (brand) =>
      brand !== expectedBrand &&
      brand.some((alias) => normalized.includes(normalizeText(alias))),
  );
}

function extractLargeNumbers(text: string) {
  return new Set(
    [...text.matchAll(/\d+(?:\.\d+)?/g)]
      .map((match) => Number(match[0]))
      .filter((value) => Number.isFinite(value) && value >= 10),
  );
}

async function fetchSearchHtml(target: string) {
  const curlArgs = [
    "--max-time",
    "15",
    "-L",
    "-sS",
    target,
    "-H",
    `User-Agent: ${SEARCH_HEADERS["User-Agent"]}`,
    "-H",
    `Accept: ${SEARCH_HEADERS.Accept}`,
    "-H",
    `Accept-Language: ${SEARCH_HEADERS["Accept-Language"]}`,
    "-H",
    `Cache-Control: ${SEARCH_HEADERS["Cache-Control"]}`,
  ];
  const { stdout } = await execFileAsync("curl", curlArgs, {
    maxBuffer: 4 * 1024 * 1024,
  });

  return stdout;
}

async function runFileMimeType(buffer: Buffer) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "lens-image-"));
  const tempFile = path.join(tempDir, "candidate");

  try {
    await fs.writeFile(tempFile, buffer);
    const { stdout } = await execFileAsync("file", ["--brief", "--mime-type", tempFile], {
      timeout: 5000,
      maxBuffer: 1024,
    });

    return stdout.trim().toLowerCase();
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function downloadImageWithCurl(url: string) {
  const curlArgs = [
    "--max-time",
    "18",
    "--location",
    "--silent",
    "--show-error",
    "--fail",
    "--max-filesize",
    String(MAX_IMAGE_DOWNLOAD_BYTES),
    "-H",
    `User-Agent: ${SEARCH_HEADERS["User-Agent"]}`,
    "-H",
    "Accept: image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    url,
  ];
  const { stdout } = await execFileAsync("curl", curlArgs, {
    encoding: "buffer",
    maxBuffer: MAX_IMAGE_DOWNLOAD_BYTES,
    timeout: 22000,
  });

  const buffer = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
  if (!buffer.length) {
    throw new Error("图片下载结果为空");
  }

  const fileMimeType = await runFileMimeType(buffer);
  if (!VALID_IMAGE_MIME_TYPES.has(fileMimeType)) {
    throw new Error(`候选 URL 不是可用图片：${fileMimeType || "unknown"}`);
  }

  return {
    buffer,
    mimeType: fileMimeType,
  };
}

async function normalizeDownloadedImage(buffer: Buffer) {
  const normalized = await sharp(buffer)
    .rotate()
    .resize({
      width: 1280,
      height: 1280,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({
      quality: NORMALIZED_IMAGE_QUALITY,
      mozjpeg: true,
    })
    .toBuffer();

  return {
    buffer: normalized,
    dataUrl: `data:${NORMALIZED_IMAGE_MIME};base64,${normalized.toString("base64")}`,
  };
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || trimmed.match(/\{[\s\S]*}/)?.[0] || "";
  if (!candidate) return null;

  try {
    return JSON.parse(candidate) as { match?: unknown; score?: unknown; reason?: unknown };
  } catch {
    return null;
  }
}

function isLikelyVisionModel(model: string) {
  return /(vision|视觉|vl|gpt-4o|gemini|claude-3|qwen-vl|qwen2\.5-vl|qvq)/i.test(model);
}

function resolveVisionModel(baseUrl: string, storedModel = "", storedFastModel = "") {
  const explicitModel = process.env.AI_IMAGE_MATCH_MODEL?.trim();
  if (explicitModel) return explicitModel;

  if (isLikelyVisionModel(storedFastModel)) return storedFastModel;
  if (isLikelyVisionModel(storedModel)) return storedModel;

  if (/dashscope|aliyuncs/i.test(baseUrl)) return "qwen-vl-plus";
  if (/openai/i.test(baseUrl)) return "gpt-4o-mini";
  if (/openrouter/i.test(baseUrl)) return "openai/gpt-4o-mini";
  return "";
}

function extractDataUrlParts(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1],
    base64: match[2],
  };
}

function buildVisionMatchPrompt(articleContext: string) {
  return [
    "请判断图片是否和文章实际内容匹配。",
    "要求：",
    "1. 事件、主体、场景明显不一致时判为不匹配。",
    "2. 通用素材、无关人物照、纯装饰图、海报模板、logo 图判为不匹配。",
    "3. 如果图片是文章来源页截图，且能承载该热点信息，可以判为匹配。",
    "返回格式：{\"match\":true|false,\"score\":0-100,\"reason\":\"一句话原因\"}",
    "",
    articleContext,
  ].join("\n");
}

async function verifyImageMatchesArticle(input: RealImageSearchInput, imageDataUrl: string) {
  const storedConfig = await readAIProviderSecret().catch(() => null);
  const apiKey = storedConfig?.apiKey || process.env.AI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim() || "";
  const baseUrl = (
    storedConfig?.baseUrl ||
    process.env.AI_BASE_URL?.trim() ||
    process.env.OPENAI_BASE_URL?.trim() ||
    "https://dashscope.aliyuncs.com/compatible-mode/v1"
  )
    .replace(/\/+$/, "")
    .replace(/\/chat\/completions$/i, "");
  const model = resolveVisionModel(
    baseUrl,
    storedConfig?.model ||
      process.env.AI_MODEL?.trim() ||
      process.env.OPENAI_MODEL?.trim() ||
      "",
    storedConfig?.fastModel ||
      process.env.AI_MODEL_FAST?.trim() ||
      process.env.OPENAI_MODEL_FAST?.trim() ||
      "",
  );

  if (!apiKey || !model) {
    return {
      passed: false,
      score: 0,
      reason: "视觉模型未配置，跳过真实配图",
    };
  }

  const articleContext = [
    input.title ? `标题：${input.title}` : "",
    input.summary ? `摘要：${input.summary}` : "",
    input.body ? `正文节选：${input.body.slice(0, 900)}` : "",
    input.query ? `搜索词：${input.query}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const isAnthropic = /anthropic/i.test(baseUrl);
  const imageParts = extractDataUrlParts(imageDataUrl);
  if (isAnthropic && !imageParts) {
    return {
      passed: false,
      score: 0,
      reason: "图片 data URL 格式不正确",
    };
  }

  const response = await fetch(isAnthropic ? `${baseUrl}/messages` : `${baseUrl}/chat/completions`, {
    method: "POST",
    headers: isAnthropic
      ? {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        }
      : {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
    signal: AbortSignal.timeout(45000),
    body: JSON.stringify(
      isAnthropic
        ? {
            model,
            temperature: 0,
            max_tokens: 512,
            system:
              "你是文章配图审核器。判断图片是否适合作为这篇文章的真实配图，只看图片内容和文章主题是否匹配。只返回 JSON。",
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: buildVisionMatchPrompt(articleContext),
                  },
                  {
                    type: "image",
                    source: {
                      type: "base64",
                      media_type: imageParts!.mimeType,
                      data: imageParts!.base64,
                    },
                  },
                ],
              },
            ],
          }
        : {
            model,
            temperature: 0,
            messages: [
              {
                role: "system",
                content:
                  "你是文章配图审核器。判断图片是否适合作为这篇文章的真实配图，只看图片内容和文章主题是否匹配。只返回 JSON。",
              },
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: buildVisionMatchPrompt(articleContext),
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: imageDataUrl,
                    },
                  },
                ],
              },
            ],
          },
    ),
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        choices?: Array<{ message?: { content?: string } }>;
        content?: Array<{ type?: string; text?: string }>;
        error?: { message?: string };
      }
    | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message || `视觉校验失败：${response.status}`);
  }

  const content =
    payload?.choices?.[0]?.message?.content ||
    payload?.content?.map((item) => (item.type === "text" && item.text ? item.text : "")).join("\n") ||
    "";
  const parsed = extractJsonObject(content);
  const score = typeof parsed?.score === "number" ? parsed.score : 0;
  const passed = parsed?.match === true && score >= VISION_MATCH_THRESHOLD;

  return {
    passed,
    score,
    reason: typeof parsed?.reason === "string" && parsed.reason.trim() ? parsed.reason.trim() : "视觉模型未返回明确原因",
  };
}

function extractBingImageEntries(html: string) {
  const entries: BingImageEntry[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(/ m="(\{&quot;[^"]+\})"/g)) {
    try {
      const payload = JSON.parse(decodeHtmlText(match[1])) as {
        murl?: string;
        turl?: string;
        purl?: string;
        t?: string;
        desc?: string;
      };

      const url = decodeHtmlUrl(payload.murl || "");
      if (!url || seen.has(url)) continue;
      seen.add(url);

      entries.push({
        url,
        thumbnailUrl: decodeHtmlUrl(payload.turl || ""),
        pageUrl: decodeHtmlUrl(payload.purl || ""),
        title: decodeHtmlText(payload.t || ""),
        desc: decodeHtmlText(payload.desc || ""),
      });
    } catch {
      continue;
    }
  }

  return entries;
}

function matchesBlockedHost(url: string) {
  try {
    const parsed = new URL(url);
    return BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(parsed.hostname));
  } catch {
    return false;
  }
}

function isLikelyUsableEntry(entry: BingImageEntry) {
  try {
    const parsed = new URL(entry.url);

    if (!/^https?:$/i.test(parsed.protocol)) return false;
    if (matchesBlockedHost(entry.url) || matchesBlockedHost(entry.pageUrl)) return false;
    if (/\.svg($|\?)/i.test(parsed.pathname)) return false;

    return true;
  } catch {
    return false;
  }
}

function isPortraitLikeEntry(entry: BingImageEntry) {
  const text = normalizeText(`${entry.title} ${entry.desc} ${entry.pageUrl} ${entry.url}`);
  return /(portrait|headshot|close up|selfie|person|model|face|人像|肖像|写真|模特|帅哥|美女|头像|证件照|博主)/.test(text);
}

function isRelevantEnoughEntry(entry: BingImageEntry, input: RealImageSearchInput) {
  const domain = resolveArticleDomain(input.domain) as ArticleDomain;
  const entryText = `${entry.title} ${entry.desc} ${entry.pageUrl} ${entry.url}`;
  const inputText = `${input.title || ""} ${input.summary || ""} ${input.query || ""}`;
  const normalizedEntry = normalizeText(entryText);

  if (hasArticleContext(input)) {
    const { anchors, matchedCount } = countCoreTopicAnchorMatches(entryText, input);
    if (anchors.length >= 2 && matchedCount < 1) {
      return false;
    }

    if (anchors.length >= 4 && matchedCount < 2) {
      return false;
    }
  }

  if (domain === "汽车") {
    const expectedBrand = findAutoBrand(inputText);
    if (expectedBrand) {
      const hasExpectedBrand = expectedBrand.some((alias) => normalizedEntry.includes(normalizeText(alias)));
      if (!hasExpectedBrand || hasDifferentAutoBrand(entryText, expectedBrand)) {
        return false;
      }
    }
  }

  if (domain === "科技" || domain === "AI") {
    const expectsRobotics = /(机器人|人形机器人|机器狗|robot|robotics)/i.test(inputText);
    const expectsRace = /(马拉松|比赛|赛道|夺冠|冠军|race|marathon|track|competition)/i.test(inputText);

    if (expectsRobotics) {
      const hasRoboticsCue = /(机器人|人形机器人|机器狗|robot|robotics)/.test(normalizedEntry);
      if (!hasRoboticsCue) {
        return false;
      }
    }

    if (expectsRace) {
      const hasRaceCue = /(马拉松|比赛|赛道|冠军|race|marathon|track|competition|event)/.test(normalizedEntry);
      if (!hasRaceCue) {
        return false;
      }
    }
  }

  const expectedNumbers = extractLargeNumbers(inputText);
  const entryNumbers = extractLargeNumbers(`${entry.title} ${entry.desc}`);
  if (expectedNumbers.size && entryNumbers.size) {
    const hasExpectedNumber = [...entryNumbers].some((value) => expectedNumbers.has(value));
    const hasConflictingNumber = [...entryNumbers].some((value) => !expectedNumbers.has(value));
    if (!hasExpectedNumber && hasConflictingNumber) {
      return false;
    }
  }

  return true;
}

function toAbsoluteUrl(baseUrl: string, value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;

  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return "";
  }
}

function isUsableSourcePageImage(url: string) {
  if (!url) return false;
  if (!/^https?:\/\//i.test(url)) return false;
  if (matchesBlockedHost(url)) return false;
  if (/\.svg($|\?)/i.test(url)) return false;
  if (/avatar|badge|icon|emoji|sponsor|favicon|logo|qrcode|qr-code/i.test(url)) return false;
  return true;
}

function scoreSourcePageImage(url: string, alt = "") {
  const text = normalizeText(`${url} ${alt}`);
  let score = 0;

  if (/og:image|twitter:image|cover|hero|banner|article|news|post/.test(text)) score += 20;
  if (/screenshot|demo|preview|product|launch|event|showcase/.test(text)) score += 16;
  if (/upload|media|image|img|photo|picture/.test(text)) score += 8;
  if (/avatar|badge|icon|logo|qrcode|qr code|emoji|sprite/.test(text)) score -= 30;
  if (/\.gif($|\?)/i.test(url)) score -= 8;

  return score;
}

function getConfidence(score: number): ImageSearchConfidence {
  if (score >= 80) return "high";
  if (score >= 60) return "medium";
  return "low";
}

function normalizeResultUrl(url: string) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url.trim();
  }
}

function rankAndDedupeResults(results: RealImageSearchResult[], limit: number) {
  const seen = new Set<string>();

  return results
    .sort((left, right) => right.score - left.score)
    .filter((result) => {
      const key = normalizeResultUrl(result.url);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

async function validateAndEmbedImage(result: RealImageSearchResult, input: RealImageSearchInput) {
  try {
    const downloaded = await downloadImageWithCurl(result.url);
    const normalized = await normalizeDownloadedImage(downloaded.buffer);
    const vision = await verifyImageMatchesArticle(input, normalized.dataUrl);

    if (!vision.passed) {
      return null;
    }

    const score = Math.max(result.score, vision.score);
    return {
      ...result,
      url: normalized.dataUrl,
      score,
      confidence: getConfidence(score),
      reason: `${result.reason}；视觉校验通过：${vision.reason}`,
    } satisfies RealImageSearchResult;
  } catch (error) {
    console.warn(
      "Skip invalid or mismatched image candidate:",
      result.url.slice(0, 160),
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

async function validateAndEmbedResults(
  results: RealImageSearchResult[],
  input: RealImageSearchInput,
  limit: number,
) {
  const ranked = rankAndDedupeResults(results, Math.max(limit * 3, MAX_CANDIDATES_TO_CHECK));
  const embedded: RealImageSearchResult[] = [];

  for (const result of ranked) {
    if (embedded.length >= limit) break;
    const verified = await validateAndEmbedImage(result, input);
    if (verified) {
      embedded.push(verified);
    }
  }

  return embedded;
}

function canUseSourceScreenshot(url: string) {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/i.test(parsed.protocol)) return false;
    if (/github\.com$/i.test(parsed.hostname)) return false;
    if (matchesBlockedHost(url)) return false;
    if (/localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

function buildSourceScreenshotUrl(pageUrl: string) {
  return `https://image.thum.io/get/width/1440/noanimate/${pageUrl}`;
}

async function isReachableImage(url: string) {
  const isUsableResponse = (response: Response) => {
    const contentType = response.headers.get("content-type") || "";
    const contentLengthHeader = response.headers.get("content-length");
    const contentLength = contentLengthHeader ? Number(contentLengthHeader) : null;

    return (
      response.ok &&
      (
        /^image\/(jpeg|jpg|png|gif|webp|avif)$/i.test(contentType) ||
        contentType === "binary/octet-stream" ||
        !contentType
      ) &&
      contentLength !== 0
    );
  };

  try {
    const response = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": SEARCH_HEADERS["User-Agent"] },
      signal: AbortSignal.timeout(7000),
      redirect: "follow",
    });

    if (isUsableResponse(response)) return true;
  } catch {
    // Some CDNs reject HEAD. Fall back to a tiny GET below.
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": SEARCH_HEADERS["User-Agent"],
        Range: "bytes=0-4095",
      },
      signal: AbortSignal.timeout(9000),
      redirect: "follow",
    });

    return isUsableResponse(response);
  } catch {
    return false;
  }
}

function scoreEntry(entry: BingImageEntry, input: RealImageSearchInput) {
  const haystack = normalizeText(`${entry.title} ${entry.desc} ${entry.pageUrl} ${entry.url}`);
  const titleText = normalizeText(input.title?.trim() || "");
  const summaryText = normalizeText(input.summary?.trim() || "");
  const terms = extractWeightedTerms(input);
  let score = 0;

  for (const [term, weight] of terms) {
    const normalizedTerm = normalizeText(term);
    if (!normalizedTerm) continue;
    if (haystack.includes(normalizedTerm)) {
      score += weight * (normalizedTerm.length >= 4 ? 3 : 2);
    }
  }

  if (titleText && haystack.includes(titleText)) score += 18;
  if (summaryText && haystack.includes(summaryText)) score += 8;

  const pageHost = (() => {
    try {
      return new URL(entry.pageUrl).hostname;
    } catch {
      return "";
    }
  })();

  const domain = resolveArticleDomain(input.domain) as ArticleDomain;
  if (domain === "汽车" && /(autohome|bitauto|che168|pcauto|sohuauto|cheshi)/i.test(pageHost)) score += 8;
  if (domain === "旅游" && /(qunar|ctrip|mafengwo|feizhu|ly\.com|tuniu|lvmama|zuche|yundashequ|mafengwo|tripadvisor|booking|agoda|airbnb|xiaohongshu|dianping)/i.test(pageHost)) score += 8;
  if (domain === "社会" && /(news|people|cctv|163|sina|qq|thepaper)/i.test(pageHost)) score += 6;
  if ((domain === "科技" || domain === "AI") && /(36kr|ifanr|leiphone|qbitai|jiqizhixin|huxiu|news|people|cctv|163|sina|qq|thepaper)/i.test(pageHost)) score += 8;

  if (/text\//i.test(entry.url) || /x_image_process=text/i.test(entry.url)) score -= 18;
  if (BLOCKED_TEXT_PATTERNS.some((pattern) => pattern.test(`${entry.title} ${entry.desc} ${entry.pageUrl} ${entry.url}`))) score -= 16;
  if (/图库|壁纸|头像|素材|海报|模板/.test(`${entry.title} ${entry.desc}`)) score -= 18;
  if (/千库网|摄图网|包图网|我图网|昵图网|视觉中国|盖帝图像|watermark|copyright/.test(`${entry.title} ${entry.desc} ${entry.pageUrl} ${entry.url}`)) score -= 30;
  if (!terms.some(([term]) => haystack.includes(normalizeText(term)))) score -= 12;
  if (shouldAvoidPortraitForSearch(input) && isPortraitLikeEntry(entry)) score -= 20;

  const { anchors, matchedCount } = countCoreTopicAnchorMatches(`${entry.title} ${entry.desc} ${entry.pageUrl} ${entry.url}`, input);
  if (hasArticleContext(input) && anchors.length) {
    score += matchedCount * 12;
    if (matchedCount === 0) score -= 40;
    if (anchors.length >= 4 && matchedCount < 2) score -= 24;
  }

  if (domain === "科技" || domain === "AI") {
    const roboticsBoost = /(机器人|人形机器人|机器狗|robot|robotics)/.test(haystack);
    const raceBoost = /(马拉松|比赛|赛道|冠军|race|marathon|track|competition|event)/.test(haystack);
    const genericDeskPenalty = /(keyboard|workspace|desk|laptop|notebook|coffee|cup|flower|键盘|桌面|笔记本|咖啡|茶杯|花瓶)/.test(haystack);

    if (roboticsBoost) score += 12;
    if (raceBoost) score += 10;
    if (genericDeskPenalty && !roboticsBoost) score -= 14;
  }

  return score;
}

function analyzeEntryMatch(entry: BingImageEntry, input: RealImageSearchInput) {
  const haystack = normalizeText(`${entry.title} ${entry.desc} ${entry.pageUrl} ${entry.url}`);
  const anchorTerms = extractAnchorTerms(input);
  const matchedAnchors = anchorTerms.filter(([term]) => haystack.includes(normalizeText(term)));
  const score = scoreEntry(entry, input);

  return {
    score,
    matchedAnchorCount: matchedAnchors.length,
    matchedStrongAnchorCount: matchedAnchors.filter(([, weight]) => weight >= 2).length,
  };
}

function hasConfidentRelevance(entry: BingImageEntry, input: RealImageSearchInput) {
  const domain = resolveArticleDomain(input.domain) as ArticleDomain;
  const { score, matchedAnchorCount, matchedStrongAnchorCount } = analyzeEntryMatch(entry, input);
  const anchorTerms = extractAnchorTerms(input);
  const entryText = `${entry.title} ${entry.desc} ${entry.pageUrl} ${entry.url}`;

  if (hasArticleContext(input)) {
    const { anchors, matchedCount } = countCoreTopicAnchorMatches(entryText, input);
    if (anchors.length >= 2 && matchedCount < 1) {
      return false;
    }

    if (anchors.length >= 4 && matchedCount < 2) {
      return false;
    }
  }

  if (!anchorTerms.length) {
    if (domain === "旅游" || domain === "汽车") {
      return score >= 10;
    }

    if (domain === "社会") {
      return score >= 12;
    }

    return score >= 12;
  }

  if (domain === "旅游" || domain === "汽车") {
    return score >= 12 && matchedStrongAnchorCount >= 1;
  }

  if (domain === "社会") {
    return score >= 14 && matchedStrongAnchorCount >= 1;
  }

  return score >= 16 && matchedAnchorCount >= 2 && matchedStrongAnchorCount >= 1;
}

function getRelaxedScoreThreshold(input: RealImageSearchInput) {
  const domain = resolveArticleDomain(input.domain) as ArticleDomain;

  if (input.query?.trim() && !input.title?.trim() && !input.summary?.trim() && !input.body?.trim()) {
    return domain === "汽车" || domain === "旅游" ? 6 : 8;
  }

  if (domain === "汽车" || domain === "旅游") return 8;
  if (domain === "社会") return 10;
  return 12;
}

function buildFallbackSearchQueries(input: RealImageSearchInput, primaryQuery: string) {
  const queries = [primaryQuery.trim()];
  const title = input.title?.trim() || "";

  if (title && !queries.includes(title)) {
    queries.push(title);
  }

  const titleTerms = extractWeightedTerms({ ...input, query: title || input.query })
    .map(([term]) => term)
    .slice(0, 4)
    .join(" ")
    .trim();
  if (titleTerms && !queries.includes(titleTerms)) {
    queries.push(titleTerms);
  }

  return queries.filter(Boolean).slice(0, 3);
}

function isGithubTrendingInput(input: RealImageSearchInput) {
  return Boolean(input.source?.includes("GitHub Trending"));
}

function extractGithubRepoSlugFromText(text: string) {
  const normalized = text.trim();
  if (!normalized) return "";

  const directMatch = normalized.match(/([A-Za-z0-9_.-]+)\s*\/\s*([A-Za-z0-9_.-]+)/);
  if (directMatch) {
    return `${directMatch[1]}/${directMatch[2]}`;
  }

  return "";
}

function normalizeGithubRepoUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    if (!/github\.com$/i.test(parsed.hostname)) return "";

    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length < 2) return "";
    return `https://github.com/${segments[0]}/${segments[1]}`;
  } catch {
    return "";
  }
}

function toAbsoluteGithubAssetUrl(repoUrl: string, value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }

  if (trimmed.startsWith("/")) {
    return `https://github.com${trimmed}`;
  }

  try {
    return new URL(trimmed, `${repoUrl}/`).toString();
  } catch {
    return "";
  }
}

function isUsableGithubImage(url: string) {
  if (!url) return false;
  if (!/^https?:\/\//i.test(url)) return false;
  if (matchesBlockedHost(url)) return false;
  if (/avatar|badge|icon|emoji|sponsor|favicon/i.test(url)) return false;
  if (/\.svg($|\?)/i.test(url)) return false;
  return true;
}

function scoreGithubImage(url: string, alt = "") {
  const text = `${url} ${alt}`.toLowerCase();
  let score = 0;

  if (/opengraph\.githubassets\.com/.test(text)) score += 40;
  if (/raw\.githubusercontent\.com/.test(text)) score += 30;
  if (/githubusercontent\.com/.test(text)) score += 20;
  if (/screenshot|demo|preview|cover|hero|sample|example|showcase/.test(text)) score += 20;
  if (/readme|assets|docs|images|img/.test(text)) score += 10;
  if (/logo|avatar|badge|shield|icon/.test(text)) score -= 25;

  return score;
}

function buildGithubRepoScreenshotUrl(repoUrl: string) {
  return `https://image.thum.io/get/width/1440/noanimate/${repoUrl}`;
}

async function fetchGithubRepoScreenshot(repoUrl: string) {
  const screenshotUrl = buildGithubRepoScreenshotUrl(repoUrl);

  return [
    {
      url: screenshotUrl,
      source: "github" as const,
      query: repoUrl,
      score: 88,
      confidence: "high" as const,
      reason: "GitHub 仓库页面截图",
      title: "GitHub Repo Screenshot",
      pageUrl: repoUrl,
    },
  ] satisfies RealImageSearchResult[];
}

async function fetchGithubRepoPreviewImages(repoUrl: string) {
  const html = await fetchSearchHtml(repoUrl);
  const $ = cheerio.load(html);
  const candidates: Array<{ url: string; score: number }> = [];
  const seen = new Set<string>();

  const pushCandidate = (rawUrl: string, alt = "") => {
    const nextUrl = toAbsoluteGithubAssetUrl(repoUrl, rawUrl);
    if (!isUsableGithubImage(nextUrl) || seen.has(nextUrl)) return;
    seen.add(nextUrl);
    candidates.push({
      url: nextUrl,
      score: scoreGithubImage(nextUrl, alt),
    });
  };

  const ogImage = $('meta[property="og:image"]').attr("content");
  if (ogImage) {
    pushCandidate(ogImage, "og-image");
  }

  $("#readme img").each((_, element) => {
    const src = $(element).attr("src") || $(element).attr("data-canonical-src") || "";
    const alt = $(element).attr("alt") || "";
    pushCandidate(src, alt);
  });

  $("img").each((_, element) => {
    const src = $(element).attr("src") || $(element).attr("data-canonical-src") || "";
    const alt = $(element).attr("alt") || "";
    if (/screenshot|preview|demo|showcase|hero/i.test(`${src} ${alt}`)) {
      pushCandidate(src, alt);
    }
  });

  const ranked = candidates
    .sort((left, right) => right.score - left.score)
    .slice(0, 6);

  const results: RealImageSearchResult[] = [];
  for (const candidate of ranked) {
    results.push({
      url: candidate.url,
      source: "github",
      query: repoUrl,
      score: 82 + Math.min(12, Math.max(0, candidate.score)),
      confidence: "high",
      reason: "GitHub README 或仓库预览图",
      title: "GitHub Repo Preview",
      pageUrl: repoUrl,
    });
  }

  return results;
}

async function searchGithubTrendingRepoImages(input: RealImageSearchInput): Promise<RealImageSearchResult[]> {
  if (!isGithubTrendingInput(input) || !input.title?.trim()) {
    return [];
  }

  const repoSlug = extractGithubRepoSlugFromText(`${input.title} ${input.query || ""}`);
  const directRepoUrl = repoSlug ? normalizeGithubRepoUrl(`https://github.com/${repoSlug}`) : "";
  if (directRepoUrl) {
    const directScreenshotResults = await fetchGithubRepoScreenshot(directRepoUrl).catch(() => []);
    if (directScreenshotResults.length) {
      return directScreenshotResults;
    }

    const directPreviewResults = await fetchGithubRepoPreviewImages(directRepoUrl).catch(() => []);
    if (directPreviewResults.length) {
      return directPreviewResults;
    }
  }

  const hotTopic = await readLatestHotTopicForTopic({
    title: input.title.trim(),
    source: input.source || "GitHub Trending",
  }).catch(() => null);

  const repoUrl = normalizeGithubRepoUrl(hotTopic?.url || "");
  if (!repoUrl) {
    return [];
  }

  const screenshotResults = await fetchGithubRepoScreenshot(repoUrl).catch(() => []);
  if (screenshotResults.length) {
    return screenshotResults;
  }

  return fetchGithubRepoPreviewImages(repoUrl);
}

async function readSourcePageUrl(input: RealImageSearchInput) {
  const hotTopic = await readLatestHotTopicForTopic({
    title: input.title?.trim() || input.query?.trim() || "",
    source: input.source || "",
  }).catch(() => null);

  return hotTopic?.url?.trim() || "";
}

async function searchSourcePageImages(input: RealImageSearchInput): Promise<RealImageSearchResult[]> {
  const pageUrl = await readSourcePageUrl(input);
  if (!pageUrl || /github\.com/i.test(pageUrl)) {
    return [];
  }

  const html = await fetchSearchHtml(pageUrl).catch(() => "");
  if (!html) return [];

  const $ = cheerio.load(html);
  const candidates: Array<{ url: string; title: string; score: number }> = [];
  const seen = new Set<string>();

  const pushCandidate = (rawUrl: string, title = "") => {
    const url = toAbsoluteUrl(pageUrl, rawUrl);
    if (!isUsableSourcePageImage(url) || seen.has(url)) return;
    seen.add(url);
    candidates.push({
      url,
      title,
      score: scoreSourcePageImage(url, title),
    });
  };

  [
    $('meta[property="og:image"]').attr("content"),
    $('meta[property="og:image:url"]').attr("content"),
    $('meta[name="twitter:image"]').attr("content"),
    $('meta[name="twitter:image:src"]').attr("content"),
  ].forEach((url) => pushCandidate(url || "", "source meta image"));

  $("article img, main img, .article-content img, .entry-content img, .post-content img, .content img").each((_, element) => {
    const src = $(element).attr("src") || $(element).attr("data-src") || $(element).attr("data-original") || "";
    const alt = $(element).attr("alt") || $(element).attr("title") || "source article image";
    pushCandidate(src, alt);
  });

  const ranked = candidates
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_CANDIDATES_TO_CHECK);

  const results: RealImageSearchResult[] = [];
  for (const candidate of ranked) {
    const score = 78 + Math.min(16, Math.max(0, candidate.score));
    results.push({
      url: candidate.url,
      source: "source-page",
      query: pageUrl,
      score,
      confidence: getConfidence(score),
      reason: candidate.title === "source meta image" ? "原文页面 meta 配图" : "原文正文图片",
      title: candidate.title,
      pageUrl,
    });
  }

  return results;
}

async function searchSourcePageScreenshot(input: RealImageSearchInput): Promise<RealImageSearchResult[]> {
  const pageUrl = await readSourcePageUrl(input);
  if (!pageUrl || !canUseSourceScreenshot(pageUrl)) {
    return [];
  }

  const screenshotUrl = buildSourceScreenshotUrl(pageUrl);

  return [
    {
      url: screenshotUrl,
      source: "source-screenshot",
      query: pageUrl,
      score: 76,
      confidence: "medium",
      reason: "热点来源页面截图",
      title: "来源页面截图",
      pageUrl,
    },
  ];
}

export async function searchRealArticleImages(input: RealImageSearchInput): Promise<RealImageSearchResult[]> {
  const targetCount = Math.max(1, Math.min(input.count ?? MAX_SEARCH_RESULTS, MAX_SEARCH_RESULTS));
  const sourcePageImages = await searchSourcePageImages(input).catch(() => []);
  const githubImages = await searchGithubTrendingRepoImages(input).catch(() => []);
  const sourcePageScreenshots = await searchSourcePageScreenshot(input).catch(() => []);
  const providerResults: RealImageSearchResult[] = [
    ...sourcePageImages,
    ...githubImages,
    ...sourcePageScreenshots,
  ];

  const query = buildSearchQuery(input);
  if (!query) {
    return validateAndEmbedResults(providerResults, input, targetCount);
  }
  const searchQueries = buildFallbackSearchQueries(input, query);
  const baseCandidates: BingImageEntry[] = [];
  const seenUrls = new Set<string>();

  for (const searchQuery of searchQueries) {
    const target = `https://cn.bing.com/images/search?q=${encodeURIComponent(searchQuery)}`;
    const html = await fetchSearchHtml(target);
    const entries = extractBingImageEntries(html)
      .filter(isLikelyUsableEntry)
      .filter((entry) => isRelevantEnoughEntry(entry, input));

    for (const entry of entries) {
      if (seenUrls.has(entry.url)) continue;
      seenUrls.add(entry.url);
      baseCandidates.push(entry);
    }

    if (baseCandidates.length >= MAX_CANDIDATES_TO_CHECK * 2) break;
  }

  const strictCandidates = baseCandidates
    .filter((entry) => hasConfidentRelevance(entry, input))
    .sort((left, right) => scoreEntry(right, input) - scoreEntry(left, input));

  const relaxedCandidates = baseCandidates
    .map((entry) => ({ entry, score: scoreEntry(entry, input) }))
    .filter(({ score }) => score >= getRelaxedScoreThreshold(input))
    .sort((left, right) => right.score - left.score)
    .map(({ entry }) => entry);

  const fallbackCandidates = baseCandidates
    .map((entry) => ({ entry, score: scoreEntry(entry, input) }))
    .sort((left, right) => right.score - left.score)
    .map(({ entry }) => entry);

  const candidates = (
    strictCandidates.length
      ? strictCandidates
      : hasArticleContext(input)
        ? []
        : relaxedCandidates.length
          ? relaxedCandidates
          : fallbackCandidates
  )
    .slice(0, MAX_CANDIDATES_TO_CHECK);

  const results: RealImageSearchResult[] = [];
  
  for (const candidate of candidates) {
    if (results.length >= MAX_CANDIDATES_TO_CHECK) break;
    const score = Math.max(30, Math.min(74, scoreEntry(candidate, input) + 45));
    results.push({
      url: candidate.url,
      source: "bing",
      query,
      score,
      confidence: getConfidence(score),
      reason: "Bing 图片搜索候选",
      title: candidate.title,
      pageUrl: candidate.pageUrl,
      thumbnailUrl: candidate.thumbnailUrl,
    });
  }

  return validateAndEmbedResults([...providerResults, ...results], input, targetCount);
}

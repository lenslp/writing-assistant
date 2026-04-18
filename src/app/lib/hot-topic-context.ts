import * as cheerio from "cheerio";
import type { TopicSuggestion } from "./app-data";
import { readLatestHotTopicForTopic } from "./hot-topic-db";
import type { HotTopicSourceContext } from "./ai-writing-types";

const CONTENT_MAX_LENGTH = 2200;
const SUMMARY_MAX_LENGTH = 220;
const FACT_LIMIT = 5;
const SOURCE_CONTEXT_CACHE_TTL_MS = 10 * 60 * 1000;

const sourceContextCache = new Map<string, { expiresAt: number; value: HotTopicSourceContext | null }>();

function normalizeWhitespace(text: string) {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function clipText(text: string, maxLength: number) {
  const normalized = normalizeWhitespace(text);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trim()}…`;
}

function buildSourceContextCacheKey(topic: Pick<TopicSuggestion, "title" | "source">) {
  return `${topic.source}::${topic.title}`.trim();
}

function readCachedSourceContext(topic: Pick<TopicSuggestion, "title" | "source">) {
  const cacheKey = buildSourceContextCacheKey(topic);
  const cached = sourceContextCache.get(cacheKey);

  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    sourceContextCache.delete(cacheKey);
    return null;
  }

  return cached.value;
}

function writeCachedSourceContext(topic: Pick<TopicSuggestion, "title" | "source">, value: HotTopicSourceContext | null) {
  sourceContextCache.set(buildSourceContextCacheKey(topic), {
    value,
    expiresAt: Date.now() + SOURCE_CONTEXT_CACHE_TTL_MS,
  });

  return value;
}

function parseJsonLikePayload(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function collectJsonText(input: unknown, bucket: string[]) {
  if (!input) return;

  if (typeof input === "string") {
    const trimmed = normalizeWhitespace(input);
    if (trimmed.length >= 60) {
      bucket.push(trimmed);
    }
    return;
  }

  if (Array.isArray(input)) {
    input.forEach((item) => collectJsonText(item, bucket));
    return;
  }

  if (typeof input !== "object") return;

  const record = input as Record<string, unknown>;
  [
    "articleBody",
    "text",
    "description",
    "headline",
    "name",
    "abstract",
  ].forEach((key) => {
    if (key in record) {
      collectJsonText(record[key], bucket);
    }
  });
}

function dedupeTexts(items: string[]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = item.replace(/\s+/g, " ").trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function removeNoise($: cheerio.CheerioAPI) {
  [
    "script",
    "style",
    "noscript",
    "svg",
    "iframe",
    "header",
    "footer",
    "nav",
    "aside",
    "form",
    ".advertisement",
    ".ads",
    ".related",
    ".recommend",
    ".sidebar",
    ".comment",
    ".comments",
    ".toolbar",
  ].forEach((selector) => $(selector).remove());
}

function collectTextFromRoot($: cheerio.CheerioAPI, root: cheerio.Cheerio<any>) {
  const nodes = root.find("h1,h2,h3,p,li,blockquote").toArray();
  const parts = nodes
    .map((node) => $(node).text())
    .map((text) => normalizeWhitespace(text))
    .filter((text) => text.length >= 18)
    .filter((text) => !/^(首页|登录|注册|下载|打开 App|举报|分享|收藏|点赞|评论)$/.test(text));

  return dedupeTexts(parts).join("\n\n");
}

function extractMetaSummary($: cheerio.CheerioAPI) {
  const candidates = [
    $('meta[name="description"]').attr("content"),
    $('meta[property="og:description"]').attr("content"),
    $('meta[name="twitter:description"]').attr("content"),
  ]
    .map((item) => normalizeWhitespace(String(item ?? "")))
    .filter(Boolean);

  return candidates[0] ?? "";
}

function extractJsonSummaries($: cheerio.CheerioAPI) {
  const texts: string[] = [];

  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).contents().text();
    const parsed = parseJsonLikePayload(raw);
    collectJsonText(parsed, texts);
  });

  return dedupeTexts(texts);
}

function extractContentCandidates($: cheerio.CheerioAPI) {
  const selectors = [
    "article",
    "main article",
    "main",
    ".RichContent-inner",
    ".RichText",
    ".Post-RichTextContainer",
    ".article-content",
    ".entry-content",
    ".post-content",
    ".content",
    "#content",
  ];

  const candidates = selectors
    .flatMap((selector) =>
      $(selector)
        .toArray()
        .map((element) => collectTextFromRoot($, $(element))),
    )
    .filter((text) => text.length >= 180);

  const bodyText = collectTextFromRoot($, $("body"));
  if (bodyText.length >= 180) {
    candidates.push(bodyText);
  }

  return dedupeTexts(candidates)
    .sort((left, right) => right.length - left.length);
}

async function fetchPageHtml(url: string) {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    next: { revalidate: 0 },
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) {
    throw new Error(`source detail responded with ${response.status}`);
  }

  return response.text();
}

function buildFallbackContent(title: string, summary: string) {
  return normalizeWhitespace([title, summary].filter(Boolean).join("\n\n"));
}

function splitSentences(text: string) {
  return normalizeWhitespace(text)
    .split(/(?<=[。！？!?；;])/)
    .map((item) => normalizeWhitespace(item))
    .filter((item) => item.length >= 14);
}

function buildTopicKeywords(topic: Pick<TopicSuggestion, "title" | "source">) {
  const sourceName = topic.source.split("·")[0]?.trim() || topic.source.trim();
  const rawParts = `${topic.title} ${sourceName}`
    .split(/[，。、“”‘’：:（）()\[\]\-—/\s]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);

  return Array.from(new Set([topic.title.trim(), sourceName, ...rawParts])).slice(0, 8);
}

function scoreFactSentence(sentence: string, keywords: string[]) {
  let score = 0;

  if (/\d/.test(sentence)) score += 3;
  if (/年|月|日|小时|分钟|连续|第\d|第[一二三四五六七八九十]/.test(sentence)) score += 2;
  if (/显示|称|表示|回应|宣布|发布|通报|披露|发现|确认|提到|指出/.test(sentence)) score += 2;
  if (/官方|平台|部门|机构|记者|网友|热搜|热榜/.test(sentence)) score += 1;
  if (sentence.length >= 18 && sentence.length <= 64) score += 2;
  if (sentence.length > 88) score -= 2;
  if (/登录|下载|打开App|点击|更多内容|分享|收藏|赞同/.test(sentence)) score -= 3;

  keywords.forEach((keyword) => {
    if (keyword && sentence.includes(keyword)) {
      score += keyword.length >= 4 ? 3 : 1;
    }
  });

  return score;
}

function extractFactCards(topic: Pick<TopicSuggestion, "title" | "source">, summary: string, content: string) {
  const keywords = buildTopicKeywords(topic);
  const candidateSentences = dedupeTexts([
    ...splitSentences(summary),
    ...splitSentences(content),
  ]);

  return candidateSentences
    .map((sentence) => ({ sentence, score: scoreFactSentence(sentence, keywords) }))
    .filter((item) => item.score >= 3)
    .sort((left, right) => right.score - left.score)
    .map((item) => item.sentence.replace(/[；;，,、\s]+$/, ""))
    .filter((item, index, array) => array.indexOf(item) === index)
    .slice(0, FACT_LIMIT);
}

export async function resolveHotTopicSourceContext(topic: Pick<TopicSuggestion, "title" | "source">): Promise<HotTopicSourceContext | null> {
  const cached = readCachedSourceContext(topic);
  if (cached) return cached;

  const hotTopic = await readLatestHotTopicForTopic(topic);
  if (!hotTopic) return writeCachedSourceContext(topic, null);

  const fallbackSummary = clipText(hotTopic.summary ?? "", SUMMARY_MAX_LENGTH);
  if (!hotTopic.url) {
    const fallbackContent = buildFallbackContent(hotTopic.title, fallbackSummary);
    const facts = extractFactCards(topic, fallbackSummary, fallbackContent);
    return writeCachedSourceContext(topic, fallbackContent
      ? {
          title: hotTopic.title,
          source: hotTopic.source,
          url: "",
          summary: fallbackSummary,
          content: clipText(fallbackContent, CONTENT_MAX_LENGTH),
          facts,
          extractedAt: new Date().toISOString(),
        }
      : null);
  }

  try {
    const html = await fetchPageHtml(hotTopic.url);
    const $ = cheerio.load(html);
    removeNoise($);

    const pageTitle = normalizeWhitespace($("title").first().text()) || hotTopic.title;
    const metaSummary = extractMetaSummary($);
    const jsonTexts = extractJsonSummaries($);
    const contentCandidates = extractContentCandidates($);

    const summary = clipText(metaSummary || fallbackSummary || jsonTexts[0] || hotTopic.title, SUMMARY_MAX_LENGTH);
    const content = clipText(
      contentCandidates[0] || jsonTexts.find((item) => item.length >= 180) || buildFallbackContent(pageTitle, summary),
      CONTENT_MAX_LENGTH,
    );
    const facts = extractFactCards(topic, summary, content);

    if (!content) return writeCachedSourceContext(topic, null);

    return writeCachedSourceContext(topic, {
      title: pageTitle,
      source: hotTopic.source,
      url: hotTopic.url,
      summary,
      content,
      facts,
      extractedAt: new Date().toISOString(),
    });
  } catch {
    const fallbackContent = buildFallbackContent(hotTopic.title, fallbackSummary);
    const facts = extractFactCards(topic, fallbackSummary, fallbackContent);
    if (!fallbackContent) return writeCachedSourceContext(topic, null);

    return writeCachedSourceContext(topic, {
      title: hotTopic.title,
      source: hotTopic.source,
      url: hotTopic.url,
      summary: fallbackSummary,
      content: clipText(fallbackContent, CONTENT_MAX_LENGTH),
      facts,
      extractedAt: new Date().toISOString(),
    });
  }
}

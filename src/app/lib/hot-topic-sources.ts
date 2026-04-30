import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import * as cheerio from "cheerio";
import {
  inferHotTopicSourcePublishedAt,
  normalizeTrend,
  pickBalancedHotTopics,
  type HotTopicItem,
} from "./hot-topics";
import { filterRestrictedTopics } from "./content-policy";

type ScrapedHotTopic = Omit<HotTopicItem, "time"> & {
  externalId: string;
  raw?: unknown;
};

const HOT_TOPIC_SOURCE_FETCH_LIMIT = 100;
const HOT_TOPIC_SOURCE_LIMIT = 40;
const HOT_TOPIC_TOTAL_LIMIT = 360;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: true,
});

type SourceFetcher = {
  source: string;
  fetch: () => Promise<ScrapedHotTopic[]>;
};

type TxqqLikePayload = {
  data?: Array<Record<string, unknown>>;
};

function hashId(source: string, input: string) {
  return createHash("sha1").update(`${source}:${input}`).digest("hex");
}

function getListEnv(name: string) {
  return (process.env[name] ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getNumberEnv(name: string, fallbackValue: number) {
  const raw = process.env[name]?.trim() ?? "";
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallbackValue;
}

function hasListEnv(name: string) {
  return getListEnv(name).length > 0;
}

function normalizeHeat(rawValue: number | null, fallbackValue: number) {
  if (!rawValue || Number.isNaN(rawValue)) return fallbackValue;
  if (rawValue < 100000) return rawValue;
  return Math.round(Math.log10(rawValue) * 1000);
}

type RequestOptions = {
  headers?: Record<string, string>;
};

async function fetchResponse(url: string, options: RequestOptions = {}) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      accept: "*/*",
      ...options.headers,
    },
    next: { revalidate: 0 },
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) {
    throw new Error(`${url} responded with ${response.status}`);
  }

  return response;
}

async function fetchText(url: string, options: RequestOptions = {}) {
  const response = await fetchResponse(url, {
    ...options,
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      ...options.headers,
    },
  });

  return response.text();
}

async function fetchJson<T>(url: string, options: RequestOptions = {}) {
  const response = await fetchResponse(url, {
    ...options,
    headers: {
      accept: "application/json,text/plain,*/*",
      ...options.headers,
    },
  });
  return response.json() as Promise<T>;
}

function ensureArray<T>(value: T | T[] | undefined | null) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function readXmlText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record["#text"] === "string") {
      return record["#text"].trim();
    }
  }

  return "";
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function extractRssBridgeErrorMessage(markup: string) {
  const $ = cheerio.load(markup);
  const explicitMessage = collapseWhitespace($(".error-message").first().text()).replace(/^Message:\s*/i, "");
  if (explicitMessage) {
    return explicitMessage;
  }

  const text = collapseWhitespace($.text());
  const matchedMessage = text.match(/Message:\s*(.+?)(?:File:|Line:|Trace:|$)/i)?.[1]?.trim();
  if (matchedMessage) {
    return matchedMessage;
  }

  return text.slice(0, 180);
}

function detectBridgeHtmlError(markup: string) {
  if (!/<html[\s>]/i.test(markup) || !/RSS-Bridge/i.test(markup)) {
    return "";
  }

  return extractRssBridgeErrorMessage(markup);
}

function normalizeTitle(title: string) {
  return title.replace(/^#|#$/g, "").replace(/\s+/g, " ").trim();
}

function parseCompactNumber(rawValue: string | number | null | undefined) {
  if (typeof rawValue === "number") return rawValue;
  if (!rawValue) return null;

  const text = String(rawValue).trim();
  if (!text) return null;

  const numeric = Number.parseFloat(text.replace(/[^\d.]/g, ""));
  if (Number.isNaN(numeric)) return null;

  if (text.includes("亿")) return Math.round(numeric * 100000000);
  if (text.includes("万")) return Math.round(numeric * 10000);
  if (text.includes("w") || text.includes("W")) return Math.round(numeric * 10000);

  return Math.round(numeric);
}

function buildNormalizedHeat(rawValue: string | number | null | undefined, fallbackValue: number) {
  return normalizeHeat(parseCompactNumber(rawValue), fallbackValue);
}

function buildTitleDedupKey(item: ScrapedHotTopic) {
  return `${item.source}:${normalizeTitle(item.title).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")}`;
}

function withBatchFetchedAt(items: ScrapedHotTopic[], fetchedAt = new Date().toISOString()) {
  return items.map((item) => ({
    ...item,
    sourcePublishedAt: item.sourcePublishedAt ?? inferHotTopicSourcePublishedAt(item.source, item.raw),
    fetchedAt,
  }));
}

async function trySequentialFetchers<T>(fetchers: Array<() => Promise<T>>) {
  let lastError: unknown = null;

  for (const fetcher of fetchers) {
    try {
      return await fetcher();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("All fallback fetchers failed");
}

function buildTxqqFallbackMapper(
  source: "知乎" | "抖音" | "百度" | "今日头条",
  rows: Array<Record<string, unknown>>,
): ScrapedHotTopic[] {
  return rows
    .slice(0, HOT_TOPIC_SOURCE_FETCH_LIMIT)
    .map((item, index) => {
      const title = normalizeTitle(String(item.title ?? item.word ?? item.query ?? ""));
      const url = String(item.url ?? "").trim();
      const hot = item.hot ?? item.hot_value ?? item.hotScore ?? item.score ?? null;
      const summary = String(item.excerpt ?? item.desc ?? item.summary ?? "").trim();
      const groupId = item.group_id ?? item.id ?? title;
      const baseTagMap = {
        知乎: "知乎热榜",
        抖音: "抖音热榜",
        百度: "百度热搜",
        今日头条: "头条热榜",
      } as const;
      const baseHeatMap = {
        知乎: 8000 - index * 210,
        抖音: 8300 - index * 220,
        百度: 9000 - index * 260,
        今日头条: 8400 - index * 220,
      } as const;

      const targetUrl =
        url ||
        (source === "知乎"
          ? "https://www.zhihu.com/billboard"
          : source === "抖音"
            ? (title ? `https://www.douyin.com/search/${encodeURIComponent(title)}` : "https://www.douyin.com/hot")
            : source === "百度"
              ? "https://top.baidu.com/board?tab=realtime"
              : "https://www.toutiao.com/hot-event/hot-board/");

      return {
        id: `${source}-${hashId(source, title)}`,
        externalId: hashId(source, String(groupId || targetUrl || title)),
        title,
        source,
        sourceType: "fallback-api",
        heat: buildNormalizedHeat(hot as string | number | null | undefined, baseHeatMap[source]),
        trend: normalizeTrend(48 - index * 2),
        tags: [baseTagMap[source]],
        url: targetUrl,
        summary: summary || `来自${baseTagMap[source]}`,
        sourcePublishedAt:
          inferHotTopicSourcePublishedAt(source, item),
        fetchedAt: new Date().toISOString(),
        raw: item,
      } satisfies ScrapedHotTopic;
    })
    .filter((item) => item.title);
}

async function scrapeFromFallbackJsonUrls(
  source: "知乎" | "抖音" | "百度" | "今日头条",
  envName: string,
) {
  const urls = getListEnv(envName);
  if (!urls.length) {
    throw new Error(`${envName} is not configured`);
  }

  return trySequentialFetchers(
    urls.map((url) => async () => {
      const payload = await fetchJson<TxqqLikePayload>(url);
      const rows = Array.isArray(payload.data) ? payload.data : [];
      if (!rows.length) {
        throw new Error(`${url} returned empty payload`);
      }

      return buildTxqqFallbackMapper(source, rows);
    }),
  );
}

async function scrapeZhihuHotFromRssHub(): Promise<ScrapedHotTopic[]> {
  const baseUrls = [
    ...getListEnv("HOTLIST_RSSHUB_BASE_URLS"),
    ...getListEnv("RSSHUB_BASE_URLS"),
  ];

  if (!baseUrls.length) {
    throw new Error("RSSHub base URLs are not configured");
  }

  return trySequentialFetchers(
    baseUrls.map((baseUrl) => async () => {
      const normalizedBase = baseUrl.replace(/\/+$/, "");
      return scrapeRssFeed("知乎", `${normalizedBase}/zhihu/hotlist`, ["知乎热榜", "问答"]);
    }),
  );
}

async function scrapeBaiduHotFromApi(): Promise<ScrapedHotTopic[]> {
  const payload = await fetchJson<{
    data?: {
      cards?: Array<{
        component?: string;
        content?: Array<{
          word?: string;
          query?: string;
          hotScore?: string;
          url?: string;
          desc?: string;
          index?: number;
        }>;
      }>;
    };
  }>("https://api.txqq.pro/api/hotlist.php?type=baidu");

  const cards = Array.isArray(payload.data?.cards) ? payload.data.cards : [];
  const hotCard = cards.find((card) => Array.isArray(card.content) && card.content.length);
  const rows = Array.isArray(hotCard?.content) ? hotCard.content : [];

  if (!rows.length) {
    throw new Error("baidu hot API returned empty payload");
  }

  return rows.slice(0, HOT_TOPIC_SOURCE_FETCH_LIMIT).map((item, index) => {
    const title = normalizeTitle(item.word || item.query || "");
    const url = item.url?.trim() || "https://top.baidu.com/board?tab=realtime";

    return {
      id: `baidu-${hashId("baidu", title)}`,
      externalId: hashId("baidu", url || title),
      title,
      source: "百度",
      sourceType: "api",
      heat: buildNormalizedHeat(item.hotScore, 9000 - index * 260),
      trend: normalizeTrend(48 - index * 2),
      tags: ["百度热搜"],
      url,
      summary: item.desc?.trim() || "来自百度热搜榜实时榜单",
      fetchedAt: new Date().toISOString(),
      raw: item,
    } satisfies ScrapedHotTopic;
  }).filter((item) => item.title);
}

async function scrapeBaiduHotFromHtml(): Promise<ScrapedHotTopic[]> {
  const html = await fetchText("https://top.baidu.com/board?tab=realtime");
  const $ = cheerio.load(html);
  const items: ScrapedHotTopic[] = [];

  $(".c-single-text-ellipsis").each((index, element) => {
    const title = $(element).text().trim();
    if (!title) return;

    const card = $(element).closest("[class*=category-wrap]");
    const hotText = card.find(".hot-index_1Bl1a").first().text().replace(/[^\d]/g, "");
    const url = card.find("a").first().attr("href");
    const heat = normalizeHeat(hotText ? Number.parseInt(hotText, 10) : null, 9000 - index * 260);

    items.push({
      id: `baidu-${hashId("baidu", title)}`,
      externalId: hashId("baidu", url || title),
      title,
      source: "百度",
      sourceType: "html",
      heat,
      trend: normalizeTrend(48 - index * 3),
      tags: ["百度热搜"],
      url: url?.startsWith("http") ? url : url ? `https://top.baidu.com${url}` : "https://top.baidu.com/board?tab=realtime",
      summary: "来自百度热搜榜实时榜单",
      fetchedAt: new Date().toISOString(),
      raw: { rank: index + 1 },
    });
  });

  return items.slice(0, HOT_TOPIC_SOURCE_FETCH_LIMIT);
}

async function scrapeBaiduHot(): Promise<ScrapedHotTopic[]> {
  return trySequentialFetchers([
    scrapeBaiduHotFromApi,
    scrapeBaiduHotFromHtml,
    ...(hasListEnv("HOTLIST_BAIDU_FALLBACK_URLS")
      ? [() => scrapeFromFallbackJsonUrls("百度", "HOTLIST_BAIDU_FALLBACK_URLS")]
      : []),
  ]);
}

async function scrapeWeiboHotFromApi(): Promise<ScrapedHotTopic[]> {
  const payload = await fetchJson<{
    success?: boolean;
    data?: Array<{
      index?: number;
      title?: string;
      hot?: string;
      url?: string;
    }>;
  }>("https://api.txqq.pro/api/hotlist.php?type=weibo");

  const rows = Array.isArray(payload.data) ? payload.data : [];
  if (!rows.length) {
    throw new Error("weibo hot API returned empty payload");
  }

  return rows
    .slice(0, HOT_TOPIC_SOURCE_FETCH_LIMIT)
    .map((item, index) => {
      const title = normalizeTitle(item.title || "");
      const url = item.url?.trim() || `https://s.weibo.com/weibo?q=${encodeURIComponent(title)}`;

      return {
        id: `weibo-${hashId("weibo", title)}`,
        externalId: hashId("weibo", url || title),
        title,
        source: "微博",
        sourceType: "api",
        heat: buildNormalizedHeat(item.hot, 8600 - index * 240),
        trend: normalizeTrend(52 - index * 2),
        tags: ["微博热搜"],
        url,
        summary: "来自微博热搜榜",
        fetchedAt: new Date().toISOString(),
        raw: item,
      } satisfies ScrapedHotTopic;
    })
    .filter((item) => item.title);
}

async function scrapeZhihuHotFromApi(): Promise<ScrapedHotTopic[]> {
  const payload = await fetchJson<{
    success?: boolean;
    data?: Array<{
      index?: number;
      title?: string;
      hot?: string;
      url?: string;
      excerpt?: string;
    }>;
  }>("https://api.txqq.pro/api/hotlist.php?type=zhihu");

  const rows = Array.isArray(payload.data) ? payload.data : [];
  if (!rows.length) {
    throw new Error("zhihu hot API returned empty payload");
  }

  return rows
    .slice(0, HOT_TOPIC_SOURCE_FETCH_LIMIT)
    .map((item, index) => {
      const title = normalizeTitle(item.title || "");
      const url = item.url?.trim() || "https://www.zhihu.com/billboard";

      return {
        id: `zhihu-${hashId("zhihu", title)}`,
        externalId: hashId("zhihu", url || title),
        title,
        source: "知乎",
        sourceType: "api",
        heat: buildNormalizedHeat(item.hot, 8000 - index * 210),
        trend: normalizeTrend(42 - index),
        tags: ["知乎热榜"],
        url,
        summary: item.excerpt?.trim() || "来自知乎热榜",
        fetchedAt: new Date().toISOString(),
        raw: item,
      } satisfies ScrapedHotTopic;
    })
    .filter((item) => item.title);
}

type ZhihuOfficialPayload = {
  data?: Array<{
    target?: {
      id?: number | string;
      title?: string;
      excerpt?: string;
      created?: number;
      url?: string;
    };
    detail_text?: string;
  }>;
};

function getZhihuOfficialHeaders() {
  const headers: Record<string, string> = {
    "user-agent":
      "osee2unifiedRelease/22916 osee2unifiedReleaseVersion/10.49.0 Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
    "x-app-versioncode": "22916",
    "x-app-bundleid": "com.zhihu.ios",
    "x-app-build": "release",
    "x-package-ytpe": "appstore",
    "x-app-za":
      "OS=iOS&Release=18.5&Model=iPhone17,2&VersionName=10.49.0&VersionCode=22916&Width=1290&Height=2796&DeviceType=Phone&Brand=Apple&OperatorType=6553565535",
    referer: "https://www.zhihu.com/billboard",
  };

  if (process.env.ZHIHU_COOKIE?.trim()) {
    headers.Cookie = process.env.ZHIHU_COOKIE.trim();
  }

  return headers;
}

function mapZhihuOfficialRows(rows: ZhihuOfficialPayload["data"]) {
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error("zhihu official API returned empty payload");
  }

  return rows
    .slice(0, HOT_TOPIC_SOURCE_FETCH_LIMIT)
    .map((item, index) => {
      const question = item.target;
      const title = normalizeTitle(String(question?.title ?? ""));
      const questionId = String(question?.id ?? "").trim() || String(question?.url ?? "").split("/").pop()?.trim() || "";
      const url = questionId
        ? `https://www.zhihu.com/question/${questionId}`
        : String(question?.url ?? "").trim() || "https://www.zhihu.com/billboard";

      return {
        id: `zhihu-${hashId("zhihu", title)}`,
        externalId: hashId("zhihu", questionId || url || title),
        title,
        source: "知乎",
        sourceType: "official-api",
        heat: buildNormalizedHeat(item.detail_text, 8000 - index * 210),
        trend: normalizeTrend(44 - index),
      tags: ["知乎热榜"],
      url,
      summary: String(question?.excerpt ?? "").trim() || "来自知乎热榜",
      sourcePublishedAt: question?.created ? new Date(question.created * 1000).toISOString() : undefined,
      fetchedAt: new Date().toISOString(),
      raw: item,
    } satisfies ScrapedHotTopic;
    })
    .filter((item) => item.title);
}

async function scrapeZhihuHotFromOfficialApi(): Promise<ScrapedHotTopic[]> {
  const headers = getZhihuOfficialHeaders();
  const payload = await trySequentialFetchers([
    () =>
      fetchJson<ZhihuOfficialPayload>(`https://api.zhihu.com/topstory/hot-lists/total?limit=${HOT_TOPIC_SOURCE_FETCH_LIMIT}`, {
        headers,
      }),
    () =>
      fetchJson<ZhihuOfficialPayload>(`https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=${HOT_TOPIC_SOURCE_FETCH_LIMIT}`, {
        headers,
      }),
  ]);

  return mapZhihuOfficialRows(payload.data);
}

async function scrapeZhihuHot(): Promise<ScrapedHotTopic[]> {
  return trySequentialFetchers([
    scrapeZhihuHotFromOfficialApi,
    scrapeZhihuHotFromApi,
    ...(hasListEnv("HOTLIST_ZHIHU_FALLBACK_URLS")
      ? [() => scrapeFromFallbackJsonUrls("知乎", "HOTLIST_ZHIHU_FALLBACK_URLS")]
      : []),
    ...((hasListEnv("HOTLIST_RSSHUB_BASE_URLS") || hasListEnv("RSSHUB_BASE_URLS"))
      ? [scrapeZhihuHotFromRssHub]
      : []),
  ]);
}

async function scrapeDouyinHotFromApi(): Promise<ScrapedHotTopic[]> {
  const payload = await fetchJson<{
    code?: number;
    data?: Array<{
      position?: number;
      word?: string;
      hot_value?: number;
      sentence_tag?: number;
      event_time?: number;
      group_id?: string;
    }>;
  }>("https://v2.xxapi.cn/api/douyinhot");

  const rows = Array.isArray(payload.data) ? payload.data : [];
  if (!rows.length) {
    throw new Error("douyin hot API returned empty payload");
  }

  return rows
    .slice(0, HOT_TOPIC_SOURCE_FETCH_LIMIT)
    .map((item, index) => {
      const title = normalizeTitle(item.word || "");
      const url = title ? `https://www.douyin.com/search/${encodeURIComponent(title)}` : "https://www.douyin.com/hot";

      return {
        id: `douyin-${hashId("douyin", title)}`,
        externalId: hashId("douyin", String(item.group_id || title)),
        title,
        source: "抖音",
        sourceType: "api",
        heat: buildNormalizedHeat(item.hot_value, 8300 - index * 220),
        trend: normalizeTrend(50 - index * 2),
        tags: ["抖音热榜"],
        url,
        summary: "来自抖音热榜",
        sourcePublishedAt: item.event_time ? new Date(item.event_time * 1000).toISOString() : undefined,
        fetchedAt: new Date().toISOString(),
        raw: item,
      } satisfies ScrapedHotTopic;
    })
    .filter((item) => item.title);
}

function extractCookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`${name}=([^;]+)`));
  return match?.[1] ?? null;
}

async function scrapeDouyinHotFromOfficialApi(): Promise<ScrapedHotTopic[]> {
  const csrfResponse = await fetchResponse("https://www.douyin.com/passport/general/login_guiding_strategy/?aid=6383");
  const csrfToken =
    extractCookieValue(csrfResponse.headers.get("set-cookie"), "passport_csrf_token") ||
    extractCookieValue(csrfResponse.headers.get("x-waf-set-cookie"), "passport_csrf_token");

  const payload = await fetchJson<{
    status_code?: number;
    data?: {
      word_list?: Array<{
        word?: string;
        event_time?: number;
        hot_value?: number | string;
        sentence_id?: string | number;
      }>;
    };
  }>("https://www.douyin.com/aweme/v1/web/hot/search/list/?device_platform=webapp&aid=6383&channel=channel_pc_web&detail_list=1", {
    headers: csrfToken ? { Cookie: `passport_csrf_token=${csrfToken}` } : undefined,
  });

  const rows = Array.isArray(payload.data?.word_list) ? payload.data.word_list : [];
  if (payload.status_code !== 0 || !rows.length) {
    throw new Error("douyin official API returned empty payload");
  }

  return rows
    .slice(0, HOT_TOPIC_SOURCE_FETCH_LIMIT)
    .map((item, index) => {
      const title = normalizeTitle(item.word || "");
      const sentenceId = String(item.sentence_id ?? "").trim();

      return {
        id: `douyin-${hashId("douyin", title)}`,
        externalId: hashId("douyin", sentenceId || title),
        title,
        source: "抖音",
        sourceType: "official-api",
        heat: buildNormalizedHeat(item.hot_value, 8300 - index * 220),
        trend: normalizeTrend(50 - index * 2),
        tags: ["抖音热榜"],
        url: sentenceId ? `https://www.douyin.com/hot/${sentenceId}` : `https://www.douyin.com/search/${encodeURIComponent(title)}`,
        summary: "来自抖音热榜",
        sourcePublishedAt: item.event_time ? new Date(item.event_time * 1000).toISOString() : undefined,
        fetchedAt: new Date().toISOString(),
        raw: item,
      } satisfies ScrapedHotTopic;
    })
    .filter((item) => item.title);
}

async function scrapeDouyinHot(): Promise<ScrapedHotTopic[]> {
  return trySequentialFetchers([
    scrapeDouyinHotFromOfficialApi,
    scrapeDouyinHotFromApi,
    ...(hasListEnv("HOTLIST_DOUYIN_FALLBACK_URLS")
      ? [() => scrapeFromFallbackJsonUrls("抖音", "HOTLIST_DOUYIN_FALLBACK_URLS")]
      : []),
  ]);
}

async function scrapeToutiaoHotFromOfficialApi(): Promise<ScrapedHotTopic[]> {
  const payload = await fetchJson<{
    data?: Array<{
      Title?: string;
      HotValue?: string | number;
      Url?: string;
      ClusterId?: string | number;
      Label?: string;
      Image?: {
        url?: string;
      };
    }>;
  }>("https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc");

  const rows = Array.isArray(payload.data) ? payload.data : [];
  if (!rows.length) {
    throw new Error("toutiao official API returned empty payload");
  }

  return rows
    .slice(0, HOT_TOPIC_SOURCE_FETCH_LIMIT)
    .map((item, index) => {
      const title = normalizeTitle(String(item.Title ?? ""));
      const url = String(item.Url ?? "").trim() || "https://www.toutiao.com/hot-event/hot-board/";

      return {
        id: `toutiao-${hashId("toutiao", title)}`,
        externalId: hashId("toutiao", String(item.ClusterId ?? url ?? title)),
        title,
        source: "今日头条",
        sourceType: "official-api",
        heat: buildNormalizedHeat(item.HotValue, 8400 - index * 220),
        trend: normalizeTrend(46 - index * 2),
        tags: [String(item.Label ?? "").trim() || "头条热榜"],
        url,
        summary: "来自今日头条热榜",
        fetchedAt: new Date().toISOString(),
        raw: item,
      } satisfies ScrapedHotTopic;
    })
    .filter((item) => item.title);
}

async function scrapeToutiaoHot(): Promise<ScrapedHotTopic[]> {
  return trySequentialFetchers([
    scrapeToutiaoHotFromOfficialApi,
    ...(hasListEnv("HOTLIST_TOUTIAO_FALLBACK_URLS")
      ? [() => scrapeFromFallbackJsonUrls("今日头条", "HOTLIST_TOUTIAO_FALLBACK_URLS")]
      : []),
  ]);
}

async function scrapeRssFeed(source: string, sourceUrl: string, defaultTags: string[]) {
  const xml = await fetchText(sourceUrl);
  const bridgeHtmlError = detectBridgeHtmlError(xml);
  if (bridgeHtmlError) {
    throw new Error(`${source} bridge error: ${bridgeHtmlError}`);
  }

  const parsed = xmlParser.parse(xml);
  const channel = parsed?.rss?.channel ?? null;
  const rssItems = ensureArray<Record<string, unknown>>(channel?.item as Record<string, unknown> | Record<string, unknown>[] | undefined);

  if (rssItems.length) {
    return rssItems.slice(0, HOT_TOPIC_SOURCE_FETCH_LIMIT).map((item, index) => {
      const link = String(item.link ?? "");
      const title = String(item.title ?? "").replace("<![CDATA[", "").replace("]]>", "").trim();
      const description = String(item.description ?? item["content:encoded"] ?? "").replace(/<[^>]+>/g, "").trim();
      const category = item.category;
      const tags = Array.isArray(category)
        ? category.map((value) => String(value)).filter(Boolean).slice(0, 3)
        : category
          ? [String(category)]
          : defaultTags;

      return {
        id: `${source.toLowerCase()}-${hashId(source, link || title)}`,
        externalId: hashId(source, link || title),
        title,
        source,
        sourceType: "rss",
        heat: 7600 - index * 180,
        trend: normalizeTrend(32 - index),
        tags,
        url: link,
        summary: description.slice(0, 120),
        sourcePublishedAt: inferHotTopicSourcePublishedAt(source, item),
        fetchedAt: new Date().toISOString(),
        raw: item,
      } satisfies ScrapedHotTopic;
    });
  }

  const feed = parsed?.feed ?? null;
  const atomEntries = ensureArray<Record<string, unknown>>(feed?.entry as Record<string, unknown> | Record<string, unknown>[] | undefined);

  if (!atomEntries.length) {
    throw new Error(`${source} feed returned empty payload`);
  }

  if (readXmlText(atomEntries[0]?.title).includes("Bridge returned error")) {
    const bridgeFeedError = extractRssBridgeErrorMessage(readXmlText(atomEntries[0]?.content ?? atomEntries[0]?.summary));
    throw new Error(
      bridgeFeedError
        ? `${source} bridge error: ${bridgeFeedError}`
        : `${source} feed bridge returned an error`,
    );
  }

  return atomEntries.slice(0, HOT_TOPIC_SOURCE_FETCH_LIMIT).map((item, index) => {
    const title = readXmlText(item.title).replace(/<[^>]+>/g, "").trim();
    const links = ensureArray<Record<string, unknown>>(item.link as Record<string, unknown> | Record<string, unknown>[] | undefined);
    const alternateLink = links.find((link) => String(link.rel ?? "alternate") === "alternate") ?? links[0] ?? {};
    const link = String(alternateLink.href ?? alternateLink.link ?? "").trim();
    const summary = readXmlText(item.summary ?? item.content).replace(/<[^>]+>/g, "").trim();
    const categories = ensureArray<Record<string, unknown>>(item.category as Record<string, unknown> | Record<string, unknown>[] | undefined);
    const tags = categories
      .map((category) => String(category.term ?? category.label ?? "").trim())
      .filter(Boolean)
      .slice(0, 3);

    return {
      id: `${source.toLowerCase()}-${hashId(source, link || title)}`,
      externalId: hashId(source, link || title),
      title,
      source,
      sourceType: "atom",
      heat: 7800 - index * 180,
      trend: normalizeTrend(36 - index),
      tags: tags.length ? tags : defaultTags,
      url: link,
      summary: summary.slice(0, 120),
      sourcePublishedAt: inferHotTopicSourcePublishedAt(source, item),
      fetchedAt: new Date().toISOString(),
      raw: item,
    } satisfies ScrapedHotTopic;
  }).filter((item) => item.title);
}

function buildTwitterRssBridgeUrl(baseUrl: string, country: string, limit: number) {
  const normalized = baseUrl.trim();
  const url = normalized.includes("://")
    ? new URL(normalized)
    : new URL(`https://${normalized}`);

  if (!url.searchParams.get("action")) url.searchParams.set("action", "display");
  if (!url.searchParams.get("bridge")) url.searchParams.set("bridge", "TwitScoopBridge");
  url.searchParams.set("country", country);
  url.searchParams.set("limit", String(Math.max(1, Math.min(50, limit))));
  url.searchParams.set("format", "Atom");

  if (!url.pathname || url.pathname === "/") {
    url.pathname = "/";
  }

  return url.toString();
}

async function scrapeTwitterHotFromRssBridge(): Promise<ScrapedHotTopic[]> {
  const baseUrls = getListEnv("HOTLIST_TWITTER_RSSBRIDGE_BASE_URLS");
  if (!baseUrls.length) {
    throw new Error("HOTLIST_TWITTER_RSSBRIDGE_BASE_URLS is not configured");
  }

  const country = (process.env.HOTLIST_TWITTER_COUNTRY ?? "worldwide").trim().toLowerCase() || "worldwide";
  const limit = getNumberEnv("HOTLIST_TWITTER_LIMIT", 20);

  return trySequentialFetchers(
    baseUrls.map((baseUrl) => async () =>
      scrapeRssFeed(
        "Twitter/X",
        buildTwitterRssBridgeUrl(baseUrl, country, limit),
        ["Twitter/X 热点", `TwitScoop ${country}`],
      ),
    ),
  );
}

export async function scrapeHotTopics() {
  const batchFetchedAt = new Date().toISOString();
  const sourceFetchers: SourceFetcher[] = [
    { source: "微博", fetch: scrapeWeiboHotFromApi },
    { source: "抖音", fetch: scrapeDouyinHot },
    { source: "知乎", fetch: scrapeZhihuHot },
    { source: "今日头条", fetch: scrapeToutiaoHot },
    { source: "百度", fetch: scrapeBaiduHot },
    { source: "36氪", fetch: () => scrapeRssFeed("36氪", "https://36kr.com/feed", ["科技", "商业"]) },
    { source: "少数派", fetch: () => scrapeRssFeed("少数派", "https://sspai.com/feed", ["效率", "工具"]) },
    { source: "爱范儿", fetch: () => scrapeRssFeed("爱范儿", "https://www.ifanr.com/feed", ["科技", "产品"]) },
  ];

  if (hasListEnv("HOTLIST_TWITTER_RSSBRIDGE_BASE_URLS")) {
    sourceFetchers.splice(1, 0, {
      source: "Twitter/X",
      fetch: scrapeTwitterHotFromRssBridge,
    });
  }

  const settled = await Promise.allSettled(
    sourceFetchers.map(async (sourceFetcher) => ({
      source: sourceFetcher.source,
      items: await sourceFetcher.fetch(),
    })),
  );

  const successItems = settled.flatMap((result) =>
    result.status === "fulfilled" ? withBatchFetchedAt(result.value.items, batchFetchedAt) : [],
  );
  const failedSources = settled.flatMap((result, index) => {
    if (result.status === "fulfilled") return [];

    return [{
      source: sourceFetchers[index]?.source ?? `source-${index + 1}`,
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    }];
  });

  const dedupedItems = Array.from(
    new Map(successItems.map((item) => [buildTitleDedupKey(item), item])).values(),
  );

  const { allowed, blocked } = filterRestrictedTopics(dedupedItems);
  const selectedItems = pickBalancedHotTopics(allowed, HOT_TOPIC_TOTAL_LIMIT, HOT_TOPIC_SOURCE_LIMIT);

  return {
    items: selectedItems.slice(0, HOT_TOPIC_TOTAL_LIMIT),
    failedSources,
    restrictedCount: blocked.length,
  };
}

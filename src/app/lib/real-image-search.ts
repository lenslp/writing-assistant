import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolveArticleDomain, type ArticleDomain } from "./content-domains";
import { buildAutoImageSearchQuery } from "./article-auto-image";

type RealImageSearchInput = {
  query?: string;
  title?: string;
  summary?: string;
  body?: string;
  domain?: string;
  count?: number;
};

export type RealImageSearchResult = {
  url: string;
  source: "bing";
  query: string;
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

const BLOCKED_HOST_PATTERNS = [
  /shetu66\.com/i,
  /58pic\.com/i,
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
  /素材/i,
  /海报/i,
  /模板/i,
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
    const href = parsed.toString();
    const text = `${entry.title} ${entry.desc} ${entry.pageUrl}`;

    if (!/^https?:$/i.test(parsed.protocol)) return false;
    if (matchesBlockedHost(entry.url) || matchesBlockedHost(entry.pageUrl)) return false;
    if (BLOCKED_TEXT_PATTERNS.some((pattern) => pattern.test(href))) return false;
    if (BLOCKED_TEXT_PATTERNS.some((pattern) => pattern.test(text))) return false;
    if (/\.svg($|\?)/i.test(parsed.pathname)) return false;
    if (/\.png($|\?)/i.test(parsed.pathname)) return false;
    if (/\.webp($|\?)/i.test(parsed.pathname)) return false;
    if (/\.avif($|\?)/i.test(parsed.pathname)) return false;

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

  if (domain === "汽车") {
    const expectedBrand = findAutoBrand(inputText);
    if (expectedBrand) {
      const normalizedEntry = normalizeText(entryText);
      const hasExpectedBrand = expectedBrand.some((alias) => normalizedEntry.includes(normalizeText(alias)));
      if (!hasExpectedBrand || hasDifferentAutoBrand(entryText, expectedBrand)) {
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

async function isReachableImage(url: string) {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": SEARCH_HEADERS["User-Agent"] },
      signal: AbortSignal.timeout(7000),
      redirect: "follow",
    });

    const contentType = response.headers.get("content-type") || "";
    const contentLength = Number(response.headers.get("content-length") || "0");
    return (
      response.ok &&
      (
        /^image\/(jpeg|jpg|png|gif)$/i.test(contentType) ||
        contentType === "binary/octet-stream"
      ) &&
      contentLength !== 0
    );
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
  if (domain === "旅游" && /(qunar|ctrip|mafengwo|feizhu|ly\.com)/i.test(pageHost)) score += 8;
  if (domain === "社会" && /(news|people|cctv|163|sina|qq|thepaper)/i.test(pageHost)) score += 6;

  if (/text\//i.test(entry.url) || /x_image_process=text/i.test(entry.url)) score -= 18;
  if (/图库|壁纸|头像|素材|海报|模板/.test(`${entry.title} ${entry.desc}`)) score -= 18;
  if (!terms.some(([term]) => haystack.includes(normalizeText(term)))) score -= 12;

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

export async function searchRealArticleImages(input: RealImageSearchInput): Promise<RealImageSearchResult[]> {
  const query = buildSearchQuery(input);
  if (!query) {
    return [];
  }
  const avoidPortrait = shouldAvoidPortraitForSearch(input);

  const target = `https://cn.bing.com/images/search?q=${encodeURIComponent(query)}`;
  const html = await fetchSearchHtml(target);
  const baseCandidates = extractBingImageEntries(html)
    .filter(isLikelyUsableEntry)
    .filter((entry) => (avoidPortrait ? !isPortraitLikeEntry(entry) : true))
    .filter((entry) => isRelevantEnoughEntry(entry, input));

  const strictCandidates = baseCandidates
    .filter((entry) => hasConfidentRelevance(entry, input))
    .sort((left, right) => scoreEntry(right, input) - scoreEntry(left, input));

  const candidates = (strictCandidates.length ? strictCandidates : baseCandidates
    .filter((entry) => scoreEntry(entry, input) >= getRelaxedScoreThreshold(input))
    .sort((left, right) => scoreEntry(right, input) - scoreEntry(left, input)))
    .slice(0, 18);

  const results: RealImageSearchResult[] = [];
  for (const candidate of candidates) {
    if (!(await isReachableImage(candidate.url))) continue;
    results.push({
      url: candidate.url,
      source: "bing",
      query,
      title: candidate.title,
      pageUrl: candidate.pageUrl,
      thumbnailUrl: candidate.thumbnailUrl,
    });
    if (results.length >= Math.max(1, Math.min(input.count ?? 6, 12))) {
      break;
    }
  }

  return results;
}

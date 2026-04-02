import type { TopicSuggestion } from "./app-data";
import { detectArticleDomain } from "./content-domains";
import { formatFetchedTime, normalizeTrend, type HotTopicItem } from "./hot-topics";
import { buildTopicSuggestionId } from "./topic-utils";

type HotTopicLike = Pick<HotTopicItem, "id" | "title" | "source" | "sourceType" | "heat" | "tags" | "fetchedAt"> & {
  summary?: string | null;
  url?: string | null;
  trend?: string;
  trendScore?: number;
};

export type ArticleAnalysisItem = {
  id: string;
  title: string;
  source: string;
  time: string;
  heat: number;
  trend: string;
  tags: string[];
  summary?: string;
  url?: string;
  angle: string;
  topic: TopicSuggestion;
  metrics: {
    reads: string;
    likes: number;
    comments: number;
  };
  analysis: {
    titleStructure: {
      pattern: string;
      hook: string;
      emotion: string;
    };
    opening: string;
    rhythm: Array<{
      section: string;
      length: string;
      style: string;
    }>;
    emotions: Array<{
      point: string;
      position: string;
      intensity: number;
    }>;
    format: string[];
    methods: string[];
  };
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toIsoString(value: string | Date) {
  return value instanceof Date ? value.toISOString() : value;
}

function formatCompactNumber(value: number) {
  if (value >= 10000) {
    const wan = value / 10000;
    return `${wan >= 10 ? wan.toFixed(0) : wan.toFixed(1)}w`;
  }

  return `${value}`;
}

function resolveTrend(item: HotTopicLike) {
  if (item.trend) return item.trend;
  return normalizeTrend(item.trendScore ?? Math.round(item.heat / 220));
}

function derivePrimaryTag(item: HotTopicLike) {
  return item.tags.find(Boolean) ?? item.source;
}

function deriveAngle(item: HotTopicLike) {
  const title = `${item.title} ${item.tags.join(" ")}`;
  const primaryTag = derivePrimaryTag(item);

  if (/AI|大模型|智能体|机器人/i.test(title)) {
    return "从技术落地、用户价值与内容机会三个层面拆解这波 AI 热点";
  }

  if (/涨|降|裁员|停更|翻车|争议|暴涨|暴跌/.test(title)) {
    return `围绕「${primaryTag}」拆出冲突点、风险判断和读者最关心的后续影响`;
  }

  if (/发布|上线|更新|新品|首发|开源/.test(title)) {
    return `把「${primaryTag}」转成读者看得懂、愿意转发的机会解读`;
  }

  return `围绕「${primaryTag}」提炼趋势判断、实际影响与行动建议`;
}

function buildTopicHeatLabel(heat: number): TopicSuggestion["heat"] {
  if (heat >= 8500) return "极高";
  if (heat >= 6500) return "高";
  if (heat >= 4500) return "中高";
  return "中";
}

export function buildTopicSuggestionFromHotTopic(item: HotTopicLike): TopicSuggestion {
  const primaryTag = derivePrimaryTag(item);
  const domain = detectArticleDomain(item.title, item.tags, item.source);

  return {
    id: buildTopicSuggestionId(item.source, item.title),
    title: item.title,
    domain,
    heat: buildTopicHeatLabel(item.heat),
    fit: clamp(Math.round(item.heat / 100), 72, 96),
    reason: item.summary || `${item.source} 正在快速升温，适合抢时效输出观点并沉淀公众号读者认知。`,
    angles: [
      deriveAngle(item),
      `从普通读者视角解释「${item.title}」为什么现在值得关注`,
      `结合账号定位，输出「${primaryTag}」带来的机会、风险与行动建议`,
    ],
    source: `${item.source} · 实时热点`,
    type: "热点型",
    tags: item.tags.length ? item.tags : [primaryTag],
  };
}

function deriveTitlePattern(title: string, heat: number) {
  if (/[？?]/.test(title)) return "问题反问型";
  if (/\d/.test(title)) return "数字结果型";
  if (/却|但|不是|反而|竟然/.test(title)) return "反差冲突型";
  if (heat >= 8000) return "热点判断型";
  return "观点拆解型";
}

function deriveHook(title: string, source: string) {
  if (/[？?]/.test(title)) return "先抛问题，再给判断";
  if (/AI|大模型|机器人/i.test(title)) return "用新技术冲击感抓住注意力";
  if (/百度|微博|知乎|头条|抖音/.test(source)) return "借平台热度直接切入";
  return "用趋势变化制造阅读期待";
}

function deriveEmotion(item: HotTopicLike) {
  if (item.heat >= 8500) return "焦虑+好奇";
  if (item.heat >= 6500) return "讨论欲+期待";
  return "理性关注+行动欲";
}

function buildRhythm(item: HotTopicLike) {
  const base = clamp(Math.round(item.heat / 60), 120, 220);

  return [
    { section: "开头引入", length: `${base - 20}字`, style: "短句+冲突" },
    { section: "热点背景", length: `${base + 80}字`, style: "信息+场景" },
    { section: "核心判断", length: `${base + 180}字`, style: "观点+拆解" },
    { section: "落地建议", length: `${base + 120}字`, style: "清单+步骤" },
    { section: "总结收尾", length: `${base}字`, style: "金句+CTA" },
  ];
}

function buildEmotionCurve(item: HotTopicLike) {
  const trendValue = Number.parseInt(resolveTrend(item), 10) || 18;
  const baseHeat = clamp(Math.round(item.heat / 100), 45, 90);

  return [
    { point: "好奇建立", position: "开头", intensity: clamp(baseHeat - 4, 40, 92) },
    { point: "痛点放大", position: "第二段", intensity: clamp(baseHeat + 6, 45, 96) },
    { point: "判断强化", position: "第三段", intensity: clamp(baseHeat + Math.round(trendValue / 6), 50, 98) },
    { point: "行动推动", position: "结尾", intensity: clamp(baseHeat - 8, 38, 90) },
  ];
}

function buildFormatFeatures(item: HotTopicLike) {
  const primaryTag = derivePrimaryTag(item);

  return [
    "开头 2-3 句单独成段",
    `围绕「${primaryTag}」设置 3 个小标题`,
    "关键判断句用高亮强调",
    "结尾保留互动提问或在看引导",
  ];
}

function buildMethods(item: HotTopicLike, angle: string) {
  const primaryTag = derivePrimaryTag(item);

  return [
    `标题先给趋势信号，再补一个与「${primaryTag}」相关的具体场景`,
    `开头 150 字内说明为什么这条热点和读者有关`,
    `正文围绕「${angle}」展开，不做纯资讯复述`,
    "结尾给出明确判断或行动建议，推动收藏和转发",
  ];
}

export function buildArticleAnalysisFromHotTopic(item: HotTopicLike): ArticleAnalysisItem {
  const trend = resolveTrend(item);
  const time = formatFetchedTime(toIsoString(item.fetchedAt));
  const angle = deriveAngle(item);
  const primaryTag = derivePrimaryTag(item);
  const reads = Math.round(item.heat * 9.2);
  const likes = Math.round(item.heat * 0.11);
  const comments = Math.round(item.heat * 0.024);

  return {
    id: `analysis-${item.id}`,
    title: item.title,
    source: item.source,
    time,
    heat: item.heat,
    trend,
    tags: item.tags.length ? item.tags : [primaryTag],
    summary: item.summary ?? undefined,
    url: item.url ?? undefined,
    angle,
    topic: buildTopicSuggestionFromHotTopic(item),
    metrics: {
      reads: formatCompactNumber(reads),
      likes: clamp(likes, 80, 9800),
      comments: clamp(comments, 12, 1800),
    },
    analysis: {
      titleStructure: {
        pattern: deriveTitlePattern(item.title, item.heat),
        hook: deriveHook(item.title, item.source),
        emotion: deriveEmotion(item),
      },
      opening: `建议开头先用「${item.source} 上这条内容为什么突然冲上来」承接热点，再迅速解释它和读者的关系，最后抛出一个与「${primaryTag}」有关的判断，建立继续阅读的理由。`,
      rhythm: buildRhythm(item),
      emotions: buildEmotionCurve(item),
      format: buildFormatFeatures(item),
      methods: buildMethods(item, angle),
    },
  };
}

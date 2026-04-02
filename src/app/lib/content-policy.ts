import type { TopicSuggestion } from "./app-data";

type RestrictionInput = {
  title?: string | null;
  summary?: string | null;
  tags?: string[] | null;
  source?: string | null;
  angles?: string[] | null;
};

const POLITICAL_SENSITIVE_KEYWORDS = [
  "政治",
  "时政",
  "中央",
  "国务院",
  "人大",
  "政协",
  "外交部",
  "国防部",
  "公安部",
  "国台办",
  "发改委",
  "中纪委",
  "省委",
  "市委",
  "书记",
  "主席",
  "总理",
  "部长",
  "官员",
  "两会",
  "选举",
  "投票",
  "制裁",
  "台海",
  "台湾",
  "台独",
  "两岸",
  "香港国安",
  "新疆",
  "西藏",
  "领土",
  "主权",
  "军演",
  "军事",
  "国防",
  "航母",
  "导弹",
  "战争",
  "停火",
  "伊朗",
  "以色列",
  "俄乌",
  "乌克兰",
  "北约",
  "美国大选",
  "总统",
  "首相",
  "雄安",
];

const POLITICAL_SENSITIVE_PATTERNS = [
  /(?:中共|共产党|党内|党委|党政)/i,
  /(?:国家主席|国务院总理|外交发言人|发言人回应)/i,
  /(?:国台办|台办|两岸关系|台海局势)/i,
  /(?:军事机密|军事行动|国防安全|领空|领海)/i,
  /(?:巴以|加沙|俄乌|乌克兰|伊朗|以色列)/i,
  /(?:中国|美国|日本|韩国|俄罗斯|乌克兰|伊朗|以色列|台湾|香港).{0,12}(?:回应|表态|制裁|局势|关系|冲突|战争|军演|挑衅|危险|伪装|发声|警告|会谈|协议|反制|追责)/i,
  /(?:彻底撕下伪装|十分危险|终身追责)/i,
];

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function buildKeywordCorpus(input: RestrictionInput) {
  return [
    input.title ?? "",
    input.source ?? "",
    ...(input.tags ?? []),
    ...(input.angles ?? []),
  ]
    .join("\n")
    .trim();
}

function buildPatternCorpus(input: RestrictionInput) {
  return [
    input.title ?? "",
    input.summary ?? "",
    input.source ?? "",
    ...(input.tags ?? []),
    ...(input.angles ?? []),
  ]
    .join("\n")
    .trim();
}

export function getRestrictedReason(input: RestrictionInput, extraKeywords: string[] = []) {
  const keywordCorpus = buildKeywordCorpus(input);
  const normalizedKeywordCorpus = normalizeText(keywordCorpus);
  const patternCorpus = buildPatternCorpus(input);

  const matchedKeyword = [...POLITICAL_SENSITIVE_KEYWORDS, ...extraKeywords.filter(Boolean)]
    .find((keyword) => normalizedKeywordCorpus.includes(normalizeText(keyword)));

  if (matchedKeyword) {
    return `命中限制词「${matchedKeyword}」`;
  }

  const matchedPattern = POLITICAL_SENSITIVE_PATTERNS.find((pattern) => pattern.test(patternCorpus));
  if (matchedPattern) {
    return "命中政治敏感内容规则";
  }

  return null;
}

export function isRestrictedTopic(input: RestrictionInput, extraKeywords: string[] = []) {
  return Boolean(getRestrictedReason(input, extraKeywords));
}

export function filterRestrictedTopics<T extends RestrictionInput>(items: T[], extraKeywords: string[] = []) {
  const allowed: T[] = [];
  const blocked: Array<{ item: T; reason: string }> = [];

  items.forEach((item) => {
    const reason = getRestrictedReason(item, extraKeywords);
    if (reason) {
      blocked.push({ item, reason });
      return;
    }
    allowed.push(item);
  });

  return { allowed, blocked };
}

export function assertTopicAllowed(topic: TopicSuggestion, extraKeywords: string[] = []) {
  const reason = getRestrictedReason(topic, extraKeywords);
  if (reason) {
    throw new Error(`当前选题已被安全策略拦截：${reason}`);
  }
}

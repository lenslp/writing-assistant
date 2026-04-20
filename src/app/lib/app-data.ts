import {
  articleDomains,
  resolveArticleDomain,
  type ArticleDomain,
} from "./content-domains";

export type DraftStatus = "待生成" | "待修改" | "审核中" | "已发布";

export type TopicType = "热点型" | "常青型" | "行业型";

export type TemplateName = "极简白" | "科技蓝" | "商务灰" | "暖色调" | "深色";

export type ColorSchemeName = "默认蓝" | "科技绿" | "商务橙" | "高级紫";

export type DraftFormatting = {
  template: TemplateName;
  colorScheme: ColorSchemeName;
  fontSize: "15px" | "16px" | "17px";
  lineHeight: "1.75" | "1.9" | "2.0";
  paragraphSpacing: "16px" | "20px" | "24px";
  roundedQuote: boolean;
  gradientQuote: boolean;
  numberedBadge: boolean;
};

export type TopicSuggestion = {
  id: string;
  title: string;
  domain: ArticleDomain;
  heat: "极高" | "高" | "中高" | "中";
  fit: number;
  reason: string;
  angles: string[];
  source: string;
  type: TopicType;
  tags: string[];
};

export type Draft = {
  id: string;
  domain: ArticleDomain;
  title: string;
  titleCandidates: string[];
  selectedAngle: string;
  status: DraftStatus;
  updatedAt: string;
  topic: string;
  topicId: string;
  tags: string[];
  words: number;
  summary: string;
  outline: string[];
  body: string;
  source: string;
  formatting: DraftFormatting;
  publishedAt?: string;
  publishedChannel?: "公众号" | "知乎" | "微博" | "头条" | "小红书";
  lastExportedAt?: string;
  lastExportFormat?: "html" | "md" | "wechat";
};

export type AppSettings = {
  accountName: string;
  accountPosition: string;
  contentAreas: ArticleDomain[];
  readerAgeRange: string;
  readerJobTraits: string;
  readerNeeds: string;
  toneKeywords: string[];
  bannedTopics: string[];
  ctaFollow: string;
  ctaEngage: string;
  ctaShare: string;
  defaultTemplate: string;
  contentPreferences: string[];
};

export const templates: TemplateName[] = ["极简白", "科技蓝", "商务灰", "暖色调", "深色"];

export const colorSchemes: Array<{ name: ColorSchemeName; primary: string; accent: string }> = [
  { name: "默认蓝", primary: "#2563eb", accent: "#3b82f6" },
  { name: "科技绿", primary: "#059669", accent: "#10b981" },
  { name: "商务橙", primary: "#ea580c", accent: "#f97316" },
  { name: "高级紫", primary: "#7c3aed", accent: "#8b5cf6" },
];

export const recommendedTopics: TopicSuggestion[] = [];

export const defaultSettings: AppSettings = {
  accountName: "内容灵感研究所",
  accountPosition: "一个覆盖多领域内容的个人公众号，擅长把热点、经验和观点写成易读、易传播的文章",
  contentAreas: [...articleDomains],
  readerAgeRange: "25-40岁",
  readerJobTraits: "对新知、生活方式和实用经验有持续兴趣的泛内容读者",
  readerNeeds: "希望获得有信息增量、有情绪价值、也有可执行建议的优质内容",
  toneKeywords: ["专业理性", "犀利观点", "情绪共鸣", "增长操盘手", "朋友式表达"],
  bannedTopics: ["政治敏感", "时政新闻", "两岸关系", "国际冲突", "军事外交", "医疗建议", "投资理财推荐", "色情暴力"],
  ctaFollow: "关注「内容灵感研究所」，持续获取多领域优质内容",
  ctaEngage: "觉得有启发？点个「在看」分享给更多人",
  ctaShare: "转发给你身边同样喜欢优质内容的朋友",
  defaultTemplate: "科技蓝",
  contentPreferences: ["深度分析", "实用攻略", "观点表达", "案例拆解", "共鸣内容"],
};

export const defaultDrafts: Draft[] = [];

const MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*]\((?:data:[^)]+|[^)]+)\)/g;
const IMAGE_PLACEHOLDER_PATTERN = /\[图片占位[^\]]*]/g;

export function createDefaultFormatting(defaultTemplate: string): DraftFormatting {
  const template = templates.includes(defaultTemplate as TemplateName) ? (defaultTemplate as TemplateName) : "科技蓝";
  const defaultColorMap: Record<TemplateName, ColorSchemeName> = {
    极简白: "默认蓝",
    科技蓝: "默认蓝",
    商务灰: "高级紫",
    暖色调: "商务橙",
    深色: "科技绿",
  };

  return {
    template,
    colorScheme: defaultColorMap[template],
    fontSize: "16px",
    lineHeight: "1.9",
    paragraphSpacing: "20px",
    roundedQuote: true,
    gradientQuote: true,
    numberedBadge: true,
  };
}

export function createFormattingForDomain(domain: ArticleDomain, fallbackTemplate = defaultSettings.defaultTemplate): DraftFormatting {
  const presets: Record<ArticleDomain, Pick<DraftFormatting, "template" | "colorScheme" | "gradientQuote" | "roundedQuote" | "numberedBadge">> = {
    科技: { template: "科技蓝", colorScheme: "默认蓝", gradientQuote: true, roundedQuote: true, numberedBadge: true },
    教育: { template: "暖色调", colorScheme: "商务橙", gradientQuote: false, roundedQuote: true, numberedBadge: true },
    旅游: { template: "极简白", colorScheme: "科技绿", gradientQuote: false, roundedQuote: true, numberedBadge: false },
    情感: { template: "暖色调", colorScheme: "高级紫", gradientQuote: false, roundedQuote: true, numberedBadge: false },
    社会: { template: "暖色调", colorScheme: "商务橙", gradientQuote: true, roundedQuote: true, numberedBadge: false },
    汽车: { template: "商务灰", colorScheme: "默认蓝", gradientQuote: true, roundedQuote: false, numberedBadge: false },
    体育: { template: "商务灰", colorScheme: "默认蓝", gradientQuote: true, roundedQuote: false, numberedBadge: true },
    娱乐: { template: "暖色调", colorScheme: "高级紫", gradientQuote: false, roundedQuote: true, numberedBadge: false },
    财经: { template: "商务灰", colorScheme: "商务橙", gradientQuote: true, roundedQuote: false, numberedBadge: true },
    文化: { template: "极简白", colorScheme: "高级紫", gradientQuote: false, roundedQuote: true, numberedBadge: false },
    其他: { template: "极简白", colorScheme: "默认蓝", gradientQuote: false, roundedQuote: true, numberedBadge: false },
  };

  return {
    ...createDefaultFormatting(fallbackTemplate),
    ...presets[resolveArticleDomain(domain)],
  };
}

export function createTitleCandidates(topic: TopicSuggestion, settings: AppSettings) {
  const subject = topic.title.replace(/\s+/g, " ").trim();
  const primaryAngle = topic.angles[0]?.replace(/^从/, "").replace(/^[，、\s]+/, "") || subject;
  const secondaryAngle = topic.angles[1]?.replace(/^从/, "").replace(/^[，、\s]+/, "") || primaryAngle;
  const tone = settings.toneKeywords[0] ?? "朋友式表达";
  const readerLabel =
    /家长|学生|老师/.test(subject + topic.tags.join(" ")) ? "家长和学生" :
      /创作|写作|流量|增长|运营/.test(subject + topic.tags.join(" ")) ? "做内容的人" :
        "普通人";

  const trimCandidate = (text: string) =>
    text
      .replace(/\s+/g, " ")
      .replace(/[，,]{2,}/g, "，")
      .replace(/[？?]{2,}/g, "？")
      .replace(/[！!]{2,}/g, "！")
      .replace(/[，。、；：:!?！？\s]+$/g, "")
      .trim()
      .slice(0, 30)
      .replace(/[，。、；：:!?！？\s]+$/g, "")
      .trim();

  const rawCandidates = [
    subject,
    `别只盯着${subject}，更该看的其实是${primaryAngle}`,
    `${readerLabel}为什么更该关心${primaryAngle}？`,
    `${subject}之后，真正会变的是谁的日子`,
    `如果只把${subject}当热闹看，后面更容易看漏`,
    `${tone}一点说，${primaryAngle}才是关键`,
    `${subject}闹上来以后，哪些风险开始变具体`,
    `比起${subject}本身，更值得聊的是${secondaryAngle}`,
  ];

  return Array.from(new Set(rawCandidates.map(trimCandidate).filter(Boolean))).slice(0, 5);
}

export function createOutline(topic: TopicSuggestion) {
  void topic;
  return [];
}

export function createSummary(topic: TopicSuggestion, settings: AppSettings) {
  void topic;
  void settings;
  return "";
}

export function createBody(topic: TopicSuggestion, settings: AppSettings) {
  void topic;
  void settings;
  return "";
}

export function calculateWords(text: string) {
  return text
    .replace(MARKDOWN_IMAGE_PATTERN, " ")
    .replace(IMAGE_PLACEHOLDER_PATTERN, " ")
    .replace(/\s+/g, "")
    .length;
}

export function formatDraftTime(iso: string) {
  const date = new Date(iso);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

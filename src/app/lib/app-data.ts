import {
  articleDomains,
  resolveArticleDomain,
  type ArticleDomain,
} from "./content-domains";

export type DraftStatus = "待生成" | "待修改" | "审核中" | "已发布";

export type TopicType = "热点型" | "常青型" | "行业型";

export type TemplateName = "极简白" | "科技蓝" | "商务灰" | "活力橙" | "曜石黑" | "杂志绿";

export type CtaStyleName = "简洁" | "卡片" | "强调";

export type DraftFormatting = {
  template: TemplateName;
  fontSize: "15px" | "16px" | "17px";
  lineHeight: "1.75" | "1.9" | "2.0";
  paragraphSpacing: "16px" | "20px" | "24px";
  roundedQuote: boolean;
  gradientQuote: boolean;
  numberedBadge: boolean;
  ctaText?: string;
  ctaStyle?: CtaStyleName;
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
  bannedTopics: string[];
  ctaFollow: string;
  ctaEngage: string;
  ctaShare: string;
  defaultTemplate: string;
  contentPreferences: string[];
};

export const templates: TemplateName[] = ["极简白", "科技蓝", "商务灰", "活力橙", "曜石黑", "杂志绿"];

export const ctaStyles: CtaStyleName[] = ["简洁", "卡片", "强调"];

export type TemplateColors = { primary: string; accent: string };
export type TemplateDotStyle = { backgroundColor: string; borderColor?: string };

export function getTemplateColors(template: TemplateName): TemplateColors {
  const colorMap: Record<TemplateName, TemplateColors> = {
    极简白: { primary: "#2563eb", accent: "#3b82f6" },
    科技蓝: { primary: "#2563eb", accent: "#3b82f6" },
    商务灰: { primary: "#64748b", accent: "#94a3b8" },
    活力橙: { primary: "#ea580c", accent: "#f97316" },
    曜石黑: { primary: "#111827", accent: "#475569" },
    杂志绿: { primary: "#059669", accent: "#10b981" },
  };

  return colorMap[template] ?? colorMap.极简白;
}

export function getTemplateDotStyle(template: TemplateName): TemplateDotStyle {
  const dotMap: Record<TemplateName, TemplateDotStyle> = {
    极简白: { backgroundColor: "#ffffff", borderColor: "#cbd5e1" },
    科技蓝: { backgroundColor: "#2563eb" },
    商务灰: { backgroundColor: "#64748b" },
    活力橙: { backgroundColor: "#ea580c" },
    曜石黑: { backgroundColor: "#111827" },
    杂志绿: { backgroundColor: "#059669" },
  };

  return dotMap[template] ?? dotMap.极简白;
}

export const recommendedTopics: TopicSuggestion[] = [];

export const defaultSettings: AppSettings = {
  accountName: "",
  accountPosition: "",
  contentAreas: [...articleDomains],
  bannedTopics: ["政治敏感", "时政新闻", "两岸关系", "国际冲突", "军事外交", "医疗建议", "投资理财推荐", "色情暴力"],
  ctaFollow: "关注我，持续获取多领域优质内容",
  ctaEngage: "觉得有用的话，点个「在看」让更多人看到",
  ctaShare: "转发给你身边同样喜欢优质内容的朋友",
  defaultTemplate: "极简白",
  contentPreferences: ["深度分析", "实用攻略", "观点表达", "案例拆解", "共鸣内容"],
};

export const defaultDrafts: Draft[] = [];

const MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*]\((?:data:[^)]+|[^)]+)\)/g;
const IMAGE_PLACEHOLDER_PATTERN = /\[图片占位[^\]]*]/g;

export function createDefaultFormatting(defaultTemplate: string): DraftFormatting {
  const normalizedTemplate = defaultTemplate === "深色" ? "曜石黑" : defaultTemplate === "暖色调" ? "活力橙" : defaultTemplate;
  const template = templates.includes(normalizedTemplate as TemplateName) ? (normalizedTemplate as TemplateName) : "极简白";

  return {
    template,
    fontSize: "16px",
    lineHeight: "1.9",
    paragraphSpacing: "20px",
    roundedQuote: false,
    gradientQuote: template !== "极简白",
    numberedBadge: template !== "极简白",
    ctaText: defaultSettings.ctaEngage,
    ctaStyle: "简洁",
  };
}

export function migrateDefaultFormattingToMinimal(formatting: DraftFormatting): DraftFormatting {
  const legacyTemplate = formatting.template as TemplateName | "深色" | "暖色调";
  const template = legacyTemplate === "深色" ? "曜石黑" : legacyTemplate === "暖色调" ? "活力橙" : legacyTemplate;
  const normalizedFormatting: DraftFormatting = {
    template,
    fontSize: formatting.fontSize,
    lineHeight: formatting.lineHeight,
    paragraphSpacing: formatting.paragraphSpacing,
    roundedQuote: formatting.roundedQuote,
    gradientQuote: formatting.gradientQuote,
    numberedBadge: formatting.numberedBadge,
    ctaText: formatting.ctaText ?? defaultSettings.ctaEngage,
    ctaStyle: formatting.ctaStyle ?? "简洁",
  };

  if (
    normalizedFormatting.template !== "科技蓝" ||
    !normalizedFormatting.gradientQuote ||
    !normalizedFormatting.numberedBadge
  ) {
    return normalizedFormatting;
  }

  return {
    ...normalizedFormatting,
    template: "极简白",
    gradientQuote: false,
    numberedBadge: false,
  };
}

export function createFormattingForDomain(domain: ArticleDomain, fallbackTemplate = defaultSettings.defaultTemplate): DraftFormatting {
  const presets: Record<ArticleDomain, Pick<DraftFormatting, "template" | "gradientQuote" | "roundedQuote" | "numberedBadge">> = {
    AI: { template: "极简白", gradientQuote: false, roundedQuote: false, numberedBadge: false },
    科技: { template: "极简白", gradientQuote: false, roundedQuote: false, numberedBadge: false },
    教育: { template: "极简白", gradientQuote: false, roundedQuote: false, numberedBadge: false },
    旅游: { template: "极简白", gradientQuote: false, roundedQuote: false, numberedBadge: false },
    情感: { template: "极简白", gradientQuote: false, roundedQuote: false, numberedBadge: false },
    社会: { template: "极简白", gradientQuote: false, roundedQuote: false, numberedBadge: false },
    汽车: { template: "极简白", gradientQuote: false, roundedQuote: false, numberedBadge: false },
    体育: { template: "极简白", gradientQuote: false, roundedQuote: false, numberedBadge: false },
    娱乐: { template: "极简白", gradientQuote: false, roundedQuote: false, numberedBadge: false },
    财经: { template: "极简白", gradientQuote: false, roundedQuote: false, numberedBadge: false },
    文化: { template: "极简白", gradientQuote: false, roundedQuote: false, numberedBadge: false },
    其他: { template: "极简白", gradientQuote: false, roundedQuote: false, numberedBadge: false },
  };

  return {
    ...createDefaultFormatting(fallbackTemplate),
    ...presets[resolveArticleDomain(domain)],
  };
}

export function createFormattingForTopicInput(input: {
  domain: ArticleDomain;
  source?: string;
  fallbackTemplate?: string;
}): DraftFormatting {
  if (input.source?.includes("GitHub Trending")) {
    return {
      ...createDefaultFormatting(input.fallbackTemplate ?? defaultSettings.defaultTemplate),
      template: "极简白",
      gradientQuote: false,
      roundedQuote: false,
      numberedBadge: false,
    };
  }

  return createFormattingForDomain(input.domain, input.fallbackTemplate ?? defaultSettings.defaultTemplate);
}

export function createTitleCandidates(topic: TopicSuggestion, settings: AppSettings) {
  void settings;
  const subject = topic.title.replace(/\s+/g, " ").trim();
  const primaryAngle = topic.angles[0]?.replace(/^从/, "").replace(/^[，、\s]+/, "") || subject;
  const secondaryAngle = topic.angles[1]?.replace(/^从/, "").replace(/^[，、\s]+/, "") || primaryAngle;
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
      .replace(/[，。、；：:!?！？\s]+$/g, "")
      .trim();
  const shortenCandidate = (text: string) => {
    const normalized = trimCandidate(text);
    if (normalized.replace(/\s+/g, "").length <= 30) {
      return normalized;
    }

    return normalized
      .replace(/，更该看的其实是/g, "，更该看")
      .replace(/为什么更该关心/g, "为何更该关心")
      .replace(/真正会变的是谁的日子/g, "真正会变的是什么")
      .replace(/后面更容易看漏/g, "更容易看漏")
      .replace(/一点说，/g, "说，")
      .replace(/哪些风险开始变具体/g, "哪些风险变具体")
      .replace(/比起(.+)本身，更值得聊的是(.+)/, "比起$1，更值得聊的是$2")
      .trim();
  };

  if (topic.source?.includes("GitHub Trending")) {
    const repoName = subject.replace(/\s+/g, " ").trim();
    const focus = primaryAngle.replace(/^它|这个项目|这项目/, "").trim() || secondaryAngle || "一个值得关注的开源项目";
    const githubCandidates = [
      repoName,
      `${repoName}`,
      `${repoName}，我最近会推荐它`,
      `${repoName}，真有点意思`,
      `${repoName}，不是随便火的`,
      `${repoName}：${focus}`,
      `聊聊 ${repoName}`,
      `${repoName} 的几个看点`,
    ];

    return Array.from(new Set(githubCandidates.map(shortenCandidate).filter(Boolean))).slice(0, 5);
  }

  const rawCandidates = [
    subject,
    `别只盯着${subject}，更该看的其实是${primaryAngle}`,
    `${readerLabel}为什么更该关心${primaryAngle}？`,
    `${subject}之后，真正会变的是谁的日子`,
    `如果只把${subject}当热闹看，后面更容易看漏`,
    `说直接点，${primaryAngle}才是关键`,
    `${subject}闹上来以后，哪些风险开始变具体`,
    `比起${subject}本身，更值得聊的是${secondaryAngle}`,
  ];

  return Array.from(new Set(rawCandidates.map(shortenCandidate).filter(Boolean))).slice(0, 5);
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

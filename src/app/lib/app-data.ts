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
    其他: { template: "极简白", colorScheme: "默认蓝", gradientQuote: false, roundedQuote: true, numberedBadge: false },
  };

  return {
    ...createDefaultFormatting(fallbackTemplate),
    ...presets[resolveArticleDomain(domain)],
  };
}

export function createTitleCandidates(topic: TopicSuggestion, settings: AppSettings) {
  const tone = settings.toneKeywords[0] ?? "专业";
  const domain = resolveArticleDomain(topic.domain);
  const domainPrefix: Record<ArticleDomain, string> = {
    科技: "趋势拆解",
    教育: "方法指南",
    旅游: "实用攻略",
    情感: "关系观察",
    社会: "社会观察",
    汽车: "深度评测",
    其他: "综合观察",
  };

  return [
    topic.title,
    `${topic.title}：${topic.angles[0]}`,
    `${domainPrefix[domain]}｜${topic.title}`,
    `${tone}｜${topic.title}`,
  ];
}

export function createOutline(topic: TopicSuggestion) {
  const domain = resolveArticleDomain(topic.domain);
  const presets: Record<ArticleDomain, string[]> = {
    科技: [
      `开头：为什么现在要关注「${topic.title}」`,
      `核心变化：${topic.angles[0]}`,
      `影响判断：${topic.angles[1]}`,
      `机会与风险：${topic.angles[2]}`,
      "结尾：给读者一个明确行动建议",
    ],
    教育: [
      "开头：这个问题为什么总让人反复卡住",
      `关键原因：${topic.angles[0]}`,
      `方法拆解：${topic.angles[1]}`,
      `实操建议：${topic.angles[2]}`,
      "结尾：给家长/学习者一个可执行提醒",
    ],
    旅游: [
      "开头：为什么这次出行值得安排",
      `路线亮点：${topic.angles[0]}`,
      `预算与体验：${topic.angles[1]}`,
      `避坑提醒：${topic.angles[2]}`,
      "结尾：给出最佳玩法和建议节奏",
    ],
    情感: [
      "开头：很多人都会经历的那个情绪卡点",
      `关系判断：${topic.angles[0]}`,
      `真实原因：${topic.angles[1]}`,
      `怎么面对：${topic.angles[2]}`,
      "结尾：给读者一句安放和行动建议",
    ],
    社会: [
      "开头：先抛出最值得关注的事件现场",
      `事件核心：${topic.angles[0]}`,
      `现实影响：${topic.angles[1]}`,
      `观点判断：${topic.angles[2]}`,
      "结尾：给出一个明确提醒或讨论问题",
    ],
    汽车: [
      "开头：这台车/这类车为什么值得聊",
      `核心参数：${topic.angles[0]}`,
      `真实体验：${topic.angles[1]}`,
      `购车建议：${topic.angles[2]}`,
      "结尾：给不同预算用户明确建议",
    ],
    其他: [
      "开头：先讲清这件事为什么值得看",
      `核心信息：${topic.angles[0]}`,
      `延伸角度：${topic.angles[1]}`,
      `读者价值：${topic.angles[2]}`,
      "结尾：用一个判断或提醒收束全文",
    ],
  };

  return presets[domain];
}

export function createSummary(topic: TopicSuggestion, settings: AppSettings) {
  const domain = resolveArticleDomain(topic.domain);
  const domainGoal: Record<ArticleDomain, string> = {
    科技: "帮助读者快速理解这件事的技术变化、行业影响与实际价值",
    教育: "帮助读者看清问题、理解原因，并拿到能立刻执行的方法",
    旅游: "帮助读者快速掌握值不值得去、怎么玩、花多少钱以及怎么避坑",
    情感: "帮助读者看清情绪背后的原因，并找到更温柔也更清晰的表达方式",
    社会: "帮助读者快速理解事件脉络、现实影响和为什么值得持续关注",
    汽车: "帮助读者更高效地看懂配置、体验差异和购车决策逻辑",
    其他: "帮助读者快速抓住重点、看清来龙去脉，并提炼真正有价值的信息",
  };

  return `这篇文章将围绕「${topic.title}」展开，结合你的账号定位「${settings.accountPosition}」，从 ${topic.angles[0]} 的角度切入，${domainGoal[domain]}。`;
}

export function createBody(topic: TopicSuggestion, settings: AppSettings) {
  const domain = resolveArticleDomain(topic.domain);
  const bodies: Record<ArticleDomain, string[]> = {
    科技: [
      `最近一段时间，「${topic.title}」持续升温。对很多读者来说，这不只是一个新热点，更是一个值得尽快建立判断的信号。`,
      `如果只停留在“发生了什么”，这篇内容很容易变成资讯复述。真正更有价值的写法，是从「${topic.angles[0]}」切进去，讲清楚它为什么重要。`,
      `更值得展开的是，这件事背后反映出的不只是产品变化，还有行业节奏、用户习惯和内容机会的重组。`,
      `所以正文最好围绕 ${topic.angles[1]} 展开，再补充 ${topic.angles[2]}，最后给出普通读者最该关注的行动建议。`,
      `如果你也在持续做 ${settings.contentAreas.slice(0, 3).join("、")} 相关内容，这类题目既能接热点，也适合沉淀长期认知。`,
    ],
    教育: [
      `很多教育类问题，真正难的不是不知道答案，而是知道很多道理，却不知道从哪里开始调整。`,
      `围绕「${topic.title}」这类主题，最容易打动读者的，不是空泛说教，而是先把「${topic.angles[0]}」讲透。`,
      `家长和学习者真正关心的，是为什么会这样、最先该改什么、以及怎么做才不会半途而废。`,
      `所以这篇文章更适合先拆原因，再讲方法，最后补充可执行建议，让读者看完就能用起来。`,
      "如果你的账号想长期输出有帮助感的内容，这会是一个很适合建立信任感的选题。",
    ],
    旅游: [
      `旅游内容最怕写成“到此一游式”流水账。真正让人收藏的，往往是路线、预算、体验和避坑信息都讲得很清楚。`,
      `围绕「${topic.title}」，这篇文章最适合从「${topic.angles[0]}」切入，让读者先快速判断这趟值不值得去。`,
      `接着再把时间安排、花费预估、拍照点位和容易踩坑的地方讲清楚，读者才会觉得这篇内容真的有用。`,
      `如果再补上 ${topic.angles[1]} 和 ${topic.angles[2]} 两层内容，文章的收藏价值会更强。`,
      "这类内容既适合即时搜索，也很适合在公众号里沉淀成长期流量。",
    ],
    情感: [
      `很多情绪，并不是突然出现的，而是长期压着没说出口。真正让人共鸣的文章，也往往不是讲大道理，而是先把那种说不出的感受说准。`,
      `围绕「${topic.title}」，可以从「${topic.angles[0]}」切进去，先替读者把心里的那个结点说出来。`,
      `当读者感受到“这说的就是我”，后面的判断和建议才会真正被听进去。`,
      `所以这篇文章适合少一点硬道理，多一点情绪承接，再慢慢落到 ${topic.angles[1]} 和 ${topic.angles[2]}。`,
      "如果写得克制而真诚，这会是一篇很容易被收藏、转发给朋友的内容。",
    ],
    社会: [
      `社会类内容最怕只停留在情绪层面。真正有传播力的，不只是“看完很气愤”，而是读者能快速看懂事情发生了什么、为什么重要。`,
      `围绕「${topic.title}」，可以先从「${topic.angles[0]}」这个最关键的事件切口切进去，让读者先建立基本认知。`,
      `中段重点展开 ${topic.angles[1]}，把它对普通人、平台或现实环境的影响讲清楚，文章的价值感就会更强。`,
      `结尾再落到 ${topic.angles[2]}，给出判断、提醒或讨论问题，读者会更愿意参与表达。`,
      "这类内容只要信息密度够高、判断够清楚，就很适合沉淀成稳定的社会观察栏目。",
    ],
    汽车: [
      `汽车内容最怕只堆参数。真正让用户愿意看下去的，是你能不能把“这些参数意味着什么”讲清楚。`,
      `围绕「${topic.title}」，更适合从「${topic.angles[0]}」切入，让读者先快速判断这台车值得关注的核心点。`,
      `接下来可以围绕驾驶体验、配置差异、空间表现和价格逻辑继续拆，让内容更接近真实购车决策。`,
      `如果能把 ${topic.angles[1]} 和 ${topic.angles[2]} 也串起来，文章就会从“资讯”变成“评测判断”。`,
      "这类内容特别适合做成对比和建议型表达，帮助读者更快做选择。",
    ],
    其他: [
      `有些选题并不天然属于某个垂直领域，但依然值得写。关键不是硬套模板，而是把真正重要的信息提炼出来。`,
      `围绕「${topic.title}」，可以先从「${topic.angles[0]}」切入，让读者快速知道这件事的核心看点。`,
      `接着再补充 ${topic.angles[1]}，把背景、影响或延伸价值交代清楚，文章就会更完整。`,
      `最后落到 ${topic.angles[2]}，给出一个判断、提醒或建议，帮助读者把信息真正用起来。`,
      "这类内容适合做成综合观察或热点杂谈，重点是判断清楚、表达利落。",
    ],
  };

  return bodies[domain].join("\n\n");
}

export function calculateWords(text: string) {
  return text.replace(/\s+/g, "").length;
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

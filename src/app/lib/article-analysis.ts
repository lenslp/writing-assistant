import type { TopicSuggestion } from "./app-data";
import { detectArticleDomain } from "./content-domains";
import { buildHotTopicTimeLabel, normalizeTrend, type HotTopicItem } from "./hot-topics";
import { buildTopicSuggestionId } from "./topic-utils";

type HotTopicLike = Pick<HotTopicItem, "id" | "title" | "source" | "sourceType" | "heat" | "tags" | "fetchedAt" | "sourcePublishedAt"> & {
  summary?: string | null;
  url?: string | null;
  trend?: string;
  trendScore?: number;
  domain?: TopicSuggestion["domain"];
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

type HotTopicCategory = TopicSuggestion["domain"];

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

function normalizeTopicTitleForAngle(title: string) {
  return title
    .replace(/^(知乎|微博|抖音|百度|头条|今日头条)(热搜|热榜)?[:：\s-]*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function trimTopicReason(summary?: string | null) {
  if (!summary?.trim()) return "";

  const cleaned = summary
    .replace(/[#＃][^#\s]{2,}/g, "")
    .replace(/欢迎关注[^。！!？?]*/g, "")
    .replace(/微信号[:：]?[A-Za-z0-9_-]+/gi, "")
    .replace(/\s+/g, " ")
    .split(/[。！？!?]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join("，");

  if (
    /^来自(微博|知乎|抖音|百度|头条|今日头条).*(热搜|热榜)/.test(cleaned) ||
    /实时热点$/.test(cleaned)
  ) {
    return "";
  }

  return cleaned;
}

function buildTopicReasonFromSignals(input: {
  title: string;
  source: string;
  domain: TopicSuggestion["domain"];
  summary?: string | null;
}) {
  const cleanedSummary = trimTopicReason(input.summary);
  const subject = normalizeTopicTitleForAngle(input.title);
  const titleCorpus = `${input.title} ${cleanedSummary}`;

  if (/AI|大模型|智能体|机器人|模型|Agent/i.test(titleCorpus)) {
    return cleanedSummary || `这条热点不只是技术圈自嗨，更适合借「${subject}」去写 AI 正在怎样进入真实场景。`;
  }

  if (/发布|上线|更新|新品|首发|开源|升级|发布会/.test(titleCorpus)) {
    return cleanedSummary || `这条消息的写作价值不在"上新"本身，而在于它有没有带来足够具体的产品增量和现实影响。`;
  }

  if (/补贴|公积金|社保|医保|退休|工资|福利|政策|新规|征求意见|通知|调整/.test(titleCorpus)) {
    return cleanedSummary || `这类政策热度背后通常连着现金流、规则变化和预期波动，适合尽快写成对普通人有用的解释。`;
  }

  if (/警方|通报|坠楼|身亡|受伤|急诊|爆炸|起火|车祸|袭击|冲突|咬伤|走失|失联/.test(titleCorpus)) {
    return cleanedSummary || `这类事故型热点传播很快，但真正值得写的是事实边界、责任归属和普通人能从中避开的风险。`;
  }

  if (/演唱会|明星|演员|歌手|恋情|离婚|回应|梦回|官宣|塌房|剧组|综艺|校花/.test(titleCorpus)) {
    return cleanedSummary || `这类娱乐话题容易空转，适合借「${subject}」去写公众情绪、代入机制和现实投射。`;
  }

  if (/复试|考研|高考|录取|博士|本科|研究生|学校|上岸|保研|分数线/.test(titleCorpus)) {
    return cleanedSummary || `这类教育热搜之所以能反复冲上来，往往不是因为结果本身，而是它会触发更深的机会焦虑。`;
  }

  if (/融资|投资|估值|募资|天使轮|并购/.test(titleCorpus)) {
    return cleanedSummary || `融资消息本身不是重点，重点是资本现在为什么愿意为这件事下注，以及它会先改变什么。`;
  }

  const domainFallback: Record<TopicSuggestion["domain"], string> = {
    科技: `这条热点有时效，也有延展空间，适合从技术变化和现实影响两个层面立住判断。`,
    教育: `这类题容易引发家长和学生共鸣，适合把情绪卡点、误区和能马上做的动作一起讲清楚。`,
    旅游: `这类出行话题如果只写热闹很快就过去，真正有价值的是把体验、预算、小众推荐和避坑写具体。`,
    情感: `这类关系话题最有价值的部分，不是表态，而是把说不出口的情绪和边界说准。`,
    社会: `这类社会议题通常自带讨论度，适合尽快把冲突、后果和规则变化拆开讲。`,
    汽车: `这类汽车热度背后往往连着真实购车判断，适合把价格、配置和适配人群讲明白。`,
    体育: `这类体育话题不只看输赢，适合把关键转折、人物状态和圈外情绪一起讲清楚。`,
    娱乐: `这类娱乐热点容易流于吃瓜，真正值得写的是公众情绪、作品价值和舆论变化。`,
    财经: `这类财经商业话题背后通常连着成本、市场和风险，适合写成普通人也能判断的解释。`,
    文化: `这类文化话题适合从现象、审美和生活方式切入，写出比资讯更多的观察。`,
    其他: `${input.source} 这条内容正在快速升温，适合从冲突、后果和读者代入感三个层面尽快立题。`,
  };

  return cleanedSummary || domainFallback[input.domain];
}

function pickDomainAudience(domain: TopicSuggestion["domain"]) {
  const audienceMap: Record<TopicSuggestion["domain"], string> = {
    科技: "普通用户和内容创作者",
    教育: "家长、老师和学生",
    旅游: "准备出发的人",
    情感: "关系里容易纠结的人",
    社会: "对现实议题有代入感的普通人",
    汽车: "正在看车和准备换车的人",
    体育: "关注赛事和人物故事的读者",
    娱乐: "关注文娱热点和公众情绪的读者",
    财经: "关心商业变化和消费决策的普通人",
    文化: "对文化现象和生活方式有兴趣的读者",
    其他: "普通读者",
  };

  return audienceMap[domain];
}

function deriveAnglesFromSignals(input: {
  title: string;
  tags: string[];
  source: string;
  domain: TopicSuggestion["domain"];
}) {
  const subject = normalizeTopicTitleForAngle(input.title);
  const titleCorpus = `${input.title} ${input.tags.join(" ")}`;
  const domain = input.domain;
  const audience = pickDomainAudience(domain);

  if (/AI|大模型|智能体|机器人|模型|Agent/i.test(titleCorpus)) {
    return [
      `别只盯着「${subject}」的热闹，更值得写的是 AI 到底开始在哪些真实场景落地了`,
      `对${audience}来说，最实际的问题不是技术名词，而是这波变化会先改掉什么习惯和门槛`,
      `如果热度继续往上走，真正会被拉开差距的是谁，代价和风险又会落到哪里`,
    ];
  }

  if (/发布|上线|更新|新品|首发|开源|升级|发布会/.test(titleCorpus)) {
    return [
      `表面看是「${subject}」发布了新东西，真正该写的是它有没有带来足够具体的增量`,
      `对${audience}来说，最该关心的不是参数堆了多少，而是这次更新会不会真的改变选择`,
      `这类消息最容易被宣传话术带偏，文章里要把值得期待和不该高估的部分分开讲`,
    ];
  }

  if (/涨|降|裁员|停更|翻车|争议|暴涨|暴跌|下架|约谈|曝光|封禁|叫停/.test(titleCorpus)) {
    return [
      `别急着站队「${subject}」，更值得写的是情绪背后到底是哪种矛盾被戳破了`,
      `这件事为什么会让${audience}有代入感，说明现实里哪种焦虑已经积累很久了`,
      `热度退下去之后，真正该继续追问的不是输赢，而是谁来承担后果、规则会不会变`,
    ];
  }

  if (/融资|投资|估值|募资|天使轮|并购/.test(titleCorpus)) {
    return [
      `这不只是「${subject}」拿到一笔钱，更值得判断的是资本现在在押什么方向`,
      `对${audience}来说，真正有价值的不是看热闹，而是看这笔钱会把哪个场景先做实`,
      `文章里要把机会和泡沫一起写清楚，别把融资消息直接翻译成行业确定性`,
    ];
  }

  if (/演唱会|明星|演员|歌手|恋情|离婚|回应|梦回|官宣|塌房|剧组|综艺|校花/.test(titleCorpus)) {
    return [
      `别把「${subject}」只写成娱乐八卦，更值得写的是它为什么总能精准戳中大众的代入和投射`,
      `对${audience}来说，真正值得讨论的不是谁又上热搜了，而是我们到底在借这些故事表达什么情绪`,
      `这类题如果只跟着吃瓜，很快就会空掉；文章里要把情绪机制、公众想象和现实落差一起拆开`,
    ];
  }

  if (/高温|暴雨|台风|气温|极端天气|预警|降温|升温|地震|洪水|山火/.test(titleCorpus)) {
    return [
      `别把「${subject}」只写成天气提醒，更值得写的是极端变化为什么越来越频繁地闯进普通人的日常`,
      `对${audience}来说，真正重要的不是转发一句"注意安全"，而是哪些生活成本和风险已经在悄悄抬高`,
      `这类题不能只停在情绪感叹，文章里要把眼前影响、长期趋势和具体应对分开讲清楚`,
    ];
  }

  if (/复试|考研|高考|录取|博士|本科|研究生|学校|上岸|保研|分数线/.test(titleCorpus)) {
    return [
      `表面看是「${subject}」又上了热搜，真正该写的是教育竞争里的哪种执念被再次点燃`,
      `对${audience}来说，真正刺痛人的不只是结果本身，而是资源、身份和机会分配带来的落差感`,
      `这类题最容易吵成立场之争，文章里要继续往下写：大家到底在替什么焦虑，边界又该画在哪里`,
    ];
  }

  if (/警方|通报|坠楼|身亡|受伤|急诊|爆炸|起火|车祸|袭击|冲突|咬伤|走失|失联/.test(titleCorpus)) {
    return [
      `别急着把「${subject}」写成猎奇事件，更值得写的是这种事故为什么总会迅速击中公众神经`,
      `对${audience}来说，真正需要的不是再添一层情绪，而是先分清事实、责任和可避免的风险`,
      `这类题如果只写震惊很快就空了，文章里要把制度漏洞、行为门槛和现实教训继续追下去`,
    ];
  }

  if (/补贴|公积金|社保|医保|退休|工资|福利|政策|新规|征求意见|通知|调整/.test(titleCorpus)) {
    return [
      `别把「${subject}」只当政策新闻看，更值得写的是它会怎样改动普通人的现金流、选择和预期`,
      `对${audience}来说，最关键的不是把条文背下来，而是先知道自己到底会不会被这次变化真正影响`,
      `这类题最怕写成政策复读，文章里要把能立刻执行的动作和容易误判的地方一起讲明白`,
    ];
  }

  if (/比赛|夺冠|战队|选手|无畏契约|LOL|电竞|联赛|季后赛|足球|篮球/.test(titleCorpus)) {
    return [
      `别把「${subject}」只写成赛果播报，更值得写的是这场热度为什么会外溢到圈外`,
      `对${audience}来说，真正有意思的不是输赢本身，而是人们在这类竞技叙事里投射了什么期待`,
      `这类题如果只复盘过程会很快同质化，文章里要把情绪动员、商业价值和后续影响一起讲`,
    ];
  }

  if (/演唱会|明星|演员|歌手|综艺|电影|电视剧|票房|金像奖|奥斯卡|红毯|官宣|塌房|剧组/.test(titleCorpus)) {
    return [
      `别把「${subject}」只写成娱乐八卦，更值得写的是它为什么能牵动这么多人的情绪`,
      `对${audience}来说，真正有意思的不是谁又上热搜，而是作品、人物和公众想象之间出现了什么落差`,
      `这类题如果只写热闹很快就空了，文章里要把舆论变化、粉丝心理和现实投射一起讲清楚`,
    ];
  }

  if (/融资|投资|估值|募资|并购|上市|股价|财报|营收|利润|负债|破产|开业|停售|暂停销售|消费|门店|零食店/.test(titleCorpus)) {
    return [
      `别把「${subject}」只写成商业消息，更值得写的是背后的成本、需求和风险怎么变了`,
      `对${audience}来说，真正重要的不是谁赚了多少钱，而是这件事会怎样影响选择、价格和预期`,
      `这类题要避免写成公司通稿，文章里要把商业动因、普通人感受和后续变量分开讲`,
    ];
  }

  if (/文化|艺术|历史|文学|阅读|博物馆|非遗|城市漫步|照片|影像|审美|年度杰出文化影响力人物/.test(titleCorpus)) {
    return [
      `别把「${subject}」只写成一条文化资讯，更值得写的是它折射了哪种审美和生活方式变化`,
      `对${audience}来说，真正有代入感的不是概念，而是这件事为什么会让人重新理解自己的日常`,
      `这类题需要写出观察而不是堆形容词，文章里要把现象、情绪和现实场景连起来`,
    ];
  }

  if (domain === "教育") {
    return [
      `别把「${subject}」只写成一个教育话题，更该写的是它为什么总能卡住家长和学生`,
      `对${audience}来说，真正需要的不是道理更满，而是先知道最先该改哪一步`,
      `这类题最怕空泛鸡汤，文章里要把误区、边界和能马上做的动作讲具体`,
    ];
  }

  if (domain === "情感") {
    return [
      `表面看是「${subject}」引发共鸣，真正该写的是关系里那种说不出口的卡点`,
      `对${audience}来说，最需要的不是站在高处劝，而是先把情绪和边界说准`,
      `这类题只写共鸣不够，文章里还得往下追问：如果继续这样，会把关系推向哪里`,
    ];
  }

  if (domain === "汽车") {
    return [
      `别只把「${subject}」写成新车资讯，更值得写的是它对真实购车决策意味着什么`,
      `对${audience}来说，真正重要的不是配置表本身，而是这些变化值不值那个价格`,
      `文章里要把亮点、门槛和适合谁说清楚，别让内容停在"看起来很香"`,
    ];
  }

  if (domain === "旅游") {
    // 根据标题关键词动态调整角度
    if (/小众|冷门|私藏|宝藏|人少|秘境/.test(subject)) {
      return [
        `「${subject}」这类小众推荐，最怕写成网红打卡清单，真正有价值的是交通、体验和配套的真实门槛`,
        `对${audience}来说，想知道的不是"这个地方很美"，而是"去一趟到底方不方便、值不值"`,
        `文章里要把适合谁去、什么季节最佳、怎么避开人流写清楚，才有收藏价值`,
      ];
    }
    if (/自驾|公路|环线|国道|川藏|独库/.test(subject)) {
      return [
        `「${subject}」这类自驾路线，不能只写沿途风景，更值得写的是路况、补给和真实驾驶体验`,
        `对${audience}来说，最关心的是路好不好开、哪里加油、哪里住宿、有哪些坑`,
        `这类题要把每天行程、必备物资和应急准备一起写出来，才是真正的攻略`,
      ];
    }
    if (/亲子|遛娃|带娃|家庭/.test(subject)) {
      return [
        `「${subject}」这类亲子游内容，不能只写景点好玩，更值得写的是孩子能不能玩好、大人累不累`,
        `对${audience}来说，最关心的是适不适合孩子年龄、有没有母婴设施、吃饭方不方便`,
        `文章里要把行程节奏、必备物品和真实花销写清楚，才是对家长有用的攻略`,
      ];
    }
    if (/穷游|省钱|平价|性价比/.test(subject)) {
      return [
        `「${subject}」这类穷游攻略，不能只说"便宜"，更值得写的是哪些钱能省、哪些不能省`,
        `对${audience}来说，想知道的是怎么用最少的钱获得最好的体验，而不是住最差的`,
        `文章里要把交通、住宿、餐饮的真实花销和省钱技巧拆开讲，才有实操价值`,
      ];
    }
    if (/赏花|红叶|银杏|樱花|薰衣草|油菜花|花海/.test(subject)) {
      return [
        `「${subject}」这类赏花内容，不能只写花有多美，更值得写的是花期、人流量和拍照技巧`,
        `对${audience}来说，最关心的是什么时候去最好、要不要门票、周边有没有吃的`,
        `文章里要把最佳观赏期、交通方式和避开人流的技巧一起写出来，才不辜负这趟出行`,
      ];
    }
    if (/温泉|滑雪|漂流|潜水|冲浪/.test(subject)) {
      return [
        `「${subject}」这类体验项目，不能只写刺激好玩，更值得写的是价格、安全和真实体验感`,
        `对${audience}来说，最关心的是多少钱一次、有没有隐藏消费、新手能不能玩`,
        `文章里要把项目选择、费用明细和注意事项写清楚，读者才敢下单`,
      ];
    }
    if (/古镇|古城|古村|苗寨|藏寨/.test(subject)) {
      return [
        `「${subject}」这类古镇游，不能只写古色古香，更值得写的是商业化程度和真实体验`,
        `对${audience}来说，最关心的是要不要门票、值不值得住一晚、有没有被坑`,
        `文章里要把哪些值得逛、哪些是坑、怎么避开商业化套路一起写出来`,
      ];
    }
    // 默认旅游角度
    return [
      `别把「${subject}」写成打卡安利，更值得写的是这件事到底值不值得专门安排`,
      `对${audience}来说，最关心的不是漂亮话，而是体验、预算和避坑信息够不够真`,
      `这类题要把"适合谁去"和"什么时候去容易踩坑"一起写出来，收藏价值才会高`,
    ];
  }

  if (domain === "体育") {
    return [
      `别只把「${subject}」写成赛果播报，更值得写的是它为什么会被圈外人也看见`,
      `对${audience}来说，真正有意思的是人物状态、竞技压力和情绪共鸣怎么连在一起`,
      `文章里要把关键转折、争议边界和后续影响讲清楚，别停在"赢了/输了"`,
    ];
  }

  if (domain === "娱乐") {
    return [
      `别只把「${subject}」写成吃瓜，更值得写的是大众为什么会对这件事产生代入感`,
      `对${audience}来说，真正重要的是作品、人设、舆论和商业之间出现了什么变化`,
      `文章里要把热闹背后的情绪机制讲出来，别只复述时间线`,
    ];
  }

  if (domain === "财经") {
    return [
      `别只把「${subject}」写成商业快讯，更值得写的是钱、需求和风险正在往哪里流动`,
      `对${audience}来说，真正有用的是这件事会怎样影响价格、选择和市场预期`,
      `文章里要把公司视角和普通人视角分开，讲清机会在哪里、边界在哪里`,
    ];
  }

  if (domain === "文化") {
    return [
      `别只把「${subject}」写成文化资讯，更值得写的是它背后的审美变化和生活情绪`,
      `对${audience}来说，真正有意思的是为什么这个现象会在当下被重新看见`,
      `文章里要把具体场景、公众感受和更长线的文化变化连起来`,
    ];
  }

  return [
    `别把「${subject}」只当一条热搜看，更值得写的是它为什么会在这个时间点突然冲上来`,
    `对${audience}来说，真正有代入感的不是标题本身，而是这件事会把什么现实问题重新推到台前`,
    `这类题最容易止步于表态，文章里要继续往下追问：真正的影响会落到谁身上，接下来又会怎么发展`,
  ];
}

export function deriveTopicAngles(input: {
  title: string;
  tags: string[];
  source: string;
  domain: TopicSuggestion["domain"];
}) {
  return deriveAnglesFromSignals(input);
}

export function deriveTopicReason(input: {
  title: string;
  source: string;
  domain: TopicSuggestion["domain"];
  summary?: string | null;
}) {
  return buildTopicReasonFromSignals(input);
}

function buildTopicHeatLabel(heat: number): TopicSuggestion["heat"] {
  if (heat >= 8500) return "极高";
  if (heat >= 6500) return "高";
  if (heat >= 4500) return "中高";
  return "中";
}

export function buildTopicSuggestionFromHotTopic(item: HotTopicLike): TopicSuggestion {
  const primaryTag = derivePrimaryTag(item);
  const preferredDomain = item.domain;
  const domain = preferredDomain ?? detectArticleDomain(item.title, item.tags, item.source, item.summary ?? "");
  const angles = deriveAnglesFromSignals({
    title: item.title,
    tags: item.tags,
    source: item.source,
    domain,
  });

  return {
    id: buildTopicSuggestionId(item.source, item.title),
    title: item.title,
    domain,
    heat: buildTopicHeatLabel(item.heat),
    fit: clamp(Math.round(item.heat / 100), 72, 96),
    reason: buildTopicReasonFromSignals({
      title: item.title,
      source: item.source,
      domain,
      summary: item.summary,
    }),
    angles,
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
  const time = buildHotTopicTimeLabel({
    fetchedAt: toIsoString(item.fetchedAt),
    source: item.source,
    sourcePublishedAt: item.sourcePublishedAt,
  });
  const domain = detectArticleDomain(item.title, item.tags, item.source);
  const angle = deriveAnglesFromSignals({
    title: item.title,
    tags: item.tags,
    source: item.source,
    domain,
  })[0];
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

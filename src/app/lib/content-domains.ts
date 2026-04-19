export const articleDomains = ["科技", "教育", "旅游", "情感", "社会", "汽车", "体育", "娱乐", "财经", "文化", "其他"] as const;

export type ArticleDomain = (typeof articleDomains)[number];

export type DomainConfig = {
  label: ArticleDomain;
  icon: string;
  description: string;
  template: "极简白" | "科技蓝" | "商务灰" | "暖色调" | "深色";
  colorScheme: "默认蓝" | "科技绿" | "商务橙" | "高级紫";
  aliases: string[];
  writingFocus: string[];
  promptHint: string;
};

export const domainConfigs: Record<ArticleDomain, DomainConfig> = {
  科技: {
    label: "科技",
    icon: "🤖",
    description: "适合科技趋势、AI、产品更新、商业影响类内容。",
    template: "科技蓝",
    colorScheme: "默认蓝",
    aliases: ["ai", "人工智能", "科技", "互联网", "产品", "数码", "大模型", "开源", "芯片", "航天", "火箭", "卫星"],
    writingFocus: ["趋势判断", "产品解读", "用户价值", "行业影响"],
    promptHint: "重点写技术变化、产品能力、行业影响和普通读者该怎么理解。",
  },
  教育: {
    label: "教育",
    icon: "📚",
    description: "适合学习方法、家长教育、成长建议和知识科普。",
    template: "暖色调",
    colorScheme: "商务橙",
    aliases: ["教育", "学习", "家长", "成长", "考试", "升学", "课堂", "老师"],
    writingFocus: ["方法建议", "认知升级", "案例启发", "成长路径"],
    promptHint: "重点写学习方法、成长建议、家长视角和可执行步骤。",
  },
  旅游: {
    label: "旅游",
    icon: "✈️",
    description: "适合目的地攻略、路线规划、预算建议和避坑内容。",
    template: "极简白",
    colorScheme: "科技绿",
    aliases: ["旅游", "旅行", "酒店", "民宿", "景点", "出行", "攻略", "路线", "文旅", "旅居"],
    writingFocus: ["行程路线", "体验感", "预算", "避坑建议"],
    promptHint: "重点写地点体验、路线安排、预算信息和真实避坑提醒。",
  },
  情感: {
    label: "情感",
    icon: "💕",
    description: "适合关系表达、情绪疗愈、共鸣故事和边界话题。",
    template: "暖色调",
    colorScheme: "高级紫",
    aliases: ["情感", "恋爱", "婚姻", "关系", "治愈", "共鸣", "心理", "温暖"],
    writingFocus: ["情绪共鸣", "关系判断", "沟通建议", "边界感"],
    promptHint: "重点写情绪变化、关系判断、代入感和温柔但清晰的表达。",
  },
  社会: {
    label: "社会",
    icon: "📰",
    description: "适合社会热点、民生观察、公共议题和现实案例。",
    template: "暖色调",
    colorScheme: "商务橙",
    aliases: ["社会", "社会热点", "民生", "新闻", "事件", "观察", "调查", "舆论", "搞笑", "法律", "法院", "文化"],
    writingFocus: ["事件脉络", "现实影响", "公众情绪", "观点判断"],
    promptHint: "重点写事件背景、现实影响、公众关注点和清晰判断。",
  },
  汽车: {
    label: "汽车",
    icon: "🚗",
    description: "适合车型评测、购车建议、配置对比和用车体验。",
    template: "商务灰",
    colorScheme: "默认蓝",
    aliases: ["汽车", "新能源", "车型", "suv", "轿车", "试驾", "评测", "配置", "续航", "机车", "摩托"],
    writingFocus: ["配置参数", "驾驶体验", "购车决策", "性价比判断"],
    promptHint: "重点写参数、体验、优缺点对比和购买决策建议。",
  },
  体育: {
    label: "体育",
    icon: "🏟️",
    description: "适合赛事、运动员、竞技表现和体育商业类内容。",
    template: "商务灰",
    colorScheme: "默认蓝",
    aliases: ["体育", "赛事", "比赛", "运动", "足球", "篮球", "电竞", "冠军", "夺冠"],
    writingFocus: ["赛事脉络", "竞技表现", "情绪价值", "商业影响"],
    promptHint: "重点写赛事情绪、关键转折、人物表现和圈外读者为什么会关心。",
  },
  娱乐: {
    label: "娱乐",
    icon: "🎬",
    description: "适合明星、影视综艺、演唱会、奖项和文娱热点。",
    template: "暖色调",
    colorScheme: "高级紫",
    aliases: ["娱乐", "明星", "影视", "综艺", "电影", "演员", "歌手", "演唱会", "奖项"],
    writingFocus: ["公众情绪", "粉丝生态", "作品价值", "舆论变化"],
    promptHint: "重点写清热闹背后的情绪机制、作品或人物变化，以及大众为什么会代入。",
  },
  财经: {
    label: "财经",
    icon: "💹",
    description: "适合公司、消费、商业、融资、市场和宏观经济类内容。",
    template: "商务灰",
    colorScheme: "商务橙",
    aliases: ["财经", "商业", "消费", "公司", "融资", "投资", "估值", "市场", "经济"],
    writingFocus: ["商业模式", "市场变化", "消费决策", "风险边界"],
    promptHint: "重点写商业动因、成本收益、市场影响和普通读者该怎么判断。",
  },
  文化: {
    label: "文化",
    icon: "🎭",
    description: "适合文化现象、阅读、艺术、历史、城市生活和审美话题。",
    template: "极简白",
    colorScheme: "高级紫",
    aliases: ["文化", "阅读", "艺术", "历史", "文学", "城市", "影像", "照片", "审美"],
    writingFocus: ["文化现象", "审美变化", "社会情绪", "生活方式"],
    promptHint: "重点写文化现象背后的情绪、审美和生活方式变化，不只做资讯罗列。",
  },
  其他: {
    label: "其他",
    icon: "🧩",
    description: "适合暂时难以归类的泛热点、综合观察和跨领域内容。",
    template: "极简白",
    colorScheme: "默认蓝",
    aliases: ["其他", "其它", "综合", "泛热点", "杂谈"],
    writingFocus: ["信息提炼", "角度归纳", "读者价值", "跨领域连接"],
    promptHint: "重点写清事件本身、核心看点和读者真正需要知道的部分，不强行套某个垂直领域。",
  },
};

const sourceDomainHints: Array<{ pattern: RegExp; domain: ArticleDomain; score: number }> = [
  { pattern: /(36氪|爱范儿|少数派|机器之心|量子位|雷峰网|虎嗅|openai|anthropic|github)/i, domain: "科技", score: 5 },
  { pattern: /(懂车帝|汽车之家|易车|太平洋汽车|一汽大众|比亚迪|特斯拉|理想汽车|蔚来|小鹏)/i, domain: "汽车", score: 5 },
  { pattern: /(马蜂窝|携程|飞猪|同程|去哪儿)/i, domain: "旅游", score: 5 },
  { pattern: /(新华社|央视|人民日报|澎湃|界面|红星|新京报|中新网)/i, domain: "社会", score: 5 },
  { pattern: /(懂球帝|虎扑|直播吧|体坛|新浪体育|腾讯体育)/i, domain: "体育", score: 5 },
  { pattern: /(豆瓣|猫眼|淘票票|时光网|微博娱乐|新浪娱乐)/i, domain: "娱乐", score: 5 },
  { pattern: /(财新|第一财经|证券时报|经济观察报|界面新闻|华尔街见闻)/i, domain: "财经", score: 5 },
];

const domainKeywordRules: Record<
  ArticleDomain,
  {
    strong: string[];
    medium: string[];
    weak: string[];
    patterns?: RegExp[];
  }
> = {
  科技: {
    strong: ["ai", "gpt", "openai", "claude", "agent", "大模型", "人工智能", "芯片", "算力", "开源", "模型", "机器人", "航天", "火箭", "卫星", "飞行汽车", "激光雷达"],
    medium: ["科技", "互联网", "数码", "手机", "电脑", "应用", "软件", "系统", "云计算", "产品", "发布会", "苹果", "华为", "小米", "硬核科技", "清洁能源", "消博会"],
    weak: ["平台", "工具", "公司", "效率", "升级", "版本", "智能化", "科技赋能"],
    patterns: [/(发布|上线|更新|首发|开源).{0,8}(模型|系统|应用|芯片|平台)/i, /(航天|火箭|卫星|机器人|硬核科技|消博会|清洁能源)/i],
  },
  教育: {
    strong: ["教育", "学习", "考试", "升学", "老师", "学生", "课程", "课堂", "作业", "高考", "考研", "中考", "幼儿园", "小学", "初中", "高中", "大学"],
    medium: ["家长", "成长", "知识", "方法", "指南", "备考", "学校", "培训", "奖学金", "留学", "读书", "学霸", "专业"],
    weak: ["报名", "刷题", "课表", "校长", "班主任", "志愿", "分数"],
    patterns: [/(高考|考研|中考|志愿填报|学习方法|课堂管理|教育改革)/i],
  },
  旅游: {
    strong: ["旅游", "旅行", "景点", "机票", "酒店", "民宿", "签证", "攻略", "路线", "自驾", "露营", "文旅", "旅居"],
    medium: ["出行", "高铁", "航班", "目的地", "古镇", "海边", "海岛", "打卡", "避坑", "城市漫步", "宜居", "小城"],
    weak: ["门票", "住宿", "行程", "游玩", "沿海", "春游"],
    patterns: [/(去哪玩|值得去|旅行攻略|出行提醒|目的地|文旅|旅居|城市漫步)/i],
  },
  情感: {
    strong: ["情感", "恋爱", "婚姻", "离婚", "关系", "治愈", "共鸣", "心理", "结婚", "家庭", "亲密关系", "分手", "复合", "婚礼"],
    medium: ["感情", "孤独", "温暖", "人生", "夫妻", "朋友", "相处", "陪伴", "沟通", "边界感", "原生家庭", "伴侣"],
    weak: ["故事", "情绪", "理解", "失望", "委屈", "和解"],
    patterns: [/(结婚|离婚|遗嘱|婚礼|家庭|亲密关系|情绪价值)/i],
  },
  社会: {
    strong: ["社会", "民生", "新闻", "事件", "调查", "警方", "通报", "曝光", "舆论", "事故", "现场", "维权", "治理", "案件", "求职", "租房", "消费", "退款", "平台", "法院", "法律", "遗产", "遗嘱", "继承", "数据造假"],
    medium: ["女子", "男子", "老人", "孩子", "家长", "学校", "医院", "司机", "乘客", "网友", "社区", "物业", "商家", "客服", "打工人", "上班", "招聘", "门店", "开业", "停售", "评论员", "春耕", "文化", "金像奖"],
    weak: ["关注", "热议", "讨论", "提醒", "争议", "画面", "经历", "背后", "回应", "观众", "热搜", "后续"],
    patterns: [/(通报|回应|曝光|调查|事件|事故|警方|民生|热议|争议|退款|维权|求职|租房|消费者|法院|法律|遗嘱|遗产|继承|开业|停售|数据造假|春耕|评论员|金像奖)/i],
  },
  汽车: {
    strong: ["汽车", "新能源", "suv", "轿车", "试驾", "评测", "续航", "揽巡", "比亚迪", "特斯拉", "理想", "蔚来", "小鹏", "大众", "奔驰", "宝马", "奥迪", "机车", "摩托"],
    medium: ["车型", "新车", "上市", "油耗", "电耗", "智能驾驶", "充电", "底盘", "配置", "驾驶", "车手", "荷兰站"],
    weak: ["百公里", "马力", "扭矩", "四驱", "增程", "正赛", "回合"],
    patterns: [/(上市|试驾|评测|续航|新车).{0,8}(汽车|suv|轿车|车型)/i, /(机车|摩托|车手|正赛|荷兰站)/i],
  },
  体育: {
    strong: ["体育", "赛事", "比赛", "夺冠", "冠军", "联赛", "季后赛", "足球", "篮球", "电竞", "选手", "战队", "运动员", "世锦赛", "奥运", "世界杯"],
    medium: ["比分", "赛场", "球员", "教练", "俱乐部", "主场", "客场", "决赛", "半决赛", "正赛", "回合", "丁俊晖", "斯诺克"],
    weak: ["迎战", "晋级", "出局", "纪录", "排名", "荷兰站", "第7", "第七"],
    patterns: [/(比赛|夺冠|冠军|联赛|季后赛|足球|篮球|电竞|战队|选手|运动员|世锦赛|斯诺克|丁俊晖)/i],
  },
  娱乐: {
    strong: ["娱乐", "明星", "演员", "歌手", "演唱会", "综艺", "电影", "电视剧", "剧集", "票房", "金像奖", "奥斯卡", "红毯", "塌房"],
    medium: ["官宣", "回应", "恋情", "离婚", "剧组", "导演", "艺人", "粉丝", "偶像", "舞台", "颁奖", "获奖", "提名"],
    weak: ["热播", "定档", "路透", "梦回", "同框", "营业", "爆料"],
    patterns: [/(演唱会|明星|演员|歌手|综艺|电影|电视剧|票房|金像奖|奥斯卡|红毯|官宣|塌房|剧组)/i],
  },
  财经: {
    strong: ["财经", "商业", "融资", "投资", "估值", "募资", "并购", "上市", "股价", "财报", "营收", "利润", "负债", "破产", "消费", "门店"],
    medium: ["公司", "企业", "品牌", "市场", "经济", "价格", "成本", "CEO", "创始人", "暂停销售", "停售", "开业", "零食店"],
    weak: ["增长", "下滑", "涨价", "降价", "客户", "供应链", "资本", "生意"],
    patterns: [/(融资|投资|估值|募资|并购|上市|股价|财报|营收|利润|负债|破产|开业|停售|暂停销售|消费|门店|零食店)/i],
  },
  文化: {
    strong: ["文化", "艺术", "历史", "文学", "阅读", "书籍", "博物馆", "非遗", "城市漫步", "照片", "影像", "审美"],
    medium: ["人物", "年度", "影响力", "小镇", "城市", "生活方式", "展览", "作品", "创作", "设计"],
    weak: ["打卡", "记录", "指南", "观察", "风格"],
    patterns: [/(文化|艺术|历史|文学|阅读|博物馆|非遗|城市漫步|照片|影像|审美|年度杰出文化影响力人物)/i],
  },
  其他: {
    strong: ["杂谈", "综合", "其他", "其它"],
    medium: [],
    weak: ["热点", "话题"],
    patterns: [],
  },
};

function countKeywordHits(text: string, keywords: string[], scorePerHit: number) {
  return keywords.reduce((sum, keyword) => {
    return sum + (text.includes(keyword.toLowerCase()) ? scorePerHit : 0);
  }, 0);
}

export function resolveArticleDomain(input?: string | null): ArticleDomain {
  const normalized = input?.trim().toLowerCase();
  if (!normalized) return "其他";

  if (normalized === "搞笑") {
    return "社会";
  }

  if (normalized === "其它") {
    return "其他";
  }

  for (const domain of articleDomains) {
    const config = domainConfigs[domain];
    if (
      [config.label, ...config.aliases].some((item) => item.trim().toLowerCase() === normalized)
    ) {
      return domain;
    }
  }

  return "其他";
}

export function detectArticleDomain(title: string, tags: string[] = [], source = "", summary = ""): ArticleDomain {
  const text = `${title} ${tags.join(" ")} ${source} ${summary}`.toLowerCase();
  const scores = new Map<ArticleDomain, number>(articleDomains.map((domain) => [domain, 0]));

  for (const domain of articleDomains) {
    const config = domainConfigs[domain];
    const rule = domainKeywordRules[domain];

    let score = scores.get(domain) ?? 0;
    score += countKeywordHits(text, config.aliases, 2);
    score += countKeywordHits(text, rule.strong, 5);
    score += countKeywordHits(text, rule.medium, 3);
    score += countKeywordHits(text, rule.weak, 1);
    score += (rule.patterns ?? []).reduce((sum, pattern) => sum + (pattern.test(text) ? 6 : 0), 0);

    for (const hint of sourceDomainHints) {
      if (hint.domain === domain && hint.pattern.test(text)) {
        score += hint.score;
      }
    }

    scores.set(domain, score);
  }

  let best: { domain: ArticleDomain; score: number } = { domain: "其他", score: -1 };
  let secondBestScore = -1;
  for (const domain of articleDomains) {
    const score = scores.get(domain) ?? 0;
    if (score > best.score) {
      secondBestScore = best.score;
      best = { domain, score };
    } else if (score > secondBestScore) {
      secondBestScore = score;
    }
  }

  if (best.domain !== "其他" && best.score >= 5 && (best.score - secondBestScore >= 2 || best.score >= 8)) {
    return best.domain;
  }

  if (/36氪|爱范儿|少数派/.test(source)) return "科技";
  if (/懂车帝|汽车之家|易车/.test(source)) return "汽车";
  if (/马蜂窝|携程|飞猪|同程|去哪儿/.test(source)) return "旅游";

  if (/微博|抖音|头条|百度|知乎/.test(source)) {
    if (/(高考|考研|中考|老师|学生|课程|备考|学习|家长|升学)/.test(text)) return "教育";
    if (/(汽车|新车|上市|试驾|比亚迪|特斯拉|理想|蔚来|小鹏|机车|摩托|车手|正赛|荷兰站)/.test(text)) return "汽车";
    if (/(比赛|夺冠|冠军|联赛|季后赛|足球|篮球|电竞|战队|选手|运动员|世锦赛|斯诺克|丁俊晖|迎战)/.test(text)) return "体育";
    if (/(演唱会|明星|演员|歌手|综艺|电影|电视剧|票房|金像奖|奥斯卡|红毯|官宣|塌房|剧组)/.test(text)) return "娱乐";
    if (/(融资|投资|估值|募资|并购|上市|股价|财报|营收|利润|负债|破产|开业|停售|暂停销售|消费|门店|零食店)/.test(text)) return "财经";
    if (/(文化|艺术|历史|文学|阅读|博物馆|非遗|城市漫步|照片|影像|审美|年度杰出文化影响力人物)/.test(text)) return "文化";
    if (/(恋爱|婚姻|离婚|分手|家庭|夫妻|伴侣|情绪|爸妈|爱你)/.test(text)) return "情感";
    if (/(旅游|旅行|酒店|民宿|景点|出行|文旅|旅居|城市漫步|沿海|小城)/.test(text)) return "旅游";
    if (/(ai|人工智能|机器人|航天|火箭|卫星|硬核科技|消博会|清洁能源)/.test(text)) return "科技";
    if (/(事件|通报|警方|曝光|调查|热议|案件|求职|租房|平台|退款|法院|法律|遗产|遗嘱|继承|数据造假|春耕|评论员)/.test(text)) return "社会";
  }

  return "其他";
}

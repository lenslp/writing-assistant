export const articleDomains = ["科技", "教育", "旅游", "情感", "社会", "汽车", "体育", "娱乐", "财经", "文化", "其他"] as const;

export type ArticleDomain = (typeof articleDomains)[number];
export type DomainConfidence = "high" | "medium" | "low";
export type DomainDetectionResult = {
  domain: ArticleDomain;
  ruleDomain: ArticleDomain;
  confidence: DomainConfidence;
  shouldUseAiAssist: boolean;
  contentLead: number;
  totalLead: number;
  hasStrongTitleEvidence: boolean;
  directDomain: ArticleDomain | null;
};

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
    aliases: ["ai", "人工智能", "科技", "互联网", "产品", "数码", "大模型", "开源", "芯片", "航天", "卫星"],
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
    description: "适合目的地攻略、路线规划、预算建议、小众景点推荐和避坑内容。",
    template: "极简白",
    colorScheme: "科技绿",
    aliases: [
      "旅游", "旅行", "酒店", "民宿", "景点", "出行", "攻略", "路线", "文旅", "旅居",
      "景区", "度假", "出游", "自驾游", "周边游", "国内游", "出境游", "穷游", "背包客",
      "亲子游", "蜜月", "毕业旅行", "周末游", "短途游", "长途旅行", "深度游", "轻奢游",
    ],
    writingFocus: ["行程路线", "体验感", "预算", "避坑建议", "小众推荐", "最佳时节"],
    promptHint: "重点写地点体验、路线安排、预算信息、小众景点推荐和真实避坑提醒。",
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
  { pattern: /(36氪|爱范儿|机器之心|量子位|雷峰网|虎嗅|openai|anthropic|github)/i, domain: "科技", score: 3 },
  { pattern: /(少数派)/i, domain: "科技", score: 1 },
  { pattern: /(懂车帝|汽车之家|易车|太平洋汽车|一汽大众|比亚迪|特斯拉|理想汽车|蔚来|小鹏)/i, domain: "汽车", score: 3 },
  { pattern: /(马蜂窝|携程|飞猪|同程|去哪儿|途牛|驴妈妈|穷游网|小红书旅游|大众点评旅游|抖音旅游|十六番|背包客|蚂蜂窝|airbnb|booking|agoda|tripadvisor|猫途鹰)/i, domain: "旅游", score: 3 },
  { pattern: /(新华社|央视|人民日报|澎湃|界面|红星|新京报|中新网)/i, domain: "社会", score: 3 },
  { pattern: /(懂球帝|虎扑|直播吧|体坛|新浪体育|腾讯体育)/i, domain: "体育", score: 3 },
  { pattern: /(豆瓣|猫眼|淘票票|时光网|微博娱乐|新浪娱乐)/i, domain: "娱乐", score: 3 },
  { pattern: /(财新|第一财经|证券时报|经济观察报|界面新闻|华尔街见闻)/i, domain: "财经", score: 3 },
];

const titleIntentHints: Array<{ pattern: RegExp; domain: ArticleDomain; score: number }> = [
  { pattern: /(入学资格|高校|博士|升学|校园|高二|清华|留校)/i, domain: "教育", score: 6 },
  { pattern: /(古镇|灵隐寺|旅行|出游|五一.*(出游|旅行|古镇|浪漫)|过一天是什么体验|看望孙子|民宿|飞猪|堵在路上|老君山|挑山工|小众景点|冷门景区|宝藏目的地|人少景美|值得一去|此生必驾|国内最美|自驾路线|穷游攻略|亲子游|蜜月旅行|毕业旅行|赏花攻略|避暑胜地|温泉推荐|滑雪场|海岛游|古镇推荐|古城攻略|世界遗产|5A景区|国家公园|周末去哪|周边游|短途旅行)/i, domain: "旅游", score: 6 },
  { pattern: /(我妈养我|思虑过重|自救|鼓励|自卑|交朋友|好带的娃|陪伴|相处|人生|晚饭不吃|复胖|午休|口角后|讲和)/i, domain: "情感", score: 6 },
  { pattern: /(质疑|误输|遇难|身体不适|虚开.*发票|被拘|不实|查案|严查|取消支付|刑案|被抓获|碰瓷|禁烟令|工作文件|二手烟|唇腭裂|网络空间|奋进力量|老人.*三轮车|监控拍下|今起实施|择机公布访华日期|没英国你们在说法语)/i, domain: "社会", score: 7 },
  { pattern: /(问界|智界|理想|蔚来|小鹏|比亚迪|特斯拉|交付速度|m6|乐道 l80|领克 900|空客|航司.*空客)/i, domain: "汽车", score: 7 },
  { pattern: /(\d+[:：]\d+|tko|止步\d+强|世乒赛|复出|马龙|许昕|阿森纳|马竞|赵心童|村超|kpl|罗唐|里夫斯|禁赛风波|詹姆斯|苏超|火箭.*詹姆斯)/i, domain: "体育", score: 7 },
  { pattern: /(跑男|五哈|开始推理吧|影帝|影后|新歌|粉丝|女团|男团|合照|综艺|艺人|偶遇|影节|大赏|行程安排|回归|隐婚生子|手势舞|主持|回复唐嫣|吓出汗|首发博|演技大赏|乐华艺人|黄晓明|关晓彤|赵露思|陈哲远|肖战|杨幂|朱珠|王玉雯|吴宣仪|李小冉|贺峻霖|造型|阵容|进组|妻旅|虞书欣|白鹿|密逃8|穿普拉达的女王|vlog品类主理人|独家访谈)/i, domain: "娱乐", score: 7 },
  { pattern: /(股票|a股|股王|利率|金饰价格|金价|楼市|彩票|加仓|楼市调控|购买决策|美联储|利率不变|供应商|泡泡玛特|成交额|航司|净买入|交付速度刺激购买决策)/i, domain: "财经", score: 7 },
  { pattern: /(微信.*工具|工作软件|空间站|歼15|生产线|军机|射程之内|苹果.*生产线|高通|共享内存|win 本|macbook pro|一加 ace|steam 手柄|联通魔方|前额叶|外骨骼机器)/i, domain: "科技", score: 7 },
  { pattern: /(洗护指南|穿搭|极简|禅意|显贵|风格|不p图|耳边的风|月季的浪漫|转场挑战|手势舞|bonbonbon|回床演绎挑战|蒜薹噩梦|深藏不露|换头像的频率|虾吃大赛|阿房宫|方言歌曲|抗战剧|老式水果|奢侈品|闪光职人|带火一座城|月季的浪漫|灵隐寺|奢侈品)/i, domain: "文化", score: 6 },
];

const sourceTagDomainHints: Array<{ sourcePattern: RegExp; tagPattern: RegExp; domain: ArticleDomain; score: number }> = [
  { sourcePattern: /(微博|抖音|百度|知乎|今日头条|头条)/i, tagPattern: /(热搜|热榜)/i, domain: "社会", score: 1 },
  { sourcePattern: /(36氪)/i, tagPattern: /(商业)/i, domain: "财经", score: 4 },
  { sourcePattern: /(36氪|爱范儿)/i, tagPattern: /(科技)/i, domain: "科技", score: 4 },
  { sourcePattern: /(爱范儿)/i, tagPattern: /(董车会|乐道|领克|汽车)/i, domain: "汽车", score: 6 },
  { sourcePattern: /(少数派)/i, tagPattern: /(效率|工具)/i, domain: "文化", score: 4 },
  { sourcePattern: /(知乎)/i, tagPattern: /(知乎热榜)/i, domain: "社会", score: 1 },
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
    strong: ["ai", "gpt", "openai", "claude", "agent", "大模型", "人工智能", "芯片", "算力", "开源", "机器人", "航天", "卫星", "飞行汽车", "激光雷达"],
    medium: ["科技", "互联网", "数码", "手机", "电脑", "应用", "软件", "系统", "云计算", "产品", "发布会", "苹果", "华为", "小米", "硬核科技", "清洁能源", "消博会"],
    weak: ["公司", "升级", "版本", "智能化", "科技赋能"],
    patterns: [/(发布|上线|更新|首发|开源).{0,8}(大模型|模型|系统|应用|芯片|平台)/i, /(航天|火箭发射|卫星|机器人|硬核科技|消博会|清洁能源|星舰|spacex)/i],
  },
  教育: {
    strong: ["教育", "学习", "考试", "升学", "老师", "学生", "课程", "课堂", "作业", "高考", "考研", "中考", "幼儿园", "小学", "初中", "高中", "大学"],
    medium: ["家长", "成长", "知识", "方法", "指南", "备考", "学校", "培训", "奖学金", "留学", "读书", "学霸", "专业"],
    weak: ["报名", "刷题", "课表", "校长", "班主任", "志愿", "分数"],
    patterns: [/(高考|考研|中考|志愿填报|学习方法|课堂管理|教育改革)/i],
  },
  旅游: {
    strong: [
      "旅游", "旅行", "景点", "机票", "酒店", "民宿", "签证", "攻略", "路线", "自驾", "露营", "文旅", "旅居",
      "景区", "度假", "出游", "穷游", "背包客", "亲子游", "蜜月旅行", "毕业旅行",
      "温泉度假", "滑雪场", "主题乐园", "国家公园", "自然保护区",
    ],
    medium: [
      "出行", "高铁", "航班", "目的地", "古镇", "海边", "海岛", "打卡", "避坑", "城市漫步", "宜居", "小城",
      "周边游", "短途游", "周末游", "自驾游", "深度游", "轻奢游",
      "小众景点", "冷门景区", "网红打卡", "摄影圣地", "赏花", "红叶", "银杏", "樱花",
      "古城", "古村落", "少数民族", "藏区", "苗寨", "梯田", "草原", "沙漠", "戈壁",
      "海滨", "沙滩", "潜水", "冲浪", "海岛游", "邮轮",
      "博物馆", "美术馆", "展览", "世界遗产", "文化古迹", "历史遗迹",
      "雪山", "冰川", "峡谷", "瀑布", "溶洞", "森林公园", "湿地",
      "采摘", "农家乐", "渔村", "赶海", "露营地", "帐篷",
      "网红民宿", "海景房", "树屋", "星空房", "洞穴酒店",
    ],
    weak: [
      "门票", "住宿", "行程", "游玩", "沿海", "春游", "秋游", "冬游", "夏游",
      "风景", "美景", "日出", "日落", "星空", "云海", "花海", "漂流", "骑行", "徒步",
      "夜市", "小吃", "美食街", "特产", "伴手礼", "免税店",
      "缆车", "索道", "观光车", "游船", "竹筏", "骑马", "骆驼",
      "亲子", "遛娃", "情侣", "闺蜜", "家庭游", "团建",
      "人少", "冷门", "小众", "私藏", "宝藏", "秘境", "世外桃源",
    ],
    patterns: [
      /(去哪玩|值得去|旅行攻略|出行提醒|目的地|文旅|旅居|城市漫步)/i,
      /(冷门|小众|私藏|宝藏|人少景美|世外桃源|秘境).{0,6}(景点|景区|地方|去处|目的地)/i,
      /(最值得|必去|一生要去|此生必驾|国内最美|全球最美).{0,10}(城市|地方|景点|景区|古镇|海岛|公路)/i,
      /(穷游|背包客|自驾游|环岛|环线|川藏线|青藏线|独库公路|318国道)/i,
      /(亲子游|遛娃|带娃|蜜月|情侣游|闺蜜游|毕业旅行|家庭游)/i,
      /(赏花|看红叶|看银杏|看樱花|看薰衣草|看油菜花|看梯田|看日出|看星空|看云海)/i,
      /(温泉|滑雪|漂流|潜水|冲浪|跳伞|蹦极|滑翔伞|热气球)/i,
      /(古镇|古城|古村|苗寨|藏寨|土楼|围屋|吊脚楼)/i,
      /(世界遗产|5A景区|国家公园|森林公园|地质公园|湿地公园)/i,
      /(避暑|避寒|过冬|越冬|旅居|养老旅居)/i,
    ],
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
    patterns: [/(通报|回应|曝光|调查|事件|事故|警方|民生|退款|维权|求职|租房|消费者|法院|法律|遗嘱|遗产|继承|开业|停售|数据造假|春耕|评论员|金像奖)/i],
  },
  汽车: {
    strong: ["汽车", "新能源", "suv", "轿车", "试驾", "评测", "续航", "揽巡", "比亚迪", "特斯拉", "理想", "蔚来", "小鹏", "大众", "奔驰", "宝马", "奥迪", "机车", "摩托"],
    medium: ["车型", "新车", "上市", "油耗", "电耗", "智能驾驶", "充电", "底盘", "配置", "驾驶", "车手", "荷兰站"],
    weak: ["百公里", "马力", "扭矩", "四驱", "增程", "正赛", "回合"],
    patterns: [/(上市|试驾|评测|续航|新车).{0,8}(汽车|suv|轿车|车型)/i, /(机车|摩托|车手|正赛|荷兰站)/i],
  },
  体育: {
    strong: ["体育", "赛事", "比赛", "夺冠", "冠军", "联赛", "季后赛", "足球", "篮球", "电竞", "选手", "战队", "运动员", "世锦赛", "奥运", "世界杯"],
    medium: ["比分", "赛场", "球员", "教练", "俱乐部", "主场", "客场", "决赛", "半决赛", "正赛", "回合", "丁俊晖", "斯诺克", "nba", "cba", "湖人", "勇士", "快船", "掘金", "雷霆", "骑士", "雄鹿"],
    weak: ["迎战", "晋级", "出局", "纪录", "排名", "荷兰站", "第7", "第七"],
    patterns: [/(比赛|夺冠|冠军|联赛|季后赛|足球|篮球|电竞|战队|选手|运动员|世锦赛|斯诺克|丁俊晖|nba|cba|湖人|勇士)/i, /(火箭).{0,8}(湖人|勇士|快船|掘金|雷霆|骑士|雄鹿|vs|队|主场|客场|季后赛|常规赛)/i],
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

function scoreTitleIntentHints(text: string, domain: ArticleDomain) {
  return titleIntentHints.reduce((sum, hint) => {
    if (hint.domain !== domain) return sum;
    return sum + (hint.pattern.test(text) ? hint.score : 0);
  }, 0);
}

function scoreSourceTagHints(sourceText: string, tagsText: string, domain: ArticleDomain) {
  return sourceTagDomainHints.reduce((sum, hint) => {
    if (hint.domain !== domain) return sum;
    if (!hint.sourcePattern.test(sourceText)) return sum;
    return sum + (hint.tagPattern.test(tagsText) ? hint.score : 0);
  }, 0);
}

function isGenericHotTopicSummary(summaryText: string) {
  if (!summaryText.trim()) return true;
  return /^(来自.+(热搜|热榜)|#欢迎关注|查看全文)/i.test(summaryText.trim());
}

function getTagFieldWeight(sourceText: string) {
  if (/(36氪|爱范儿|少数派)/i.test(sourceText)) return 1.1;
  if (/(知乎|百度|今日头条|头条)/i.test(sourceText)) return 0.8;
  return 0.75;
}

function getSummaryFieldWeight(sourceText: string, summaryText: string) {
  if (isGenericHotTopicSummary(summaryText)) return 0;
  if (/(百度|今日头条|头条)/i.test(sourceText)) return 0.95;
  if (/(36氪|爱范儿|少数派)/i.test(sourceText)) return 0.85;
  if (/(知乎)/i.test(sourceText)) return 0.75;
  return 0.45;
}

function normalizeDomainText(value: string) {
  return value.trim().toLowerCase();
}

function scoreRuleHits(
  text: string,
  rule: (typeof domainKeywordRules)[ArticleDomain],
  fieldWeight: number,
) {
  const strongHits = countKeywordHits(text, rule.strong, 1);
  const mediumHits = countKeywordHits(text, rule.medium, 1);
  const weakHits = Math.min(countKeywordHits(text, rule.weak, 1), 2);
  const patternHits = (rule.patterns ?? []).reduce((sum, pattern) => sum + (pattern.test(text) ? 1 : 0), 0);

  const rawScore = strongHits * 5 + mediumHits * 3 + weakHits + patternHits * 6;
  return {
    score: rawScore * fieldWeight,
    strongHits,
    mediumHits,
    weakHits,
    patternHits,
  };
}

function detectDomainByDisambiguation(text: string): ArticleDomain | null {
  if (
    /(火箭).{0,8}(湖人|勇士|快船|掘金|雷霆|骑士|雄鹿|vs|队|主场|客场|季后赛|常规赛)/i.test(text) ||
    /(湖人|勇士|快船|掘金|雷霆|骑士|雄鹿).{0,8}(火箭)/i.test(text)
  ) {
    return "体育";
  }

  if (/(乐高|积木|手办|装饰画)/i.test(text) && !/(ai|大模型|人工智能|模型发布|开源模型)/i.test(text)) {
    return "文化";
  }

  if (/(中年危机|婚姻危机|人生思考|关于.+思考)/i.test(text)) {
    return "情感";
  }

  return null;
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
    if (domain.trim().toLowerCase() === normalized) {
      return domain;
    }
  }

  for (const domain of articleDomains) {
    const config = domainConfigs[domain];
    if (config.aliases.some((item) => item.trim().toLowerCase() === normalized)) {
      return domain;
    }
  }

  return "其他";
}

export function detectArticleDomainWithSignals(title: string, tags: string[] = [], source = "", summary = ""): DomainDetectionResult {
  const titleText = normalizeDomainText(title);
  const tagsText = normalizeDomainText(tags.join(" "));
  const sourceText = normalizeDomainText(source);
  const summaryText = normalizeDomainText(summary);
  const fullText = `${titleText} ${tagsText} ${sourceText} ${summaryText}`.trim();
  const directDomain = detectDomainByDisambiguation(fullText);
  if (directDomain) {
    return {
      domain: directDomain,
      ruleDomain: directDomain,
      confidence: "high",
      shouldUseAiAssist: false,
      contentLead: 99,
      totalLead: 99,
      hasStrongTitleEvidence: true,
      directDomain,
    };
  }

  const scores = new Map<
    ArticleDomain,
    {
      total: number;
      content: number;
      source: number;
      titleStrongHits: number;
      titlePatternHits: number;
      titleIntentScore: number;
    }
  >(articleDomains.map((domain) => [domain, { total: 0, content: 0, source: 0, titleStrongHits: 0, titlePatternHits: 0, titleIntentScore: 0 }]));

  for (const domain of articleDomains) {
    const config = domainConfigs[domain];
    const rule = domainKeywordRules[domain];
    const tagsFieldWeight = getTagFieldWeight(sourceText);
    const summaryFieldWeight = getSummaryFieldWeight(sourceText, summaryText);
    const titleScore = scoreRuleHits(titleText, rule, 1);
    const tagsScore = scoreRuleHits(tagsText, rule, tagsFieldWeight);
    const summaryScore = scoreRuleHits(summaryText, rule, summaryFieldWeight);
    const tagAliasScore = countKeywordHits(tagsText, config.aliases, 2) * tagsFieldWeight;
    const titleIntentScore = scoreTitleIntentHints(titleText, domain);
    const sourceTagScore = scoreSourceTagHints(sourceText, tagsText, domain);
    const contentScore = titleScore.score + tagsScore.score + summaryScore.score + tagAliasScore + titleIntentScore + sourceTagScore;

    let sourceScore = 0;

    for (const hint of sourceDomainHints) {
      if (hint.domain === domain && hint.pattern.test(sourceText)) {
        sourceScore += hint.score;
      }
    }

    scores.set(domain, {
      total: contentScore + sourceScore,
      content: contentScore,
      source: sourceScore,
      titleStrongHits: titleScore.strongHits,
      titlePatternHits: titleScore.patternHits,
      titleIntentScore,
    });
  }

  let best: { domain: ArticleDomain; total: number; content: number; source: number; titleStrongHits: number; titlePatternHits: number; titleIntentScore: number } = {
    domain: "其他",
    total: -1,
    content: -1,
    source: 0,
    titleStrongHits: 0,
    titlePatternHits: 0,
    titleIntentScore: 0,
  };
  let secondBest: typeof best = {
    domain: "其他",
    total: -1,
    content: -1,
    source: 0,
    titleStrongHits: 0,
    titlePatternHits: 0,
    titleIntentScore: 0,
  };

  for (const domain of articleDomains) {
    const score = scores.get(domain) ?? { total: 0, content: 0, source: 0, titleStrongHits: 0, titlePatternHits: 0, titleIntentScore: 0 };
    if (
      score.content > best.content ||
      (score.content === best.content && score.total > best.total)
    ) {
      secondBest = best;
      best = { domain, ...score };
    } else if (
      score.content > secondBest.content ||
      (score.content === secondBest.content && score.total > secondBest.total)
    ) {
      secondBest = { domain, ...score };
    }
  }

  const hasStrongTitleEvidence = best.titleStrongHits > 0 || best.titlePatternHits > 0 || best.titleIntentScore >= 6;
  const contentLead = best.content - secondBest.content;
  const totalLead = best.total - secondBest.total;

  let ruleDomain: ArticleDomain = "其他";

  if (
    best.domain !== "其他" &&
    best.content >= 8 &&
    (contentLead >= 2 || best.content >= 11 || hasStrongTitleEvidence)
  ) {
    ruleDomain = best.domain;
  }
  else if (
    best.domain !== "其他" &&
    best.content >= 5 &&
    hasStrongTitleEvidence &&
    (contentLead >= 1.5 || totalLead >= 2)
  ) {
    ruleDomain = best.domain;
  }
  else if (best.domain !== "其他" && best.content >= 6 && totalLead >= 2) {
    ruleDomain = best.domain;
  }
  else if (
    best.domain !== "其他" &&
    /微博|抖音|百度|知乎|今日头条|头条/.test(sourceText) &&
    best.content >= 4 &&
    (contentLead >= 1 || totalLead >= 1)
  ) {
    ruleDomain = best.domain;
  }
  else if (best.domain !== "其他" && best.source >= 3 && secondBest.content < 4) {
    ruleDomain = best.domain;
  }

  let confidence: DomainConfidence = "low";

  if (
    ruleDomain !== "其他" &&
    (
      directDomain !== null ||
      (best.content >= 8 && (contentLead >= 2 || hasStrongTitleEvidence)) ||
      (best.content >= 11 && totalLead >= 3)
    )
  ) {
    confidence = "high";
  } else if (
    ruleDomain !== "其他" &&
    (
      (best.content >= 6 && totalLead >= 2) ||
      (best.content >= 5 && hasStrongTitleEvidence)
    )
  ) {
    confidence = "medium";
  }

  const shouldUseAiAssist = confidence === "low" || ruleDomain === "其他";

  return {
    domain: ruleDomain,
    ruleDomain,
    confidence,
    shouldUseAiAssist,
    contentLead,
    totalLead,
    hasStrongTitleEvidence,
    directDomain,
  };
}

export function detectArticleDomain(title: string, tags: string[] = [], source = "", summary = ""): ArticleDomain {
  return detectArticleDomainWithSignals(title, tags, source, summary).domain;
}

export type WritingTonePreset = {
  id: string;
  label: string;
  description: string;
  titleStrategy: string;
  openingStrategy: string;
  paragraphRhythm: string;
  languageStyle: string;
  emotionalTexture: string;
  closingStyle: string;
  transformFocus: string;
  aliases: string[];
  examples?: {
    titles: string[];
    opening: string;
  };
};

export const writingTonePresets: WritingTonePreset[] = [
  {
    id: "professional",
    label: "专业理性",
    description: "判断清晰、信息密度高，适合行业解读和趋势分析。",
    titleStrategy: "标题要明确价值点和判断感，避免情绪夸张，像成熟行业作者。",
    openingStrategy: "开头先给读者熟悉的问题或趋势变化，再迅速提出核心判断。",
    paragraphRhythm: "段落短而稳，层层递进，多用“先判断，再解释”的写法。",
    languageStyle: "用词克制、干净，不喊口号，不故作煽动。",
    emotionalTexture: "情绪轻，强调可信度和洞察力。",
    closingStyle: "结尾收束到方法、建议或判断升级，给读者可执行方向。",
    transformFocus: "把表达改得更专业、更有信息密度，减少空话和口语赘述。",
    aliases: ["专业", "理性", "克制", "有深度", "不说教"],
  },
  {
    id: "sharp",
    label: "犀利观点",
    description: "观点更鲜明，适合输出态度、拆误区、做反常识表达。",
    titleStrategy: "标题要带反差、判断或纠偏感，让读者知道你要戳破什么误区。",
    openingStrategy: "开头直接抛出一个常见误判、行业误区或反直觉结论，不要铺垫。",
    paragraphRhythm: "节奏更快，短句更多，适合一段一个观点、一段一个转折。",
    languageStyle: "表达锋利但不攻击，不阴阳怪气，要有边界感。",
    emotionalTexture: "允许有一点压迫感和反问感，但核心仍是帮助读者看清问题。",
    closingStyle: "结尾要把观点钉住，留下可传播的一句话判断。",
    transformFocus: "把内容改得更有锋芒，减少温吞描述，增强判断力度。",
    aliases: ["犀利", "锋利", "观点型", "强观点"],
  },
  {
    id: "emotional",
    label: "情绪共鸣",
    description: "更贴近创作者和职场人的真实处境，适合共鸣型内容。",
    titleStrategy: "标题要有情境感和代入感，让读者觉得“这说的就是我”。",
    openingStrategy: "开头从读者当下的焦虑、疲惫、卡点或无力感切入，快速建立代入。",
    paragraphRhythm: "段落更碎一点，留白更多，适合情绪递进和心理拆解。",
    languageStyle: "像成熟作者在跟读者说真心话，别鸡汤，也别做作。",
    emotionalTexture: "允许有温度、有共鸣，但不要滥情。",
    closingStyle: "结尾要给安放感和实际建议，让读者感到被理解且能继续行动。",
    transformFocus: "增强代入感和情绪承接，让读者更容易产生共鸣。",
    aliases: ["情绪化", "共鸣", "温度", "走心", "有情绪"],
  },
  {
    id: "growth",
    label: "增长操盘手",
    description: "更像懂增长、懂运营的人在写，适合方法论和复盘内容。",
    titleStrategy: "标题突出结果、方法、差距和可执行价值，带一点操盘视角。",
    openingStrategy: "开头先指出增长停滞、转化下滑、选题失效这类现实问题，再给判断。",
    paragraphRhythm: "多用“问题-原因-动作”结构，拆解要具体，少抒情。",
    languageStyle: "偏操盘、偏复盘，强调方法、动作、优先级和执行顺序。",
    emotionalTexture: "情绪弱，结果导向强。",
    closingStyle: "结尾给 2-3 条明确动作建议，让读者看完就知道下一步怎么做。",
    transformFocus: "强化操盘感和落地动作，让内容更像实战复盘而不是泛泛建议。",
    aliases: ["增长", "运营", "方法论", "实战", "操盘"],
  },
  {
    id: "friendly",
    label: "朋友式表达",
    description: "更自然、更亲近，像懂行的朋友在把复杂问题讲明白。",
    titleStrategy: "标题可以更口语一点，但仍要有信息价值，不要太轻佻。",
    openingStrategy: "开头像和读者直接聊天，从一个很具体的日常问题切入。",
    paragraphRhythm: "语言顺一点，过渡更自然，允许用少量口语短句。",
    languageStyle: "像聪明又靠谱的朋友，不端着，也不卖弄术语。",
    emotionalTexture: "轻松、亲近，但保留专业度。",
    closingStyle: "结尾自然收束，像聊完后顺手给一个靠谱建议。",
    transformFocus: "把表达改得更自然好懂，减少硬邦邦的报告腔。",
    aliases: ["朋友式", "轻松", "自然", "口语化", "聊天感"],
  },
  // ── v2 新增 4 种预设 ──────────────────────────────────
  {
    id: "story",
    label: "故事叙事",
    description: "用讲故事的方式写，适合人物、事件、经历类内容。",
    titleStrategy: "标题像故事名或悬念句，让读者想知道后来怎样了。",
    openingStrategy: "开头直接进入场景或事件，像电影开场，不要背景介绍。",
    paragraphRhythm: "节奏像讲故事：有铺垫、有转折、有高潮、有收尾。段落可以长一点。",
    languageStyle: "用画面感强的动词和细节，少用抽象名词。像在给朋友讲一件刚发生的事。",
    emotionalTexture: "允许有情绪起伏，但不要刻意煽情。",
    closingStyle: "结尾回到故事本身，或者留一个开放式的思考，不要硬升华。",
    transformFocus: "把内容改得更有故事感，增加场景细节和情绪转折，减少平铺直叙。",
    aliases: ["故事型", "叙事", "讲故事", "有画面感"],
    examples: {
      titles: ["那个辞职去摆摊的同事，现在怎么样了", "我花了 3 万块买了一个教训"],
      opening: "上个月底，我在咖啡店碰到一个前同事。他辞了大厂的工作，在街边摆了个摊。",
    },
  },
  {
    id: "comparison",
    label: "对比评测",
    description: "用对比和评测的方式写，适合产品对比、方案对比、选择类内容。",
    titleStrategy: "标题直接点出对比对象，让读者一眼知道在比什么。",
    openingStrategy: "开头先抛出读者的选择困境，再引出对比维度。",
    paragraphRhythm: "结构清晰，按维度分段：维度 A → 维度 B → 结论。每段有明确判断。",
    languageStyle: "客观但有态度，不回避优缺点。用数据和事实说话，但也要有主观判断。",
    emotionalTexture: "理性为主，偶尔带一点个人偏好。",
    closingStyle: "结尾给一个清晰的选择建议：什么人选 A，什么人选 B。",
    transformFocus: "强化对比结构和判断感，让优缺点更清晰，减少模糊表述。",
    aliases: ["评测型", "对比", "AB 对比", "怎么选"],
    examples: {
      titles: ["秦L vs 银河L7：10 万级插混到底选谁", "MacBook Air vs ThinkPad X1：打工人的笔记本怎么选"],
      opening: "10 万预算买插混，绕不开两个名字：比亚迪秦L和吉利银河L7。一个轿车一个SUV，价格高度重叠。",
    },
  },
  {
    id: "listicle",
    label: "清单体",
    description: "用清单和列表的方式写，适合盘点、推荐、避坑类内容。",
    titleStrategy: "标题带数字或“几个”“X 条”等量词，让读者知道信息量。",
    openingStrategy: "开头简短交代背景，然后快速进入清单。不要长篇铺垫。",
    paragraphRhythm: "每条独立成段，有标题 + 简短说明。节奏快，信息密度高。",
    languageStyle: "简洁直接，每条说清楚一件事。允许用短句和符号。",
    emotionalTexture: "轻松、实用，不啰嗦。",
    closingStyle: "清单结束后给一句总结或提醒，不要强行升华。",
    transformFocus: "把内容整理成更清晰的清单结构，每条更独立、更完整。",
    aliases: ["清单型", "盘点", "推荐", "避坑", "X 条"],
    examples: {
      titles: ["买新能源车前一定要问销售的 8 个问题", "3 个工具让我的工作效率翻了一倍"],
      opening: "最近帮朋友看了几款车，总结了 8 个一定要问销售的问题。",
    },
  },
  {
    id: "newsflash",
    label: "快讯速报",
    description: "快速传递信息，适合新闻、发布、热点事件类内容。",
    titleStrategy: "标题直接说发生了什么，不要弯弯绕绕。",
    openingStrategy: "开头第一句就说核心事实：谁做了什么、什么时候、结果怎样。",
    paragraphRhythm: "段落极短，一段一个事实点。节奏快，不拖沓。",
    languageStyle: "简洁、准确、不废话。像新闻稿但不要太官方。",
    emotionalTexture: "中性偏轻，偶尔带一句作者判断。",
    closingStyle: "结尾给一个简短的判断或后续关注点，不要长篇总结。",
    transformFocus: "把内容改得更简洁、更直接，删除多余铺垫和重复信息。",
    aliases: ["快讯型", "速报", "新闻", "热点"],
    examples: {
      titles: ["小米 YU7 正式上市：21.59 万起，对标 Model Y", "比亚迪 5 月销量破 38 万台，再创新高"],
      opening: "今天下午，小米 YU7 正式上市，共推出 3 款车型，售价 21.59-27.59 万元。",
    },
  },
];

export function resolveWritingTone(tone: string) {
  const normalized = tone.trim().toLowerCase();

  return (
    writingTonePresets.find((preset) =>
      [preset.label, preset.id, ...preset.aliases].some((item) => item.trim().toLowerCase() === normalized),
    ) ?? writingTonePresets[0]
  );
}

export function buildWritingToneOptions(customTones: string[]) {
  const merged = [...writingTonePresets.map((preset) => preset.label), ...customTones.filter(Boolean)];

  return Array.from(new Set(merged));
}

function findToneOptionByPresetId(presetId: string, availableTones: string[]) {
  const matchedOption = availableTones.find((tone) => resolveWritingTone(tone).id === presetId);
  if (matchedOption) return matchedOption;

  return writingTonePresets.find((preset) => preset.id === presetId)?.label ?? null;
}

export function recommendToneForArticleType(articleType: string, availableTones: string[]) {
  const normalized = articleType.replace(/\s+/g, "");
  let preferredPresetIds: string[] = ["friendly", "professional"];

  if (/观点|评论|观察|舆论/.test(normalized)) {
    preferredPresetIds = ["sharp", "professional", "friendly"];
  } else if (/方法|指南|攻略|清单|路线|购车|增长|操盘/.test(normalized)) {
    preferredPresetIds = ["growth", "listicle", "friendly"];
  } else if (/故事|共鸣|关系|体验|生活/.test(normalized)) {
    preferredPresetIds = ["emotional", "story", "friendly"];
  } else if (/解读|分析|趋势|复盘|评测|对比|盘点|人物|作品/.test(normalized)) {
    preferredPresetIds = ["professional", "comparison", "sharp"];
  } else if (/新闻|快讯|发布|热点|事件/.test(normalized)) {
    preferredPresetIds = ["newsflash", "professional", "friendly"];
  }

  for (const presetId of preferredPresetIds) {
    const matchedTone = findToneOptionByPresetId(presetId, availableTones);
    if (matchedTone) {
      return matchedTone;
    }
  }

  return availableTones[0] ?? writingTonePresets[0].label;
}

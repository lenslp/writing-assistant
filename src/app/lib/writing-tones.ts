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
    preferredPresetIds = ["growth", "friendly", "professional"];
  } else if (/故事|共鸣|关系|体验|生活/.test(normalized)) {
    preferredPresetIds = ["emotional", "friendly", "professional"];
  } else if (/解读|分析|趋势|复盘|评测|对比|盘点|人物|作品/.test(normalized)) {
    preferredPresetIds = ["professional", "sharp", "friendly"];
  }

  for (const presetId of preferredPresetIds) {
    const matchedTone = findToneOptionByPresetId(presetId, availableTones);
    if (matchedTone) {
      return matchedTone;
    }
  }

  return availableTones[0] ?? writingTonePresets[0].label;
}

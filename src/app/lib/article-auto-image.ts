import type { ArticleDomain } from "./content-domains";

const IMAGE_MARKDOWN_PATTERN = /^!\[(.*?)\]\((.+)\)$/m;
const VISUAL_STOPWORDS = new Set([
  "文章",
  "标题",
  "摘要",
  "正文",
  "内容",
  "主题",
  "配图",
  "重点",
  "画面",
  "感觉",
  "事情",
  "问题",
  "一个",
  "一种",
  "这个",
  "那个",
  "这些",
  "那些",
  "我们",
  "你们",
  "他们",
  "已经",
  "其实",
  "就是",
  "不是",
  "如果",
  "因为",
  "所以",
]);

export function buildImageSnippet(url: string, caption: string) {
  const safeCaption = (caption || "配图").trim();
  const safeUrl = url.trim();
  return `![${safeCaption}](${safeUrl})`;
}

export function collectAutoImageKeyPoints(body: string) {
  return body
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("!["))
    .filter((line) => !line.startsWith("[图片占位"))
    .filter((line) => !line.startsWith(">"))
    .map((line) => line.replace(/^##\s+/, "").replace(/^【金句】/, "").replace(/^【重点】/, "").trim())
    .filter((line) => line.length >= 8)
    .slice(0, 4);
}

function extractVisualKeywords(texts: string[]) {
  const keywords: string[] = [];

  texts
    .map((text) => text.trim())
    .filter(Boolean)
    .join(" ")
    .match(/[\u4e00-\u9fa5]{2,8}/g)
    ?.forEach((item) => {
      const normalized = item
        .replace(/^(一位|一个|一种|关于|围绕|失去|那个|这个)/, "")
        .replace(/(的话|这件事|这件|这个|那个)$/g, "")
        .trim();

      if (!normalized || normalized.length < 2 || normalized.length > 8) return;
      if (VISUAL_STOPWORDS.has(normalized)) return;
      if (keywords.includes(normalized)) return;
      keywords.push(normalized);
    });

  return keywords.slice(0, 5);
}

function shouldAvoidAiPortrait(input: {
  title: string;
  summary: string;
  body: string;
  domain: ArticleDomain;
}) {
  const text = `${input.title} ${input.summary} ${input.body}`;
  const leadText = `${input.title} ${input.summary}`;
  const hasPeopleCue = /(有人|男子|女子|男生|女生|年轻人|中年人|普通人|创作者|博主|歌手|作者|老板|家长|孩子|母亲|父亲|儿子|女儿|一人公司|打工人|创业者|用户)/.test(text);
  const hasLeadPeopleCue = /(有人|男子|女子|男生|女生|年轻人|中年人|普通人|创作者|博主|歌手|作者|老板|家长|孩子|母亲|父亲|儿子|女儿|一人公司|打工人|创业者|用户)/.test(leadText);

  if (/(比亚迪|理想|蔚来|小鹏|特斯拉|问界|极氪|大众|丰田|本田|宝马|奔驰|奥迪)/.test(text)) {
    return false;
  }

  if (hasLeadPeopleCue) {
    return true;
  }

  if (/(海边|沙滩|山川|古镇|公路|车内|车外|书桌|课堂|办公室|会议室|录音棚|键盘|耳机|麦克风|合同|版权|电脑|屏幕)/.test(text)) {
    return hasPeopleCue;
  }

  return hasPeopleCue;
}

function buildImageScene(input: {
  title: string;
  summary: string;
  body: string;
  domain: ArticleDomain;
}) {
  const text = `${input.title} ${input.summary} ${input.body}`;
  const avoidPortrait = shouldAvoidAiPortrait(input);

  if (/(失去孩子|母亲|儿子|女儿|去世|离世|亲人|逝者|悲伤|悼念)/.test(text)) {
    return "写实摄影感，一位中年母亲安静地坐在室内，旁边有旧手机或空椅子，气氛克制、安静、有留白";
  }

  if (/(ai|AI|人工智能|数字人|机器人|大模型)/.test(text) && /(母亲|儿子|女儿|亲人|家庭|情感)/.test(text)) {
    return "现实主义场景，用人物、房间、旧物和微弱屏幕光表达技术与思念的距离感，不做科幻海报";
  }

  if (avoidPortrait && input.domain === "科技") return "真实办公或创作场景，电脑屏幕、耳机、键盘、文件或录音设备构成主体，不出现正脸人物";
  if (avoidPortrait && input.domain === "教育") return "真实家庭学习或书桌场景，书本、笔记、作业本、台灯构成主体，不出现正脸人物";
  if (avoidPortrait && input.domain === "情感") return "真实生活化室内场景，用空椅子、咖啡杯、纸张、窗光表达情绪，不出现正脸人物";
  if (avoidPortrait && input.domain === "社会") return "真实纪实场景，用街景、公告栏、办公室、窗口、合同或设备表达事件背景，不出现正脸人物";
  if (avoidPortrait && input.domain === "其他") return "真实工作或生活场景，用桌面物件、文件、电脑、城市空间构成主体，不出现正脸人物";

  if (input.domain === "科技") return "现代感静物或人物场景，克制冷色调，真实摄影感，不做海报";
  if (input.domain === "教育") return "书桌、纸页或人物专注场景，温和自然光，安静干净";
  if (input.domain === "旅游") return "真实地点或在途场景，开阔通透，空气感强";
  if (input.domain === "情感") return "人物或生活化室内场景，情绪克制，柔和留白";
  if (input.domain === "社会") return "纪实摄影感的人物或现实场景，不做信息图和说明卡";
  if (input.domain === "汽车") return "车辆与道路场景，线条清晰，质感克制";
  return "编辑感摄影场景，单一主体，构图简洁，氛围克制";
}

function buildImageStyle(input: { domain: ArticleDomain; title: string; summary: string; body: string }) {
  const text = `${input.title} ${input.summary} ${input.body}`;
  const avoidPortrait = shouldAvoidAiPortrait(input);

  if (/(失去孩子|母亲|儿子|女儿|去世|离世|亲人|逝者|悲伤|悼念)/.test(text)) {
    return "cinematic documentary photography, natural window light, quiet mood, realistic details, soft contrast, restrained colors";
  }

  if (avoidPortrait) {
    return "editorial documentary photography, realistic environment, object-led storytelling, natural light, restrained composition, no portrait";
  }

  if (input.domain === "科技") return "editorial photography, modern, minimal, clean composition, cool muted tones, realistic";
  if (input.domain === "教育") return "editorial photography, warm natural light, calm, clean desk scene, realistic";
  if (input.domain === "旅游") return "editorial travel photography, airy atmosphere, natural light, open composition, realistic";
  if (input.domain === "情感") return "editorial photography, intimate, soft natural light, quiet mood, realistic";
  if (input.domain === "社会") return "documentary editorial photography, realistic, restrained, human-centered scene";
  if (input.domain === "汽车") return "editorial automotive photography, sleek lines, realistic light, minimal background";
  return "editorial photography, minimal, realistic, clean composition, muted tones";
}

export function buildAutoImagePrompt(input: {
  title: string;
  summary: string;
  body: string;
  domain: ArticleDomain;
}) {
  const keyPoints = collectAutoImageKeyPoints(input.body);
  const visualKeywords = extractVisualKeywords([input.title, input.summary, ...keyPoints]);
  const scene = buildImageScene(input);
  const style = buildImageStyle(input);
  const avoidPortrait = shouldAvoidAiPortrait(input);

  return [
    "Editorial body illustration for an article.",
    `Scene: ${scene}.`,
    visualKeywords.length ? `Visual cues: ${visualKeywords.join(", ")}.` : "",
    `Style: ${style}.`,
    "Composition: single clear subject, clean frame, moderate negative space, not a cover, not a poster, not an infographic.",
    avoidPortrait ? "Prefer environment, objects, hands, back view, workspace, documents, devices, or ambient scene instead of a frontal human portrait." : "",
    "Output a pure image only.",
    `Negative prompt: text, words, letters, Chinese characters, subtitles, captions, typography, title card, article layout, poster layout, infographic, white document page, black text block, UI overlay, chat bubble, screenshot, watermark, logo, QR code${avoidPortrait ? ", frontal portrait, close-up face, beauty shot, influencer portrait, identifiable person" : ""}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildAutoImageCaption(input: {
  title: string;
  summary: string;
  domain: ArticleDomain;
}) {
  const base = input.title.trim() || input.summary.trim() || `${input.domain}主题配图`;
  return base.slice(0, 24);
}

export function buildAutoImageSearchQuery(input: {
  title: string;
  summary: string;
  body: string;
  domain: ArticleDomain;
}) {
  const avoidPortrait = shouldAvoidAiPortrait(input);
  const domainHints: Record<ArticleDomain, string> = {
    科技: avoidPortrait ? "office desk keyboard monitor workspace real photo" : "technology workspace real photo",
    教育: avoidPortrait ? "study desk classroom notebook real photo" : "classroom study real photo",
    旅游: "destination landscape street travel real photo",
    情感: avoidPortrait ? "home interior objects ambient scene real photo" : "lifestyle people home real photo",
    社会: avoidPortrait ? "documentary office street documents real photo" : "documentary street life real photo",
    汽车: "car vehicle road automotive real photo",
    其他: avoidPortrait ? "workspace objects ambient scene real photo" : "editorial lifestyle real photo",
  };

  const latinTokens = Array.from(
    new Set(
      `${input.title} ${input.summary} ${input.body}`
        .match(/[A-Za-z0-9][A-Za-z0-9+.-]{1,}/g)
        ?.map((item) => item.trim())
        .filter((item) => item.length >= 2 && item.length <= 20)
        .slice(0, 2) ?? [],
    ),
  );

  const hanTokens = Array.from(
    new Set(
      extractVisualKeywords([
        input.title,
        input.summary,
        ...collectAutoImageKeyPoints(input.body),
      ])
        .filter((item) => item.length >= 2 && item.length <= 4)
        .slice(0, 2),
    ),
  );

  return [...hanTokens, ...latinTokens, domainHints[input.domain]]
    .filter(Boolean)
    .join(" ")
    .trim();
}

export function shouldPreferRealImage(domain: ArticleDomain) {
  return Boolean(domain);
}

export function getAutoImageInsertLimit(domain: ArticleDomain) {
  return domain === "旅游" ? 3 : 2;
}

export function countArticleImages(body: string) {
  return body.match(/^!\[(.*?)\]\((.+)\)$/gm)?.length ?? 0;
}

function canInsertAfterSection(section: string) {
  return (
    !section.startsWith("## ") &&
    !section.startsWith(">") &&
    section !== "---" &&
    !section.startsWith("![") &&
    !section.startsWith("【金句】") &&
    !section.startsWith("【重点】") &&
    !section.startsWith("- ") &&
    !/^\d+[.)、]\s+/.test(section)
  );
}

function insertOneAutoImageIntoBody(body: string, url: string, caption: string, options?: { skipIfHasImage?: boolean }) {
  const snippet = buildImageSnippet(url, caption);
  const normalizedBody = body.trim();

  if (!normalizedBody) {
    return snippet;
  }

  if (options?.skipIfHasImage && IMAGE_MARKDOWN_PATTERN.test(normalizedBody)) {
    return normalizedBody;
  }

  const placeholderPattern = /\[图片占位[^\]]*\]/;
  if (placeholderPattern.test(normalizedBody)) {
    return normalizedBody.replace(placeholderPattern, snippet);
  }

  const sections = normalizedBody.split(/\n{2,}/).map((section) => section.trim()).filter(Boolean);
  if (!sections.length) {
    return snippet;
  }

  const paragraphIndexes = sections.reduce<number[]>((indexes, section, index) => {
    if (canInsertAfterSection(section)) {
      indexes.push(index);
    }
    return indexes;
  }, []);
  const existingImageCount = countArticleImages(normalizedBody);
  const targetParagraphIndex =
    paragraphIndexes.length > 0
      ? paragraphIndexes[Math.min(existingImageCount, paragraphIndexes.length - 1)]
      : 0;
  const targetIndex = targetParagraphIndex ?? 0;
  const nextSections = [...sections];
  nextSections.splice(targetIndex + 1, 0, snippet);

  return nextSections.join("\n\n");
}

export function insertAutoImageIntoBody(body: string, url: string, caption: string) {
  return insertOneAutoImageIntoBody(body, url, caption, { skipIfHasImage: true });
}

export function insertAutoImagesIntoBody(
  body: string,
  images: Array<{ url: string; caption: string }>,
  maxImageCount: number,
) {
  const uniqueImages = Array.from(
    new Map(
      images
        .map((image) => ({ url: image.url.trim(), caption: image.caption.trim() || "文章配图" }))
        .filter((image) => image.url)
        .map((image) => [image.url, image]),
    ).values(),
  );

  let nextBody = body;
  for (const image of uniqueImages) {
    if (countArticleImages(nextBody) >= maxImageCount) {
      break;
    }
    nextBody = insertOneAutoImageIntoBody(nextBody, image.url, image.caption);
  }

  return nextBody;
}

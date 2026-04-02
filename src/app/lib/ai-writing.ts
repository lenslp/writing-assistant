import {
  createBody,
  createOutline,
  createSummary,
  createTitleCandidates,
  type AppSettings,
  type TopicSuggestion,
} from "./app-data";
import { domainConfigs, resolveArticleDomain } from "./content-domains";
import { resolveWritingTone } from "./writing-tones";
import type {
  AITransformAction,
  AIWriteGenerateRequest,
  AIWriteResult,
  AIWriteTransformRequest,
  DraftWritingSnapshot,
} from "./ai-writing-types";

type ProviderConfig = {
  configured: boolean;
  apiKey: string;
  baseUrl: string;
  provider: string;
};

type JsonRecord = Record<string, unknown>;
type AIModelTask = AIWriteGenerateRequest["scope"] | "transform";
type AIArticlePlan = Omit<AIWriteResult, "body"> & { body: string };

const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_MODEL = "qwen3.5-plus";
const DEFAULT_FAST_MODEL = "qwen-turbo";
const AI_TONE_PREFIX_PATTERNS = [
  /^(总的来说|总而言之|综上所述|不难发现|值得一提的是|由此可见|某种程度上|从某种意义上说|客观来看|事实上|换句话说|简单来说|需要明确的是|不可否认)\s*[，,：:]?/,
  /^(首先|其次|再次|最后|另外|此外|同时)\s*[，,、：:]?/,
] as const;
const AI_TONE_INLINE_REPLACEMENTS = [
  { pattern: /在信息爆炸的时代/g, replacement: "现在" },
  { pattern: /在这个信息过载的时代/g, replacement: "现在" },
  { pattern: /随着时代的发展/g, replacement: "这几年" },
  { pattern: /值得注意的是/g, replacement: "" },
  { pattern: /我们不难发现/g, replacement: "" },
  { pattern: /总的来说/g, replacement: "" },
  { pattern: /总而言之/g, replacement: "" },
  { pattern: /综上所述/g, replacement: "" },
] as const;

function getEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

function detectProvider(baseUrl: string) {
  if (baseUrl.includes("dashscope") || baseUrl.includes("aliyuncs")) return "Qwen / DashScope";
  if (baseUrl.includes("openrouter")) return "OpenRouter";
  if (baseUrl.includes("deepseek")) return "DeepSeek";
  if (baseUrl.includes("siliconflow")) return "SiliconFlow";
  if (baseUrl.includes("openai")) return "OpenAI";
  return "OpenAI Compatible";
}

export function getAIProviderConfig(): ProviderConfig {
  const apiKey = getEnv("AI_API_KEY") || getEnv("OPENAI_API_KEY");
  const baseUrl = (getEnv("AI_BASE_URL") || getEnv("OPENAI_BASE_URL") || DEFAULT_BASE_URL).replace(/\/+$/, "");

  return {
    configured: Boolean(apiKey),
    apiKey,
    baseUrl,
    provider: detectProvider(baseUrl),
  };
}

function getTaskSpecificModel(task: AIModelTask) {
  const upperTask = task.toUpperCase();

  return (
    getEnv(`AI_MODEL_${upperTask}`) ||
    getEnv(`OPENAI_MODEL_${upperTask}`) ||
    ""
  );
}

function getAIModelForTask(task: AIModelTask) {
  const directTaskModel = getTaskSpecificModel(task);
  if (directTaskModel) return directTaskModel;

  if (task === "title" || task === "outline" || task === "transform") {
    return (
      getEnv("AI_MODEL_FAST") ||
      getEnv("OPENAI_MODEL_FAST") ||
      getEnv("AI_MODEL") ||
      getEnv("OPENAI_MODEL") ||
      DEFAULT_FAST_MODEL
    );
  }

  return (
    getEnv("AI_MODEL_LONGFORM") ||
    getEnv("OPENAI_MODEL_LONGFORM") ||
    getEnv("AI_MODEL") ||
    getEnv("OPENAI_MODEL") ||
    DEFAULT_MODEL
  );
}

function createBaseResult(
  topic: TopicSuggestion,
  settings: AppSettings,
  draft?: DraftWritingSnapshot | null,
): AIWriteResult {
  const titleCandidates =
    draft?.titleCandidates?.filter(Boolean).length
      ? draft.titleCandidates
      : createTitleCandidates(topic, settings);
  const summary = draft?.summary?.trim() || createSummary(topic, settings);
  const outline = draft?.outline?.filter(Boolean).length ? draft.outline : createOutline(topic);
  const body = draft?.body?.trim() || createBody(topic, settings);

  return {
    title: draft?.title?.trim() || titleCandidates[0] || topic.title,
    titleCandidates,
    selectedAngle: draft?.selectedAngle?.trim() || topic.angles[0] || topic.title,
    summary,
    outline,
    body,
  };
}

function normalizeStringList(value: unknown, fallback: string[] = []) {
  if (!Array.isArray(value)) return fallback;

  const items = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);

  return items.length ? Array.from(new Set(items)) : fallback;
}

function normalizeText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim().replace(/\r\n/g, "\n") : fallback;
}

function normalizeSelectedAngle(value: unknown, fallback: string) {
  const text = normalizeText(value, fallback);
  return text.split(/[；;|、]/).map((item) => item.trim()).filter(Boolean)[0] || fallback;
}

function normalizeBodyText(value: unknown, fallback = "") {
  const text = normalizeText(value, fallback);

  return text
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^(###\s+)/gm, "## ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function polishTitleText(text: string) {
  return text
    .replace(/[！!]{2,}/g, "！")
    .replace(/[？?]{2,}/g, "？")
    .replace(/^(在这个|在当下|在如今)\s*/g, "")
    .trim();
}

function polishSummaryText(text: string) {
  return text
    .replace(/^(这篇文章将|本文将|这篇内容将)(围绕|从|结合)/, "这篇文章会")
    .replace(/，?为你提供[^，。]{4,20}(参考|建议|启发)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeParagraphTone(paragraph: string) {
  const trimmed = paragraph.trim();

  if (
    trimmed.startsWith("## ") ||
    trimmed.startsWith(">") ||
    trimmed.startsWith("【金句】") ||
    trimmed.startsWith("【重点】") ||
    trimmed.startsWith("![") ||
    trimmed.startsWith("[图片占位") ||
    trimmed.startsWith("- ") ||
    /^\d+[.)、]\s+/.test(trimmed)
  ) {
    return trimmed;
  }

  let next = trimmed;

  for (const pattern of AI_TONE_PREFIX_PATTERNS) {
    next = next.replace(pattern, "");
  }

  for (const { pattern, replacement } of AI_TONE_INLINE_REPLACEMENTS) {
    next = next.replace(pattern, replacement);
  }

  return next
    .replace(/([。！？])(?=[，、；])/g, "$1")
    .replace(/^[，、；：\s]+/, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function splitWechatParagraph(paragraph: string) {
  if (
    paragraph.length < 90 ||
    paragraph.startsWith("## ") ||
    paragraph.startsWith(">") ||
    paragraph.startsWith("【金句】") ||
    paragraph.startsWith("【重点】") ||
    paragraph.startsWith("![") ||
    paragraph.startsWith("[图片占位") ||
    paragraph.includes("\n")
  ) {
    return [paragraph];
  }

  const sentences = paragraph.match(/[^。！？!?]+[。！？!?]?/g)?.map((item) => item.trim()).filter(Boolean) ?? [paragraph];
  if (sentences.length <= 2) {
    return [paragraph];
  }

  const chunks: string[] = [];
  let buffer = "";

  sentences.forEach((sentence) => {
    const candidate = `${buffer}${sentence}`;
    if (!buffer || candidate.length <= 68) {
      buffer = candidate;
      return;
    }

    chunks.push(buffer.trim());
    buffer = sentence;
  });

  if (buffer.trim()) {
    chunks.push(buffer.trim());
  }

  return chunks.length > 1 ? chunks : [paragraph];
}

function polishOutlineItems(outline: string[]) {
  return outline
    .map((item) => normalizeParagraphTone(item))
    .map((item) => item.replace(/^(开头|中段|结尾|总结|方法|建议)[:：]/, "").trim())
    .filter(Boolean)
    .slice(0, 7);
}

function polishTitleCandidates(items: string[]) {
  return Array.from(new Set(items.map((item) => polishTitleText(item)).filter(Boolean))).slice(0, 5);
}

function polishBodyText(text: string) {
  const sections = text
    .split(/\n{2,}/)
    .map((section) => section.trim())
    .filter(Boolean)
    .flatMap((section) => {
      const normalized = normalizeParagraphTone(section);
      if (!normalized) return [];
      return splitWechatParagraph(normalized);
    });

  const deduped: string[] = [];

  sections.forEach((section) => {
    const previous = deduped[deduped.length - 1];
    if (!previous || previous !== section) {
      deduped.push(section);
    }
  });

  return deduped.join("\n\n").trim();
}

function extractJsonPayload(text: string): JsonRecord {
  const direct = text.trim();

  const candidates = [
    direct,
    direct.match(/```json\s*([\s\S]*?)```/i)?.[1] ?? "",
    direct.match(/```[\s\S]*?```/i)?.[0]?.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim() ?? "",
  ].filter(Boolean);

  const firstBraceIndex = direct.indexOf("{");
  const lastBraceIndex = direct.lastIndexOf("}");
  if (firstBraceIndex >= 0 && lastBraceIndex > firstBraceIndex) {
    candidates.push(direct.slice(firstBraceIndex, lastBraceIndex + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as JsonRecord;
      }
    } catch {
      continue;
    }
  }

  return {};
}

function extractMessageContent(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";

  const choices = (payload as { choices?: Array<{ message?: { content?: unknown }; text?: unknown }> }).choices;
  const firstChoice = choices?.[0];
  const content = firstChoice?.message?.content;

  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "text" in item && typeof item.text === "string") {
          return item.text;
        }
        return "";
      })
      .join("\n")
      .trim();
  }

  if (typeof firstChoice?.text === "string") return firstChoice.text;

  return "";
}

function buildGenerateSystemPrompt(scope: AIWriteGenerateRequest["scope"], tone: string) {
  const scopeInstruction: Record<AIWriteGenerateRequest["scope"], string> = {
    title: "你本次只需要重做标题候选，但仍需保持选题角度清晰、传播感强。",
    outline: "你本次重点重做摘要和文章大纲，让结构更适合公众号阅读与转发。",
    body: "你本次重点完成正文成文，必须写出可直接发布的公众号文章。",
    full: "你本次需要完整生成标题、摘要、大纲和正文，达到可直接排版发布的质量。",
  };

  return [
    "你是一位资深中文公众号主笔，擅长热点解读、观点表达、结构化叙事和传播性标题设计。",
    "请用简体中文输出，风格适合微信公众号，不要出现 AI 口吻、提示词痕迹、学院派套话或模板腔。",
    "文章必须做到：开头抓人、小标题清晰、段落短、节奏强、观点明确、带一点情绪张力，但不要浮夸。",
    "不要写成行业报告，要写成公众号作者在和真实读者说话。",
    "禁止使用明显 AI/报告腔连接词：例如“首先、其次、最后、总的来说、综上所述、不难发现、值得一提的是、由此可见”。",
    "不要写“在这个信息爆炸的时代”“随着时代的发展”这类悬浮开场。",
    "不要编造具体数据、人物发言、用户反馈、机构结论、采访、百分比和案例细节；如果缺少可靠事实，就用趋势判断和经验表达。",
    "不要虚构'小林''老张''某位博主'这类悬浮主人公，不要写小说式开场。",
    "开头前两段必须快速抛出读者熟悉的困境、反差或冲突，不要空泛铺垫。",
    "每个小标题下都要给出一个明确判断，再给解释或建议，不能只有概念复述。",
    "正文中至少给出 1 句适合做高亮金句的话，格式写成【金句】……",
    "多用短段落，每段 1-3 句；尽量减少大段列表，除非在行动建议部分。",
    "句子节奏要像真人写作：有长有短，有停顿，有转折，不要每段都一个模子。",
    "正文请尽量使用 `## 小标题` 作为段落分节格式，方便后续自动排版。",
    ...buildTonePromptSections(tone).system,
    scopeInstruction[scope],
    "请严格返回 JSON，不要额外解释。",
  ].join("\n");
}

function buildTonePromptSections(tone: string) {
  const preset = resolveWritingTone(tone);

  return {
    preset,
    system: [
      `本次写作采用「${preset.label}」风格。${preset.description}`,
      `标题策略：${preset.titleStrategy}`,
      `开头方式：${preset.openingStrategy}`,
      `段落节奏：${preset.paragraphRhythm}`,
      `表达方式：${preset.languageStyle}`,
      `情绪纹理：${preset.emotionalTexture}`,
      `结尾方式：${preset.closingStyle}`,
    ],
    user: [
      `目标风格：${preset.label}`,
      `风格说明：${preset.description}`,
      `标题要求：${preset.titleStrategy}`,
      `开头要求：${preset.openingStrategy}`,
      `段落要求：${preset.paragraphRhythm}`,
      `语言要求：${preset.languageStyle}`,
      `情绪要求：${preset.emotionalTexture}`,
      `收束要求：${preset.closingStyle}`,
    ],
  };
}

function buildGenerateUserPrompt(request: AIWriteGenerateRequest) {
  const { topic, settings, articleType, targetReader, tone, draft, scope, domain } = request;
  const tonePrompt = buildTonePromptSections(tone);
  const resolvedDomain = resolveArticleDomain(domain);
  const domainConfig = domainConfigs[resolvedDomain];
  const sections = [
    `任务：生成适合公众号的${scope === "full" ? "完整文章" : scope === "title" ? "标题候选" : scope === "outline" ? "摘要和大纲" : "正文"}`,
    `主题：${topic.title}`,
    `文章领域：${resolvedDomain}`,
    `领域说明：${domainConfig.description}`,
    `领域重点：${domainConfig.writingFocus.join("、")}`,
    `领域提醒：${domainConfig.promptHint}`,
    `推荐角度：${topic.angles.join("；")}`,
    `选题理由：${topic.reason}`,
    `文章类型：${articleType}`,
    `目标读者：${targetReader}`,
    `语气：${tone}`,
    ...tonePrompt.user,
    `账号定位：${settings.accountPosition}`,
    `内容领域：${settings.contentAreas.join("、")}`,
    `读者需求：${settings.readerNeeds}`,
    `禁写：${settings.bannedTopics.join("、") || "无"}`,
    `互动 CTA：${settings.ctaEngage}`,
    scope === "body" || scope === "full"
      ? "正文建议 1200-1800 字，使用 ## 小标题分节。结构建议：1) 开头用真实场景或冲突切入；2) 中段拆 3-4 个核心判断；3) 末尾给出可执行建议和互动收束。"
      : "",
    scope === "body" || scope === "full"
      ? "文风要求：像成熟公众号爆文，不鸡血，不喊口号，但要有传播性。标题、开头、小标题、金句都要让人愿意继续读下去。"
      : "",
    scope === "body" || scope === "full"
      ? "请避免这些常见问题：空话大话、正确废话、泛泛而谈、假案例、假数据、过长段落。"
      : "",
    scope === "body" || scope === "full"
      ? "开头不要写虚构人物故事，优先从读者当下真实处境切入，比如时间不够、选题焦虑、产出内卷、增长停滞。"
      : "",
    scope === "body" || scope === "full"
      ? "结尾最好给 2-3 条可执行建议，方便读者收藏或转发。"
      : "",
    draft?.title ? `当前标题：${draft.title}` : "",
    draft?.summary ? `当前摘要：${draft.summary}` : "",
    draft?.outline?.length ? `当前大纲：${draft.outline.join(" | ")}` : "",
    draft?.body ? `当前正文参考：${draft.body.slice(0, 600)}` : "",
    "请只返回 JSON，格式必须是：{\"title\":\"\",\"titleCandidates\":[],\"selectedAngle\":\"\",\"summary\":\"\",\"outline\":[],\"body\":\"\"}",
    "titleCandidates 输出 5 个标题，避免标题党，但要有点击欲和明确价值感。",
    "标题更像公众号：可用'为什么'、'正在'、'不是…而是…'、'真正拉开差距的'这类结构，但不要低俗夸张。",
    "摘要控制在 80-140 字，像导读，不像摘要报告。",
    "大纲输出 5-7 条，每条都是可直接当小标题的短句。",
  ].filter(Boolean);

  return sections.join("\n");
}

function buildPlanningSystemPrompt(tone: string) {
  return [
    "你是一位资深中文公众号策划编辑，擅长为文章确定最有传播性的标题、摘要和结构。",
    "请用简体中文输出，像成熟公众号编辑，不要报告腔。",
    "不要编造事实、数据、案例和人物故事。",
    "标题要有点击欲但不夸张；摘要要像导读；大纲要能直接拿来写正文。",
    ...buildTonePromptSections(tone).system,
    "请严格返回 JSON，不要额外解释。",
  ].join("\n");
}

function buildPlanningUserPrompt(request: AIWriteGenerateRequest) {
  const { topic, settings, articleType, targetReader, tone, draft, domain } = request;
  const tonePrompt = buildTonePromptSections(tone);
  const resolvedDomain = resolveArticleDomain(domain);
  const domainConfig = domainConfigs[resolvedDomain];

  return [
    "任务：为一篇公众号文章生成标题、摘要和写作结构。",
    `主题：${topic.title}`,
    `文章领域：${resolvedDomain}`,
    `领域说明：${domainConfig.description}`,
    `领域重点：${domainConfig.writingFocus.join("、")}`,
    `领域提醒：${domainConfig.promptHint}`,
    `推荐角度：${topic.angles.join("；")}`,
    `选题理由：${topic.reason}`,
    `文章类型：${articleType}`,
    `目标读者：${targetReader}`,
    `语气：${tone}`,
    ...tonePrompt.user,
    `账号定位：${settings.accountPosition}`,
    `内容领域：${settings.contentAreas.join("、")}`,
    `读者需求：${settings.readerNeeds}`,
    `互动 CTA：${settings.ctaEngage}`,
    "标题必须更像公众号：明确价值点、带判断感，避免空泛。",
    "标题不要假大空，不要像产品介绍，也不要像公文汇报。",
    "摘要控制在 80-140 字，像导读。",
    "大纲输出 5-7 条，每一条都要像真正的小标题，能支撑正文展开。",
    "小标题不要只写“为什么重要”“给我们的启示”这种空泛句，要更具体、更像公众号真实目录。",
    draft?.title ? `当前标题参考：${draft.title}` : "",
    draft?.summary ? `当前摘要参考：${draft.summary}` : "",
    draft?.outline?.length ? `当前大纲参考：${draft.outline.join(" | ")}` : "",
    "请只返回 JSON：{\"title\":\"\",\"titleCandidates\":[],\"selectedAngle\":\"\",\"summary\":\"\",\"outline\":[],\"body\":\"\"}",
  ].filter(Boolean).join("\n");
}

function buildDraftingSystemPrompt(tone: string) {
  return [
    "你是一位资深中文公众号作者，擅长把已有结构写成可直接发布的成稿。",
    "请用简体中文输出，像成熟公众号作者在和读者说话，不要报告腔，不要模板腔。",
    "禁止使用“首先、其次、最后、总的来说、综上所述、不难发现、值得一提的是”这类强 AI 味连接词。",
    "不要编造具体数据、采访、案例、机构结论、人物故事和百分比。",
    "开头前两段必须迅速进入读者痛点或冲突。",
    "每个小标题下都要先给判断，再给解释、拆解或建议。",
    "至少写出 1 句【金句】。",
    "多用短段落，每段 1-3 句，减少冗长铺垫。",
    "不要每段都写得四平八稳，允许有一点口语停顿和自然转折，但不要油腻。",
    ...buildTonePromptSections(tone).system,
    "请严格返回 JSON，不要额外解释。",
  ].join("\n");
}

function buildDraftingUserPrompt(
  request: AIWriteGenerateRequest,
  plan: AIArticlePlan,
) {
  const tonePrompt = buildTonePromptSections(request.tone);
  const resolvedDomain = resolveArticleDomain(request.domain);
  const domainConfig = domainConfigs[resolvedDomain];

  return [
    "任务：基于既定标题和结构，写出完整公众号正文。",
    `主题：${request.topic.title}`,
    `文章领域：${resolvedDomain}`,
    `领域说明：${domainConfig.description}`,
    `领域重点：${domainConfig.writingFocus.join("、")}`,
    `领域提醒：${domainConfig.promptHint}`,
    `文章类型：${request.articleType}`,
    `目标读者：${request.targetReader}`,
    `语气：${request.tone}`,
    ...tonePrompt.user,
    `账号定位：${request.settings.accountPosition}`,
    `互动 CTA：${request.settings.ctaEngage}`,
    `最终标题：${plan.title}`,
    `摘要：${plan.summary}`,
    `写作角度：${plan.selectedAngle}`,
    `大纲：${plan.outline.join(" | ")}`,
    "正文建议 1200-1800 字，使用 ## 小标题分节。",
    "正文不要像在完成任务，不要机械平均展开每个小标题；重点部分可以多写，次重点可以收一点。",
    "结尾给出 2-3 条可执行建议，并自然收束到互动 CTA。",
    request.draft?.body ? `已有正文参考：${request.draft.body.slice(0, 600)}` : "",
    "请只返回 JSON：{\"title\":\"\",\"titleCandidates\":[],\"selectedAngle\":\"\",\"summary\":\"\",\"outline\":[],\"body\":\"\"}",
  ].filter(Boolean).join("\n");
}

function buildTransformInstruction(action: AITransformAction) {
  if (action === "rewrite") {
    return "在不改变核心观点的前提下，重写这段内容，让表达更像成熟公众号作者，节奏更好、信息密度更高。";
  }

  if (action === "expand") {
    return "在保持原有观点的前提下扩写这段内容，补充解释、例子、转折和行动建议，让内容更完整。";
  }

  return "在保留核心观点和关键信息的前提下缩写这段内容，删掉空话套话，让节奏更紧凑。";
}

function buildTransformSystemPrompt(tone: string) {
  return [
    "你是一位资深公众号编辑，专门负责润色和改写文章片段。",
    "请输出适合直接粘贴回公众号文章的中文文本。",
    "不要加引号、不要解释改动、不要列点说明。",
    "改写后不要有 AI 味，不要出现“总的来说”“不难发现”“值得一提的是”这类模板连接词。",
    ...buildTonePromptSections(tone).system,
    "请严格返回 JSON，不要额外解释。",
  ].join("\n");
}

function buildTransformUserPrompt(request: AIWriteTransformRequest) {
  const sourceText = request.selectedText?.trim() || request.body.trim();
  const tonePrompt = buildTonePromptSections(request.tone);
  const tonePreset = resolveWritingTone(request.tone);
  const resolvedDomain = resolveArticleDomain(request.domain);
  const domainConfig = domainConfigs[resolvedDomain];

  return [
    "任务：改写公众号文章片段",
    `动作：${request.action}`,
    `要求：${buildTransformInstruction(request.action)}`,
    `主题：${request.topic.title}`,
    `文章领域：${resolvedDomain}`,
    `领域说明：${domainConfig.description}`,
    `领域重点：${domainConfig.writingFocus.join("、")}`,
    `角度：${request.topic.angles.join("；")}`,
    `文章类型：${request.articleType}`,
    `目标读者：${request.targetReader}`,
    `语气：${request.tone}`,
    ...tonePrompt.user,
    `账号定位：${request.settings.accountPosition}`,
    `互动 CTA：${request.settings.ctaEngage}`,
    "改写方向：更像公众号爆文作者，而不是报告写作者。多用短句，保留判断感和节奏感。",
    `本次改写重点：${tonePreset.transformFocus}`,
    "不要编造新事实、案例、数据、采访和引用。",
    "不要为了显得高级而堆抽象词，优先把话说明白。",
    request.draft?.title ? `文章标题：${request.draft.title}` : "",
    request.draft?.summary ? `文章摘要：${request.draft.summary}` : "",
    `待处理文本：${sourceText}`,
    "请只返回 JSON：{\"transformedText\":\"\"}",
  ].filter(Boolean).join("\n");
}

async function callCompatibleModel({
  systemPrompt,
  userPrompt,
  temperature,
  task,
}: {
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  task: AIModelTask;
}) {
  const config = getAIProviderConfig();
  const model = getAIModelForTask(task);

  if (!config.configured) {
    throw new Error("AI model is not configured");
  }

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  const payload = (await response.json().catch(() => null)) as unknown;
  const content = extractMessageContent(payload);

  if (!response.ok) {
    const errorMessage =
      (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "object" && payload.error && "message" in payload.error && typeof payload.error.message === "string"
        ? payload.error.message
        : "") || `AI request failed with status ${response.status}`;
    throw new Error(errorMessage);
  }

  if (!content) {
    throw new Error("AI response is empty");
  }

  return {
    config,
    model,
    content,
  };
}

function mergeGeneratedResult(request: AIWriteGenerateRequest, rawText: string): AIWriteResult {
  const base = createBaseResult(request.topic, request.settings, request.draft);
  const parsed = extractJsonPayload(rawText);
  const existingBody = request.draft?.body?.trim() ?? "";
  const existingSummary = request.draft?.summary?.trim() ?? base.summary;
  const existingOutline = request.draft?.outline?.filter(Boolean).length ? request.draft.outline : [];

  const titleCandidates = polishTitleCandidates(normalizeStringList(parsed.titleCandidates, base.titleCandidates));
  const title = polishTitleText(normalizeText(parsed.title, titleCandidates[0] || base.title));
  const selectedAngle = normalizeSelectedAngle(parsed.selectedAngle, base.selectedAngle);
  const summary = polishSummaryText(normalizeText(parsed.summary, base.summary));
  const outline = polishOutlineItems(normalizeStringList(parsed.outline, base.outline));
  const body = polishBodyText(normalizeBodyText(parsed.body, base.body));

  if (request.scope === "title") {
    return {
      ...base,
      title,
      titleCandidates: titleCandidates.length ? titleCandidates : polishTitleCandidates(base.titleCandidates),
      selectedAngle,
      summary: polishSummaryText(existingSummary),
      outline: polishOutlineItems(existingOutline),
      body: existingBody,
    };
  }

  if (request.scope === "outline") {
    return {
      ...base,
      selectedAngle,
      summary,
      outline: outline.length ? outline : polishOutlineItems(base.outline),
      body: existingBody,
    };
  }

  return {
    title,
    titleCandidates: titleCandidates.length ? titleCandidates : polishTitleCandidates(base.titleCandidates),
    selectedAngle,
    summary,
    outline: outline.length ? outline : base.outline,
    body,
  };
}

function mergePlanningResult(request: AIWriteGenerateRequest, rawText: string): AIArticlePlan {
  const base = createBaseResult(request.topic, request.settings, request.draft);
  const parsed = extractJsonPayload(rawText);

  const titleCandidates = polishTitleCandidates(normalizeStringList(parsed.titleCandidates, base.titleCandidates));
  const title = polishTitleText(normalizeText(parsed.title, titleCandidates[0] || base.title));
  const selectedAngle = normalizeSelectedAngle(parsed.selectedAngle, base.selectedAngle);
  const summary = polishSummaryText(normalizeText(parsed.summary, base.summary));
  const outline = polishOutlineItems(normalizeStringList(parsed.outline, base.outline));

  return {
    title,
    titleCandidates: titleCandidates.length ? titleCandidates : polishTitleCandidates(base.titleCandidates),
    selectedAngle,
    summary,
    outline: outline.length ? outline : polishOutlineItems(base.outline),
    body: request.draft?.body?.trim() ?? "",
  };
}

function mergeBodyWithPlan(rawText: string, plan: AIArticlePlan): AIWriteResult {
  const parsed = extractJsonPayload(rawText);
  const titleCandidates = polishTitleCandidates(normalizeStringList(parsed.titleCandidates, plan.titleCandidates));
  const outline = polishOutlineItems(normalizeStringList(parsed.outline, plan.outline));

  return {
    title: polishTitleText(normalizeText(parsed.title, plan.title)),
    titleCandidates: titleCandidates.length ? titleCandidates : polishTitleCandidates(plan.titleCandidates),
    selectedAngle: normalizeSelectedAngle(parsed.selectedAngle, plan.selectedAngle),
    summary: polishSummaryText(normalizeText(parsed.summary, plan.summary)),
    outline: outline.length ? outline : polishOutlineItems(plan.outline),
    body: polishBodyText(normalizeBodyText(parsed.body, plan.body)),
  };
}

export async function generateWechatArticle(request: AIWriteGenerateRequest) {
  if (request.scope === "body" || request.scope === "full") {
    const planningResponse = await callCompatibleModel({
      systemPrompt: buildPlanningSystemPrompt(request.tone),
      userPrompt: buildPlanningUserPrompt(request),
      temperature: 0.65,
      task: "outline",
    });

    const plan = mergePlanningResult(request, planningResponse.content);

    const draftingResponse = await callCompatibleModel({
      systemPrompt: buildDraftingSystemPrompt(request.tone),
      userPrompt: buildDraftingUserPrompt(request, plan),
      temperature: 0.62,
      task: request.scope,
    });

    return {
      provider: draftingResponse.config.provider,
      model: `${planningResponse.model} -> ${draftingResponse.model}`,
      result: mergeBodyWithPlan(draftingResponse.content, plan),
    };
  }

  const { config, model, content } = await callCompatibleModel({
    systemPrompt: buildGenerateSystemPrompt(request.scope, request.tone),
    userPrompt: buildGenerateUserPrompt(request),
    temperature: request.scope === "title" ? 0.72 : 0.64,
    task: request.scope,
  });

  return {
    provider: config.provider,
    model,
    result: mergeGeneratedResult(request, content),
  };
}

export async function transformWechatText(request: AIWriteTransformRequest) {
  const { config, model, content } = await callCompatibleModel({
    systemPrompt: buildTransformSystemPrompt(request.tone),
    userPrompt: buildTransformUserPrompt(request),
    temperature: 0.7,
    task: "transform",
  });

  const parsed = extractJsonPayload(content);
  const sourceText = request.selectedText?.trim() || request.body.trim();
  const transformedText = polishBodyText(normalizeText(parsed.transformedText, content.trim() || sourceText));

  return {
    provider: config.provider,
    model,
    transformedText,
  };
}

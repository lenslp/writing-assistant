import {
  calculateWords,
  createBody,
  createOutline,
  createSummary,
  createTitleCandidates,
  type AppSettings,
  type TopicSuggestion,
} from "./app-data";
import { domainConfigs, resolveArticleDomain } from "./content-domains";
import { resolveWritingTone } from "./writing-tones";
import { decodeEscapedStructuralText, normalizeStructuredBodyText } from "./body-structure";
import { readAIProviderSecret, type AIProviderSecret } from "./app-config-db";
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
type ModelSelection = {
  primary: string;
  fallback?: string;
};
type RuntimeModelConfig = Partial<AIProviderSecret> | null;

const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_MODEL = "qwen3.5-plus";
const DEFAULT_FAST_MODEL = "qwen-turbo";
const MODEL_REQUEST_MAX_RETRIES = 1;
const MAX_TITLE_LENGTH = 30;
const MAX_SUMMARY_LENGTH = 120;
const SOURCE_CONTEXT_SUMMARY_LIMIT = 140;
const SOURCE_CONTEXT_PLANNING_CONTENT_LIMIT = 900;
const SOURCE_CONTEXT_DRAFTING_CONTENT_LIMIT = 1400;
const MIN_GENERATED_BODY_WORDS = 650;
const MIN_GENERATED_SUMMARY_WORDS = 36;
const MIN_GENERATED_OUTLINE_ITEMS = 4;
const MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*]\((?:data:[^)]+|[^)]+)\)/g;
const IMAGE_PLACEHOLDER_PATTERN = /\[图片占位[^\]]*]/g;
const AI_TONE_PREFIX_PATTERNS = [
  /^(总的来说|总而言之|综上所述|不难发现|值得一提的是|由此可见|某种程度上|从某种意义上说|客观来看|事实上|换句话说|简单来说|需要明确的是|不可否认)\s*[，,：:]?/,
  /^(首先|其次|再次|最后|另外|此外|同时)\s*[，,、：:]?/,
  /^(更重要的是|更值得注意的是|真正值得关注的是|真正需要警惕的是|需要提醒的是|本质上看|如果把话说得更直接一点|如果说得更直接一点|换个角度看)\s*[，,：:]?/,
] as const;
const AI_TONE_INLINE_REPLACEMENTS = [
  { pattern: /在信息爆炸的时代/g, replacement: "现在" },
  { pattern: /在这个信息过载的时代/g, replacement: "现在" },
  { pattern: /随着时代的发展/g, replacement: "这几年" },
  { pattern: /值得注意的是/g, replacement: "" },
  { pattern: /需要注意的是/g, replacement: "" },
  { pattern: /需要明确的是/g, replacement: "" },
  { pattern: /我们不难发现/g, replacement: "" },
  { pattern: /总的来说/g, replacement: "" },
  { pattern: /总而言之/g, replacement: "" },
  { pattern: /综上所述/g, replacement: "" },
  { pattern: /某种程度上/g, replacement: "" },
  { pattern: /从某种意义上说/g, replacement: "" },
  { pattern: /客观来看/g, replacement: "" },
  { pattern: /真正值得关注的是/g, replacement: "更值得看的，是" },
  { pattern: /更值得注意的是/g, replacement: "更关键的是" },
  { pattern: /归根结底/g, replacement: "说到底" },
  { pattern: /本质上看/g, replacement: "说到底" },
] as const;
const AI_TITLE_PREFIX_PATTERNS = [
  /^(一文看懂|带你看懂|快速看懂|深度拆解|深度解读|完整解读|全面解析|全景观察|讲透|说透)\s*[：:｜|]\s*/i,
] as const;
const AI_TITLE_SUFFIX_PATTERNS = [
  /\s*[：:｜|]\s*(背后的逻辑|背后的真相|底层逻辑|方法论|启示录)$/i,
] as const;
const AI_TITLE_BANNED_PATTERNS = [
  /一文看懂|带你看懂|快速看懂|深度拆解|深度解读|全面解析|完整解读|全景观察/i,
  /底层逻辑|方法论|启示录|终极答案|最终答案|完全指南/i,
  /真正拉开差距的|值得所有人|建议所有人|请务必|一定要看/i,
  /真正值得看的是什么|很多人可能都看反了|最该关注什么|背后更大的变化是/i,
] as const;
const TITLE_PLATFORM_NOISE_PATTERNS = [
  /^(围绕|关于)?\s*(知乎|微博|抖音|百度|头条|今日头条)\s*(热榜|热搜)?[，、：:\-｜|]?\s*/i,
  /^(知乎|微博|抖音|百度|头条|今日头条)(上|里)?(这条|这个|这波)?\s*/i,
  /\b(知乎|微博|抖音|百度|头条|今日头条)(热榜|热搜)?\b/gi,
  /\b(热榜|热搜)\b/gi,
] as const;
const AIISH_SENTENCE_PATTERNS = [
  /^(这篇文章会|本文会|这篇内容会|今天这篇内容|接下来我们就来|下面我们就来)/,
  /^(如果你也在持续做|如果你的账号想长期输出)/,
  /^(本文|这篇文章|这篇内容)(主要|试图|想要|会从|将从)/,
] as const;
const META_WRITING_PATTERNS = [
  /这(篇|类)文章(最适合|适合|最好|可以|建议|需要)/,
  /具体写作时/,
  /写作过程中/,
  /正文(最好|建议|可以|适合)围绕/,
  /中段(围绕|重点展开)/,
  /结尾再落到/,
  /最后别忘了/,
  /可以先用一个真实问题开头/,
  /把读者带进情境/,
  /从内容结构上看/,
  /相比单纯追热/,
] as const;
const PLACEHOLDER_OUTLINE_PATTERNS = [
  /^(开头|中段|结尾|总结|核心变化|影响判断|机会与风险|实操拆解|风险提醒)[:：]/m,
  /给读者一个明确行动建议/,
] as const;
const SUMMARY_TEMPLATE_PATTERNS = [
  /^(这篇文章将|本文将|这篇内容将)/,
  /结合你的账号定位/,
  /帮助读者快速/,
  /从 .+ 的角度切入/,
] as const;
const CONSISTENCY_STOP_WORDS = new Set([
  "为什么",
  "什么",
  "这波",
  "这件事",
  "这个",
  "今天",
  "再次",
  "正式",
  "真的",
  "到底",
  "普通人",
  "热搜",
  "热榜",
  "微博",
  "知乎",
  "抖音",
  "百度",
  "头条",
  "今日头条",
  "发布",
  "上市",
  "回应",
  "进入",
  "开始",
  "继续",
  "一个",
  "因为",
  "所以",
]);
const SPECIFICITY_PATTERNS = [
  /\d/,
  /[A-Za-z][A-Za-z0-9_.-]{2,}/,
  /“[^”]{2,}”|「[^」]{2,}」/,
  /公司|平台|产品|用户|团队|政策|工具|模型|学校|家长|价格|成本|融资|漏洞|账号|门店|行业|社区|监管/,
] as const;

/**
 * Unified writing rule registry.
 *
 * Each rule appears exactly once, tagged with a scope that determines which
 * prompt phase includes it.  This replaces the former seven separate
 * `build*Rules()` helpers and eliminates the ~60-rule duplication that existed
 * when both system and user prompts injected the same lists.
 *
 * Scopes:
 *   "universal" — included in every phase (planning / drafting / generate / transform)
 *   "planning"  — planning + generate (title, summary, outline)
 *   "drafting"  — drafting + generate (body writing)
 */
type RuleScope = "universal" | "planning" | "drafting";

const CORE_WRITING_RULES: ReadonlyArray<{ scope: RuleScope; text: string }> = [
  // ── universal: 通用写作规范 ──────────────────────────────
  { scope: "universal", text: "把自己当成一个长期写公众号的人，不是内容生产机器人。写法要像编辑来回改过的成稿：有主次、有轻重、有判断，不追求每段一样完整。" },
  { scope: "universal", text: "少写抽象空词（赋能、价值、趋势、认知升级、底层逻辑、方法论、启示），能写具体处境就写具体处境。" },
  { scope: "universal", text: "不要自我介绍文章结构，不要写“本文将”“这篇文章会”“接下来我们聊”这种提示式句子。" },
  { scope: "universal", text: "禁止使用明显 AI/报告腔连接词：首先、其次、最后、总的来说、综上所述、不难发现、值得一提的是、由此可见。" },
  { scope: "universal", text: "不要编造具体数据、人物发言、采访、机构结论、案例细节和百分比；事实不足时用因果判断和经验推理补足。" },
  { scope: "universal", text: "文章必须给出一个贯穿全文的核心判断，至少写一个“表面看是 A，实际更关键的是 B”的反差，但不要用“底层逻辑”“本质上”等模板词。" },
  { scope: "universal", text: "深度不是堆术语。复杂概念先翻译成人话，再解释它为什么重要。默认读者不是行业从业者，写法要让普通读者顺着读懂。" },
  { scope: "universal", text: "语气像见过很多类似事情的朋友在帮读者把复杂问题讲明白，不要像评论员发言或咨询报告。允许口语化停顿和自然转折，但不要油腻。" },
  { scope: "universal", text: "每个重要观点都要往下追问一层：为什么现在发生、谁会被影响、代价是什么、接下来会改变什么。必须写出边界感：不该被过度解读的地方和真正需要关注的地方。" },

  // ── planning: 标题 / 摘要 / 大纲阶段 ──────────────────
  { scope: "planning", text: "标题要像编辑最后拍板的成品，优先使用具体对象、真实场景、冲突或后果。避免过于工整的对仗句和大词堆叠，宁可口语、具体一点。" },
  { scope: "planning", text: "摘要不要以“这篇文章”“本文”“今天聊聊”开头，直接进入判断、场景或问题，像转发前的一段导语。" },
  { scope: "planning", text: "大纲不能只是“背景-影响-建议”的流水账，至少 2 个小标题要像判断句而非栏目名，每条都能写出信息增量。" },

  // ── drafting: 正文阶段 ────────────────────────────────
  { scope: "drafting", text: "开头不要解释文章要讲什么，直接进入读者当下的处境、事件冲突或核心判断。不要虚构人物故事，不要写“在这个信息爆炸的时代”这类悬浮开场。" },
  { scope: "drafting", text: "同一篇文章里小标题句式要有变化，有判断句也有场景句。每段都应推动信息、判断或情绪，少写万能总结句。" },
  { scope: "drafting", text: "多用短段落（每段 1-3 句），句子节奏有长有短、有停顿有转折。重要部分多写，次要部分收着写，不要机械平均展开。" },
  { scope: "drafting", text: "尽量把抽象变化改写成具体影响：这对普通人、创作者、家长、用户、消费者意味着什么。用因果链和现实处境解释，不用黑话。" },
  { scope: "drafting", text: "结尾不要像社论收口，更像朋友把话说透后给一个清楚提醒，附 2-3 条可执行建议。" },
] as const;

function getRulesForPhase(phase: "planning" | "drafting" | "generate" | "transform"): string[] {
  return CORE_WRITING_RULES
    .filter((rule) => {
      if (rule.scope === "universal") return true;
      if (phase === "generate" || phase === "transform") return true;
      return rule.scope === phase;
    })
    .map((rule) => rule.text);
}

function getEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

function detectProvider(baseUrl: string) {
  if (baseUrl.includes("dashscope") || baseUrl.includes("aliyuncs")) return "Qwen / DashScope";
  if (baseUrl.includes("anthropic")) return "Claude / Anthropic";
  if (baseUrl.includes("openrouter")) return "OpenRouter";
  if (baseUrl.includes("deepseek")) return "DeepSeek";
  if (baseUrl.includes("siliconflow")) return "SiliconFlow";
  if (baseUrl.includes("openai")) return "OpenAI";
  return "OpenAI Compatible";
}

function getErrorDetails(error: unknown): string {
  if (error instanceof Error) {
    const cause =
      "cause" in error && error.cause
        ? ` ${getErrorDetails(error.cause)}`
        : "";
    return `${error.name} ${error.message}${cause}`.trim();
  }

  return String(error);
}

function condenseErrorDetails(error: unknown) {
  return getErrorDetails(error)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function isRetryableModelError(error: unknown) {
  const details = getErrorDetails(error).toLowerCase();

  return (
    details.includes("fetch failed") ||
    details.includes("connect timeout") ||
    details.includes("timeouterror") ||
    details.includes("aborted due to timeout") ||
    details.includes("timed out") ||
    details.includes("headers timeout") ||
    details.includes("body timeout") ||
    details.includes("socket hang up") ||
    details.includes("networkerror") ||
    details.includes("enotfound") ||
    details.includes("econnreset") ||
    details.includes("eai_again") ||
    details.includes("und_err")
  );
}

function formatModelNetworkError(error: unknown, config: ProviderConfig, model: string) {
  if (!isRetryableModelError(error)) {
    return null;
  }

  return `AI 模型接口连接失败，请检查当前网络、代理和 AI_BASE_URL 配置（${config.provider} / ${model}）。原始错误：${condenseErrorDetails(error)}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getModelRequestTimeoutMs(task: AIModelTask) {
  if (task === "body" || task === "full") {
    return 180000;
  }

  return 90000;
}

function toErrorCause(error: unknown) {
  return error instanceof Error ? error : undefined;
}

export async function getAIProviderConfig(): Promise<ProviderConfig> {
  const storedConfig = await readAIProviderSecret().catch((error) => {
    console.error("Failed to read AI provider config:", error);
    return null;
  });
  const apiKey = storedConfig?.apiKey || getEnv("AI_API_KEY") || getEnv("OPENAI_API_KEY");
  const baseUrl = (storedConfig?.baseUrl || getEnv("AI_BASE_URL") || getEnv("OPENAI_BASE_URL") || DEFAULT_BASE_URL).replace(/\/+$/, "");

  return {
    configured: Boolean(apiKey),
    apiKey,
    baseUrl,
    provider: detectProvider(baseUrl),
  };
}

function getTaskSpecificModel(task: AIModelTask, runtimeConfig: RuntimeModelConfig) {
  const upperTask = task.toUpperCase();
  const runtimeTaskModel =
    task === "title" || task === "outline" || task === "transform"
      ? runtimeConfig?.fastModel
      : runtimeConfig?.longformModel;

  return (
    runtimeTaskModel ||
    getEnv(`AI_MODEL_${upperTask}`) ||
    getEnv(`OPENAI_MODEL_${upperTask}`) ||
    ""
  );
}

function getExplicitFastModel(runtimeConfig: RuntimeModelConfig) {
  return runtimeConfig?.fastModel || getEnv("AI_MODEL_FAST") || getEnv("OPENAI_MODEL_FAST") || "";
}

function getExplicitLongformModel(runtimeConfig: RuntimeModelConfig) {
  return runtimeConfig?.longformModel || getEnv("AI_MODEL_LONGFORM") || getEnv("OPENAI_MODEL_LONGFORM") || "";
}

async function getAIModelSelectionForTask(task: AIModelTask): Promise<ModelSelection> {
  const runtimeConfig = await readAIProviderSecret().catch((error) => {
    console.error("Failed to read AI provider model selection:", error);
    return null;
  });
  const directTaskModel = getTaskSpecificModel(task, runtimeConfig);
  if (directTaskModel) return { primary: directTaskModel };

  const generalModel = runtimeConfig?.model || getEnv("AI_MODEL") || getEnv("OPENAI_MODEL") || "";

  if (task === "title" || task === "outline" || task === "transform") {
    const explicitFastModel = getExplicitFastModel(runtimeConfig);
    const fastModel = explicitFastModel || DEFAULT_FAST_MODEL;

    return {
      primary: explicitFastModel || generalModel || DEFAULT_FAST_MODEL,
      fallback:
        !explicitFastModel && generalModel && generalModel !== fastModel
          ? fastModel
          : undefined,
    };
  }

  return {
    primary: getExplicitLongformModel(runtimeConfig) || generalModel || DEFAULT_MODEL,
  };
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
  const text = decodeEscapedStructuralText(normalizeText(value, fallback));

  return normalizeStructuredBodyText(
    text
      .replace(/\n{3,}/g, "\n\n")
      .replace(/^(###\s+)/gm, "## ")
      .replace(/[ \t]+\n/g, "\n"),
  );
}

function polishTitleText(text: string) {
  let next = text
    .replace(/[！!]{2,}/g, "！")
    .replace(/[？?]{2,}/g, "？")
    .replace(/^(在这个|在当下|在如今)\s*/g, "");

  for (const pattern of AI_TITLE_PREFIX_PATTERNS) {
    next = next.replace(pattern, "");
  }

  for (const pattern of AI_TITLE_SUFFIX_PATTERNS) {
    next = next.replace(pattern, "");
  }

  for (const pattern of TITLE_PLATFORM_NOISE_PATTERNS) {
    next = next.replace(pattern, "");
  }

  return next
    .replace(/([：:｜|\-])\1+/g, "$1")
    .replace(/^[：:｜|\-\s]+/, "")
    .replace(/[：:｜|\-\s]+$/, "")
    .replace(/\s{2,}/g, " ")
    .slice(0, MAX_TITLE_LENGTH)
    .replace(/[：:｜|\-\s，。、；！？,.!?]+$/g, "")
    .trim();
}

function polishSummaryText(text: string) {
  return text
    .replace(/^(这篇文章将|本文将|这篇内容将)(围绕|从|结合)/, "这篇文章会")
    .replace(/^(这篇文章会|本文会|这篇内容会|今天这篇内容|这一篇想聊的是)\s*/g, "")
    .replace(/^(今天想聊聊|我们今天聊聊|先聊聊)\s*/g, "")
    .replace(/^(接下来我们就来|下面我们就来)\s*/g, "")
    .replace(/^(摘要|导语)[:：]\s*/g, "")
    .replace(/，?为你提供[^，。]{4,20}(参考|建议|启发)/g, "")
    .replace(/(带你|帮你)(快速)?(看懂|理解|搞懂|掌握)/g, "讲清")
    .replace(/^(围绕|关于).{0,18}(这个话题|这件事)[，,]?\s*/g, "")
    .replace(/\s+/g, " ")
    .slice(0, MAX_SUMMARY_LENGTH)
    .replace(/[：:｜|\-\s，。、；！？,.!?]+$/g, "")
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

function shouldDropAiishSentence(paragraph: string) {
  const trimmed = paragraph.trim();
  return AIISH_SENTENCE_PATTERNS.some((pattern) => pattern.test(trimmed));
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
    .map((item) => item.replace(/^\d+[.)、]\s*/, "").trim())
    .map((item) => item.replace(/^(开头|中段|结尾|总结|方法|建议)[:：]/, "").trim())
    .filter(Boolean)
    .slice(0, 7);
}

function polishTitleCandidates(items: string[]) {
  const cleaned = Array.from(new Set(items.map((item) => polishTitleText(item)).filter(Boolean)));
  return diversifyTitleCandidates(cleaned).slice(0, 5);
}

function detectTitleArchetype(title: string) {
  if (/[？?]$/.test(title) || /为什么|怎么|凭什么|到底|究竟/.test(title)) return "question";
  if (/不是.+而是|别再|先别|很多人都/.test(title)) return "contrast";
  if (/普通人|打工人|创作者|家长|年轻人|中年人|用户|老板/.test(title)) return "audience";
  if (/正在|开始|越来越|已经|突然|这波|这件事/.test(title)) return "trend";
  if (/会不会|意味着|说明了|最该关注/.test(title)) return "judgment";
  return "statement";
}

function scoreTitleNaturalness(title: string) {
  let score = 0;
  const length = title.replace(/\s+/g, "").length;

  if (length >= 12 && length <= 22) score += 4;
  else if (length >= 9 && length <= 26) score += 2;
  else if (length <= MAX_TITLE_LENGTH) score += 0;
  else score -= 1;

  if (!/[：:｜|]/.test(title)) score += 1;
  if (/[？?]$/.test(title)) score += 1;
  if (/普通人|打工人|家长|创作者|用户/.test(title)) score += 1;
  if (/别只盯着|如果只把|真正会变的是|更该关心|更容易看漏/.test(title)) score += 1;

  AI_TITLE_BANNED_PATTERNS.forEach((pattern) => {
    if (pattern.test(title)) score -= 4;
  });

  if (/逻辑|方法|趋势拆解|综合观察|专业|深度|启示|信号|变量|真相|密码/.test(title)) score -= 1;
  if (/背后的|意味着什么|给所有人|值得关注|最该关注|看反了/.test(title)) score -= 2;
  if (/^关于|聊聊|说说/.test(title)) score -= 1;
  if (length > 24) score -= 1;

  return score;
}

function diversifyTitleCandidates(items: string[]) {
  const grouped = new Map<string, string[]>();

  items.forEach((item) => {
    const archetype = detectTitleArchetype(item);
    const group = grouped.get(archetype) ?? [];
    group.push(item);
    grouped.set(archetype, group);
  });

  grouped.forEach((group, key) => {
    grouped.set(
      key,
      [...group].sort((left, right) => scoreTitleNaturalness(right) - scoreTitleNaturalness(left)),
    );
  });

  const diversified: string[] = [];
  const keys = ["question", "judgment", "contrast", "audience", "trend", "statement"];

  keys.forEach((key) => {
    const next = grouped.get(key)?.shift();
    if (next) diversified.push(next);
  });

  const leftovers = Array.from(grouped.values())
    .flat()
    .sort((left, right) => scoreTitleNaturalness(right) - scoreTitleNaturalness(left));

  return Array.from(new Set([...diversified, ...leftovers]));
}

function selectPrimaryTitle(preferredTitle: string, titleCandidates: string[], fallbackTitle: string) {
  const candidates = Array.from(
    new Set([preferredTitle, ...titleCandidates, fallbackTitle].map((item) => polishTitleText(item)).filter(Boolean)),
  );

  return candidates.sort((left, right) => scoreTitleNaturalness(right) - scoreTitleNaturalness(left))[0] ?? fallbackTitle;
}

function getTitleCandidateDiversityIssue(titleCandidates: string[], topicTitle: string) {
  const normalized = Array.from(new Set(titleCandidates.map((item) => item.trim()).filter(Boolean)));
  if (normalized.length < 4) {
    return "标题候选太少，句式不够分散，请重新生成。";
  }

  if (normalized.some((item) => item.replace(/\s+/g, "").length > MAX_TITLE_LENGTH)) {
    return `标题过长，请控制在 ${MAX_TITLE_LENGTH} 字内。`;
  }

  const archetypeCount = new Set(normalized.map((item) => detectTitleArchetype(item))).size;
  if (archetypeCount < 2) {
    return "标题候选句式过于单一，请重新生成。";
  }

  const repeatedLeadCount = normalized.filter((item) =>
    item.startsWith("别把") || item.startsWith("为什么") || item.startsWith("关于") || item.startsWith(topicTitle),
  ).length;
  if (archetypeCount < 3 && repeatedLeadCount >= 4) {
    return "标题候选开头太像一套模板，请重新生成。";
  }

  const repeatedTailCount = normalized.filter((item) =>
    /值得看的是什么|看反了|最该关注什么|背后更大的变化是/.test(item),
  ).length;
  if (repeatedTailCount >= 2) {
    return "标题候选尾句太像固定模板，请重新生成。";
  }

  return "";
}

function assertTitleCandidateDiversity(titleCandidates: string[], topicTitle: string) {
  const issue = getTitleCandidateDiversityIssue(titleCandidates, topicTitle);
  if (issue) {
    throw new Error(issue);
  }
}

function resolveSafeTitleCandidates(aiCandidates: string[], fallbackCandidates: string[], topicTitle: string) {
  const normalizedAiCandidates = polishTitleCandidates(aiCandidates);
  if (!getTitleCandidateDiversityIssue(normalizedAiCandidates, topicTitle)) {
    return normalizedAiCandidates;
  }

  const normalizedFallbackCandidates = polishTitleCandidates(fallbackCandidates);
  if (normalizedFallbackCandidates.length) {
    return normalizedFallbackCandidates;
  }

  return normalizedAiCandidates;
}

function assertOutlineDiversity(outline: string[]) {
  const cleaned = outline.map((item) => item.trim()).filter(Boolean);
  if (cleaned.length < 4) return;

  const leadTokens = cleaned.map((item) => item.slice(0, 4));
  const repeatedLeadCount = leadTokens.filter((token, index, items) => items.indexOf(token) !== index).length;
  if (repeatedLeadCount >= 3) {
    throw new Error("大纲句式变化不够，太像同一模板展开，请重新生成。");
  }

  const uniqueOutlineCount = new Set(cleaned.map((item) => item.replace(/[「」“”":：，,。！？!?、\s]/g, ""))).size;
  if (uniqueOutlineCount < Math.max(3, cleaned.length - 1)) {
    throw new Error("大纲条目彼此太像，信息增量不够，请重新生成。");
  }
}

function polishBodyText(text: string) {
  const sections = normalizeStructuredBodyText(text)
    .split(/\n{2,}/)
    .map((section) => section.trim())
    .filter(Boolean)
    .flatMap((section) => {
      const normalized = normalizeParagraphTone(section);
      if (!normalized) return [];
      if (shouldDropAiishSentence(normalized)) return [];
      return splitWechatParagraph(normalized);
    });

  const deduped: string[] = [];

  sections.forEach((section) => {
    const previous = deduped[deduped.length - 1];
    if (!previous || previous !== section) {
      deduped.push(section);
    }
  });

  return normalizeStructuredBodyText(deduped.join("\n\n"));
}

function stripNonArticleText(text: string) {
  return text
    .replace(MARKDOWN_IMAGE_PATTERN, " ")
    .replace(IMAGE_PLACEHOLDER_PATTERN, " ")
    .trim();
}

function hasGeneratedBodyQuality(body: string, fallbackBody = "") {
  const articleText = stripNonArticleText(body);

  if (!articleText) {
    return {
      ok: false,
      reason: "AI 未返回可用正文，本次没有保存为成稿。",
    };
  }

  if (fallbackBody && articleText === stripNonArticleText(fallbackBody)) {
    return {
      ok: false,
      reason: "AI 未生成新的正文内容，本次没有保存为成稿。",
    };
  }

  const wordCount = calculateWords(articleText);
  if (wordCount < MIN_GENERATED_BODY_WORDS) {
    return {
      ok: false,
      reason: `正文只有 ${wordCount} 字，低于成稿要求，请重新生成。`,
    };
  }

  const metaWritingHits = META_WRITING_PATTERNS.filter((pattern) => pattern.test(articleText)).length;
  if (metaWritingHits >= 2) {
    return {
      ok: false,
      reason: "正文仍像写作说明或仿写框架，本次没有保存为成稿。",
    };
  }

  if (PLACEHOLDER_OUTLINE_PATTERNS.some((pattern) => pattern.test(articleText))) {
    return {
      ok: false,
      reason: "正文包含大纲占位词，本次没有保存为成稿。",
    };
  }

  const specificityScore = SPECIFICITY_PATTERNS.reduce((score, pattern) => score + (pattern.test(articleText) ? 1 : 0), 0);
  if (specificityScore < 2) {
    return {
      ok: false,
      reason: "正文缺少足够具体的主体、事实或场景，本次没有保存为成稿。",
    };
  }

  return { ok: true, reason: "" };
}

function assertGeneratedBodyQuality(body: string, fallbackBody = "") {
  const result = hasGeneratedBodyQuality(body, fallbackBody);
  if (!result.ok) {
    throw new Error(result.reason);
  }
}

function hasGeneratedPlanningQuality(
  summary: string,
  outline: string[],
  fallbackSummary = "",
  fallbackOutline: string[] = [],
) {
  const normalizedSummary = summary.trim();
  const dedupedOutline = outline.map((item) => item.trim()).filter(Boolean);

  if (!normalizedSummary) {
    return {
      ok: false,
      reason: "AI 未返回可用摘要，本次没有保存为结构稿。",
    };
  }

  if (fallbackSummary && normalizedSummary === fallbackSummary.trim()) {
    return {
      ok: false,
      reason: "AI 未生成新的摘要内容，本次没有保存为结构稿。",
    };
  }

  const summaryWordCount = calculateWords(normalizedSummary);
  if (summaryWordCount < MIN_GENERATED_SUMMARY_WORDS) {
    return {
      ok: false,
      reason: `摘要只有 ${summaryWordCount} 字，信息量不够，请重新生成。`,
    };
  }

  if (SUMMARY_TEMPLATE_PATTERNS.some((pattern) => pattern.test(normalizedSummary))) {
    return {
      ok: false,
      reason: "摘要仍是模板导语，不像可发布导读，请重新生成。",
    };
  }

  if (dedupedOutline.length < MIN_GENERATED_OUTLINE_ITEMS) {
    return {
      ok: false,
      reason: "大纲条目过少，本次没有保存为结构稿。",
    };
  }

  const outlineIsFallback =
    fallbackOutline.length > 0 &&
    dedupedOutline.length === fallbackOutline.length &&
    dedupedOutline.every((item, index) => item === fallbackOutline[index]?.trim());
  if (outlineIsFallback) {
    return {
      ok: false,
      reason: "AI 未生成新的大纲结构，本次没有保存为结构稿。",
    };
  }

  const genericOutlineCount = dedupedOutline.filter((item) =>
    PLACEHOLDER_OUTLINE_PATTERNS.some((pattern) => pattern.test(item)),
  ).length;
  if (genericOutlineCount >= 2) {
    return {
      ok: false,
      reason: "大纲仍像栏目占位词，不像真正的小标题，请重新生成。",
    };
  }

  const informativeOutlineCount = dedupedOutline.filter((item) => calculateWords(item) >= 8).length;
  if (informativeOutlineCount < MIN_GENERATED_OUTLINE_ITEMS) {
    return {
      ok: false,
      reason: "大纲信息密度不够，暂不保存为结构稿。",
    };
  }

  return { ok: true, reason: "" };
}

function assertGeneratedPlanningQuality(
  summary: string,
  outline: string[],
  fallbackSummary = "",
  fallbackOutline: string[] = [],
) {
  const result = hasGeneratedPlanningQuality(summary, outline, fallbackSummary, fallbackOutline);
  if (!result.ok) {
    throw new Error(result.reason);
  }
}

function normalizeConsistencyText(text: string) {
  return text
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .toLowerCase();
}

function extractChineseKeywordCandidates(token: string) {
  const normalized = token.trim();
  if (normalized.length <= 4) return [normalized];

  const chunks = new Set<string>([normalized]);
  for (let size = 2; size <= 4; size += 1) {
    for (let index = 0; index <= normalized.length - size; index += 1) {
      chunks.add(normalized.slice(index, index + size));
    }
  }

  return Array.from(chunks);
}

function collectConsistencyKeywords(title: string, tags: string[], angles: string[] = []) {
  const corpus = [title, ...tags, ...angles].join(" ");
  const normalizedTitle = corpus
    .replace(/^(知乎|微博|抖音|百度|头条|今日头条)(热搜|热榜)?[:：\s-]*/i, " ")
    .replace(/[“”"【】\[\]（）()，。！？!?：:、|/\\\-]+/g, " ");

  const englishTokens =
    normalizedTitle.match(/[A-Za-z]+[A-Za-z0-9.+_-]*/g)?.map((token) => token.trim()) ?? [];
  const chineseTokens =
    normalizedTitle.match(/[\u4e00-\u9fff]{2,16}/g)?.flatMap((token) => extractChineseKeywordCandidates(token.trim())) ?? [];
  const tagTokens = tags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag) => !CONSISTENCY_STOP_WORDS.has(tag));

  return Array.from(new Set([...englishTokens, ...chineseTokens, ...tagTokens]))
    .map((token) => token.replace(/\s+/g, "").trim())
    .filter((token) => token.length >= 2)
    .filter((token) => !CONSISTENCY_STOP_WORDS.has(token))
    .filter((token) => !/^\d+$/.test(token))
    .slice(0, 8);
}

function countMatchedKeywords(text: string, keywords: string[]) {
  const normalized = normalizeConsistencyText(text);
  if (!normalized) return 0;
  return keywords.filter((keyword) => normalized.includes(normalizeConsistencyText(keyword))).length;
}

function assertResultConsistency(
  topic: TopicSuggestion,
  result: Pick<AIWriteResult, "summary" | "outline" | "body">,
  options?: {
    requireBody?: boolean;
  },
) {
  const keywords = collectConsistencyKeywords(topic.title, topic.tags, topic.angles);
  if (!keywords.length) return;

  const summaryMatches = countMatchedKeywords(result.summary, keywords);
  const outlineMatches = countMatchedKeywords(result.outline.join(" "), keywords);
  const planningMatches = summaryMatches + outlineMatches;

  if (planningMatches === 0) {
    throw new Error("生成结果和当前选题的关联度太弱，请重新生成。");
  }

  if (options?.requireBody) {
    const bodyMatches = countMatchedKeywords(stripNonArticleText(result.body), keywords);
    if (bodyMatches === 0 && planningMatches === 0) {
      throw new Error("正文和当前选题的关联度太弱，请重新生成。");
    }
  }
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
    "正文请尽量使用 `## 小标题` 作为段落分节格式，方便后续自动排版。",
    "",
    "## 写作规则",
    ...getRulesForPhase("generate").map((rule, index) => `${index + 1}. ${rule}`),
    "",
    ...buildTonePromptSections(tone).system,
    ...buildToneExamplesSections(tone),
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
      `目标风格：${preset.label}——${preset.description}`,
    ],
  };
}

function buildToneExamplesSections(tone: string): string[] {
  const preset = resolveWritingTone(tone);
  if (!preset.examples) return [];

  return [
    "",
    "## 风格参考示例（仅供模仿风格，不要照搬内容）",
    "标题示例：",
    ...preset.examples.titles.map((t, i) => `${i + 1}. ${t}`),
    "开头示例：",
    preset.examples.opening,
  ];
}

function clipPromptText(text: string, maxLength: number) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trim()}…`;
}

function buildSourceContextPromptSections(
  sourceContext: AIWriteGenerateRequest["sourceContext"],
  mode: "planning" | "drafting" | "generate" | "transform",
) {
  if (!sourceContext) {
    return [];
  }

  const contentLimit =
    mode === "drafting"
      ? SOURCE_CONTEXT_DRAFTING_CONTENT_LIMIT
      : mode === "planning"
        ? SOURCE_CONTEXT_PLANNING_CONTENT_LIMIT
        : SOURCE_CONTEXT_PLANNING_CONTENT_LIMIT;

  return [
    sourceContext.source ? `热点来源：${sourceContext.source}` : "",
    sourceContext.url ? `热点链接：${sourceContext.url}` : "",
    sourceContext.facts?.length
      ? `热点事实卡片：\n${sourceContext.facts.map((fact, index) => `${index + 1}. ${fact}`).join("\n")}`
      : "",
    sourceContext.summary ? `热点摘要参考：${clipPromptText(sourceContext.summary, SOURCE_CONTEXT_SUMMARY_LIMIT)}` : "",
    sourceContext.content ? `热点详情参考：${clipPromptText(sourceContext.content, contentLimit)}` : "",
  ].filter(Boolean);
}

function buildSharedTaskContext(request: {
  topic: TopicSuggestion;
  settings: AppSettings;
  domain: string;
  articleType: string;
  targetReader: string;
  targetWordCount: number;
  tone: string;
}): string[] {
  const resolvedDomain = resolveArticleDomain(request.domain);
  const domainConfig = domainConfigs[resolvedDomain];
  const tonePrompt = buildTonePromptSections(request.tone);

  return [
    `主题：${request.topic.title}`,
    `文章领域：${resolvedDomain}`,
    `领域说明：${domainConfig.description}`,
    `领域重点：${domainConfig.writingFocus.join("、")}`,
    `领域提醒：${domainConfig.promptHint}`,
    `推荐角度：${request.topic.angles.join("；")}`,
    `选题理由：${request.topic.reason}`,
    `文章类型：${request.articleType}`,
    `目标读者：${request.targetReader}`,
    `目标字数：约 ${request.targetWordCount} 字`,
    ...tonePrompt.user,
    `账号定位：${request.settings.accountPosition}`,
    `内容领域：${request.settings.contentAreas.join("、")}`,
    `读者需求：${request.settings.readerNeeds}`,
    `禁写：${request.settings.bannedTopics.join("、") || "无"}`,
    `互动 CTA：${request.settings.ctaEngage}`,
  ];
}

function normalizeTargetWordCount(targetWordCount: number) {
  if (!Number.isFinite(targetWordCount)) return 1200;
  return Math.min(5000, Math.max(300, Math.round(targetWordCount)));
}

function buildWordCountGuidance(targetWordCount: number) {
  const normalized = normalizeTargetWordCount(targetWordCount);
  const min = Math.max(300, Math.round(normalized * 0.85));
  const max = Math.round(normalized * 1.15);

  return {
    normalized,
    min,
    max,
    sentence: `正文目标字数约 ${normalized} 字，可上下浮动到 ${min}-${max} 字。`,
  };
}

function buildGenerateUserPrompt(request: AIWriteGenerateRequest) {
  const { topic, draft, scope } = request;
  const wordCount = buildWordCountGuidance(request.targetWordCount);
  const sections = [
    `任务：生成适合公众号的${scope === "full" ? "完整文章" : scope === "title" ? "标题候选" : scope === "outline" ? "摘要和大纲" : "正文"}`,
    ...buildSharedTaskContext(request),
    ...buildSourceContextPromptSections(request.sourceContext, "generate"),
    request.sourceContext?.content
      ? "要求：以上内容来自热点详情页自动提取，可作为事实和细节参考；请优先信任“热点事实卡片”，再参考详情正文展开。如果提取内容不完整，请基于已知信息写作，不要自行编造。"
      : "",
    scope === "body" || scope === "full"
      ? `${wordCount.sentence} 使用 ## 小标题分节。结构建议：1) 开头用真实场景或冲突切入；2) 中段拆 3-4 个核心判断；3) 末尾给出可执行建议和互动收束。`
      : "",
    draft?.title ? `当前标题：${draft.title}` : "",
    draft?.summary ? `当前摘要：${draft.summary}` : "",
    draft?.outline?.length ? `当前大纲：${draft.outline.join(" | ")}` : "",
    draft?.body ? `当前正文参考：${draft.body.slice(0, 600)}` : "",
    '请只返回 JSON，格式必须是：{"title":"","titleCandidates":[],"selectedAngle":"","summary":"","outline":[],"body":""}',
    "titleCandidates 输出 5 个标题，避免标题党，但要有点击欲和明确价值感。",
    `每个标题不要超过 ${MAX_TITLE_LENGTH} 个字符。`,
    "优先把标题控制在 12-24 字之间，宁可短一点，也不要拖成长句。",
    "标题里不要出现“知乎、微博、抖音、百度、今日头条、热搜、热榜”这类平台词，除非平台名本身就是事件主体的一部分。",
    "不要把 5 个标题写成同一个母句换尾巴，也不要重复使用“真正值得看的是什么 / 很多人都看反了 / 最该关注什么 / 背后更大的变化是”这类套话。",
    "5 个标题必须尽量分散句式，至少覆盖问题型、判断型、反差纠偏型、人群/场景型、趋势后果型中的 4 类。",
    `摘要控制在 80-${MAX_SUMMARY_LENGTH} 字，像导读，不像摘要报告。`,
    "大纲输出 5-7 条，每条都是可直接当小标题的短句。",
  ].filter(Boolean);

  return sections.join("\n");
}

function buildPlanningSystemPrompt(tone: string) {
  return [
    "你是一位资深中文公众号策划编辑，擅长为文章确定最有传播性的标题、摘要和结构。",
    "请用简体中文输出，像成熟公众号编辑，不要报告腔。",
    "不要编造事实、数据、案例和人物故事。",
    "",
    "## 写作规则",
    ...getRulesForPhase("planning").map((rule, index) => `${index + 1}. ${rule}`),
    "",
    ...buildTonePromptSections(tone).system,
    ...buildToneExamplesSections(tone),
    "请严格返回 JSON，不要额外解释。",
  ].join("\n");
}

function buildPlanningUserPrompt(request: AIWriteGenerateRequest) {
  const { draft } = request;
  const wordCount = buildWordCountGuidance(request.targetWordCount);

  return [
    "任务：为一篇公众号文章生成标题、摘要和写作结构。",
    ...buildSharedTaskContext(request),
    ...buildSourceContextPromptSections(request.sourceContext, "planning"),
    request.sourceContext?.content
      ? "要求：优先把“热点事实卡片”里的信息写进标题、摘要和大纲，再用详情页正文补背景，不要脱离原始热点自行脑补。"
      : "",
    `每个标题不要超过 ${MAX_TITLE_LENGTH} 个字符。`,
    "优先把标题控制在 12-24 字之间，不要写成解释句或超长复句。",
    "标题里不要出现“知乎、微博、抖音、百度、今日头条、热搜、热榜”这类平台词，除非平台名本身就是事件主体的一部分。",
    "不要重复使用“真正值得看的是什么 / 很多人都看反了 / 最该关注什么 / 背后更大的变化是”这类固定尾句。",
    "请给出 5 个句式明显不同的标题候选，至少覆盖问题型、判断型、反差型、人群/场景型、趋势型中的 4 类。",
    `摘要控制在 80-${MAX_SUMMARY_LENGTH} 字，像导读。`,
    `大纲输出 5-7 条，每一条都要像真正的小标题，能支撑一篇约 ${wordCount.normalized} 字的正文展开。`,
    draft?.title ? `当前标题参考：${draft.title}` : "",
    draft?.summary ? `当前摘要参考：${draft.summary}` : "",
    draft?.outline?.length ? `当前大纲参考：${draft.outline.join(" | ")}` : "",
    '请只返回 JSON：{"title":"","titleCandidates":[],"selectedAngle":"","summary":"","outline":[],"body":""}',
  ].filter(Boolean).join("\n");
}

function buildDraftingSystemPrompt(tone: string) {
  return [
    "你是一位资深中文公众号作者，擅长把已有结构写成可直接发布的成稿。",
    "请用简体中文输出，像成熟公众号作者在和读者说话，不要报告腔，不要模板腔。",
    "不要编造具体数据、采访、案例、机构结论、人物故事和百分比。",
    "",
    "## 写作规则",
    ...getRulesForPhase("drafting").map((rule, index) => `${index + 1}. ${rule}`),
    "",
    ...buildTonePromptSections(tone).system,
    ...buildToneExamplesSections(tone),
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
  const wordCount = buildWordCountGuidance(request.targetWordCount);

  return [
    "任务：基于既定标题和结构，写出完整公众号正文。",
    `主题：${request.topic.title}`,
    `文章领域：${resolvedDomain}`,
    `领域提醒：${domainConfig.promptHint}`,
    `文章类型：${request.articleType}`,
    `目标读者：${request.targetReader}`,
    ...tonePrompt.user,
    `账号定位：${request.settings.accountPosition}`,
    `互动 CTA：${request.settings.ctaEngage}`,
    ...buildSourceContextPromptSections(request.sourceContext, "drafting"),
    request.sourceContext?.content
      ? "写作要求：请先围绕“热点事实卡片”建立正文的事实骨架，再吸收详情页内容补充背景，但不要逐句复述，也不要补写未被确认的具体数据和情节。"
      : "",
    `最终标题：${plan.title}`,
    `摘要：${plan.summary}`,
    `写作角度：${plan.selectedAngle}`,
    `大纲：${plan.outline.join(" | ")}`,
    `${wordCount.sentence} 使用 ## 小标题分节。`,
    "正文至少要回答 4 个层次中的 3 个：这件事为什么发生、真正变化在哪里、对谁影响最大、接下来会出现什么后果。",
    "文中至少写出一个容易被忽略的代价、门槛或风险，不要只写机会和表面热度。",
    "结尾给出 2-3 条可执行建议，并自然收束到互动 CTA。",
    request.draft?.body ? `已有正文参考：${request.draft.body.slice(0, 600)}` : "",
    '请只返回 JSON：{"title":"","titleCandidates":[],"selectedAngle":"","summary":"","outline":[],"body":""}',
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
    ...getRulesForPhase("transform"),
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
  const config = await getAIProviderConfig();
  const modelSelection = await getAIModelSelectionForTask(task);
  const model = modelSelection.primary;
  const fallbackModel = modelSelection.fallback;

  if (!config.configured) {
    throw new Error("AI model is not configured");
  }

  let response: Response | null = null;
  let currentModel = model;

  for (let attempt = 0; attempt <= MODEL_REQUEST_MAX_RETRIES; attempt += 1) {
    try {
      response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(getModelRequestTimeoutMs(task)),
        body: JSON.stringify({
          model: currentModel,
          temperature,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });
      break;
    } catch (error) {
      if (attempt < MODEL_REQUEST_MAX_RETRIES && isRetryableModelError(error)) {
        const shouldSwitchModel = Boolean(
          fallbackModel &&
            currentModel !== fallbackModel &&
            condenseErrorDetails(error).toLowerCase().includes("timeout"),
        );
        if (shouldSwitchModel) {
          currentModel = fallbackModel!;
        }
        console.warn(
          `AI model request failed on attempt ${attempt + 1}, retrying once${shouldSwitchModel ? ` with fallback model ${currentModel}` : ""}:`,
          condenseErrorDetails(error),
        );
        await sleep(800 * (attempt + 1));
        continue;
      }

      throw new Error(
        formatModelNetworkError(error, config, currentModel) ?? getErrorDetails(error),
        { cause: toErrorCause(error) },
      );
    }
  }

  if (!response) {
    throw new Error(`AI request failed without a response (${config.provider} / ${currentModel})`);
  }

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
    model: currentModel,
    content,
  };
}

function mergeGeneratedResult(request: AIWriteGenerateRequest, rawText: string): AIWriteResult {
  const base = createBaseResult(request.topic, request.settings, request.draft);
  const parsed = extractJsonPayload(rawText);
  const existingBody = request.draft?.body?.trim() ?? "";
  const existingSummary = request.draft?.summary?.trim() ?? base.summary;
  const existingOutline = request.draft?.outline?.filter(Boolean).length ? request.draft.outline : [];

  const titleCandidates = resolveSafeTitleCandidates(
    normalizeStringList(parsed.titleCandidates, base.titleCandidates),
    base.titleCandidates,
    request.topic.title,
  );
  assertTitleCandidateDiversity(titleCandidates, request.topic.title);
  const title = selectPrimaryTitle(normalizeText(parsed.title, titleCandidates[0] || base.title), titleCandidates, base.title);
  const selectedAngle = normalizeSelectedAngle(parsed.selectedAngle, base.selectedAngle);
  const summary = polishSummaryText(normalizeText(parsed.summary, base.summary));
  const outline = polishOutlineItems(normalizeStringList(parsed.outline, base.outline));
  const body = polishBodyText(normalizeBodyText(parsed.body, base.body));

  if (request.scope !== "title") {
    assertOutlineDiversity(outline);
  }

  if (request.scope === "body" || request.scope === "full") {
    assertGeneratedBodyQuality(body, base.body);
    assertResultConsistency(request.topic, { summary, outline, body }, { requireBody: true });
  }

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
    assertGeneratedPlanningQuality(summary, outline, base.summary, base.outline);
    assertResultConsistency(request.topic, { summary, outline, body: "" });
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

  const titleCandidates = resolveSafeTitleCandidates(
    normalizeStringList(parsed.titleCandidates, base.titleCandidates),
    base.titleCandidates,
    request.topic.title,
  );
  assertTitleCandidateDiversity(titleCandidates, request.topic.title);
  const title = selectPrimaryTitle(normalizeText(parsed.title, titleCandidates[0] || base.title), titleCandidates, base.title);
  const selectedAngle = normalizeSelectedAngle(parsed.selectedAngle, base.selectedAngle);
  const summary = polishSummaryText(normalizeText(parsed.summary, base.summary));
  const outline = polishOutlineItems(normalizeStringList(parsed.outline, base.outline));

  assertOutlineDiversity(outline);
  assertGeneratedPlanningQuality(summary, outline, base.summary, base.outline);
  assertResultConsistency(request.topic, { summary, outline, body: "" });

  return {
    title,
    titleCandidates: titleCandidates.length ? titleCandidates : polishTitleCandidates(base.titleCandidates),
    selectedAngle,
    summary,
    outline: outline.length ? outline : polishOutlineItems(base.outline),
    body: request.draft?.body?.trim() ?? "",
  };
}

function mergeBodyWithPlan(
  rawText: string,
  plan: AIArticlePlan,
  topic: TopicSuggestion,
  fallbackBody = "",
): AIWriteResult {
  const parsed = extractJsonPayload(rawText);
  const titleCandidates = resolveSafeTitleCandidates(
    normalizeStringList(parsed.titleCandidates, plan.titleCandidates),
    plan.titleCandidates,
    topic.title,
  );
  assertTitleCandidateDiversity(titleCandidates, topic.title);
  const outline = polishOutlineItems(normalizeStringList(parsed.outline, plan.outline));
  const body = polishBodyText(normalizeBodyText(parsed.body, plan.body));

  assertOutlineDiversity(outline);
  assertGeneratedBodyQuality(body, fallbackBody || plan.body);
  assertResultConsistency(topic, { summary: plan.summary, outline: plan.outline, body }, { requireBody: true });

  return {
    title: selectPrimaryTitle(normalizeText(parsed.title, plan.title), titleCandidates, plan.title),
    titleCandidates: titleCandidates.length ? titleCandidates : polishTitleCandidates(plan.titleCandidates),
    selectedAngle: normalizeSelectedAngle(parsed.selectedAngle, plan.selectedAngle),
    summary: polishSummaryText(normalizeText(parsed.summary, plan.summary)),
    outline: outline.length ? outline : polishOutlineItems(plan.outline),
    body,
  };
}

function tryReuseExistingPlan(request: AIWriteGenerateRequest) {
  if (!request.draft) return null;

  const base = createBaseResult(request.topic, request.settings, request.draft);
  const summary = polishSummaryText(request.draft.summary ?? "");
  const outline = polishOutlineItems(request.draft.outline ?? []);

  if (!summary || !outline.length) {
    return null;
  }

  try {
    assertOutlineDiversity(outline);
    assertGeneratedPlanningQuality(summary, outline);
    assertResultConsistency(request.topic, { summary, outline, body: "" });
  } catch {
    return null;
  }

  const titleCandidates = resolveSafeTitleCandidates(
    normalizeStringList(request.draft.titleCandidates, base.titleCandidates),
    base.titleCandidates,
    request.topic.title,
  );

  return {
    title: selectPrimaryTitle(
      normalizeText(request.draft.title, titleCandidates[0] || base.title),
      titleCandidates,
      base.title,
    ),
    titleCandidates: titleCandidates.length ? titleCandidates : polishTitleCandidates(base.titleCandidates),
    selectedAngle: normalizeSelectedAngle(request.draft.selectedAngle, base.selectedAngle),
    summary,
    outline,
    body: request.draft.body?.trim() ?? "",
  } satisfies AIArticlePlan;
}

export async function generateWechatArticle(request: AIWriteGenerateRequest) {
  if (request.scope === "body" || request.scope === "full") {
    const reusedPlan = tryReuseExistingPlan(request);
    const planningResponse = reusedPlan
      ? null
      : await callCompatibleModel({
          systemPrompt: buildPlanningSystemPrompt(request.tone),
          userPrompt: buildPlanningUserPrompt(request),
          temperature: 0.72,
          task: "outline",
        });

    const plan = reusedPlan
      ? reusedPlan
      : mergePlanningResult(request, planningResponse ? planningResponse.content : "");

    const draftingResponse = await callCompatibleModel({
      systemPrompt: buildDraftingSystemPrompt(request.tone),
      userPrompt: buildDraftingUserPrompt(request, plan),
      temperature: 0.74,
      task: request.scope,
    });

    return {
      provider: draftingResponse.config.provider,
      model: planningResponse ? `${planningResponse.model} -> ${draftingResponse.model}` : draftingResponse.model,
      result: mergeBodyWithPlan(draftingResponse.content, plan, request.topic, request.draft?.body?.trim() ?? ""),
    };
  }

  const { config, model, content } = await callCompatibleModel({
    systemPrompt: buildGenerateSystemPrompt(request.scope, request.tone),
    userPrompt: buildGenerateUserPrompt(request),
    temperature: request.scope === "title" ? 0.82 : 0.7,
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
  const transformedText = polishBodyText(
    normalizeBodyText(parsed.transformedText, content.trim() || sourceText),
  );

  return {
    provider: config.provider,
    model,
    transformedText,
  };
}

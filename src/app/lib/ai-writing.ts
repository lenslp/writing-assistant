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
export type AITextCompletionTask = AIModelTask;
type AIArticlePlan = Omit<AIWriteResult, "body"> & { body: string };
type ModelSelection = {
  primary: string;
  fallback?: string;
};
type RuntimeModelConfig = Partial<AIProviderSecret> | null;
type ProviderProtocol = "openai" | "anthropic";

const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_MODEL = "qwen3.5-plus";
const DEFAULT_FAST_MODEL = "qwen-turbo";
const MODEL_REQUEST_MAX_RETRIES = 1;
const MAX_TITLE_LENGTH = 35;  // v2: 从 30 放宽到 35，给标题更多空间
const MAX_SUMMARY_LENGTH = 120;
const SOURCE_CONTEXT_SUMMARY_LIMIT = 140;
const SOURCE_CONTEXT_PLANNING_CONTENT_LIMIT = 900;
const SOURCE_CONTEXT_DRAFTING_CONTENT_LIMIT = 800;  // v2: 从 1400 降到 800，避免热点细节带偏正文
const MIN_GENERATED_BODY_WORDS = 650;
const MIN_GENERATED_SUMMARY_WORDS = 36;
const MIN_GENERATED_OUTLINE_ITEMS = 3;
const MIN_GENERATED_GITHUB_OUTLINE_ITEMS = 2;
const TITLE_LENGTH_ADJUSTMENT_MAX_PASSES = 2;
const BODY_WORD_COUNT_ADJUSTMENT_MAX_PASSES = 1;  // v2: 从 2 降到 1，减少 API 调用
const BODY_REGENERATION_MAX_ATTEMPTS = 2;
const QUALITY_REWRITE_MAX_ATTEMPTS = 2;
const QUALITY_RETRY_USER_MESSAGE = "AI 正在自动调整稿件质量，请再试一次。";
const BODY_WORD_COUNT_TOLERANCE_RATIO = 0.02;
const BODY_WORD_COUNT_TOLERANCE_MIN = 15;
const BODY_WORD_COUNT_TOLERANCE_MAX = 80;
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
/**
 * AI 味检测（v2 优化版）
 *
 * v1 问题：
 * - AIISH_SENTENCE_PATTERNS 误杀正常开头（如「这篇文章会介绍 X」）
 * - META_WRITING_PATTERNS 误杀编辑批注
 * - 「首先、其次、最后」被一刀切禁止，但这些是正常过渡词
 *
 * v2 改进：
 * - AIISH_SENTENCE_PATTERNS 只检测最明显的 AI 模板句
 * - META_WRITING_PATTERNS 仅在正文中检测，不在标题/大纲中检测
 * - 「首先/其次/最后」只在连续出现 3 个以上时才判定为 AI 味
 */
const AIISH_SENTENCE_PATTERNS = [
  // v1 保留：最明显的 AI 模板句
  /^(接下来我们就来|下面我们就来)/,
  /^(如果你也在持续做|如果你的账号想长期输出)/,
  // skill 高危句式：必须改的
  /^(这才是正确的打开方式)/,
  /^(接受缺点,?享受优点)/,
  /^(让我们来看看)/,
  /^(真香|绝绝子|yyds)/,
  // skill 结构性 AI 味：每段开头都是过渡句
  /^(因此|所以|由此可见|毫无疑问|可以说|不难发现|事实上|实际上)/,
] as const;

/**
 * 元写作检测：检测「写作说明」混入正文的情况。
 * 仅在正文（body）中检测，标题和大纲中不检测。
 */
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

/**
 * 过渡词连续检测：只在「首先+其次+最后」连续出现时才判定为 AI 味。
 * 单独使用「首先」或「其次」是正常的。
 */
const TRANSITION_CHAIN_PATTERN = /首先[^。！？]*[。，]?\s*(其次|然后)[^。！？]*[。，]?\s*(最后|此外|另外)/;

/**
 * 结构性 AI 味检测（skill 规则）
 * 检测「三词并列」「对仗工整」等 PPT 风格
 */
const STRUCTURAL_AI_PATTERNS = [
  // 三词并列：XX、YY、ZZ（顿号分隔的三连）
  /[^，。！？]{2,8}、[^，。！？]{2,8}、[^，。！？]{2,8}[。，！？]/,
  // 对仗工整的结尾：不仅是…更是…
  /不仅(是|仅)…更是…/,
  // 完美正反对比：一方面…另一方面…
  /一方面…另一方面…/,
] as const;

class QualityRetryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QualityRetryError";
  }
}

function createQualityRetryExhaustedError() {
  return new QualityRetryError(QUALITY_RETRY_USER_MESSAGE);
}

function throwQualityRetry(reason: string) {
  throw new QualityRetryError(reason);
}

export function isQualityRetryError(error: unknown): error is QualityRetryError {
  return error instanceof QualityRetryError;
}

function buildQualityRewriteNotes(issue?: string) {
  return [
    issue ? `上一次质检没有通过：${issue}` : "本次写作从第一稿就要避开常见 AI 味，不要等校验后再改。",
    issue ? "这次直接重写，不要解释。目标是自然、具体、像人写过，不要像 AI 成稿。" : "直接生成自然成稿，像编辑亲手改过，不要像模型一次性铺出来。",
    "重点避开：三词并列、整齐对仗、首先/其次/最后、总分总报告腔、空泛拔高、模糊归因、金句式结尾。",
    "不要写“不仅……更是……”“一方面……另一方面……”“既……又……还……”这类硬凑结构。",
    "少用：此外、值得注意、核心、关键、赋能、底层逻辑、方法论、格局、启示、趋势、深度。",
    "少用抽象大词，多写具体对象、真实处境、明确代价和读者能感到的后果。",
    "段落长度要有变化。两项可以，不要硬凑三项。句子不要每段都用同一种转折。",
  ].filter(Boolean);
}

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
/**
 * 统一写作规则注册表（v2 精简版）。
 *
 * 从原来的 20+ 条精简到 12 条核心规则，按 scope 分层注入，
 * 避免一次性塞太多规则导致模型无所适从。
 *
 * Scopes:
 *   "universal" — 每个阶段都注入
 *   "planning"  — 标题/摘要/大纲阶段
 *   "drafting"  — 正文写作阶段
 */
type RuleScope = "universal" | "planning" | "drafting";

const CORE_WRITING_RULES: ReadonlyArray<{ scope: RuleScope; text: string }> = [
  // ── universal: 6 条通用铁律 ──────────────────────────────
  { scope: "universal", text: "把自己当成一个长期写公众号的人，不是内容生产机器人。写法要像编辑来回改过的成稿：有主次、有轻重、有判断。" },
  { scope: "universal", text: "少写抽象空词（赋能、价值、趋势、认知升级、底层逻辑、方法论、启示），能写具体处境就写具体处境。" },
  { scope: "universal", text: "禁止使用 AI/报告腔连接词：首先、其次、最后、总的来说、综上所述、不难发现、值得一提的是、由此可见、由此可见。直接说事，不要铺垫。" },
  { scope: "universal", text: "不要编造具体数据、人物发言、采访、机构结论和百分比；事实不足时用因果判断和经验推理补足。" },
  { scope: "universal", text: "深度不是堆术语。复杂概念先翻译成人话，再解释它为什么重要。默认读者不是行业从业者。" },
  { scope: "universal", text: "语气像见过很多类似事情的朋友在帮读者把复杂问题讲明白，不要像评论员发言或咨询报告。" },
  { scope: "universal", text: "有观点有态度，不要两头讨好。结尾可以俏皮或犀利，不要烂尾。" },
  { scope: "universal", text: "标点必须用中文全角（，。！？：；），英文半角逗号会挤在一起，非常难看。" },
  { scope: "universal", text: "不要在文章中展示数据来源/信息出处（不说“数据来源：XXX”“信息来自XXX”），数据要有来源感但不要暴露出处。" },

  // ── planning: 3 条标题/结构规则 ──────────────────
  { scope: "planning", text: "标题要像编辑最后拍板的成品，优先使用具体对象、真实场景、冲突或后果。避免过于工整的对仗句和大词堆叠。" },
  { scope: "planning", text: "摘要不要以“这篇文章”“本文”“今天聊聊”开头，直接进入判断、场景或问题，像转发前的一段导语。" },
  { scope: "planning", text: "大纲不能只是“背景-影响-建议”的流水账，至少 2 个小标题要像判断句而非栏目名。" },

  // ── drafting: 3 条正文规则 ────────────────────────────────
  { scope: "drafting", text: "开头不要解释文章要讲什么，直接进入读者当下的处境、事件冲突或核心判断。不要写“在这个信息爆炸的时代”这类悬浮开场。" },
  { scope: "drafting", text: "多用短段落（每段 1-3 句），句子节奏有长有短。重要部分多写，次要部分收着写，不要机械平均展开。" },
  { scope: "drafting", text: "结尾不要像社论收口，更像朋友把话说透后给一个清楚提醒，附 2-3 条可执行建议。" },
] as const;

/**
 * 根据阶段获取对应规则。
 * v2 逻辑：universal 规则始终注入，planning/drawing 规则按需注入。
 * generate 和 transform 阶段注入所有规则（因为它们可能涉及任意阶段的工作）。
 */
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

function normalizeAIProviderBaseUrl(baseUrl: string) {
  return baseUrl
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/chat\/completions$/i, "")
    .replace(/\/messages$/i, "");
}

function detectProvider(baseUrl: string) {
  if (baseUrl.includes("dashscope") || baseUrl.includes("aliyuncs")) return "Qwen / DashScope";
  if (baseUrl.includes("anthropic")) return "Claude / Anthropic";
  if (baseUrl.includes("generativelanguage.googleapis.com")) return "Gemini";
  if (baseUrl.includes("openrouter")) return "OpenRouter";
  if (baseUrl.includes("deepseek")) return "DeepSeek";
  if (baseUrl.includes("siliconflow")) return "SiliconFlow";
  if (baseUrl.includes("openai")) return "OpenAI";
  return "OpenAI Compatible";
}

function detectProviderProtocol(baseUrl: string): ProviderProtocol {
  return baseUrl.includes("anthropic") ? "anthropic" : "openai";
}

function isXiaomiMiMoBaseUrl(baseUrl: string) {
  return /xiaomimimo\.com/i.test(baseUrl);
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

function readTimeoutMs(names: string[], fallbackMs: number) {
  for (const name of names) {
    const value = Number.parseInt(getEnv(name), 10);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  return fallbackMs;
}

function getModelRequestTimeoutMs(task: AIModelTask) {
  if (task === "body" || task === "full") {
    return readTimeoutMs(["AI_MODEL_LONG_TIMEOUT_MS", "AI_MODEL_TIMEOUT_MS"], 360000);
  }

  return readTimeoutMs(["AI_MODEL_FAST_TIMEOUT_MS", "AI_MODEL_TIMEOUT_MS"], 180000);
}

function getAnthropicMaxTokens(task: AIModelTask) {
  if (task === "body" || task === "full") {
    return 8192;
  }

  return 2048;
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
  const baseUrl = normalizeAIProviderBaseUrl(storedConfig?.baseUrl || getEnv("AI_BASE_URL") || getEnv("OPENAI_BASE_URL") || DEFAULT_BASE_URL);

  return {
    configured: Boolean(apiKey),
    apiKey,
    baseUrl,
    provider: detectProvider(baseUrl),
  };
}

function extractProviderResponseContent(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";

  const directOutputText = (payload as { output_text?: unknown }).output_text;
  if (typeof directOutputText === "string" && directOutputText.trim()) {
    return directOutputText.trim();
  }

  const anthropicContent = (payload as { content?: unknown }).content;
  if (Array.isArray(anthropicContent)) {
    const text = anthropicContent
      .map((item) => {
        if (!item || typeof item !== "object") return "";
        if ("type" in item && item.type !== "text") return "";
        if ("text" in item && typeof item.text === "string") return item.text;
        return "";
      })
      .join("\n")
      .trim();

    if (text) return text;
  }

  const responseOutput = (payload as { output?: unknown }).output;
  if (Array.isArray(responseOutput)) {
    const text = responseOutput
      .flatMap((item) => {
        if (!item || typeof item !== "object") return [];

        const contentBlocks = "content" in item ? (item as { content?: unknown }).content : null;
        if (!Array.isArray(contentBlocks)) return [];

        return contentBlocks.map((block) => {
          if (!block || typeof block !== "object") return "";
          if ("text" in block && typeof block.text === "string") return block.text;
          if (
            "text" in block &&
            block.text &&
            typeof block.text === "object" &&
            "value" in block.text &&
            typeof (block.text as { value?: unknown }).value === "string"
          ) {
            return (block.text as { value: string }).value;
          }
          if ("output_text" in block && typeof block.output_text === "string") return block.output_text;
          return "";
        });
      })
      .join("\n")
      .trim();

    if (text) return text;
  }

  const geminiCandidates = (payload as { candidates?: unknown }).candidates;
  if (Array.isArray(geminiCandidates)) {
    const text = geminiCandidates
      .flatMap((candidate) => {
        if (!candidate || typeof candidate !== "object") return [];
        const content = "content" in candidate ? (candidate as { content?: unknown }).content : null;
        if (!content || typeof content !== "object") return [];
        const parts = "parts" in content ? (content as { parts?: unknown }).parts : null;
        if (!Array.isArray(parts)) return [];
        return parts.map((part) => {
          if (!part || typeof part !== "object") return "";
          return "text" in part && typeof part.text === "string" ? part.text : "";
        });
      })
      .join("\n")
      .trim();

    if (text) return text;
  }

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

  if (firstChoice?.message && typeof firstChoice.message === "object") {
    const reasoningContent = "reasoning_content" in firstChoice.message
      ? (firstChoice.message as { reasoning_content?: unknown }).reasoning_content
      : null;
    if (typeof reasoningContent === "string" && reasoningContent.trim()) {
      return reasoningContent.trim();
    }
  }

  if (typeof firstChoice?.text === "string") return firstChoice.text;

  return "";
}

function extractProviderErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: unknown }).error;
    if (error && typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string") {
      return (error as { message: string }).message;
    }
  }

  return fallback;
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

    return {
      primary: explicitFastModel || generalModel || DEFAULT_FAST_MODEL,
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

function normalizeOutlineList(value: unknown, fallback: string[] = []) {
  if (Array.isArray(value)) {
    return normalizeStringList(value, fallback);
  }

  if (typeof value !== "string") {
    return fallback;
  }

  const text = value.replace(/\r\n/g, "\n").trim();
  if (!text) {
    return fallback;
  }

  const numberedItems = Array.from(
    text.matchAll(/(?:^|\n)\s*(?:\d+[.)、]|[-*•])\s*([^\n]+)/g),
    (match) => match[1]?.trim() ?? "",
  ).filter(Boolean);
  if (numberedItems.length) {
    return Array.from(new Set(numberedItems));
  }

  const splitItems = text
    .split(/\n+|[|｜]/)
    .flatMap((item) => item.split(/[；;]/))
    .map((item) => item.trim())
    .filter(Boolean);
  if (splitItems.length > 1) {
    return Array.from(new Set(splitItems));
  }

  const sentenceItems = text
    .split(/(?<=[。！？!?])/)
    .map((item) => item.trim())
    .filter((item) => calculateWords(item) >= 8);

  return sentenceItems.length ? Array.from(new Set(sentenceItems)) : fallback;
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

function hasTransitionChain(text: string) {
  return TRANSITION_CHAIN_PATTERN.test(text);
}

function hasStructuralAI(text: string) {
  return STRUCTURAL_AI_PATTERNS.some((pattern) => pattern.test(text));
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

function polishOutlineItemsForTopic(topic: Pick<TopicSuggestion, "source">, outline: string[]) {
  return polishOutlineItems(outline);
}

function polishTitleCandidates(items: string[]) {
  const cleaned = Array.from(new Set(items.map((item) => polishTitleText(item)).filter(Boolean)));
  return diversifyTitleCandidates(cleaned).slice(0, 5);
}

function trimTitleToLimit(title: string) {
  const cleaned = polishTitleText(title);
  if (isTitleWithinLimit(cleaned)) return cleaned;

  const separators = ["：", ":", "｜", "|", "，", ",", " ", "-", "·"];

  for (const separator of separators) {
    if (!cleaned.includes(separator)) continue;
    const shortened = polishTitleText(cleaned.split(separator)[0] ?? "");
    if (shortened && isTitleWithinLimit(shortened)) {
      return shortened;
    }
  }

  let compact = cleaned
    .replace(/这件事|这波热度|这场讨论|这条热搜|这个话题/g, "")
    .replace(/到底|究竟|真的|正在|已经/g, "")
    .replace(/\s+/g, "");

  if (isTitleWithinLimit(compact)) return compact;

  while (getTitleLength(compact) > MAX_TITLE_LENGTH) {
    compact = compact.slice(0, -1).trim();
  }

  return polishTitleText(compact);
}

function normalizeTitlesWithinLimit(preferredTitle: string, titleCandidates: string[], fallbackTitle: string) {
  const normalizedCandidates = polishTitleCandidates(titleCandidates)
    .map((item) => trimTitleToLimit(item))
    .filter(Boolean)
    .filter((item, index, items) => items.indexOf(item) === index);

  const title = selectPrimaryTitle(
    trimTitleToLimit(preferredTitle),
    normalizedCandidates,
    trimTitleToLimit(fallbackTitle),
  );

  const ensuredCandidates = normalizedCandidates.length
    ? normalizedCandidates
    : [title].filter(Boolean);

  return {
    title: trimTitleToLimit(title),
    titleCandidates: ensuredCandidates.slice(0, 5),
  };
}

function getTitleLength(title: string) {
  return title.replace(/\s+/g, "").length;
}

function isTitleWithinLimit(title: string) {
  return getTitleLength(title) <= MAX_TITLE_LENGTH;
}

function getTitleLengthIssue(title: string, titleCandidates: string[]) {
  if (!isTitleWithinLimit(title)) {
    return `主标题过长，请控制在 ${MAX_TITLE_LENGTH} 字内。`;
  }

  const overlongCandidate = titleCandidates.find((item) => !isTitleWithinLimit(item));
  if (overlongCandidate) {
    return `标题候选过长，请控制在 ${MAX_TITLE_LENGTH} 字内。`;
  }

  return "";
}

function detectTitleArchetype(title: string) {
  if (/[？?]$/.test(title) || /为什么|怎么|凭什么|到底|究竟/.test(title)) return "question";
  if (/不是.+而是|别再|先别|很多人都/.test(title)) return "contrast";
  if (/普通人|打工人|创作者|家长|年轻人|中年人|用户|老板/.test(title)) return "audience";
  if (/正在|开始|越来越|已经|突然|这波|这件事/.test(title)) return "trend";
  if (/会不会|意味着|说明了|最该关注/.test(title)) return "judgment";
  return "statement";
}

/**
 * 标题自然度评分（v2 优化版）
 *
 * v1 问题：
 * - 太多扣分项导致模型只能选最安全的写法 → 标题同质化
 * - 「逻辑」「深度」「信号」等词被扣分，但这些词在某些语境下是正常的
 * - 「意味着什么」被扣 2 分太重
 *
 * v2 改进：
 * - 减少扣分项，只保留最明显的模板词扣分
 * - 增加更多加分项，鼓励多样化标题风格
 * - 放宽长度限制，允许稍长的标题（≤35 字）
 */
function scoreTitleNaturalness(title: string) {
  let score = 0;
  const length = title.replace(/\s+/g, "").length;

  // 长度评分：12-25 字最优
  if (length >= 12 && length <= 25) score += 4;
  else if (length >= 9 && length <= 30) score += 2;
  else if (length <= 35) score += 0;
  else score -= 1;

  // 加分项：鼓励多样化风格
  if (!/[：:｜|]/.test(title)) score += 1;  // 无冒号分隔更自然
  if (/[？?]$/.test(title)) score += 1;  // 问句标题
  if (/普通人|打工人|家长|创作者|用户/.test(title)) score += 1;  // 有具体受众
  if (/别只盯着|如果只把|真正会变的是|更该关心|更容易看漏/.test(title)) score += 1;  // 有反差感
  if (/^聊聊|^看看|^试试|^最近|^这次|^今天/.test(title)) score += 1;  // 口语化开头
  if (/\d+/.test(title)) score += 1;  // 有具体数字
  if (/[！!]$/.test(title)) score += 1;  // 感叹号结尾
  if (/怎么|为什么|凭什么/.test(title)) score += 1;  // 疑问词

  // 扣分项：只扣最明显的模板词
  AI_TITLE_BANNED_PATTERNS.forEach((pattern) => {
    if (pattern.test(title)) score -= 3;
  });

  // 轻微扣分：过度抽象的词
  if (/逻辑|方法论|趋势拆解|综合观察|启示录/.test(title)) score -= 1;
  if (/背后的|意味着什么|给所有人|值得关注|最该关注|看反了/.test(title)) score -= 1;  // v2: 从 -2 降到 -1
  if (/^关于|聊聊|说说/.test(title)) score -= 1;
  if (/(最近|值得|推荐|看点).*(最近|值得|推荐|看点)/.test(title)) score -= 1;
  if (length > 30) score -= 1;  // v2: 从 24 放宽到 30

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
  const compliantCandidates = candidates.filter((item) => isTitleWithinLimit(item));

  if (compliantCandidates.length) {
    return compliantCandidates.sort((left, right) => scoreTitleNaturalness(right) - scoreTitleNaturalness(left))[0] ?? fallbackTitle;
  }

  return candidates.sort((left, right) => scoreTitleNaturalness(right) - scoreTitleNaturalness(left))[0] ?? fallbackTitle;
}

function getTitleCandidateStructureIssue(titleCandidates: string[], topicTitle: string) {
  const normalized = Array.from(new Set(titleCandidates.map((item) => item.trim()).filter(Boolean)));
  if (normalized.length < 4) {
    return "标题候选太少，句式不够分散，请重新生成。";
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

function getGithubTitleCandidateStructureIssue(titleCandidates: string[]) {
  const normalized = Array.from(new Set(titleCandidates.map((item) => item.trim()).filter(Boolean)));
  if (normalized.length < 2) {
    return "标题候选太少，请重新生成。";
  }

  const uniqueCount = new Set(normalized.map((item) => item.replace(/[「」“”":：，,。！？!?、\s]/g, ""))).size;
  if (uniqueCount < 2) {
    return "标题候选彼此太像，请重新生成。";
  }

  return "";
}

function assertTitleCandidateDiversity(titleCandidates: string[], topicTitle: string) {
  const issue = topicTitle.includes("/")
    ? getGithubTitleCandidateStructureIssue(titleCandidates)
    : getTitleCandidateStructureIssue(titleCandidates, topicTitle);
  if (issue) {
    throwQualityRetry(issue);
  }
}

function resolveSafeTitleCandidates(aiCandidates: string[], fallbackCandidates: string[], topicTitle: string) {
  const normalizedAiCandidates = polishTitleCandidates(aiCandidates);
  if (topicTitle.includes("/")) {
    return normalizedAiCandidates.length ? normalizedAiCandidates : polishTitleCandidates(fallbackCandidates);
  }
  if (!getTitleCandidateStructureIssue(normalizedAiCandidates, topicTitle)) {
    return normalizedAiCandidates;
  }

  const normalizedFallbackCandidates = polishTitleCandidates(fallbackCandidates);
  if (normalizedFallbackCandidates.length) {
    return normalizedFallbackCandidates;
  }

  return normalizedAiCandidates;
}

function buildTitleAdjustmentSystemPrompt() {
  return [
    "你是一位资深中文公众号编辑，专门负责把标题压缩到指定长度，同时保留传播感。",
    "不要简单截断，不要只删掉句尾几个字，要重写成自然完整、适合传播的公众号标题。",
    "必须保留原来的核心事件、主要判断和读者价值感。",
    "",
    "## 写作规则",
    ...getRulesForPhase("planning").map((rule, index) => `${index + 1}. ${rule}`),
    "请严格返回 JSON，不要额外解释。",
  ].join("\n");
}

function buildTitleAdjustmentUserPrompt(
  request: AIWriteGenerateRequest,
  result: Pick<AIWriteResult, "title" | "titleCandidates" | "selectedAngle" | "summary" | "outline">,
) {
  return [
    "任务：把当前标题压缩到指定字数上限。",
    ...buildSharedTaskContext(request),
    `当前主标题：${result.title}`,
    `当前标题候选：${result.titleCandidates.join(" | ")}`,
    result.summary ? `摘要参考：${result.summary}` : "",
    result.outline.length ? `大纲参考：${result.outline.join(" | ")}` : "",
    `硬性要求：主标题和每个标题候选都必须不超过 ${MAX_TITLE_LENGTH} 字。`,
    "不要简单截断，不要省略成半句话，不要丢掉事件主体或关键判断。",
    "请保留 5 个标题候选，并保持句式尽量分散。",
    '请只返回 JSON：{"title":"","titleCandidates":[],"selectedAngle":"","summary":"","outline":[],"body":""}',
  ].filter(Boolean).join("\n");
}

async function adjustTitlesToLength<T extends AIWriteResult>(
  request: AIWriteGenerateRequest,
  result: T,
) {
  let current = result;

  for (let pass = 0; pass < TITLE_LENGTH_ADJUSTMENT_MAX_PASSES; pass += 1) {
    if (!getTitleLengthIssue(current.title, current.titleCandidates)) {
      return current;
    }

    const { content } = await callCompatibleModel({
      systemPrompt: buildTitleAdjustmentSystemPrompt(),
      userPrompt: buildTitleAdjustmentUserPrompt(request, current),
      temperature: 0.45,
      task: "title",
    });
    const parsed = extractJsonPayload(content);
    const nextCandidates = resolveSafeTitleCandidates(
      normalizeStringList(parsed.titleCandidates, current.titleCandidates),
      current.titleCandidates,
      request.topic.title,
    );
    assertTitleCandidateDiversity(nextCandidates, request.topic.title);

    current = {
      ...current,
      ...normalizeTitlesWithinLimit(
        normalizeText(parsed.title, current.title),
        nextCandidates.length ? nextCandidates : current.titleCandidates,
        current.title,
      ),
      selectedAngle: normalizeSelectedAngle(parsed.selectedAngle, current.selectedAngle),
    };
  }

  if (getTitleLengthIssue(current.title, current.titleCandidates)) {
    return {
      ...current,
      ...normalizeTitlesWithinLimit(current.title, current.titleCandidates, current.title),
    };
  }

  return current;
}

function assertOutlineDiversity(outline: string[]) {
  const cleaned = outline.map((item) => item.trim()).filter(Boolean);
  if (cleaned.length < 4) return;

  const leadTokens = cleaned.map((item) => item.slice(0, 4));
  const repeatedLeadCount = leadTokens.filter((token, index, items) => items.indexOf(token) !== index).length;
  if (repeatedLeadCount >= 3) {
    throwQualityRetry("大纲句式变化不够，太像同一模板展开。");
  }

  const uniqueOutlineCount = new Set(cleaned.map((item) => item.replace(/[「」“”":：，,。！？!?、\s]/g, ""))).size;
  if (uniqueOutlineCount < Math.max(3, cleaned.length - 1)) {
    throwQualityRetry("大纲条目彼此太像，信息增量不够。");
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
      // v2: 只删除最明显的 AI 模板句，不再误杀正常开头
      if (shouldDropAiishSentence(normalized)) return [];
      // v2: 检测「首先…其次…最后」连续结构，但不直接删除，只标记
      // 让模型在后续校准中处理
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

  // v2: 检测结构性 AI 味（三词并列、对仗工整等）
  if (hasStructuralAI(articleText)) {
    return {
      ok: false,
      reason: "正文有明显 AI 结构痕迹（三词并列/对仗工整），本次没有保存为成稿。",
    };
  }

  if (PLACEHOLDER_OUTLINE_PATTERNS.some((pattern) => pattern.test(articleText))) {
    return {
      ok: false,
      reason: "正文包含大纲占位词，本次没有保存为成稿。",
    };
  }

  // v2: 加权 specificity 评分，不同指标给不同权重
  const specificityScore = SPECIFICITY_PATTERNS.reduce((score, pattern, index) => {
    if (!pattern.test(articleText)) return score;
    // 数字和英文各 1 分，引号和领域词各 2 分（更具体）
    return score + (index >= 2 ? 2 : 1);
  }, 0);
  if (specificityScore < 4) {
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
    throwQualityRetry(result.reason);
  }
}

function getBodyQualityIssue(body: string, fallbackBody = "") {
  const result = hasGeneratedBodyQuality(body, fallbackBody);
  return result.ok ? "" : result.reason;
}

function deriveOutlineFromBody(body: string) {
  const headings = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^##\s+/.test(line))
    .map((line) => line.replace(/^##\s+/, "").trim())
    .filter(Boolean);

  return headings.slice(0, 6);
}

function hasGeneratedPlanningQuality(
  summary: string,
  outline: string[],
  fallbackSummary = "",
  fallbackOutline: string[] = [],
  topic?: Pick<TopicSuggestion, "source" | "title">,
) {
  const normalizedSummary = summary.trim();
  const dedupedOutline = outline.map((item) => item.trim()).filter(Boolean);
  const minOutlineItems = getGeneratedOutlineMinimum(topic);
  const isGithubTrending = topic && (topic.source?.includes("GitHub Trending") || topic.title.includes("/"));
  const allowsSingleGithubOutline =
    Boolean(isGithubTrending) &&
    dedupedOutline.length === 1 &&
    calculateWords(dedupedOutline[0] ?? "") >= 16;

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

  if (dedupedOutline.length < minOutlineItems && !allowsSingleGithubOutline) {
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
  if (informativeOutlineCount < minOutlineItems && !allowsSingleGithubOutline) {
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
  topic?: Pick<TopicSuggestion, "source" | "title">,
) {
  const result = hasGeneratedPlanningQuality(summary, outline, fallbackSummary, fallbackOutline, topic);
  if (!result.ok) {
    throwQualityRetry(result.reason);
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

  // v2: 不再疯狂切子串，只保留原词 + 2-gram
  const chunks = new Set<string>([normalized]);
  for (let index = 0; index <= normalized.length - 2; index += 1) {
    chunks.add(normalized.slice(index, index + 2));
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

function getGeneratedOutlineMinimum(topic?: Pick<TopicSuggestion, "source" | "title">) {
  return topic && (topic.source?.includes("GitHub Trending") || topic.title.includes("/"))
    ? MIN_GENERATED_GITHUB_OUTLINE_ITEMS
    : MIN_GENERATED_OUTLINE_ITEMS;
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
  const isGithubTrending = topic.source?.includes("GitHub Trending") || topic.title.includes("/");

  if (options?.requireBody) {
    const bodyMatches = countMatchedKeywords(stripNonArticleText(result.body), keywords);
    if (bodyMatches >= 2 || planningMatches >= 2 || isGithubTrending) {
      return;
    }

    throwQualityRetry("正文和当前选题的关联度太弱。");
  }

  if (planningMatches < 2) {
    if (!isGithubTrending) {
      throwQualityRetry("生成结果和当前选题的关联度太弱。");
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
  return extractProviderResponseContent(payload);
}

function buildGenerateSystemPrompt(scope: AIWriteGenerateRequest["scope"]) {
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
    "整体写法：像成熟公众号作者在自然表达，有判断、有节奏、有具体细节，不要按固定人设写。",
    "标题和正文都要服务于选题本身，不要为了风格牺牲事实边界。",
    scopeInstruction[scope],
    "请严格返回 JSON，不要额外解释。",
  ].join("\n");
}

function clipPromptText(text: string, maxLength: number) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trim()}…`;
}

function isGithubTrendingSource(source?: string | null) {
  return Boolean(source?.includes("GitHub Trending"));
}

function buildGithubTrendingPromptSections(
  request: Pick<AIWriteGenerateRequest, "topic" | "sourceContext" | "scope">,
  mode: "planning" | "drafting" | "generate",
) {
  if (!isGithubTrendingSource(request.topic.source) && !isGithubTrendingSource(request.sourceContext?.source)) {
    return [];
  }

  const projectName = request.sourceContext?.title?.trim() || request.topic.title.trim();
  const sections = [
    "这是 GitHub 热门开源项目文章，不是泛科技评论，也不是行业趋势报告。",
    "写法更像一篇推荐介绍文，在给读者介绍一个最近爆火、值得一看/值得试的开源项目，而不是借题发挥做观点输出。",
    "正文主任务是把项目介绍清楚、把看点说具体、把适合谁用讲明白，不要把篇幅主要花在抽象判断和行业评论上。",
    "如果热点事实卡片里有项目名、Star、语言、功能、仓库信息，优先把这些细节自然写进去；没有就不要脑补。",
    "尽量把项目名写进标题或开头，不要整篇都在用“这个项目”“这类工具”指代。",
    "少谈空泛的大趋势，多讲这个项目具体解决了什么问题、和同类东西比新在哪、为什么最近传播这么快。",
  ];

  if (mode === "planning" || mode === "generate") {
    sections.push(
      "标题要像一个编辑自然起的标题，允许更短一点、口语一点，不要总是“项目名 + 看点”这种固定句式。",
      "标题可以直接点出项目名，也可以只抓一个很具体的感受、动作或场景，不必每次都把价值说满。",
      "摘要要像转发前的一句自然介绍，直接说这个项目为什么值得看看、能做什么、适合谁看，别做成结构化提纲。",
      "大纲尽量像介绍文章的自然分段，不要刻意压成固定模板；可以写它是什么、亮点在哪、适合谁、值不值得试。",
    );
  }

  if (mode === "drafting" || (mode === "generate" && (request.scope === "body" || request.scope === "full"))) {
    sections.push(
      `正文请按开源项目推荐文来写，默认围绕「${projectName} 是什么」「它最吸引人的地方在哪」「普通人为什么会想点进去看」「值不值得试」自然展开。`,
      "全文更像在认真给朋友推荐一个项目，语气要像编辑在介绍一个新鲜东西，不要像讲解课件，也不要像评审报告。",
      "小标题尽量自然一点，允许有一两个判断句或场景句，不要每段都长得像说明书；也不要每次都以“项目简介/为什么火/怎么上手”开头。",
      "开头先把热度和看点讲出来，再进入项目细节；不要一上来讲行业背景，也不要先做概念科普。",
      "默认正文节奏是：一段轻一点的引子 + 几段自然介绍 + 一段短判断，不要写成长篇评论。",
      "至少补 1-2 个实际使用示例，优先用代码块、命令行或最小可运行片段来展示，而不是只用口头描述。",
      "如果项目适合上手，给出一个很短的示例片段或安装命令，让读者一眼知道怎么试。",
      "结尾给出一句轻判断：这个项目适不适合现在去看、值不值得试、如果要试先看哪里。"
    );
  }

  return sections.map((item, index) => `${index + 1}. ${item}`);
}

function isGithubTrendingDraft(request: Pick<AIWriteGenerateRequest, "topic">) {
  return isGithubTrendingSource(request.topic.source);
}

function getGithubTrendingSourceContextForPrompt(sourceContext: AIWriteGenerateRequest["sourceContext"]) {
  if (!sourceContext || !sourceContext.url) return sourceContext;
  return {
    ...sourceContext,
    content: sourceContext.content ? clipPromptText(sourceContext.content, 900) : "",
    summary: sourceContext.summary ? clipPromptText(sourceContext.summary, 120) : "",
    facts: sourceContext.facts?.slice(0, 3) ?? [],
  };
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
  targetWordCount: number;
}): string[] {
  const resolvedDomain = resolveArticleDomain(request.domain);
  const domainConfig = domainConfigs[resolvedDomain];
  const wordCount = buildWordCountGuidance(request.targetWordCount);

  return [
    `主题：${request.topic.title}`,
    `文章领域：${resolvedDomain}`,
    `领域说明：${domainConfig.description}`,
    `领域重点：${domainConfig.writingFocus.join("、")}`,
    `领域提醒：${domainConfig.promptHint}`,
    `推荐角度：${request.topic.angles.join("；")}`,
    `选题理由：${request.topic.reason}`,
    `文章类型：${request.articleType}`,
    `目标字数：严格控制在 ${wordCount.normalized} 字，允许误差不超过 ${wordCount.tolerance} 字`,
    `账号定位：${request.settings.accountPosition}`,
    `内容领域：${request.settings.contentAreas.join("、")}`,
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
  const tolerance = Math.min(
    BODY_WORD_COUNT_TOLERANCE_MAX,
    Math.max(BODY_WORD_COUNT_TOLERANCE_MIN, Math.round(normalized * BODY_WORD_COUNT_TOLERANCE_RATIO)),
  );
  const min = Math.max(300, normalized - tolerance);
  const max = normalized + tolerance;

  return {
    normalized,
    tolerance,
    min,
    max,
    sentence: `正文目标字数严格为 ${normalized} 字，允许误差不超过 ${tolerance} 字（即 ${min}-${max} 字）。`,
  };
}

function getBodyWordCountMetrics(body: string, targetWordCount: number) {
  const guidance = buildWordCountGuidance(targetWordCount);
  const actual = calculateWords(stripNonArticleText(body));

  return {
    ...guidance,
    target: guidance.normalized,
    actual,
    isTooShort: actual < guidance.min,
    isTooLong: actual > guidance.max,
  };
}

function buildWordCountAdjustmentSystemPrompt() {
  return [
    "你是一位资深中文公众号编辑，专门负责在不跑题的前提下校准正文长度。",
    "请输出适合直接发布的公众号正文，不要解释改动，不要列点说明你做了什么。",
    "严格保持原文的核心判断、结构、小标题方向和事实边界，不要编造新事实、数据、引用、采访和人物故事。",
    "如果需要压缩，就删掉重复表达、空话、弱转折和可有可无的例子；如果需要补足，就补充必要解释、过渡、影响和建议，但不要发散。",
    "",
    "## 写作规则",
    ...getRulesForPhase("drafting").map((rule, index) => `${index + 1}. ${rule}`),
    "请严格返回 JSON，不要额外解释。",
  ].join("\n");
}

function buildWordCountAdjustmentUserPrompt(
  request: AIWriteGenerateRequest,
  plan: AIArticlePlan,
  body: string,
  qualityIssue?: string,
) {
  const metrics = getBodyWordCountMetrics(body, request.targetWordCount);
  const adjustmentInstruction = metrics.isTooLong
    ? `当前正文约 ${metrics.actual} 字，已经超出目标值 ${metrics.target} 字。请在不跑题的前提下压缩到 ${metrics.min}-${metrics.max} 字，且尽量直接落到 ${metrics.target} 字附近。`
    : `当前正文约 ${metrics.actual} 字，低于目标值 ${metrics.target} 字。请在不跑题的前提下补足到 ${metrics.min}-${metrics.max} 字，且尽量直接落到 ${metrics.target} 字附近。`;

  return [
    "任务：校准公众号正文长度，让它严格贴近设定字数。",
    ...buildSharedTaskContext(request),
    `最终标题：${plan.title}`,
    `摘要：${plan.summary}`,
    `写作角度：${plan.selectedAngle}`,
    `大纲：${plan.outline.join(" | ")}`,
    adjustmentInstruction,
    `硬性要求：最终正文必须落在 ${metrics.min}-${metrics.max} 字之间，并尽量以 ${metrics.target} 字为准。`,
    `${metrics.sentence} 请保留 ## 小标题结构。`,
    "只调整正文，不要改成大纲，不要输出写作说明。",
    "如果压缩，优先删减重复表述、空泛判断、可省略的过渡句和冗长例子。",
    "如果补足，优先补充因果解释、影响对象、实际后果和结尾建议，不要平铺新观点。",
    qualityIssue ? "## 自动质检重写要求" : "",
    ...buildQualityRewriteNotes(qualityIssue),
    `待校准正文：\n${body}`,
    '请只返回 JSON：{"transformedText":""}',
  ].filter(Boolean).join("\n");
}

function buildWordCountStatus(body: string, targetWordCount: number, adjusted: boolean) {
  const metrics = getBodyWordCountMetrics(body, targetWordCount);
  return {
    actual: metrics.actual,
    min: metrics.min,
    max: metrics.max,
    target: metrics.normalized,
    adjusted,
    inRange: !metrics.isTooShort && !metrics.isTooLong,
    deviation: metrics.isTooShort ? "short" : metrics.isTooLong ? "long" : "none",
  };
}

function buildGenerateUserPrompt(request: AIWriteGenerateRequest, qualityIssue?: string) {
  const { topic, draft, scope } = request;
  const wordCount = buildWordCountGuidance(request.targetWordCount);
  const shouldGenerateTitleCandidates = scope !== "full";
  const isFullArticle = scope === "full";
  const sourceContext = isGithubTrendingDraft(request)
    ? getGithubTrendingSourceContextForPrompt(request.sourceContext)
    : request.sourceContext;
  const sections = [
    `任务：生成适合公众号的${scope === "full" ? "完整文章" : scope === "title" ? "标题候选" : scope === "outline" ? "摘要和大纲" : "正文"}`,
    isFullArticle
      ? [
          "本次生成流程必须按顺序执行，但只输出最终 JSON：",
          "1. 先完整阅读并吸收所有热点素材、事实卡片、账号定位、禁写规则和写作要求。",
          "2. 在脑中搭好文章结构和段落节奏，但不要把结构、大纲、写作计划、分析过程写出来。",
          "3. 一口气写完最终主标题和完整正文。正文可以使用自然的 ## 小标题分节，但不能输出提纲式占位内容。",
          "4. 输出前自行检查 AI 味，删掉模板句、空泛拔高、三段式套话、硬凑排比和写作说明。",
          '5. JSON 中 outline 返回 []，titleCandidates 返回 []，最终内容只看 title、summary、selectedAngle、body。',
        ].join("\n")
      : "",
    ...buildSharedTaskContext(request),
    ...buildSourceContextPromptSections(sourceContext, "generate"),
    ...buildGithubTrendingPromptSections(request, "generate"),
    sourceContext?.content
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
    scope === "full"
      ? "只输出一个最终主标题，titleCandidates 返回空数组，不要生成标题候选。"
      : "titleCandidates 输出 5 个标题，避免标题党，但要有点击欲和明确价值感。",
    shouldGenerateTitleCandidates
      ? `每个标题不要超过 ${MAX_TITLE_LENGTH} 个字符。`
      : `主标题不要超过 ${MAX_TITLE_LENGTH} 个字符。`,
    "优先把标题控制在 12-24 字之间，宁可短一点，也不要拖成长句。",
    "标题里不要出现“知乎、微博、抖音、百度、今日头条、热搜、热榜”这类平台词，除非平台名本身就是事件主体的一部分。",
    shouldGenerateTitleCandidates ? "标题不用刻意五花八门，别把所有候选都写成同一套句式硬换词。" : "",
    "标题优先像自然推荐而不是文章摘要，读起来要顺，不要总用反问、转折和“为什么”式开头。",
    `摘要控制在 80-${MAX_SUMMARY_LENGTH} 字，像一段自然转述，不像摘要报告。`,
    isFullArticle
      ? "不要输出大纲内容；如果 JSON 必须包含 outline 字段，就返回空数组 []。"
      : "大纲不要写得太像清单，允许两段式、三段式和轻判断混写。",
    scope === "body" || scope === "full" || qualityIssue ? "## 自动质检重写要求" : "",
    ...buildQualityRewriteNotes(qualityIssue),
  ].filter(Boolean);

  return sections.join("\n");
}

function buildPlanningSystemPrompt() {
  return [
    "你是一位资深中文公众号策划编辑，擅长为文章确定最有传播性的标题、摘要和结构。",
    "请用简体中文输出，像成熟公众号编辑，不要报告腔。",
    "不要编造事实、数据、案例和人物故事。",
    "",
    "## 写作规则",
    ...getRulesForPhase("planning").map((rule, index) => `${index + 1}. ${rule}`),
    "整体写法：自然、有信息量、有判断感，不套固定风格模板。",
    "请严格返回 JSON，不要额外解释。",
  ].join("\n");
}

function buildPlanningUserPrompt(request: AIWriteGenerateRequest, qualityIssue?: string) {
  const { draft } = request;
  const wordCount = buildWordCountGuidance(request.targetWordCount);
  const sourceContext = isGithubTrendingDraft(request)
    ? getGithubTrendingSourceContextForPrompt(request.sourceContext)
    : request.sourceContext;

  return [
    "任务：为一篇公众号文章生成标题、摘要和写作结构。",
    ...buildSharedTaskContext(request),
    ...buildSourceContextPromptSections(sourceContext, "planning"),
    ...buildGithubTrendingPromptSections(request, "planning"),
    sourceContext?.content
      ? "要求：优先把“热点事实卡片”里的信息写进标题、摘要和大纲，再用详情页正文补背景，不要脱离原始热点自行脑补。"
      : "",
    `每个标题不要超过 ${MAX_TITLE_LENGTH} 个字符。`,
    "优先把标题控制在 12-24 字之间，不要写成解释句或超长复句。",
    "标题里不要出现“知乎、微博、抖音、百度、今日头条、热搜、热榜”这类平台词，除非平台名本身就是事件主体的一部分。",
    "不要重复使用“真正值得看的是什么 / 很多人都看反了 / 最该关注什么 / 背后更大的变化是”这类固定尾句。",
    "请给出 5 个标题候选，但不要为了分散而硬凑不同句式，自然比变化更重要。",
    `摘要控制在 80-${MAX_SUMMARY_LENGTH} 字，像导读。`,
    `大纲输出 4-6 条就够了，允许更像自然分段，不必强行写成栏目清单。`,
    draft?.title ? `当前标题参考：${draft.title}` : "",
    draft?.summary ? `当前摘要参考：${draft.summary}` : "",
    draft?.outline?.length ? `当前大纲参考：${draft.outline.join(" | ")}` : "",
    qualityIssue ? "## 自动质检重写要求" : "",
    ...buildQualityRewriteNotes(qualityIssue),
    '请只返回 JSON：{"title":"","titleCandidates":[],"selectedAngle":"","summary":"","outline":[],"body":""}',
  ].filter(Boolean).join("\n");
}

function buildDraftingSystemPrompt() {
  return [
    "你是一位资深中文公众号作者，擅长把已有结构写成可直接发布的成稿。",
    "请用简体中文输出，像成熟公众号作者在和读者说话，不要报告腔，不要模板腔。",
    "不要编造具体数据、采访、案例、机构结论、人物故事和百分比。",
    "",
    "## 写作规则",
    ...getRulesForPhase("drafting").map((rule, index) => `${index + 1}. ${rule}`),
    "整体写法：自然、有信息量、有判断感，不套固定风格模板。",
    "请严格返回 JSON，不要额外解释。",
  ].join("\n");
}

function buildDraftingUserPrompt(
  request: AIWriteGenerateRequest,
  plan: AIArticlePlan,
  qualityIssue?: string,
) {
  const resolvedDomain = resolveArticleDomain(request.domain);
  const domainConfig = domainConfigs[resolvedDomain];
  const wordCount = buildWordCountGuidance(request.targetWordCount);
  const sourceContext = isGithubTrendingDraft(request)
    ? getGithubTrendingSourceContextForPrompt(request.sourceContext)
    : request.sourceContext;

  return [
    "任务：基于既定标题和结构，写出完整公众号正文。",
    `主题：${request.topic.title}`,
    `文章领域：${resolvedDomain}`,
    `领域提醒：${domainConfig.promptHint}`,
    `文章类型：${request.articleType}`,
    `账号定位：${request.settings.accountPosition}`,
    `互动 CTA：${request.settings.ctaEngage}`,
    ...buildSourceContextPromptSections(sourceContext, "drafting"),
    ...buildGithubTrendingPromptSections(request, "drafting"),
    sourceContext?.content
      ? "写作要求：请先围绕“热点事实卡片”建立正文的事实骨架，再吸收详情页内容补充背景，但不要逐句复述，也不要补写未被确认的具体数据和情节。"
      : "",
    `最终标题：${plan.title}`,
    `摘要：${plan.summary}`,
    `写作角度：${plan.selectedAngle}`,
    `大纲：${plan.outline.join(" | ")}`,
    `${wordCount.sentence} 使用 ## 小标题分节，但不要把小标题写成固定模板，尽量自然一点。`,
    `硬性要求：最终正文必须落在 ${wordCount.min}-${wordCount.max} 字之间，并尽量直接命中 ${wordCount.normalized} 字。不能明显超出，也不能明显不足。`,
    "如果内容过多，优先压缩重复解释、弱信息和套话；如果内容不足，优先补充因果、影响和建议，但不要发散到无关新话题。",
    "正文至少要回答 4 个层次中的 3 个：这件事为什么发生、真正变化在哪里、对谁影响最大、接下来会出现什么后果。",
    "文中至少写出一个容易被忽略的代价、门槛或风险，不要只写机会和表面热度。",
    "结尾给出 2-3 条可执行建议，并自然收束到互动 CTA。",
    request.draft?.body ? `已有正文参考：${request.draft.body.slice(0, 600)}` : "",
    "## 自动质检重写要求",
    ...buildQualityRewriteNotes(qualityIssue),
    '请只返回 JSON：{"title":"","titleCandidates":[],"selectedAngle":"","summary":"","outline":[],"body":""}',
  ].filter(Boolean).join("\n");
}

function buildTransformInstruction(action: AITransformAction) {
  if (action === "rewrite") {
    return "在不改变核心观点的前提下，重写这段内容，重点去掉 AI 味：删填充词、拆模板句、压口号感、补自然节奏，让它更像成熟公众号作者亲手改过。";
  }

  if (action === "expand") {
    return "在保持原有观点的前提下扩写这段内容，补充解释、例子、转折和行动建议，让内容更完整。";
  }

  return "在保留核心观点和关键信息的前提下缩写这段内容，删掉空话套话，让节奏更紧凑。";
}

function buildTransformSystemPrompt() {
  return [
    "你是一位资深公众号编辑，专门负责润色和改写文章片段。",
    "请输出适合直接粘贴回公众号文章的中文文本。",
    "不要加引号、不要解释改动、不要列点说明。",
    "改写后不要有 AI 味，不要出现“总的来说”“不难发现”“值得一提的是”这类模板连接词。",
    ...getRulesForPhase("transform"),
    "请严格返回 JSON，不要额外解释。",
  ].join("\n");
}

function buildTransformUserPrompt(request: AIWriteTransformRequest) {
  const sourceText = request.selectedText?.trim() || request.body.trim();
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
    `账号定位：${request.settings.accountPosition}`,
    `互动 CTA：${request.settings.ctaEngage}`,
    "改写方向：更像公众号爆文作者，而不是报告写作者。多用短句，保留判断感和节奏感。",
    "去味清单：删掉填充连接词、空泛拔高、模糊归因、宣传腔、否定式排比和硬凑三连词；把能说具体的地方都说具体。",
    "不要编造新事实、案例、数据、采访和引用。",
    "不要为了显得高级而堆抽象词，优先把话说明白。",
    request.draft?.title ? `文章标题：${request.draft.title}` : "",
    request.draft?.summary ? `文章摘要：${request.draft.summary}` : "",
    `待处理文本：${sourceText}`,
    "请只返回 JSON：{\"transformedText\":\"\"}",
  ].filter(Boolean).join("\n");
}

async function adjustBodyToTargetWordCount(
  request: AIWriteGenerateRequest,
  plan: AIArticlePlan,
  body: string,
  qualityIssue?: string,
) {
  const initialMetrics = getBodyWordCountMetrics(body, request.targetWordCount);
  if (!initialMetrics.isTooShort && !initialMetrics.isTooLong) {
    return null;
  }

  let currentBody = body;
  let currentMetrics = initialMetrics;
  const usedModels: string[] = [];
  let provider = "";
  let currentQualityIssue = qualityIssue;

  for (let pass = 0; pass < BODY_WORD_COUNT_ADJUSTMENT_MAX_PASSES; pass += 1) {
    const { config, model, content } = await callCompatibleModel({
      systemPrompt: buildWordCountAdjustmentSystemPrompt(),
      userPrompt: buildWordCountAdjustmentUserPrompt(request, plan, currentBody, currentQualityIssue),
      temperature: 0.4,
      task: "transform",
    });

    try {
      const parsed = extractJsonPayload(content);
      const adjustedBody = polishBodyText(
        normalizeBodyText(parsed.transformedText, content.trim() || currentBody),
      );
      const adjustedMetrics = getBodyWordCountMetrics(adjustedBody, request.targetWordCount);
      const becameCloser =
        Math.abs(adjustedMetrics.actual - adjustedMetrics.normalized) < Math.abs(currentMetrics.actual - currentMetrics.normalized);
      const reachedTarget = !adjustedMetrics.isTooShort && !adjustedMetrics.isTooLong;

      if (!becameCloser && !reachedTarget) {
        break;
      }

      assertGeneratedBodyQuality(adjustedBody, currentBody);
      currentBody = adjustedBody;
      currentMetrics = adjustedMetrics;
      usedModels.push(model);
      provider = config.provider;
      currentQualityIssue = undefined;

      if (reachedTarget) {
        break;
      }
    } catch (error) {
      if (isQualityRetryError(error)) {
        currentQualityIssue = error.message;
        continue;
      }

      throw error;
    }
  }

  if (usedModels.length === 0) {
    return null;
  }

  return {
    body: currentBody,
    model: usedModels.join(" -> "),
    provider,
  };
}

async function draftBodyWithStrictWordCount(
  request: AIWriteGenerateRequest,
  plan: AIArticlePlan,
) {
  let lastResult: AIWriteResult | null = null;
  let lastWordCountStatus = null as ReturnType<typeof buildWordCountStatus> | null;
  const modelTrail: string[] = [];
  let provider = "";
  let qualityIssue: string | undefined;

  for (let attempt = 0; attempt <= BODY_REGENERATION_MAX_ATTEMPTS; attempt += 1) {
    const draftingResponse = await callCompatibleModel({
      systemPrompt: buildDraftingSystemPrompt(),
      userPrompt: buildDraftingUserPrompt(request, plan, qualityIssue),
      temperature: attempt === 0 ? 0.72 : 0.62,
      task: request.scope,
    });

    try {
      provider = draftingResponse.config.provider;
      const draftedResult = mergeBodyWithPlan(
        draftingResponse.content,
        plan,
        request.topic,
        request.draft?.body?.trim() ?? "",
      );
      const adjustedBodyResult = await adjustBodyToTargetWordCount(request, plan, draftedResult.body, qualityIssue);
      const result = adjustedBodyResult
        ? {
            ...draftedResult,
            body: adjustedBodyResult.body,
          }
        : draftedResult;
      const wordCountStatus = buildWordCountStatus(result.body, request.targetWordCount, Boolean(adjustedBodyResult));

      modelTrail.push(
        adjustedBodyResult?.model
          ? `${draftingResponse.model} -> ${adjustedBodyResult.model}`
          : draftingResponse.model,
      );

      lastResult = result;
      lastWordCountStatus = wordCountStatus;
      qualityIssue = undefined;

      if (wordCountStatus.inRange) {
        return {
          provider,
          model: modelTrail.join(" => "),
          result,
          wordCountStatus,
        };
      }
    } catch (error) {
      if (isQualityRetryError(error)) {
        qualityIssue = error.message;
        modelTrail.push(draftingResponse.model);
        continue;
      }

      throw error;
    }
  }

  if (!lastResult || !lastWordCountStatus) {
    throw createQualityRetryExhaustedError();
  }

  console.warn("AI body word count did not converge to target", {
    target: lastWordCountStatus.target,
    actual: lastWordCountStatus.actual,
    min: lastWordCountStatus.min,
    max: lastWordCountStatus.max,
  });

  return {
    provider,
    model: modelTrail.join(" => "),
    result: lastResult,
    wordCountStatus: lastWordCountStatus,
  };
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
  const protocol = detectProviderProtocol(config.baseUrl);
  const isXiaomiMiMo = isXiaomiMiMoBaseUrl(config.baseUrl);

  for (let attempt = 0; attempt <= MODEL_REQUEST_MAX_RETRIES; attempt += 1) {
    try {
      response = await fetch(protocol === "anthropic" ? `${config.baseUrl}/messages` : `${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: protocol === "anthropic"
          ? {
              "Content-Type": "application/json",
              "x-api-key": config.apiKey,
              ...(isXiaomiMiMo ? { "api-key": config.apiKey, Authorization: `Bearer ${config.apiKey}` } : {}),
              "anthropic-version": "2023-06-01",
            }
          : {
              Authorization: `Bearer ${config.apiKey}`,
              ...(isXiaomiMiMo ? { "api-key": config.apiKey } : {}),
              "Content-Type": "application/json",
            },
        signal: AbortSignal.timeout(getModelRequestTimeoutMs(task)),
        body: JSON.stringify(
          protocol === "anthropic"
            ? {
                model: currentModel,
                temperature,
                max_tokens: getAnthropicMaxTokens(task),
                system: systemPrompt,
                messages: [
                  { role: "user", content: userPrompt },
                ],
              }
            : {
                model: currentModel,
                temperature,
                ...(isXiaomiMiMo
                  ? {
                      max_completion_tokens: task === "title" || task === "outline" || task === "transform" ? 4096 : 16384,
                      top_p: 0.95,
                    }
                  : {}),
                messages: [
                  { role: "system", content: systemPrompt },
                  { role: "user", content: userPrompt },
                ],
              },
        ),
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
    const errorMessage = extractProviderErrorMessage(payload, `AI request failed with status ${response.status}`);
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

export async function completeAIText({
  systemPrompt,
  userPrompt,
  temperature = 0.2,
  task = "title",
}: {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  task?: AITextCompletionTask;
}) {
  return callCompatibleModel({
    systemPrompt,
    userPrompt,
    temperature,
    task,
  });
}

function mergeGeneratedResult(request: AIWriteGenerateRequest, rawText: string): AIWriteResult {
  const base = createBaseResult(request.topic, request.settings, request.draft);
  const parsed = extractJsonPayload(rawText);
  const existingBody = request.draft?.body?.trim() ?? "";
  const existingSummary = request.draft?.summary?.trim() ?? base.summary;
  const existingOutline = request.draft?.outline?.filter(Boolean).length ? request.draft.outline : [];

  const titleCandidates =
    request.scope === "full"
      ? []
      : resolveSafeTitleCandidates(
          normalizeStringList(parsed.titleCandidates, base.titleCandidates),
          base.titleCandidates,
          request.topic.title,
        );
  if (request.scope !== "full") {
    assertTitleCandidateDiversity(titleCandidates, request.topic.title);
  }
  const normalizedTitles = normalizeTitlesWithinLimit(
    normalizeText(parsed.title, titleCandidates[0] || base.title),
    titleCandidates.length ? titleCandidates : [base.title],
    base.title,
  );
  const title = normalizedTitles.title;
  const selectedAngle = normalizeSelectedAngle(parsed.selectedAngle, base.selectedAngle);
  const summary = polishSummaryText(normalizeText(parsed.summary, base.summary));
  const body = polishBodyText(normalizeBodyText(parsed.body, base.body));
  const outline = request.scope === "full"
    ? deriveOutlineFromBody(body)
    : polishOutlineItemsForTopic(request.topic, normalizeOutlineList(parsed.outline, base.outline));

  if (request.scope !== "title" && request.scope !== "full") {
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
      titleCandidates: normalizedTitles.titleCandidates,
      selectedAngle,
      summary: polishSummaryText(existingSummary),
      outline: polishOutlineItemsForTopic(request.topic, existingOutline),
      body: existingBody,
    };
  }

  if (request.scope === "outline") {
    assertGeneratedPlanningQuality(summary, outline, base.summary, base.outline, request.topic);
    assertResultConsistency(request.topic, { summary, outline, body: "" });
    return {
      ...base,
      selectedAngle,
      summary,
      outline: outline.length ? outline : polishOutlineItemsForTopic(request.topic, base.outline),
      body: existingBody,
    };
  }

  return {
    title,
    titleCandidates: request.scope === "full" ? [] : normalizedTitles.titleCandidates,
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
  const normalizedTitles = normalizeTitlesWithinLimit(
    normalizeText(parsed.title, titleCandidates[0] || base.title),
    titleCandidates,
    base.title,
  );
  const title = normalizedTitles.title;
  const selectedAngle = normalizeSelectedAngle(parsed.selectedAngle, base.selectedAngle);
  const summary = polishSummaryText(normalizeText(parsed.summary, base.summary));
  const outline = polishOutlineItemsForTopic(request.topic, normalizeOutlineList(parsed.outline, base.outline));

  assertOutlineDiversity(outline);
  assertGeneratedPlanningQuality(summary, outline, base.summary, base.outline, request.topic);
  assertResultConsistency(request.topic, { summary, outline, body: "" });

  return {
    title,
    titleCandidates: normalizedTitles.titleCandidates,
    selectedAngle,
    summary,
    outline: outline.length ? outline : polishOutlineItemsForTopic(request.topic, base.outline),
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
  const outline = polishOutlineItemsForTopic(topic, normalizeOutlineList(parsed.outline, plan.outline));
  const body = polishBodyText(normalizeBodyText(parsed.body, plan.body));

  const normalizedTitles = normalizeTitlesWithinLimit(
    normalizeText(parsed.title, plan.title),
    titleCandidates,
    plan.title,
  );
  const title = normalizedTitles.title;

  assertOutlineDiversity(outline);
  assertGeneratedBodyQuality(body, fallbackBody || plan.body);
  assertResultConsistency(topic, { summary: plan.summary, outline: plan.outline, body }, { requireBody: true });

  return {
    title,
    titleCandidates: normalizedTitles.titleCandidates,
    selectedAngle: normalizeSelectedAngle(parsed.selectedAngle, plan.selectedAngle),
    summary: polishSummaryText(normalizeText(parsed.summary, plan.summary)),
    outline: outline.length ? outline : polishOutlineItemsForTopic(topic, plan.outline),
    body,
  };
}

async function rewriteBodyAfterAIQualityCheck(request: AIWriteGenerateRequest, result: AIWriteResult) {
  const qualityIssue = getBodyQualityIssue(result.body, request.draft?.body?.trim() ?? "");
  if (!qualityIssue) {
    return null;
  }

  const plan: AIArticlePlan = {
    title: result.title,
    titleCandidates: result.titleCandidates,
    selectedAngle: result.selectedAngle,
    summary: result.summary,
    outline: result.outline.length ? result.outline : deriveOutlineFromBody(result.body),
    body: result.body,
  };
  const { config, model, content } = await callCompatibleModel({
    systemPrompt: buildWordCountAdjustmentSystemPrompt(),
    userPrompt: buildWordCountAdjustmentUserPrompt(request, plan, result.body, qualityIssue),
    temperature: 0.46,
    task: "transform",
  });
  const parsed = extractJsonPayload(content);
  const body = polishBodyText(normalizeBodyText(parsed.transformedText, content.trim() || result.body));

  assertGeneratedBodyQuality(body, result.body);
  assertResultConsistency(request.topic, { summary: result.summary, outline: result.outline, body }, { requireBody: true });

  return {
    provider: config.provider,
    model,
    result: {
      ...result,
      body,
      outline: result.outline.length ? result.outline : deriveOutlineFromBody(body),
    },
  };
}

function tryReuseExistingPlan(request: AIWriteGenerateRequest) {
  if (!request.draft) return null;

  const base = createBaseResult(request.topic, request.settings, request.draft);
  const summary = polishSummaryText(request.draft.summary ?? "");
  const outline = polishOutlineItemsForTopic(request.topic, request.draft.outline ?? []);

  if (!summary || !outline.length) {
    return null;
  }

  try {
    assertOutlineDiversity(outline);
    assertGeneratedPlanningQuality(summary, outline, "", [], request.topic);
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

async function generatePlanningWithQualityRetry(request: AIWriteGenerateRequest) {
  let qualityIssue: string | undefined;

  for (let attempt = 0; attempt <= QUALITY_REWRITE_MAX_ATTEMPTS; attempt += 1) {
    const planningResponse = await callCompatibleModel({
      systemPrompt: buildPlanningSystemPrompt(),
      userPrompt: buildPlanningUserPrompt(request, qualityIssue),
      temperature: attempt === 0 ? 0.72 : 0.62,
      task: "outline",
    });

    try {
      return {
        response: planningResponse,
        plan: mergePlanningResult(request, planningResponse.content),
      };
    } catch (error) {
      if (isQualityRetryError(error)) {
        qualityIssue = error.message;
        continue;
      }

      throw error;
    }
  }

  throw createQualityRetryExhaustedError();
}

async function generateFullArticleWithQualityRetry(request: AIWriteGenerateRequest) {
  let qualityIssue: string | undefined;

  for (let attempt = 0; attempt <= QUALITY_REWRITE_MAX_ATTEMPTS; attempt += 1) {
    const { config, model, content } = await callCompatibleModel({
      systemPrompt: buildGenerateSystemPrompt(request.scope),
      userPrompt: buildGenerateUserPrompt(request, qualityIssue),
      temperature: attempt === 0 ? 0.7 : 0.58,
      task: request.scope,
    });

    try {
      const result = mergeGeneratedResult(request, content);
      const rewritten = await rewriteBodyAfterAIQualityCheck(request, result);
      const finalResult = rewritten?.result ?? result;

      return {
        provider: rewritten?.provider ?? config.provider,
        model: rewritten ? `${model} -> ${rewritten.model}` : model,
        result: finalResult,
        wordCountStatus: buildWordCountStatus(finalResult.body, request.targetWordCount, Boolean(rewritten)),
      };
    } catch (error) {
      if (isQualityRetryError(error)) {
        qualityIssue = error.message;
        continue;
      }

      throw error;
    }
  }

  throw createQualityRetryExhaustedError();
}

async function generatePartialArticleWithQualityRetry(request: AIWriteGenerateRequest) {
  let qualityIssue: string | undefined;

  for (let attempt = 0; attempt <= QUALITY_REWRITE_MAX_ATTEMPTS; attempt += 1) {
    const { config, model, content } = await callCompatibleModel({
      systemPrompt: buildGenerateSystemPrompt(request.scope),
      userPrompt: buildGenerateUserPrompt(request, qualityIssue),
      temperature: request.scope === "title" && !qualityIssue ? 0.82 : 0.64,
      task: request.scope,
    });

    try {
      const mergedResult = mergeGeneratedResult(request, content);
      const adjustedResult =
        request.scope === "title" || request.scope === "outline"
          ? await adjustTitlesToLength(request, mergedResult)
          : mergedResult;

      return {
        provider: config.provider,
        model,
        result: adjustedResult,
        wordCountStatus: undefined,
      };
    } catch (error) {
      if (isQualityRetryError(error)) {
        qualityIssue = error.message;
        continue;
      }

      throw error;
    }
  }

  throw createQualityRetryExhaustedError();
}

export async function generateWechatArticle(request: AIWriteGenerateRequest) {
  if (request.scope === "full") {
    return generateFullArticleWithQualityRetry(request);
  }

  if (request.scope === "body") {
    const reusedPlan = tryReuseExistingPlan(request);
    const planningGeneration = reusedPlan ? null : await generatePlanningWithQualityRetry(request);
    const plan = reusedPlan ?? planningGeneration!.plan;
    const bodyGeneration = await draftBodyWithStrictWordCount(request, plan);
    assertResultConsistency(request.topic, { summary: bodyGeneration.result.summary, outline: bodyGeneration.result.outline, body: bodyGeneration.result.body }, { requireBody: true });

    return {
      provider: bodyGeneration.provider,
      model: planningGeneration
        ? `${planningGeneration.response.model} -> ${bodyGeneration.model}`
        : bodyGeneration.model,
      result: bodyGeneration.result,
      wordCountStatus: bodyGeneration.wordCountStatus,
    };
  }

  return generatePartialArticleWithQualityRetry(request);
}

export async function transformWechatText(request: AIWriteTransformRequest) {
  const { config, model, content } = await callCompatibleModel({
    systemPrompt: buildTransformSystemPrompt(),
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

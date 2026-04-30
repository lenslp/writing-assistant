import { articleDomains, detectArticleDomainWithSignals, resolveArticleDomain, type ArticleDomain, type DomainDetectionResult } from "./content-domains";
import { readAIProviderSecret } from "./app-config-db";

type ProviderProtocol = "openai" | "anthropic";

type ProviderConfig = {
  configured: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
};

const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_MODEL = "qwen-turbo";
const REQUEST_TIMEOUT_MS = 18000;
const SYSTEM_PROMPT = [
  "你是一个中文热点分类器。",
  `只允许输出这些类目之一：${articleDomains.join("、")}。`,
  "目标是把热点分到最贴近读者理解的内容领域，而不是按平台来源机械归类。",
  "不要输出解释文本，不要输出 markdown，只返回 JSON。",
].join("\n");

function getEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

function detectProviderProtocol(baseUrl: string): ProviderProtocol {
  return baseUrl.includes("anthropic") ? "anthropic" : "openai";
}

async function getAIProviderConfig(): Promise<ProviderConfig> {
  const storedConfig = await readAIProviderSecret().catch(() => null);
  const apiKey = storedConfig?.apiKey || getEnv("AI_API_KEY") || getEnv("OPENAI_API_KEY");
  const baseUrl = (storedConfig?.baseUrl || getEnv("AI_BASE_URL") || getEnv("OPENAI_BASE_URL") || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const model = storedConfig?.fastModel || storedConfig?.model || getEnv("AI_MODEL") || getEnv("OPENAI_MODEL") || DEFAULT_MODEL;

  return {
    configured: Boolean(apiKey),
    apiKey,
    baseUrl,
    model,
  };
}

function extractMessageContent(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";

  const anthropicContent = (payload as { content?: unknown }).content;
  if (Array.isArray(anthropicContent)) {
    return anthropicContent
      .map((item) => {
        if (!item || typeof item !== "object") return "";
        if ("type" in item && item.type !== "text") return "";
        if ("text" in item && typeof item.text === "string") return item.text;
        return "";
      })
      .join("\n")
      .trim();
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

  if (typeof firstChoice?.text === "string") return firstChoice.text;
  return "";
}

function extractJsonPayload(text: string) {
  const trimmed = text.trim();
  const codeFenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (codeFenceMatch?.[1] ?? trimmed).trim();
  const objectStart = candidate.indexOf("{");
  const objectEnd = candidate.lastIndexOf("}");
  const jsonText = objectStart >= 0 && objectEnd > objectStart ? candidate.slice(objectStart, objectEnd + 1) : candidate;
  return JSON.parse(jsonText) as Record<string, unknown>;
}

type DomainClassifierInput = {
  title: string;
  tags: string[];
  source: string;
  summary?: string;
  ruleResult: DomainDetectionResult;
};

export type AssistedDomainResult = {
  domain: ArticleDomain;
  ruleDomain: ArticleDomain;
  confidence: DomainDetectionResult["confidence"];
  usedAi: boolean;
};

export async function classifyDomainWithAI(input: DomainClassifierInput): Promise<ArticleDomain | null> {
  const config = await getAIProviderConfig();
  if (!config.configured) return null;

  const protocol = detectProviderProtocol(config.baseUrl);
  const userPrompt = JSON.stringify({
    title: input.title,
    source: input.source,
    tags: input.tags,
    summary: input.summary ?? "",
    currentRuleDomain: input.ruleResult.domain,
    currentRuleConfidence: input.ruleResult.confidence,
    candidateDomains: articleDomains,
    instruction: "返回最合适的单一 domain，尽量减少“其他”，但不要硬分到明显不匹配的类目。",
    outputSchema: {
      domain: articleDomains,
    },
  });

  const response = await fetch(protocol === "anthropic" ? `${config.baseUrl}/messages` : `${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: protocol === "anthropic"
      ? {
          "Content-Type": "application/json",
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01",
        }
      : {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    body: JSON.stringify(
      protocol === "anthropic"
        ? {
            model: config.model,
            temperature: 0,
            max_tokens: 200,
            system: SYSTEM_PROMPT,
            messages: [{ role: "user", content: userPrompt }],
          }
        : {
            model: config.model,
            temperature: 0,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: userPrompt },
            ],
          },
    ),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload
      ? ((payload as { error?: { message?: string } }).error?.message ?? "AI 分类失败")
      : "AI 分类失败";
    throw new Error(message);
  }

  const content = extractMessageContent(payload);
  if (!content) return null;

  const parsed = extractJsonPayload(content);
  const domain = typeof parsed.domain === "string" ? resolveArticleDomain(parsed.domain) : "其他";
  return domain || null;
}

export async function resolveDomainWithAIAssist(input: {
  title: string;
  tags: string[];
  source: string;
  summary?: string;
}): Promise<AssistedDomainResult> {
  const ruleResult = detectArticleDomainWithSignals(input.title, input.tags, input.source, input.summary ?? "");

  if (!ruleResult.shouldUseAiAssist) {
    return {
      domain: ruleResult.domain,
      ruleDomain: ruleResult.ruleDomain,
      confidence: ruleResult.confidence,
      usedAi: false,
    };
  }

  const aiDomain = await classifyDomainWithAI({
    ...input,
    ruleResult,
  }).catch((error) => {
    console.error("AI domain classification failed:", error);
    return null;
  });

  return {
    domain: aiDomain ?? ruleResult.domain,
    ruleDomain: ruleResult.ruleDomain,
    confidence: ruleResult.confidence,
    usedAi: Boolean(aiDomain),
  };
}

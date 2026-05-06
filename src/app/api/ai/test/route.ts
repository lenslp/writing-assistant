import { NextResponse } from "next/server";
import { getAIProviderConfig } from "../../../lib/ai-writing";
import { readAIProviderConfig } from "../../../lib/app-config-db";

export const dynamic = "force-dynamic";

type TestPayload = {
  providerType?: "openai" | "anthropic";
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  fastModel?: string;
  longformModel?: string;
};

function detectProviderProtocol(baseUrl: string) {
  return baseUrl.includes("anthropic") ? "anthropic" as const : "openai" as const;
}

function normalizeAIProviderBaseUrl(baseUrl: string) {
  return baseUrl
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/chat\/completions$/i, "")
    .replace(/\/messages$/i, "");
}

function isXiaomiMiMoBaseUrl(baseUrl: string) {
  return /xiaomimimo\.com/i.test(baseUrl);
}

function extractMessageContent(payload: unknown) {
  const directOutputText = payload && typeof payload === "object" && "output_text" in payload
    ? (payload as { output_text?: unknown }).output_text
    : null;
  if (typeof directOutputText === "string" && directOutputText.trim()) {
    return directOutputText.trim();
  }

  const anthropicContent = payload && typeof payload === "object" && "content" in payload
    ? (payload as { content?: unknown }).content
    : null;

  if (Array.isArray(anthropicContent)) {
    const text = anthropicContent
      .map((item) => {
        if (!item || typeof item !== "object") return "";
        if ("type" in item && item.type !== "text") return "";
        return "text" in item && typeof item.text === "string" ? item.text : "";
      })
      .join("\n")
      .trim();

    if (text) return text;
  }

  const responseOutput = payload && typeof payload === "object" && "output" in payload
    ? (payload as { output?: unknown }).output
    : null;
  if (Array.isArray(responseOutput)) {
    const text = responseOutput
      .flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const content = "content" in item ? (item as { content?: unknown }).content : null;
        if (!Array.isArray(content)) return [];
        return content.map((block) => {
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

  const geminiCandidates = payload && typeof payload === "object" && "candidates" in payload
    ? (payload as { candidates?: unknown }).candidates
    : null;
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

  const choices = payload && typeof payload === "object" && "choices" in payload
    ? (payload as { choices?: unknown }).choices
    : null;

  if (!Array.isArray(choices)) return "";

  const message = choices[0] && typeof choices[0] === "object" && "message" in choices[0]
    ? (choices[0] as { message?: unknown }).message
    : null;

  if (message && typeof message === "object" && "content" in message && typeof (message as { content?: unknown }).content === "string") {
    return (message as { content: string }).content.trim();
  }

  if (message && typeof message === "object" && "content" in message && Array.isArray((message as { content?: unknown }).content)) {
    const text = ((message as { content: Array<unknown> }).content ?? [])
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "text" in item && typeof item.text === "string") {
          return item.text;
        }
        return "";
      })
      .join("\n")
      .trim();
    if (text) return text;
  }

  if (message && typeof message === "object" && "reasoning_content" in message && typeof (message as { reasoning_content?: unknown }).reasoning_content === "string") {
    return ((message as { reasoning_content: string }).reasoning_content ?? "").trim();
  }

  return "";
}

function extractErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: unknown }).error;
    if (error && typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string") {
      return (error as { message: string }).message;
    }
  }

  return fallback;
}

function classifyModelError(status: number, message: string) {
  if (status === 401 || status === 403 || /api.?key|auth|unauthorized|forbidden|permission/i.test(message)) {
    return "认证失败，请检查 API Key。";
  }

  if (status === 404 || /model|not found|does not exist|invalid model/i.test(message)) {
    return "模型名不可用，请检查模型名称。";
  }

  if (status === 400 || /unsupported|invalid request|schema|parameter/i.test(message)) {
    return "接口格式不兼容，请确认当前服务支持所选协议。";
  }

  return message || "模型连接测试失败。";
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null) as TestPayload | null;
  const savedConfig = await getAIProviderConfig();
  const summary = await readAIProviderConfig();
  const activeProfile = summary.activeProfile;
  const runtimeBaseUrl = normalizeAIProviderBaseUrl(payload?.baseUrl?.trim() || savedConfig.baseUrl);
  const runtimeApiKey = payload?.apiKey?.trim() || savedConfig.apiKey;
  const model =
    payload?.model?.trim() ||
    payload?.fastModel?.trim() ||
    payload?.longformModel?.trim() ||
    activeProfile?.model ||
    activeProfile?.fastModel ||
    activeProfile?.longformModel ||
    "qwen-turbo";
  const config = {
    ...savedConfig,
    configured: Boolean(runtimeApiKey),
    apiKey: runtimeApiKey,
    baseUrl: runtimeBaseUrl,
    provider: detectProviderProtocol(runtimeBaseUrl) === "anthropic" ? "Anthropic" : "OpenAI Compatible",
  };
  const protocol = detectProviderProtocol(config.baseUrl);
  const isXiaomiMiMo = isXiaomiMiMoBaseUrl(config.baseUrl);

  if (!config.configured) {
    return NextResponse.json(
      {
        ok: false,
        provider: config.provider,
        model,
        message: "AI 写作模型尚未配置，请先保存 API Key、Base URL 和模型名。",
      },
      { status: 503 },
    );
  }

  try {
    const response = await fetch(protocol === "anthropic" ? `${config.baseUrl}/messages` : `${config.baseUrl}/chat/completions`, {
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
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify(
        protocol === "anthropic"
          ? {
              model,
              temperature: 0,
              max_tokens: 32,
              system: "你只用于测试接口连通性。",
              messages: [
                { role: "user", content: "请回复：连接成功" },
              ],
            }
          : {
              model,
              temperature: 0,
              max_tokens: 24,
              ...(isXiaomiMiMo
                ? {
                    max_completion_tokens: 128,
                    top_p: 0.95,
                    thinking: { type: "disabled" },
                  }
                : {}),
              messages: [
                { role: "system", content: "你只用于测试接口连通性。" },
                { role: "user", content: "请回复：连接成功" },
              ],
            },
      ),
    });
    const payload = await response.json().catch(() => null);
    const content = extractMessageContent(payload);

    if (!response.ok) {
      const rawMessage = extractErrorMessage(payload, `HTTP ${response.status}`);
      return NextResponse.json(
        {
          ok: false,
          provider: config.provider,
          model,
          message: classifyModelError(response.status, rawMessage),
          rawMessage,
        },
        { status: 400 },
      );
    }

    if (!content) {
      return NextResponse.json(
        {
          ok: false,
          provider: config.provider,
          model,
          message: protocol === "anthropic" ? "Anthropic 接口返回为空，请检查模型权限或响应格式。" : "模型接口返回为空，请检查中转服务兼容性。",
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      provider: config.provider,
      model,
      message: "模型连接测试通过。",
      sample: content,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        provider: config.provider,
        model,
        message: error instanceof Error ? `模型接口连接失败：${error.message}` : "模型接口连接失败。",
      },
      { status: 500 },
    );
  }
}

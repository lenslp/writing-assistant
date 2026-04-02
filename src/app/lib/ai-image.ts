type ImageProviderConfig = {
  configured: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
  provider: string;
};

const DEFAULT_IMAGE_BASE_URL = "https://api.openai.com/v1";

function getEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

function detectProvider(baseUrl: string) {
  if (baseUrl.includes("dashscope") || baseUrl.includes("aliyuncs")) return "Qwen / DashScope Compatible";
  if (baseUrl.includes("openrouter")) return "OpenRouter";
  if (baseUrl.includes("siliconflow")) return "SiliconFlow";
  if (baseUrl.includes("openai")) return "OpenAI";
  return "OpenAI Compatible";
}

export function getAIImageConfig(): ImageProviderConfig {
  const apiKey = getEnv("AI_IMAGE_API_KEY") || getEnv("OPENAI_IMAGE_API_KEY") || getEnv("AI_API_KEY") || getEnv("OPENAI_API_KEY");
  const baseUrl = (
    getEnv("AI_IMAGE_BASE_URL") ||
    getEnv("OPENAI_IMAGE_BASE_URL") ||
    getEnv("AI_BASE_URL") ||
    getEnv("OPENAI_BASE_URL") ||
    DEFAULT_IMAGE_BASE_URL
  ).replace(/\/+$/, "");
  const model = getEnv("AI_IMAGE_MODEL") || getEnv("OPENAI_IMAGE_MODEL");

  return {
    configured: Boolean(apiKey && model),
    apiKey,
    baseUrl,
    model,
    provider: detectProvider(baseUrl),
  };
}

export async function generateArticleImage(prompt: string) {
  const config = getAIImageConfig();

  if (!config.configured) {
    throw new Error("AI 图片模型未配置，请补充 AI_IMAGE_MODEL 及对应 API Key。");
  }

  const response = await fetch(`${config.baseUrl}/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      prompt,
      size: "1024x1024",
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      (payload && typeof payload === "object" && "error" in payload && payload.error && typeof payload.error === "object" && "message" in payload.error && typeof payload.error.message === "string"
        ? payload.error.message
        : "") || "AI 图片生成失败",
    );
  }

  const firstItem = Array.isArray((payload as { data?: unknown[] })?.data) ? (payload as { data: Array<Record<string, unknown>> }).data[0] : null;
  const url = firstItem && typeof firstItem.url === "string" ? firstItem.url : "";
  const b64 = firstItem && typeof firstItem.b64_json === "string" ? firstItem.b64_json : "";

  if (!url && !b64) {
    throw new Error("AI 图片接口未返回可用图片。");
  }

  return {
    provider: config.provider,
    model: config.model,
    url: url || `data:image/png;base64,${b64}`,
  };
}

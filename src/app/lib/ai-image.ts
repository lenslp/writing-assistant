import sharp from "sharp";
import { readAIImageProviderSecret } from "./app-config-db";

type ImageProviderConfig = {
  configured: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
  provider: string;
};

const DEFAULT_IMAGE_BASE_URL = "https://api.openai.com/v1";
const DASHSCOPE_IMAGE_SYNC_PATH = "/services/aigc/multimodal-generation/generation";
const DASHSCOPE_IMAGE_ASYNC_PATH = "/services/aigc/image-generation/generation";
const DASHSCOPE_TASK_PATH = "/tasks";
const NORMALIZED_IMAGE_MIME = "image/jpeg";
const NORMALIZED_IMAGE_QUALITY = 88;
const DASHSCOPE_TASK_TIMEOUT_MS = 180000;
const DASHSCOPE_TASK_POLL_INTERVAL_MS = 2500;

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

function isDashScopeQwenImageModel(model: string, baseUrl: string) {
  return /^qwen-image-2\.0/i.test(model) && (baseUrl.includes("dashscope.aliyuncs.com") || baseUrl.includes("dashscope-intl.aliyuncs.com"));
}

function isDashScopeWanImageModel(model: string, baseUrl: string) {
  return /^wan2\.7-image(?:-pro)?/i.test(model) && (baseUrl.includes("dashscope.aliyuncs.com") || baseUrl.includes("dashscope-intl.aliyuncs.com"));
}

function resolveDashScopeImageBaseUrl(baseUrl: string) {
  const normalized = baseUrl.replace(/\/+$/, "");

  if (normalized.includes("dashscope-intl.aliyuncs.com")) {
    return "https://dashscope-intl.aliyuncs.com/api/v1";
  }

  if (normalized.includes("dashscope.aliyuncs.com")) {
    return "https://dashscope.aliyuncs.com/api/v1";
  }

  return normalized.replace(/\/compatible-mode\/v1$/i, "/api/v1");
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function extractDashScopeImageUrl(payload: unknown) {
  const content = payload && typeof payload === "object" && "output" in payload && payload.output && typeof payload.output === "object"
    && "choices" in payload.output && Array.isArray(payload.output.choices)
    ? payload.output.choices[0]?.message?.content
    : null;

  return Array.isArray(content)
    ? content.find((item) => item && typeof item === "object" && "image" in item && typeof item.image === "string")?.image || ""
    : "";
}

function extractDashScopeErrorMessage(payload: unknown) {
  return (
    (payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
      ? payload.message
      : "") ||
    (payload && typeof payload === "object" && "code" in payload && typeof payload.code === "string"
      ? payload.code
      : "") ||
    "AI 图片生成失败"
  );
}

async function waitForDashScopeTask(baseUrl: string, apiKey: string, taskId: string) {
  const deadline = Date.now() + DASHSCOPE_TASK_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const response = await fetch(`${baseUrl}${DASHSCOPE_TASK_PATH}/${taskId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(extractDashScopeErrorMessage(payload));
    }

    const taskStatus =
      payload && typeof payload === "object" && "output" in payload && payload.output && typeof payload.output === "object"
        && "task_status" in payload.output && typeof payload.output.task_status === "string"
        ? payload.output.task_status
        : "";

    if (taskStatus === "SUCCEEDED") {
      return payload;
    }

    if (taskStatus === "FAILED" || taskStatus === "CANCELED" || taskStatus === "UNKNOWN") {
      throw new Error(extractDashScopeErrorMessage(payload) || `AI 图片生成失败：${taskStatus}`);
    }

    await sleep(DASHSCOPE_TASK_POLL_INTERVAL_MS);
  }

  throw new Error("AI 图片生成超时，请稍后重试。");
}

export async function getAIImageConfig(): Promise<ImageProviderConfig> {
  const storedConfig = await readAIImageProviderSecret().catch((error) => {
    console.error("Failed to read AI image provider config:", error);
    return null;
  });
  const apiKey = storedConfig?.apiKey || getEnv("AI_IMAGE_API_KEY") || getEnv("OPENAI_IMAGE_API_KEY") || getEnv("AI_API_KEY") || getEnv("OPENAI_API_KEY");
  const baseUrl = (
    storedConfig?.baseUrl ||
    getEnv("AI_IMAGE_BASE_URL") ||
    getEnv("OPENAI_IMAGE_BASE_URL") ||
    getEnv("AI_BASE_URL") ||
    getEnv("OPENAI_BASE_URL") ||
    DEFAULT_IMAGE_BASE_URL
  ).replace(/\/+$/, "");
  const model = storedConfig?.model || getEnv("AI_IMAGE_MODEL") || getEnv("OPENAI_IMAGE_MODEL");

  return {
    configured: Boolean(apiKey && model),
    apiKey,
    baseUrl,
    model,
    provider: detectProvider(baseUrl),
  };
}

async function normalizeImageBufferToJpeg(buffer: Buffer) {
  return sharp(buffer)
    .rotate()
    .jpeg({
      quality: NORMALIZED_IMAGE_QUALITY,
      mozjpeg: true,
    })
    .toBuffer();
}

async function fetchImageBufferFromUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载 AI 图片失败：${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function normalizeGeneratedImageUrl(url: string) {
  if (url.startsWith("data:")) {
    const match = url.match(/^data:(.+?);base64,(.+)$/);
    if (!match) {
      throw new Error("AI 图片 data URL 格式不正确。");
    }

    const normalized = await normalizeImageBufferToJpeg(Buffer.from(match[2], "base64"));
    return `data:${NORMALIZED_IMAGE_MIME};base64,${normalized.toString("base64")}`;
  }

  const normalized = await normalizeImageBufferToJpeg(await fetchImageBufferFromUrl(url));
  return `data:${NORMALIZED_IMAGE_MIME};base64,${normalized.toString("base64")}`;
}

export async function generateArticleImage(prompt: string) {
  const config = await getAIImageConfig();

  if (!config.configured) {
    throw new Error("AI 图片模型未配置，请补充 AI_IMAGE_MODEL 及对应 API Key。");
  }

  if (isDashScopeQwenImageModel(config.model, config.baseUrl)) {
    const dashscopeBaseUrl = resolveDashScopeImageBaseUrl(config.baseUrl);
    const response = await fetch(`${dashscopeBaseUrl}${DASHSCOPE_IMAGE_SYNC_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        input: {
          messages: [
            {
              role: "user",
              content: [
                {
                  text: prompt,
                },
              ],
            },
          ],
        },
        parameters: {
          size: "1024*1024",
          n: 1,
          prompt_extend: false,
          watermark: false,
        },
      }),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(extractDashScopeErrorMessage(payload));
    }

    const imageUrl = extractDashScopeImageUrl(payload);

    if (!imageUrl) {
      throw new Error("AI 图片接口未返回可用图片。");
    }

    return {
      provider: config.provider,
      model: config.model,
      url: await normalizeGeneratedImageUrl(imageUrl),
    };
  }

  if (isDashScopeWanImageModel(config.model, config.baseUrl)) {
    const dashscopeBaseUrl = resolveDashScopeImageBaseUrl(config.baseUrl);
    const createResponse = await fetch(`${dashscopeBaseUrl}${DASHSCOPE_IMAGE_ASYNC_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        "X-DashScope-Async": "enable",
      },
      body: JSON.stringify({
        model: config.model,
        input: {
          messages: [
            {
              role: "user",
              content: [
                {
                  text: prompt,
                },
              ],
            },
          ],
        },
        parameters: {
          size: "2K",
          n: 1,
          watermark: false,
          thinking_mode: true,
        },
      }),
    });

    const createPayload = await createResponse.json().catch(() => null);
    if (!createResponse.ok) {
      throw new Error(extractDashScopeErrorMessage(createPayload));
    }

    const taskId =
      createPayload && typeof createPayload === "object" && "output" in createPayload && createPayload.output && typeof createPayload.output === "object"
        && "task_id" in createPayload.output && typeof createPayload.output.task_id === "string"
        ? createPayload.output.task_id
        : "";

    if (!taskId) {
      throw new Error("AI 图片任务创建失败，未返回 task_id。");
    }

    const resultPayload = await waitForDashScopeTask(dashscopeBaseUrl, config.apiKey, taskId);
    const imageUrl = extractDashScopeImageUrl(resultPayload);

    if (!imageUrl) {
      throw new Error("AI 图片接口未返回可用图片。");
    }

    return {
      provider: config.provider,
      model: config.model,
      url: await normalizeGeneratedImageUrl(imageUrl),
    };
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
    url: await normalizeGeneratedImageUrl(url || `data:image/png;base64,${b64}`),
  };
}

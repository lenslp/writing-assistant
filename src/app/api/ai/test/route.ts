import { NextResponse } from "next/server";
import { getAIProviderConfig } from "../../../lib/ai-writing";
import { readAIProviderConfig } from "../../../lib/app-config-db";

export const dynamic = "force-dynamic";

function extractMessageContent(payload: unknown) {
  const choices = payload && typeof payload === "object" && "choices" in payload
    ? (payload as { choices?: unknown }).choices
    : null;

  if (!Array.isArray(choices)) return "";

  const message = choices[0] && typeof choices[0] === "object" && "message" in choices[0]
    ? (choices[0] as { message?: unknown }).message
    : null;

  return message && typeof message === "object" && "content" in message && typeof (message as { content?: unknown }).content === "string"
    ? (message as { content: string }).content.trim()
    : "";
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
    return "接口格式不兼容，请确认中转服务支持 OpenAI chat/completions。";
  }

  return message || "模型连接测试失败。";
}

export async function POST() {
  const config = await getAIProviderConfig();
  const summary = await readAIProviderConfig();
  const model = summary.fastModel || summary.model || summary.longformModel || "qwen-turbo";

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
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 24,
        messages: [
          { role: "system", content: "你只用于测试接口连通性。" },
          { role: "user", content: "请回复：连接成功" },
        ],
      }),
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
          message: "模型接口返回为空，请检查中转服务兼容性。",
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

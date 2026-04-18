import { NextResponse } from "next/server";
import {
  generateWechatArticle,
  getAIProviderConfig,
  transformWechatText,
} from "../../../lib/ai-writing";
import { getRestrictedReason } from "../../../lib/content-policy";
import { resolveHotTopicSourceContext } from "../../../lib/hot-topic-context";
import type { AIWriteRequest } from "../../../lib/ai-writing-types";

export const dynamic = "force-dynamic";
const SOURCE_CONTEXT_TIME_BUDGET_MS = 2500;

function isValidRequest(payload: unknown): payload is AIWriteRequest {
  if (!payload || typeof payload !== "object" || !("mode" in payload)) {
    return false;
  }

  const mode = (payload as { mode?: unknown }).mode;

  if (mode === "generate") {
    return (
      "scope" in payload &&
      typeof (payload as { scope?: unknown }).scope === "string" &&
      "topic" in payload &&
      typeof (payload as { topic?: unknown }).topic === "object" &&
      "settings" in payload &&
      typeof (payload as { settings?: unknown }).settings === "object"
    );
  }

  if (mode === "transform") {
    return (
      "action" in payload &&
      typeof (payload as { action?: unknown }).action === "string" &&
      "body" in payload &&
      typeof (payload as { body?: unknown }).body === "string" &&
      "topic" in payload &&
      typeof (payload as { topic?: unknown }).topic === "object" &&
      "settings" in payload &&
      typeof (payload as { settings?: unknown }).settings === "object"
    );
  }

  return false;
}

export async function POST(request: Request) {
  const config = getAIProviderConfig();

  if (!config.configured) {
    return NextResponse.json(
      {
        configured: false,
        provider: config.provider,
        model: "unconfigured",
        message: "AI 写作模型尚未配置，请先补充 AI_API_KEY / OPENAI_API_KEY 等环境变量。",
      },
      { status: 503 },
    );
  }

  try {
    const payload = (await request.json()) as unknown;

    if (!isValidRequest(payload)) {
      return NextResponse.json(
        {
          configured: true,
          provider: config.provider,
          model: "request-invalid",
          message: "无效的 AI 写作请求。",
        },
        { status: 400 },
      );
    }

    const restrictionReason = getRestrictedReason(
      {
        title: payload.topic?.title,
        summary: "draft" in payload && payload.draft?.summary ? payload.draft.summary : "",
        source: payload.topic?.source,
        tags: payload.topic?.tags,
        angles: payload.topic?.angles,
      },
      Array.isArray(payload.settings?.bannedTopics) ? payload.settings.bannedTopics : [],
    );

    if (restrictionReason) {
      return NextResponse.json(
        {
          configured: true,
          provider: config.provider,
          model: "topic-blocked",
          message: `当前选题命中禁写规则，已禁止生成：${restrictionReason}。`,
        },
        { status: 403 },
      );
    }

    if (payload.mode === "generate") {
      const sourceContextPromise = resolveHotTopicSourceContext(payload.topic).catch((error) => {
        console.error("Failed to resolve hot topic source context:", error);
        return null;
      });
      const sourceContext = await Promise.race<Awaited<typeof sourceContextPromise> | null>([
        sourceContextPromise,
        new Promise<null>((resolve) => {
          setTimeout(() => resolve(null), SOURCE_CONTEXT_TIME_BUDGET_MS);
        }),
      ]);

      const result = await generateWechatArticle({
        ...payload,
        sourceContext,
      });

      return NextResponse.json({
        configured: true,
        provider: result.provider,
        model: result.model,
        result: result.result,
        sourceContextUsed: Boolean(sourceContext?.content),
      });
    }

    if (!payload.body.trim()) {
      return NextResponse.json(
        {
          configured: true,
          provider: config.provider,
          model: "request-invalid",
          message: "缺少可改写的正文内容。",
        },
        { status: 400 },
      );
    }

    const result = await transformWechatText(payload);
    return NextResponse.json({
      configured: true,
      provider: result.provider,
      model: result.model,
      transformedText: result.transformedText,
    });
  } catch (error) {
    console.error("Failed to write article with AI:", error);

    return NextResponse.json(
      {
        configured: true,
        provider: config.provider,
        model: "request-failed",
        message: error instanceof Error ? error.message : "AI 写作失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}

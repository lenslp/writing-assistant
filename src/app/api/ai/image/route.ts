import { NextResponse } from "next/server";
import { generateArticleImage, getAIImageConfig } from "../../../lib/ai-image";

export const dynamic = "force-dynamic";

type Payload = {
  prompt?: string;
  title?: string;
  summary?: string;
  domain?: string;
};

function buildPrompt(payload: Payload) {
  if (payload.prompt?.trim()) {
    return payload.prompt.trim();
  }

  return [
    payload.domain ? `领域：${payload.domain}` : "",
    payload.title ? `文章标题：${payload.title}` : "",
    payload.summary ? `内容摘要：${payload.summary}` : "",
    "生成一张适合中文公众号文章排版的高质量配图，简洁、有质感、适合作为正文插图，不要出现明显文字水印。",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function POST(request: Request) {
  const config = getAIImageConfig();

  if (!config.configured) {
    return NextResponse.json(
      {
        configured: false,
        provider: config.provider,
        model: config.model || "unconfigured",
        message: "AI 图片模型尚未配置，请先补充 AI_IMAGE_MODEL 和图片 API Key。",
      },
      { status: 503 },
    );
  }

  try {
    const payload = (await request.json()) as Payload;
    const prompt = buildPrompt(payload);

    if (!prompt) {
      return NextResponse.json({ message: "缺少图片生成提示词。" }, { status: 400 });
    }

    const result = await generateArticleImage(prompt);

    return NextResponse.json({
      configured: true,
      provider: result.provider,
      model: result.model,
      url: result.url,
      prompt,
    });
  } catch (error) {
    console.error("Failed to generate AI image:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "AI 图片生成失败，请稍后重试。" },
      { status: 500 },
    );
  }
}

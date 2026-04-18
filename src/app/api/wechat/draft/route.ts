import { NextResponse } from "next/server";
import { resolveArticleDomain } from "../../../lib/content-domains";
import { getWechatConfig, pushArticleToWechatDraft } from "../../../lib/wechat-draft";

export const dynamic = "force-dynamic";

type RequestPayload = {
  title?: string;
  summary?: string;
  body?: string;
  author?: string;
  domain?: string;
  accountId?: string | null;
};

function isValidPayload(payload: unknown): payload is RequestPayload {
  return Boolean(payload && typeof payload === "object");
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as unknown;
  if (!isValidPayload(payload)) {
    return NextResponse.json({ message: "无效的公众号草稿请求。" }, { status: 400 });
  }

  const config = await getWechatConfig(payload.accountId ?? null);

  if (!config.configured) {
    return NextResponse.json(
      {
        configured: false,
        message: "微信公众号配置未完成，请先在设置页配置公众号账号。",
      },
      { status: 503 },
    );
  }

  try {
    const title = payload.title?.trim() ?? "";
    const summary = payload.summary?.trim() ?? "";
    const body = payload.body?.trim() ?? "";

    if (!title || !body) {
      return NextResponse.json({ message: "标题和正文不能为空。" }, { status: 400 });
    }

    const result = await pushArticleToWechatDraft({
      title,
      summary,
      body,
      author: payload.author?.trim() || config.accountName || config.defaultAuthor,
      domain: resolveArticleDomain(payload.domain),
      accountId: payload.accountId ?? null,
    });

    return NextResponse.json({
      configured: true,
      ok: true,
      accountId: result.accountId,
      accountName: result.accountName,
      mediaId: result.mediaId,
      articleCount: result.articleCount,
      digestTruncated: result.digestTruncated,
    });
  } catch (error) {
    console.error("Failed to push draft to WeChat:", error);
    return NextResponse.json(
      {
        configured: true,
        message: error instanceof Error ? error.message : "推送公众号草稿箱失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}

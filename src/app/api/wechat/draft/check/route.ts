import { NextResponse } from "next/server";
import { resolveArticleDomain } from "../../../../lib/content-domains";
import { precheckWechatDraft } from "../../../../lib/wechat-draft";
import { requireAuthenticatedUser } from "../../../../lib/api-auth";
import { toPublicErrorMessage } from "../../../../lib/public-error";

export const dynamic = "force-dynamic";

type RequestPayload = {
  title?: string;
  summary?: string;
  body?: string;
  author?: string;
  domain?: string;
  accountId?: string | null;
};

export async function POST(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;

  const payload = (await request.json().catch(() => null)) as RequestPayload | null;

  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ message: "无效的公众号草稿检查请求。" }, { status: 400 });
  }

  try {
    const result = await precheckWechatDraft({
      userId: auth.user.id,
      title: payload.title?.trim() ?? "",
      summary: payload.summary?.trim() ?? "",
      body: payload.body?.trim() ?? "",
      author: payload.author?.trim() ?? "",
      domain: resolveArticleDomain(payload.domain),
      accountId: payload.accountId ?? null,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to precheck WeChat draft:", error);
    return NextResponse.json(
      { message: toPublicErrorMessage(error, "公众号草稿检查失败。") },
      { status: 500 },
    );
  }
}

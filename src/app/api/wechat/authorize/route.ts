import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "../../../lib/api-auth";
import { createWechatThirdPartyAuthorizeUrl } from "../../../lib/wechat-open-platform";
import { toPublicErrorMessage } from "../../../lib/public-error";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;

  try {
    const authorizeUrl = await createWechatThirdPartyAuthorizeUrl(auth.user.id);
    return NextResponse.json({ authorizeUrl });
  } catch (error) {
    console.error("Failed to create WeChat authorize URL:", error);
    return NextResponse.json(
      { message: toPublicErrorMessage(error, "微信第三方授权入口生成失败。") },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { exchangeWechatAuthorizationCode, verifyWechatAuthState } from "../../../../lib/wechat-open-platform";
import { upsertWechatAuthorizedAccount } from "../../../../lib/app-config-db";
import { toPublicErrorMessage } from "../../../../lib/public-error";

export const dynamic = "force-dynamic";

function renderResultPage(title: string, message: string) {
  return new Response(
    `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${title}</title></head><body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;background:#f8fafc;color:#111827;"><main style="max-width:520px;margin:14vh auto;padding:32px 24px;background:#fff;border:1px solid #e5e7eb;border-radius:16px;box-shadow:0 20px 60px rgba(15,23,42,.08);"><h1 style="margin:0 0 12px;font-size:22px;">${title}</h1><p style="margin:0;color:#4b5563;line-height:1.8;font-size:14px;">${message}</p></main></body></html>`,
    {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const authCode = url.searchParams.get("auth_code")?.trim() ?? "";
  const state = url.searchParams.get("state")?.trim() ?? "";

  if (!authCode || !state) {
    return renderResultPage("微信授权失败", "授权回调缺少 auth_code 或 state，请回到设置页重新发起授权。");
  }

  try {
    const { userId } = verifyWechatAuthState(state);
    const authorization = await exchangeWechatAuthorizationCode(authCode);
    await upsertWechatAuthorizedAccount(userId, authorization);

    return renderResultPage("微信授权成功", "公众号已授权到当前账号。可以关闭此页面，回到设置页刷新账号列表。");
  } catch (error) {
    console.error("Failed to handle WeChat authorize callback:", error);
    return renderResultPage(
      "微信授权失败",
      toPublicErrorMessage(error, "微信授权回调处理失败，请稍后重试。"),
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}

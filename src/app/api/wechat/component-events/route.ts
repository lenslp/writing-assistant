import { NextResponse } from "next/server";
import {
  parseWechatComponentEvent,
  saveWechatComponentVerifyTicket,
  verifyWechatComponentCallbackToken,
} from "../../../lib/wechat-open-platform";
import { toPublicErrorMessage } from "../../../lib/public-error";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    verifyWechatComponentCallbackToken(request);
    const url = new URL(request.url);
    return new Response(url.searchParams.get("echostr") ?? "ok");
  } catch (error) {
    console.error("Failed to verify WeChat component event callback:", error);
    return NextResponse.json(
      { message: toPublicErrorMessage(error, "微信授权事件验证失败。") },
      { status: 403 },
    );
  }
}

export async function POST(request: Request) {
  try {
    verifyWechatComponentCallbackToken(request);
    const event = await parseWechatComponentEvent(request);

    if (event.infoType === "component_verify_ticket" && event.componentAppId && event.verifyTicket) {
      await saveWechatComponentVerifyTicket({
        componentAppId: event.componentAppId,
        verifyTicket: event.verifyTicket,
      });
    }

    return new Response("success");
  } catch (error) {
    console.error("Failed to handle WeChat component event:", error);
    return NextResponse.json(
      { message: toPublicErrorMessage(error, "微信授权事件处理失败。") },
      { status: 400 },
    );
  }
}

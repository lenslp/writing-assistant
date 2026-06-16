import { NextResponse } from "next/server";
import {
  deleteWechatOfficialAccount,
  readWechatIntegration,
  selectWechatOfficialAccount,
} from "../../../lib/app-config-db";
import { hasPersistenceBackend } from "../../../lib/persistence";
import { verifyWechatAccountConnection } from "../../../lib/wechat-draft";
import { requireAuthenticatedUser } from "../../../lib/api-auth";
import { toPublicErrorMessage } from "../../../lib/public-error";

export const dynamic = "force-dynamic";

type UpsertPayload = {
  id?: string;
  name?: string;
  appId?: string;
  appSecret?: string;
  defaultAuthor?: string;
  contentSourceUrl?: string;
  setAsSelected?: boolean;
};

type PatchPayload = {
  action?: string;
  account?: UpsertPayload;
  selectedAccountId?: string | null;
  accountId?: string | null;
};

export async function GET(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;

  if (!hasPersistenceBackend()) {
    return NextResponse.json({ accounts: [], selectedAccountId: null, persisted: false });
  }

  try {
    const result = await readWechatIntegration(auth.user.id);
    return NextResponse.json({ ...result, persisted: true });
  } catch (error) {
    console.error("Failed to read WeChat accounts:", error);
    return NextResponse.json({ accounts: [], selectedAccountId: null, persisted: false });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;

  if (!hasPersistenceBackend()) {
    return NextResponse.json({ message: "数据服务暂不可用，请稍后重试。" }, { status: 503 });
  }

  try {
    const payload = (await request.json()) as PatchPayload;

    if (payload.action === "select") {
      const result = await selectWechatOfficialAccount(auth.user.id, payload.selectedAccountId ?? null);
      return NextResponse.json({ ...result, persisted: true });
    }

    if (payload.action === "verify") {
      const result = await verifyWechatAccountConnection(auth.user.id, payload.accountId ?? payload.selectedAccountId ?? null);
      return NextResponse.json({ ...result, ok: true, persisted: true });
    }

    if (payload.action === "upsert" && payload.account) {
      return NextResponse.json(
        { message: "线上模式不再支持手动保存公众号 AppSecret，请通过微信第三方平台授权接入公众号。" },
        { status: 410 },
      );
    }

    return NextResponse.json({ message: "无效的公众号账号请求。" }, { status: 400 });
  } catch (error) {
    console.error("Failed to update WeChat accounts:", error);
    return NextResponse.json(
      { message: toPublicErrorMessage(error, "公众号账号更新失败") },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;

  if (!hasPersistenceBackend()) {
    return NextResponse.json({ message: "数据服务暂不可用，请稍后重试。" }, { status: 503 });
  }

  try {
    const payload = (await request.json().catch(() => null)) as { id?: string } | null;
    const id = payload?.id?.trim() ?? "";

    if (!id) {
      return NextResponse.json({ message: "缺少公众号账号 ID。" }, { status: 400 });
    }

    const result = await deleteWechatOfficialAccount(auth.user.id, id);
    return NextResponse.json({ ...result, persisted: true });
  } catch (error) {
    console.error("Failed to delete WeChat account:", error);
    return NextResponse.json(
      { message: toPublicErrorMessage(error, "公众号账号删除失败") },
      { status: 500 },
    );
  }
}

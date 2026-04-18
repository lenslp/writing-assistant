import { NextResponse } from "next/server";
import {
  deleteWechatOfficialAccount,
  readWechatIntegration,
  selectWechatOfficialAccount,
  upsertWechatOfficialAccount,
} from "../../../lib/app-config-db";
import { hasPersistenceBackend } from "../../../lib/persistence";
import { verifyWechatAccountConnection } from "../../../lib/wechat-draft";

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

export async function GET() {
  if (!hasPersistenceBackend()) {
    return NextResponse.json({ accounts: [], selectedAccountId: null, persisted: false });
  }

  try {
    const result = await readWechatIntegration();
    return NextResponse.json({ ...result, persisted: true });
  } catch (error) {
    console.error("Failed to read WeChat accounts:", error);
    return NextResponse.json({ accounts: [], selectedAccountId: null, persisted: false });
  }
}

export async function PATCH(request: Request) {
  if (!hasPersistenceBackend()) {
    return NextResponse.json({ message: "No persistence backend is configured" }, { status: 500 });
  }

  try {
    const payload = (await request.json()) as PatchPayload;

    if (payload.action === "select") {
      const result = await selectWechatOfficialAccount(payload.selectedAccountId ?? null);
      return NextResponse.json({ ...result, persisted: true });
    }

    if (payload.action === "verify") {
      const result = await verifyWechatAccountConnection(payload.accountId ?? payload.selectedAccountId ?? null);
      return NextResponse.json({ ...result, ok: true, persisted: true });
    }

    if (payload.action === "upsert" && payload.account) {
      const account = payload.account;
      const result = await upsertWechatOfficialAccount({
        id: account.id,
        name: account.name?.trim() ?? "",
        appId: account.appId?.trim() ?? "",
        appSecret: account.appSecret?.trim() ?? "",
        defaultAuthor: account.defaultAuthor?.trim() ?? "",
        contentSourceUrl: account.contentSourceUrl?.trim() ?? "",
        setAsSelected: Boolean(account.setAsSelected),
      });

      return NextResponse.json({ ...result, persisted: true });
    }

    return NextResponse.json({ message: "Invalid WeChat account patch" }, { status: 400 });
  } catch (error) {
    console.error("Failed to update WeChat accounts:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to update WeChat accounts" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  if (!hasPersistenceBackend()) {
    return NextResponse.json({ message: "No persistence backend is configured" }, { status: 500 });
  }

  try {
    const payload = (await request.json().catch(() => null)) as { id?: string } | null;
    const id = payload?.id?.trim() ?? "";

    if (!id) {
      return NextResponse.json({ message: "Missing account id" }, { status: 400 });
    }

    const result = await deleteWechatOfficialAccount(id);
    return NextResponse.json({ ...result, persisted: true });
  } catch (error) {
    console.error("Failed to delete WeChat account:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to delete WeChat account" },
      { status: 500 },
    );
  }
}

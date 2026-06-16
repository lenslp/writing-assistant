import { NextResponse } from "next/server";
import { deleteDraftById, patchDraft, readDraftById } from "../../../lib/draft-db";
import { hasPersistenceBackend } from "../../../lib/persistence";
import { requireAuthenticatedUser } from "../../../lib/api-auth";

type RouteContext = {
  params: Promise<{
    draftId: string;
  }>;
};

export const dynamic = "force-dynamic";

export async function GET(_: Request, context: RouteContext) {
  const auth = await requireAuthenticatedUser(_);
  if (auth.response) return auth.response;

  if (!hasPersistenceBackend()) {
    return NextResponse.json({ item: null, persisted: false });
  }

  const { draftId } = await context.params;

  try {
    const item = await readDraftById(draftId, auth.user.id);
    return NextResponse.json({ item, persisted: true });
  } catch (error) {
    console.error("Failed to read draft:", error);
    return NextResponse.json({ item: null, persisted: false }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;

  if (!hasPersistenceBackend()) {
    return NextResponse.json({ message: "数据服务暂不可用，请稍后重试。" }, { status: 503 });
  }

  const { draftId } = await context.params;

  try {
    const payload = await request.json();
    const patch = payload?.patch;

    if (!patch || typeof patch !== "object") {
      return NextResponse.json({ message: "无效的草稿更新请求。" }, { status: 400 });
    }

    const item = await patchDraft(draftId, patch, auth.user.id);
    if (!item) {
      return NextResponse.json({ message: "草稿不存在或已删除。" }, { status: 404 });
    }

    return NextResponse.json({ item, persisted: true });
  } catch (error) {
    console.error("Failed to update draft:", error);
    return NextResponse.json({ message: "更新草稿失败，请稍后重试。" }, { status: 500 });
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  const auth = await requireAuthenticatedUser(_);
  if (auth.response) return auth.response;

  if (!hasPersistenceBackend()) {
    return NextResponse.json({ message: "数据服务暂不可用，请稍后重试。" }, { status: 503 });
  }

  const { draftId } = await context.params;

  try {
    await deleteDraftById(draftId, auth.user.id);
    return NextResponse.json({ ok: true, persisted: true });
  } catch (error) {
    console.error("Failed to delete draft:", error);
    return NextResponse.json({ message: "删除草稿失败，请稍后重试。" }, { status: 500 });
  }
}

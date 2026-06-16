import { NextResponse } from "next/server";
import { readDraftById, upsertDraft } from "../../../../lib/draft-db";
import { hasPersistenceBackend } from "../../../../lib/persistence";
import { requireAuthenticatedUser } from "../../../../lib/api-auth";

type RouteContext = {
  params: Promise<{
    draftId: string;
  }>;
};

export const dynamic = "force-dynamic";

export async function POST(_: Request, context: RouteContext) {
  const auth = await requireAuthenticatedUser(_);
  if (auth.response) return auth.response;

  if (!hasPersistenceBackend()) {
    return NextResponse.json({ message: "数据服务暂不可用，请稍后重试。" }, { status: 503 });
  }

  const { draftId } = await context.params;

  try {
    const sourceDraft = await readDraftById(draftId, auth.user.id);
    if (!sourceDraft) {
      return NextResponse.json({ message: "草稿不存在或已删除。" }, { status: 404 });
    }

    const duplicated = await upsertDraft({
      ...sourceDraft,
      id: `${sourceDraft.id}-copy-${Date.now()}`,
      title: `${sourceDraft.title}（副本）`,
      status: "待修改",
      updatedAt: new Date().toISOString(),
    }, auth.user.id);

    return NextResponse.json({ item: duplicated, persisted: true });
  } catch (error) {
    console.error("Failed to duplicate draft:", error);
    return NextResponse.json({ message: "复制草稿失败，请稍后重试。" }, { status: 500 });
  }
}

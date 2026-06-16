import { NextResponse } from "next/server";
import { deleteTopicById } from "../../../lib/topic-db";
import { hasPersistenceBackend } from "../../../lib/persistence";
import { requireAuthenticatedUser } from "../../../lib/api-auth";

type RouteContext = {
  params: Promise<{
    topicId: string;
  }>;
};

export const dynamic = "force-dynamic";

export async function DELETE(_: Request, context: RouteContext) {
  const auth = await requireAuthenticatedUser(_);
  if (auth.response) return auth.response;

  if (!hasPersistenceBackend()) {
    return NextResponse.json({ message: "数据服务暂不可用，请稍后重试。" }, { status: 503 });
  }

  const { topicId } = await context.params;

  try {
    await deleteTopicById(topicId, auth.user.id);
    return NextResponse.json({ ok: true, persisted: true });
  } catch (error) {
    console.error("Failed to delete topic:", error);
    return NextResponse.json({ message: "删除选题失败，请稍后重试。" }, { status: 500 });
  }
}

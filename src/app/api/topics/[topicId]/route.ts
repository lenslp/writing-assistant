import { NextResponse } from "next/server";
import { deleteTopicById } from "../../../lib/topic-db";
import { hasPersistenceBackend } from "../../../lib/persistence";

type RouteContext = {
  params: Promise<{
    topicId: string;
  }>;
};

export const dynamic = "force-dynamic";

export async function DELETE(_: Request, context: RouteContext) {
  if (!hasPersistenceBackend()) {
    return NextResponse.json({ message: "No persistence backend is configured" }, { status: 500 });
  }

  const { topicId } = await context.params;

  try {
    await deleteTopicById(topicId);
    return NextResponse.json({ ok: true, persisted: true });
  } catch (error) {
    console.error("Failed to delete topic:", error);
    return NextResponse.json({ message: "Failed to delete topic" }, { status: 500 });
  }
}

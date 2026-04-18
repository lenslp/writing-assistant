import { NextResponse } from "next/server";
import { readDraftById, upsertDraft } from "../../../../lib/draft-db";
import { hasPersistenceBackend } from "../../../../lib/persistence";

type RouteContext = {
  params: Promise<{
    draftId: string;
  }>;
};

export const dynamic = "force-dynamic";

export async function POST(_: Request, context: RouteContext) {
  if (!hasPersistenceBackend()) {
    return NextResponse.json({ message: "No persistence backend is configured" }, { status: 500 });
  }

  const { draftId } = await context.params;

  try {
    const sourceDraft = await readDraftById(draftId);
    if (!sourceDraft) {
      return NextResponse.json({ message: "Draft not found" }, { status: 404 });
    }

    const duplicated = await upsertDraft({
      ...sourceDraft,
      id: `${sourceDraft.id}-copy-${Date.now()}`,
      title: `${sourceDraft.title}（副本）`,
      status: "待修改",
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ item: duplicated, persisted: true });
  } catch (error) {
    console.error("Failed to duplicate draft:", error);
    return NextResponse.json({ message: "Failed to duplicate draft" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { deleteDraftById, patchDraft, readDraftById } from "../../../lib/draft-db";
import { hasPersistenceBackend } from "../../../lib/persistence";

type RouteContext = {
  params: Promise<{
    draftId: string;
  }>;
};

export const dynamic = "force-dynamic";

export async function GET(_: Request, context: RouteContext) {
  if (!hasPersistenceBackend()) {
    return NextResponse.json({ item: null, persisted: false });
  }

  const { draftId } = await context.params;

  try {
    const item = await readDraftById(draftId);
    return NextResponse.json({ item, persisted: true });
  } catch (error) {
    console.error("Failed to read draft:", error);
    return NextResponse.json({ item: null, persisted: false }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  if (!hasPersistenceBackend()) {
    return NextResponse.json({ message: "No persistence backend is configured" }, { status: 500 });
  }

  const { draftId } = await context.params;

  try {
    const payload = await request.json();
    const patch = payload?.patch;

    if (!patch || typeof patch !== "object") {
      return NextResponse.json({ message: "Invalid draft patch" }, { status: 400 });
    }

    const item = await patchDraft(draftId, patch);
    if (!item) {
      return NextResponse.json({ message: "Draft not found" }, { status: 404 });
    }

    return NextResponse.json({ item, persisted: true });
  } catch (error) {
    console.error("Failed to update draft:", error);
    return NextResponse.json({ message: "Failed to update draft" }, { status: 500 });
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  if (!hasPersistenceBackend()) {
    return NextResponse.json({ message: "No persistence backend is configured" }, { status: 500 });
  }

  const { draftId } = await context.params;

  try {
    await deleteDraftById(draftId);
    return NextResponse.json({ ok: true, persisted: true });
  } catch (error) {
    console.error("Failed to delete draft:", error);
    return NextResponse.json({ message: "Failed to delete draft" }, { status: 500 });
  }
}

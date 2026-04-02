import { NextResponse } from "next/server";
import { readDrafts, upsertDraft } from "../../lib/draft-db";
import { hasDatabaseUrl } from "../../lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ items: [], persisted: false });
  }

  try {
    const items = await readDrafts();
    return NextResponse.json({ items, persisted: true });
  } catch (error) {
    console.error("Failed to read drafts:", error);
    return NextResponse.json({ items: [], persisted: false }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ message: "DATABASE_URL is not configured" }, { status: 500 });
  }

  try {
    const payload = await request.json();
    const draft = payload?.draft;

    if (!draft || typeof draft !== "object") {
      return NextResponse.json({ message: "Invalid draft payload" }, { status: 400 });
    }

    const item = await upsertDraft(draft);
    return NextResponse.json({ item, persisted: true });
  } catch (error) {
    console.error("Failed to create draft:", error);
    return NextResponse.json({ message: "Failed to create draft" }, { status: 500 });
  }
}

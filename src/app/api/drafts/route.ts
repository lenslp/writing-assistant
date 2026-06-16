import { NextResponse } from "next/server";
import { readDrafts, upsertDraft } from "../../lib/draft-db";
import { hasPersistenceBackend } from "../../lib/persistence";
import { requireAuthenticatedUser } from "../../lib/api-auth";
import type { Draft } from "../../lib/app-data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;

  if (!hasPersistenceBackend()) {
    return NextResponse.json({ items: [], persisted: false });
  }

  try {
    const items = await readDrafts(auth.user.id);
    return NextResponse.json({ items, persisted: true });
  } catch (error) {
    console.error("Failed to read drafts:", error);
    return NextResponse.json({ items: [], persisted: false });
  }
}

export async function POST(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;

  let draft: Draft | null = null;
  try {
    const payload = await request.json();
    draft = payload?.draft;
  } catch {
    return NextResponse.json({ message: "无效的草稿请求。" }, { status: 400 });
  }

  if (!draft || typeof draft !== "object") {
    return NextResponse.json({ message: "无效的草稿请求。" }, { status: 400 });
  }

  if (!hasPersistenceBackend()) {
    return NextResponse.json({
      item: draft,
      persisted: false,
      message: "草稿已保存在本地，远端同步暂不可用。",
    });
  }

  try {
    const item = await upsertDraft(draft, auth.user.id);
    return NextResponse.json({ item, persisted: true });
  } catch (error) {
    console.error("Failed to create draft:", error);
    return NextResponse.json({
      item: draft,
      persisted: false,
      message: "草稿已保存在本地，远端同步暂不可用。",
    });
  }
}

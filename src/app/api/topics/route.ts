import { NextResponse } from "next/server";
import { readTopics, upsertTopicRecord } from "../../lib/topic-db";
import { hasPersistenceBackend } from "../../lib/persistence";
import { requireAuthenticatedUser } from "../../lib/api-auth";
import { toPublicErrorMessage } from "../../lib/public-error";
import type { TopicSuggestion } from "../../lib/app-data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;

  if (!hasPersistenceBackend()) {
    return NextResponse.json({ items: [], persisted: false });
  }

  try {
    const items = await readTopics(auth.user.id);
    return NextResponse.json({ items, persisted: true });
  } catch (error) {
    console.error("Failed to read topics:", error);
    return NextResponse.json({ items: [], persisted: false });
  }
}

export async function POST(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;

  let topic: TopicSuggestion | null = null;
  try {
    const payload = await request.json();
    topic = payload?.topic;
  } catch {
    return NextResponse.json({ message: "无效的选题请求。" }, { status: 400 });
  }

  if (!topic || typeof topic !== "object") {
    return NextResponse.json({ message: "无效的选题请求。" }, { status: 400 });
  }

  if (!hasPersistenceBackend()) {
    return NextResponse.json({
      item: topic,
      persisted: false,
      message: "选题已保存在本地，远端同步暂不可用。",
    });
  }

  try {
    const item = await upsertTopicRecord(topic, auth.user.id);
    return NextResponse.json({ item, persisted: true });
  } catch (error) {
    console.error("Failed to save topic:", error);
    const message = toPublicErrorMessage(error, "保存选题失败");
    if (message.includes("安全策略拦截")) {
      return NextResponse.json({ message }, { status: 400 });
    }

    return NextResponse.json({
      item: topic,
      persisted: false,
      message: "选题已保存在本地，远端同步暂不可用。",
    });
  }
}

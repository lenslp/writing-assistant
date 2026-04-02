import { NextResponse } from "next/server";
import { readTopics, upsertTopicRecord } from "../../lib/topic-db";
import { hasDatabaseUrl } from "../../lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ items: [], persisted: false });
  }

  try {
    const items = await readTopics();
    return NextResponse.json({ items, persisted: true });
  } catch (error) {
    console.error("Failed to read topics:", error);
    return NextResponse.json({ items: [], persisted: false }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ message: "DATABASE_URL is not configured" }, { status: 500 });
  }

  try {
    const payload = await request.json();
    const topic = payload?.topic;

    if (!topic || typeof topic !== "object") {
      return NextResponse.json({ message: "Invalid topic payload" }, { status: 400 });
    }

    const item = await upsertTopicRecord(topic);
    return NextResponse.json({ item, persisted: true });
  } catch (error) {
    console.error("Failed to save topic:", error);
    const message = error instanceof Error ? error.message : "Failed to save topic";
    const status = message.includes("安全策略拦截") ? 400 : 500;
    return NextResponse.json({ message }, { status });
  }
}

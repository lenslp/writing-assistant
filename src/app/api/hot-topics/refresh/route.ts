import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { buildHotTopicTimeLabel } from "../../../lib/hot-topics";
import {
  ARTICLE_ANALYSIS_CACHE_TAG,
  HOT_TOPICS_CACHE_TAG,
  refreshHotTopicsAndPersist,
} from "../../../lib/hot-topic-refresh";

export const dynamic = "force-dynamic";

function isAuthorizedCronRequest(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;

  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function refreshHotTopics() {
  try {
    const result = await refreshHotTopicsAndPersist();

    revalidateTag(HOT_TOPICS_CACHE_TAG);
    revalidateTag(ARTICLE_ANALYSIS_CACHE_TAG);

    if (!result.persisted) {
      return NextResponse.json(
        {
          ok: false,
          persisted: false,
          message: result.message,
          generatedTopicCount: result.generatedTopicCount,
          restrictedCount: result.restrictedCount,
          items: result.items.slice(0, 360).map((item) => ({
            ...item,
            time: buildHotTopicTimeLabel(item),
          })),
          failedSources: result.failedSources,
        },
        { status: 200 },
      );
    }

    return NextResponse.json({
      ok: true,
      persisted: true,
      insertedCount: result.insertedCount,
      generatedTopicCount: result.generatedTopicCount,
      restrictedCount: result.restrictedCount,
      failedSources: result.failedSources,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return NextResponse.json(
      { ok: false, persisted: false, message: `入库失败：${message}`, failedSources: [] },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json(
      { ok: false, message: "Unauthorized cron request" },
      { status: 401 },
    );
  }

  return refreshHotTopics();
}

export async function POST() {
  return refreshHotTopics();
}

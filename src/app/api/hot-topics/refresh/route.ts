import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { formatFetchedTime } from "../../../lib/hot-topics";
import {
  ARTICLE_ANALYSIS_CACHE_TAG,
  HOT_TOPICS_CACHE_TAG,
  refreshHotTopicsAndPersist,
} from "../../../lib/hot-topic-refresh";

export const dynamic = "force-dynamic";

export async function POST() {
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
          items: result.items.slice(0, 240).map((item) => ({
            ...item,
            time: formatFetchedTime(item.fetchedAt),
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

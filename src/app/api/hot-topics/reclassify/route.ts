import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import {
  ARTICLE_ANALYSIS_CACHE_TAG,
  HOT_TOPICS_CACHE_TAG,
} from "../../../lib/hot-topic-refresh";
import { hasPersistenceBackend } from "../../../lib/persistence";
import { reclassifyTopicRecords } from "../../../lib/topic-db";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!hasPersistenceBackend()) {
    return NextResponse.json({ message: "No persistence backend is configured" }, { status: 500 });
  }

  try {
    const result = await reclassifyTopicRecords();

    revalidateTag(HOT_TOPICS_CACHE_TAG);
    revalidateTag(ARTICLE_ANALYSIS_CACHE_TAG);

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    console.error("Failed to reclassify hot topics:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "热点重新归类失败" },
      { status: 500 },
    );
  }
}

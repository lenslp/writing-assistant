import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import {
  ARTICLE_ANALYSIS_CACHE_TAG,
  HOT_TOPICS_CACHE_TAG,
  clearHotTopicsSnapshotCache,
} from "../../../lib/hot-topic-refresh";
import { hasPersistenceBackend } from "../../../lib/persistence";
import { reclassifyHotTopicRecords } from "../../../lib/hot-topic-db";
import { reclassifyTopicRecords } from "../../../lib/topic-db";
import { requireAuthenticatedUser } from "../../../lib/api-auth";
import { toPublicErrorMessage } from "../../../lib/public-error";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;

  if (!hasPersistenceBackend()) {
    return NextResponse.json({ message: "数据服务暂不可用，请稍后重试。" }, { status: 503 });
  }

  try {
    const [topicResult, hotTopicResult] = await Promise.all([
      reclassifyTopicRecords(auth.user.id),
      reclassifyHotTopicRecords(),
    ]);

    revalidateTag(HOT_TOPICS_CACHE_TAG);
    revalidateTag(ARTICLE_ANALYSIS_CACHE_TAG);
    clearHotTopicsSnapshotCache();

    return NextResponse.json({
      ok: true,
      total: Math.max(topicResult.total, hotTopicResult.total),
      updatedCount: Math.max(topicResult.updatedCount, hotTopicResult.updatedCount),
      topicUpdatedCount: topicResult.updatedCount,
      hotTopicUpdatedCount: hotTopicResult.updatedCount,
    });
  } catch (error) {
    console.error("Failed to reclassify hot topics:", error);
    return NextResponse.json(
      { message: toPublicErrorMessage(error, "热点重新归类失败") },
      { status: 500 },
    );
  }
}

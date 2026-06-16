import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { buildHotTopicTimeLabel } from "../../../lib/hot-topics";
import {
  ARTICLE_ANALYSIS_CACHE_TAG,
  HOT_TOPICS_CACHE_TAG,
  cacheHotTopicsSnapshot,
  clearHotTopicsSnapshotCache,
  refreshHotTopicsAndPersist,
} from "../../../lib/hot-topic-refresh";
import { requireAuthenticatedUser } from "../../../lib/api-auth";
import { toPublicFailedSources } from "../../../lib/public-error";

export const dynamic = "force-dynamic";

function isAuthorizedCronRequest(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;

  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function refreshHotTopics() {
  try {
    const result = await refreshHotTopicsAndPersist();

    clearHotTopicsSnapshotCache();
    revalidateTag(HOT_TOPICS_CACHE_TAG);
    revalidateTag(ARTICLE_ANALYSIS_CACHE_TAG);

    if (!result.persisted) {
      const publicFailedSources = toPublicFailedSources(result.failedSources, "抓取失败");
      const items = result.items.slice(0, 360).map((item) => ({
        ...item,
        time: buildHotTopicTimeLabel(item),
      }));
      cacheHotTopicsSnapshot(items, {
        source: "live",
        persisted: false,
        restrictedCount: result.restrictedCount,
        failedSources: publicFailedSources,
        refreshed: true,
      });

      return NextResponse.json(
        {
          ok: false,
          persisted: false,
          message: "已拉取实时热点，但暂未写入数据库。",
          generatedTopicCount: result.generatedTopicCount,
          restrictedCount: result.restrictedCount,
          items,
          failedSources: publicFailedSources,
        },
        { status: 200 },
      );
    }

    const publicFailedSources = toPublicFailedSources(result.failedSources, "抓取失败");
    return NextResponse.json({
      ok: true,
      persisted: true,
      insertedCount: result.insertedCount,
      generatedTopicCount: result.generatedTopicCount,
      restrictedCount: result.restrictedCount,
      failedSources: publicFailedSources,
    });
  } catch (error) {
    console.error("Failed to refresh hot topics:", error);

    return NextResponse.json(
      { ok: false, persisted: false, message: "热点刷新失败，请稍后重试。", failedSources: [] },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json(
      { ok: false, message: "无权执行热点刷新任务。" },
      { status: 401 },
    );
  }

  return refreshHotTopics();
}

export async function POST(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;

  return refreshHotTopics();
}

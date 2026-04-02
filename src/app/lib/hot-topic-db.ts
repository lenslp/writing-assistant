import { prisma } from "./prisma";
import { filterRestrictedTopics } from "./content-policy";
import { formatFetchedTime, normalizeTrend, pickTopHotTopicsPerSource, type HotTopicItem } from "./hot-topics";

export function mapHotTopicRecord(item: {
  id: string;
  title: string;
  source: string;
  sourceType: string;
  heat: number;
  trendScore: number;
  tags: string[];
  url: string | null;
  summary: string | null;
  fetchedAt: Date;
}) {
  return {
    id: item.id,
    title: item.title,
    source: item.source,
    sourceType: item.sourceType,
    heat: item.heat,
    trend: normalizeTrend(item.trendScore),
    time: formatFetchedTime(item.fetchedAt.toISOString()),
    tags: item.tags,
    url: item.url ?? undefined,
    summary: item.summary ?? undefined,
    fetchedAt: item.fetchedAt.toISOString(),
  } satisfies HotTopicItem;
}

export async function readHotTopics(limit: number) {
  const latestSuccessJob = await prisma.fetchJob.findFirst({
    where: {
      jobType: "hot-topics-refresh",
      status: "success",
    },
    orderBy: [{ finishedAt: "desc" }, { createdAt: "desc" }],
    select: { createdAt: true, finishedAt: true },
  });

  const latestBatchStartAt = latestSuccessJob
    ? new Date(latestSuccessJob.createdAt.getTime() - 60 * 1000)
    : null;

  let items = latestBatchStartAt
    ? await prisma.hotTopic.findMany({
      where: {
        fetchedAt: {
          gte: latestBatchStartAt,
        },
      },
      orderBy: [{ fetchedAt: "desc" }, { heat: "desc" }],
      take: Math.max(limit * 6, 180),
    })
    : [];

  if (!items.length) {
    items = await prisma.hotTopic.findMany({
      orderBy: [{ heat: "desc" }, { fetchedAt: "desc" }],
      take: Math.max(limit * 2, 240),
    });
  }

  const mappedItems = items.map(mapHotTopicRecord);
  const { allowed } = filterRestrictedTopics(mappedItems);
  const selectedItems = pickTopHotTopicsPerSource(allowed, 30);

  return selectedItems.slice(0, limit);
}

export async function readHotTopicRefreshMeta() {
  const latestJob = await prisma.fetchJob.findFirst({
    where: {
      jobType: "hot-topics-refresh",
      status: "success",
    },
    orderBy: [{ finishedAt: "desc" }, { createdAt: "desc" }],
    select: { payload: true, finishedAt: true },
  });

  const payload = latestJob?.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { restrictedCount: 0 };
  }

  const restrictedCount = "restrictedCount" in payload && typeof payload.restrictedCount === "number"
    ? payload.restrictedCount
    : 0;

  return {
    restrictedCount,
    lastSuccessAt: latestJob?.finishedAt?.toISOString() ?? null,
  };
}

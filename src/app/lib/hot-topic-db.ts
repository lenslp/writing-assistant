import { prisma } from "./prisma";
import { hasDatabaseUrl } from "./prisma";
import { getSupabaseAdmin } from "./supabase-admin";
import type { TopicSuggestion } from "./app-data";
import { filterRestrictedTopics } from "./content-policy";
import { formatFetchedTime, normalizeTrend, pickBalancedHotTopics, type HotTopicItem } from "./hot-topics";

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
  fetchedAt: Date | string;
}) {
  const fetchedAt = item.fetchedAt instanceof Date ? item.fetchedAt : new Date(item.fetchedAt);

  return {
    id: item.id,
    title: item.title,
    source: item.source,
    sourceType: item.sourceType,
    heat: item.heat,
    trend: normalizeTrend(item.trendScore),
    time: formatFetchedTime(fetchedAt.toISOString()),
    tags: item.tags,
    url: item.url ?? undefined,
    summary: item.summary ?? undefined,
    fetchedAt: fetchedAt.toISOString(),
  } satisfies HotTopicItem;
}

export async function readHotTopics(limit: number) {
  if (!hasDatabaseUrl()) {
    const supabase = getSupabaseAdmin();
    const { data: latestJobs, error: latestJobError } = await supabase
      .from("fetch_jobs")
      .select("created_at,finished_at")
      .eq("job_type", "hot-topics-refresh")
      .eq("status", "success")
      .order("finished_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);

    if (latestJobError) throw latestJobError;
    const latestSuccessJob = latestJobs?.[0];
    const latestBatchStartAt = latestSuccessJob
      ? new Date(new Date(latestSuccessJob.created_at).getTime() - 60 * 1000)
      : null;

    const latestBatchTake = Math.max(limit * 8, 360);
    const fallbackTake = Math.max(limit * 3, 360);

    let items: Array<{
      id: string;
      title: string;
      source: string;
      source_type: string;
      heat: number;
      trend_score: number;
      tags: string[];
      url: string | null;
      summary: string | null;
      fetched_at: string;
    }> = [];

    if (latestBatchStartAt) {
      const { data, error } = await supabase
        .from("hot_topics")
        .select("id,title,source,source_type,heat,trend_score,tags,url,summary,fetched_at")
        .gte("fetched_at", latestBatchStartAt.toISOString())
        .order("fetched_at", { ascending: false })
        .order("heat", { ascending: false })
        .limit(latestBatchTake);

      if (error) throw error;
      items = data ?? [];
    }

    if (!items.length) {
      const { data, error } = await supabase
        .from("hot_topics")
        .select("id,title,source,source_type,heat,trend_score,tags,url,summary,fetched_at")
        .order("heat", { ascending: false })
        .order("fetched_at", { ascending: false })
        .limit(fallbackTake);

      if (error) throw error;
      items = data ?? [];
    }

    const mappedItems = items.map((item) => mapHotTopicRecord({
      id: item.id,
      title: item.title,
      source: item.source,
      sourceType: item.source_type,
      heat: item.heat,
      trendScore: item.trend_score,
      tags: item.tags ?? [],
      url: item.url,
      summary: item.summary,
      fetchedAt: item.fetched_at,
    }));
    const { allowed } = filterRestrictedTopics(mappedItems);
    return pickBalancedHotTopics(allowed, limit, 40);
  }

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

  const latestBatchTake = Math.max(limit * 8, 360);
  const fallbackTake = Math.max(limit * 3, 360);

  let items = latestBatchStartAt
    ? await prisma.hotTopic.findMany({
      where: {
        fetchedAt: {
          gte: latestBatchStartAt,
        },
      },
      orderBy: [{ fetchedAt: "desc" }, { heat: "desc" }],
      take: latestBatchTake,
    })
    : [];

  if (!items.length) {
    items = await prisma.hotTopic.findMany({
      orderBy: [{ heat: "desc" }, { fetchedAt: "desc" }],
      take: fallbackTake,
    });
  }

  const mappedItems = items.map(mapHotTopicRecord);
  const { allowed } = filterRestrictedTopics(mappedItems);
  return pickBalancedHotTopics(allowed, limit, 40);
}

export async function readHotTopicRefreshMeta() {
  if (!hasDatabaseUrl()) {
    const supabase = getSupabaseAdmin();
    const { data: latestJobs, error } = await supabase
      .from("fetch_jobs")
      .select("payload,finished_at")
      .eq("job_type", "hot-topics-refresh")
      .eq("status", "success")
      .order("finished_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) throw error;
    const latestJob = latestJobs?.[0];
    const payload = latestJob?.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return { restrictedCount: 0 };
    }

    const restrictedCount = "restrictedCount" in payload && typeof payload.restrictedCount === "number"
      ? payload.restrictedCount
      : 0;

    return {
      restrictedCount,
      lastSuccessAt: latestJob?.finished_at ?? null,
    };
  }

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

export type HotTopicDetailRecord = {
  id: string;
  title: string;
  source: string;
  url?: string;
  summary?: string;
  raw?: unknown;
  fetchedAt: string;
};

function mapHotTopicDetailRecord(item: {
  id: string;
  title: string;
  source: string;
  url: string | null;
  summary: string | null;
  raw?: unknown;
  fetchedAt: Date | string;
}): HotTopicDetailRecord {
  return {
    id: item.id,
    title: item.title,
    source: item.source,
    url: item.url ?? undefined,
    summary: item.summary ?? undefined,
    raw: item.raw,
    fetchedAt: item.fetchedAt instanceof Date ? item.fetchedAt.toISOString() : new Date(item.fetchedAt).toISOString(),
  };
}

export async function readLatestHotTopicForTopic(topic: Pick<TopicSuggestion, "title" | "source">) {
  const sourceName = topic.source.split("·")[0]?.trim() || topic.source.trim();

  if (!hasDatabaseUrl()) {
    const supabase = getSupabaseAdmin();

    const queryByTitleAndSource = async () => {
      const { data, error } = await supabase
        .from("hot_topics")
        .select("id,title,source,url,summary,raw,fetched_at")
        .eq("title", topic.title)
        .eq("source", sourceName)
        .order("fetched_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return mapHotTopicDetailRecord({
        id: data.id,
        title: data.title,
        source: data.source,
        url: data.url,
        summary: data.summary,
        raw: data.raw,
        fetchedAt: data.fetched_at,
      });
    };

    const queryByTitleOnly = async () => {
      const { data, error } = await supabase
        .from("hot_topics")
        .select("id,title,source,url,summary,raw,fetched_at")
        .eq("title", topic.title)
        .order("fetched_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return mapHotTopicDetailRecord({
        id: data.id,
        title: data.title,
        source: data.source,
        url: data.url,
        summary: data.summary,
        raw: data.raw,
        fetchedAt: data.fetched_at,
      });
    };

    return (await queryByTitleAndSource()) ?? queryByTitleOnly();
  }

  const exactMatch = await prisma.hotTopic.findFirst({
    where: {
      title: topic.title,
      source: sourceName,
    },
    orderBy: [{ fetchedAt: "desc" }],
    select: {
      id: true,
      title: true,
      source: true,
      url: true,
      summary: true,
      raw: true,
      fetchedAt: true,
    },
  });

  if (exactMatch) {
    return mapHotTopicDetailRecord(exactMatch);
  }

  const fallbackMatch = await prisma.hotTopic.findFirst({
    where: {
      title: topic.title,
    },
    orderBy: [{ fetchedAt: "desc" }],
    select: {
      id: true,
      title: true,
      source: true,
      url: true,
      summary: true,
      raw: true,
      fetchedAt: true,
    },
  });

  return fallbackMatch ? mapHotTopicDetailRecord(fallbackMatch) : null;
}

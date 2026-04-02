import { Prisma } from "@prisma/client";
import { buildTopicSuggestionFromHotTopic } from "./article-analysis";
import { readHotTopicRefreshMeta, readHotTopics } from "./hot-topic-db";
import { scrapeHotTopics } from "./hot-topic-sources";
import type { HotTopicItem } from "./hot-topics";
import { hasDatabaseUrl, prisma } from "./prisma";
import { upsertTopicRecord } from "./topic-db";

export const HOT_TOPIC_CACHE_TTL_MS = 30 * 60 * 1000;
export const HOT_TOPICS_CACHE_TAG = "hot-topics";
export const ARTICLE_ANALYSIS_CACHE_TAG = "article-analysis";
const CORE_PLATFORM_SOURCES = ["微博", "抖音", "知乎", "今日头条", "百度"] as const;

function isWithinTtl(isoTime: string | null, ttlMs = HOT_TOPIC_CACHE_TTL_MS) {
  if (!isoTime) return false;
  const time = new Date(isoTime).getTime();
  if (Number.isNaN(time)) return false;
  return Date.now() - time <= ttlMs;
}

function hasCoreSourceCoverage(items: Array<Pick<HotTopicItem, "source">>) {
  const presentSources = new Set(items.map((item) => item.source));
  return CORE_PLATFORM_SOURCES.every((source) => presentSources.has(source));
}

export async function getHotTopicsSnapshot(limit: number, ttlMs = HOT_TOPIC_CACHE_TTL_MS) {
  if (!hasDatabaseUrl()) {
    const { items, failedSources, restrictedCount } = await scrapeHotTopics();
    return {
      items: items.slice(0, limit),
      source: "live" as const,
      persisted: false,
      restrictedCount,
      failedSources,
      refreshed: false,
      stale: false,
      ttlMs,
      lastSuccessAt: null as string | null,
    };
  }

  const [items, meta] = await Promise.all([readHotTopics(limit), readHotTopicRefreshMeta()]);
  const lastSuccessAt = meta.lastSuccessAt ?? null;

  return {
    items,
    source: "database" as const,
    persisted: true,
    restrictedCount: meta.restrictedCount,
    failedSources: [] as string[],
    refreshed: false,
    stale: !isWithinTtl(lastSuccessAt, ttlMs),
    ttlMs,
    lastSuccessAt,
  };
}

export async function refreshHotTopicsAndPersist() {
  const startedAt = new Date().toISOString();
  const batchFetchedAt = new Date(startedAt);
  const { items, failedSources, restrictedCount } = await scrapeHotTopics();
  const generatedTopics = items.slice(0, 24).map((item) => buildTopicSuggestionFromHotTopic(item));

  if (!hasDatabaseUrl()) {
    return {
      ok: false,
      persisted: false,
      items,
      failedSources,
      restrictedCount,
      generatedTopicCount: generatedTopics.length,
      insertedCount: 0,
      message: "缺少 DATABASE_URL，已抓到实时数据但暂未入库。",
    };
  }

  let jobId: string | null = null;

  try {
    await prisma.fetchJob.updateMany({
      where: {
        jobType: "hot-topics-refresh",
        status: "running",
        finishedAt: null,
      },
      data: {
        status: "failed",
        message: "任务被新的刷新请求中断或覆盖",
        finishedAt: new Date(),
      },
    });

    const job = await prisma.fetchJob.create({
      data: {
        status: "running",
        source: "all",
        message: "开始抓取热点",
        payload: { startedAt },
      },
    });
    jobId = job.id;

    await Promise.all(
      items.map((item) => {
        const rawPayload = item.raw == null ? undefined : item.raw as Prisma.InputJsonValue;

        return prisma.hotTopic.upsert({
          where: {
            source_externalId: {
              source: item.source,
              externalId: item.externalId,
            },
          },
          update: {
            title: item.title,
            url: item.url ?? null,
            sourceType: item.sourceType,
            heat: item.heat,
            trendScore: Number.parseInt(item.trend.replace(/[^\d]/g, ""), 10) || 0,
            summary: item.summary ?? null,
            tags: item.tags,
            fetchedAt: batchFetchedAt,
            raw: rawPayload,
          },
          create: {
            externalId: item.externalId,
            title: item.title,
            url: item.url ?? null,
            source: item.source,
            sourceType: item.sourceType,
            heat: item.heat,
            trendScore: Number.parseInt(item.trend.replace(/[^\d]/g, ""), 10) || 0,
            summary: item.summary ?? null,
            tags: item.tags,
            fetchedAt: batchFetchedAt,
            raw: rawPayload,
          },
        });
      }),
    );

    await Promise.all(generatedTopics.map((topic) => upsertTopicRecord(topic)));

    await prisma.fetchJob.update({
      where: { id: jobId },
      data: {
        status: "success",
        source: "all",
        insertedCount: items.length,
        message: "热点抓取、入库并生成选题完成",
        payload: { failedSources, generatedTopicCount: generatedTopics.length, restrictedCount },
        finishedAt: new Date(),
      },
    });

    return {
      ok: true,
      persisted: true,
      items,
      failedSources,
      restrictedCount,
      generatedTopicCount: generatedTopics.length,
      insertedCount: items.length,
      message: "",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (jobId) {
      await prisma.fetchJob.update({
        where: { id: jobId },
        data: {
          status: "failed",
          source: "all",
          message,
          payload: { failedSources },
          finishedAt: new Date(),
        },
      }).catch(() => undefined);
    } else {
      await prisma.fetchJob.create({
        data: {
          status: "failed",
          source: "all",
          message,
          payload: { failedSources },
          finishedAt: new Date(),
        },
      }).catch(() => undefined);
    }

    return {
      ok: false,
      persisted: false,
      items,
      failedSources,
      restrictedCount,
      generatedTopicCount: generatedTopics.length,
      insertedCount: 0,
      message: `入库失败：${message}`,
    };
  }
}

export async function ensureHotTopicsCache(limit: number, ttlMs = HOT_TOPIC_CACHE_TTL_MS) {
  if (!hasDatabaseUrl()) {
    const { items, failedSources, restrictedCount } = await scrapeHotTopics();
    return {
      items: items.slice(0, limit),
      source: "live" as const,
      persisted: false,
      restrictedCount,
      failedSources,
      refreshed: true,
      stale: false,
      ttlMs,
      lastSuccessAt: null as string | null,
    };
  }

  const meta = await readHotTopicRefreshMeta();
  const lastSuccessAt = meta.lastSuccessAt ?? null;
  const fresh = isWithinTtl(lastSuccessAt, ttlMs);

  if (fresh) {
    const items = await readHotTopics(limit);
    if (hasCoreSourceCoverage(items)) {
      return {
        items,
        source: "database" as const,
        persisted: true,
        restrictedCount: meta.restrictedCount,
        failedSources: [] as string[],
        refreshed: false,
        stale: false,
        ttlMs,
        lastSuccessAt,
      };
    }

    const refreshed = await refreshHotTopicsAndPersist();
    if (!refreshed.persisted && refreshed.items.length) {
      return {
        items: refreshed.items.slice(0, limit),
        source: "live" as const,
        persisted: false,
        restrictedCount: refreshed.restrictedCount,
        failedSources: refreshed.failedSources,
        refreshed: true,
        stale: false,
        ttlMs,
        lastSuccessAt,
        generatedTopicCount: refreshed.generatedTopicCount,
      };
    }

    return {
      items: refreshed.persisted ? await readHotTopics(limit) : items,
      source: refreshed.persisted ? ("database" as const) : ("live" as const),
      persisted: refreshed.persisted,
      restrictedCount: refreshed.persisted ? (await readHotTopicRefreshMeta()).restrictedCount : refreshed.restrictedCount,
      failedSources: refreshed.failedSources,
      refreshed: true,
      stale: false,
      ttlMs,
      lastSuccessAt: refreshed.persisted ? ((await readHotTopicRefreshMeta()).lastSuccessAt ?? lastSuccessAt) : lastSuccessAt,
      generatedTopicCount: refreshed.generatedTopicCount,
    };
  }

  const refreshed = await refreshHotTopicsAndPersist();
  const items = refreshed.persisted ? await readHotTopics(limit) : refreshed.items.slice(0, limit);
  const latestMeta = refreshed.persisted ? await readHotTopicRefreshMeta() : meta;

  return {
    items,
    source: refreshed.persisted ? ("database" as const) : ("live" as const),
    persisted: refreshed.persisted,
    restrictedCount: refreshed.persisted ? latestMeta.restrictedCount : refreshed.restrictedCount,
    failedSources: refreshed.failedSources,
    refreshed: true,
    stale: true,
    ttlMs,
    lastSuccessAt: refreshed.persisted ? (latestMeta.lastSuccessAt ?? null) : lastSuccessAt,
    generatedTopicCount: refreshed.generatedTopicCount,
  };
}

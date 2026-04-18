import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { buildTopicSuggestionFromHotTopic } from "./article-analysis";
import { hasPersistenceBackend } from "./persistence";
import { readHotTopicRefreshMeta, readHotTopics } from "./hot-topic-db";
import { scrapeHotTopics } from "./hot-topic-sources";
import type { HotTopicItem } from "./hot-topics";
import { hasDatabaseUrl, prisma } from "./prisma";
import { getSupabaseAdmin } from "./supabase-admin";
import { upsertTopicRecord } from "./topic-db";

export const HOT_TOPIC_CACHE_TTL_MS = 30 * 60 * 1000;
export const HOT_TOPICS_CACHE_TAG = "hot-topics";
export const ARTICLE_ANALYSIS_CACHE_TAG = "article-analysis";
const CORE_PLATFORM_SOURCES = ["微博", "抖音", "知乎", "今日头条", "百度"] as const;
const HOT_TOPICS_RETENTION_DAYS = 7;
const HOT_TOPIC_FETCH_JOB_KEEP_COUNT = 100;

function formatPersistenceError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function isWithinTtl(isoTime: string | null, ttlMs = HOT_TOPIC_CACHE_TTL_MS) {
  if (!isoTime) return false;
  const time = new Date(isoTime).getTime();
  if (Number.isNaN(time)) return false;
  return Date.now() - time <= ttlMs;
}

function getHotTopicRetentionCutoff() {
  return new Date(Date.now() - HOT_TOPICS_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

async function cleanupHotTopicHistory() {
  const cutoff = getHotTopicRetentionCutoff();

  if (!hasDatabaseUrl()) {
    const supabase = getSupabaseAdmin();

    await supabase
      .from("hot_topics")
      .delete()
      .lt("fetched_at", cutoff.toISOString());

    let from = HOT_TOPIC_FETCH_JOB_KEEP_COUNT;
    const batchSize = 500;

    while (true) {
      const to = from + batchSize - 1;
      const { data, error } = await supabase
        .from("fetch_jobs")
        .select("id")
        .eq("job_type", "hot-topics-refresh")
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;

      const ids = (data ?? []).map((item) => item.id).filter(Boolean);
      if (!ids.length) break;

      const { error: deleteError } = await supabase
        .from("fetch_jobs")
        .delete()
        .in("id", ids);

      if (deleteError) throw deleteError;

      if (ids.length < batchSize) break;
      from += batchSize;
    }

    return;
  }

  await prisma.hotTopic.deleteMany({
    where: {
      fetchedAt: {
        lt: cutoff,
      },
    },
  });

  const expiredJobs = await prisma.fetchJob.findMany({
    where: {
      jobType: "hot-topics-refresh",
    },
    orderBy: {
      createdAt: "desc",
    },
    skip: HOT_TOPIC_FETCH_JOB_KEEP_COUNT,
    take: 5000,
    select: {
      id: true,
    },
  });

  if (expiredJobs.length) {
    await prisma.fetchJob.deleteMany({
      where: {
        id: {
          in: expiredJobs.map((item) => item.id),
        },
      },
    });
  }
}

function hasCoreSourceCoverage(items: Array<Pick<HotTopicItem, "source">>) {
  const presentSources = new Set(items.map((item) => item.source));
  return CORE_PLATFORM_SOURCES.every((source) => presentSources.has(source));
}

export async function getHotTopicsSnapshot(limit: number, ttlMs = HOT_TOPIC_CACHE_TTL_MS) {
  if (!hasPersistenceBackend()) {
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

  try {
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
  } catch (error) {
    console.error("Failed to read hot topics from database, falling back to live fetch:", error);
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
}

export async function refreshHotTopicsAndPersist() {
  const startedAt = new Date().toISOString();
  const batchFetchedAt = new Date(startedAt);
  const { items, failedSources, restrictedCount } = await scrapeHotTopics();
  const generatedTopics = items.slice(0, 24).map((item) => buildTopicSuggestionFromHotTopic(item));

  if (!hasPersistenceBackend()) {
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
    if (!hasDatabaseUrl()) {
      const supabase = getSupabaseAdmin();
      await supabase
        .from("fetch_jobs")
        .update({
          status: "failed",
          message: "任务被新的刷新请求中断或覆盖",
          finished_at: new Date().toISOString(),
        })
        .eq("job_type", "hot-topics-refresh")
        .eq("status", "running")
        .is("finished_at", null);

      const { data: createdJob, error: createJobError } = await supabase
        .from("fetch_jobs")
        .insert({
          id: randomUUID(),
          status: "running",
          source: "all",
          message: "开始抓取热点",
          payload: { startedAt },
        })
        .select("id")
        .single();

      if (createJobError) throw createJobError;
      jobId = createdJob.id;

      const { error: hotTopicError } = await supabase
        .from("hot_topics")
        .upsert(
          items.map((item) => ({
            id: randomUUID(),
            external_id: item.externalId,
            title: item.title,
            url: item.url ?? null,
            source: item.source,
            source_type: item.sourceType,
            heat: item.heat,
            trend_score: Number.parseInt(item.trend.replace(/[^\d]/g, ""), 10) || 0,
            summary: item.summary ?? null,
            tags: item.tags,
            fetched_at: batchFetchedAt.toISOString(),
            updated_at: batchFetchedAt.toISOString(),
            raw: item.raw == null ? null : item.raw as Prisma.InputJsonValue,
          })),
          { onConflict: "source,external_id" },
        );

      if (hotTopicError) throw hotTopicError;

      await Promise.all(generatedTopics.map((topic) => upsertTopicRecord(topic)));

      const { error: finishJobError } = await supabase
        .from("fetch_jobs")
        .update({
          status: "success",
          source: "all",
          inserted_count: items.length,
          message: "热点抓取、入库并生成选题完成",
          payload: { failedSources, generatedTopicCount: generatedTopics.length, restrictedCount },
          finished_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      if (finishJobError) throw finishJobError;

      await cleanupHotTopicHistory().catch((error) => {
        console.error("Failed to clean up hot topic history:", error);
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
    }

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

    await cleanupHotTopicHistory().catch((error) => {
      console.error("Failed to clean up hot topic history:", error);
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
    const message = formatPersistenceError(error);

    if (!hasDatabaseUrl()) {
      const supabase = getSupabaseAdmin();

      if (jobId) {
        await supabase
          .from("fetch_jobs")
          .update({
            status: "failed",
            source: "all",
            message,
            payload: { failedSources },
            finished_at: new Date().toISOString(),
          })
          .eq("id", jobId);
      } else {
        await supabase
          .from("fetch_jobs")
          .insert({
            id: randomUUID(),
            status: "failed",
            source: "all",
            message,
            payload: { failedSources },
            finished_at: new Date().toISOString(),
          });
      }
    } else if (jobId) {
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
  if (!hasPersistenceBackend()) {
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

  try {
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
  } catch (error) {
    console.error("Failed to ensure hot topics cache from database, falling back to live fetch:", error);
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
}

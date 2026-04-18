import { prisma } from "./prisma";
import { hasDatabaseUrl } from "./prisma";
import { getSupabaseAdmin } from "./supabase-admin";
import { type TopicSuggestion, type TopicType } from "./app-data";
import { deriveTopicAngles, deriveTopicReason } from "./article-analysis";
import { detectArticleDomain, resolveArticleDomain } from "./content-domains";
import { assertTopicAllowed, filterRestrictedTopics } from "./content-policy";
import { buildTopicIdentityKey } from "./topic-utils";

type TopicRecord = {
  id: string;
  title: string;
  domain?: string | null;
  heat: string;
  fit: number;
  reason: string;
  angles: string[];
  source: string;
  type: string;
  tags: string[];
  updatedAt: Date | string;
};

const validTypes = new Set<TopicType>(["热点型", "常青型", "行业型"]);
const LEGACY_GENERIC_ANGLE_PATTERNS = [
  /^围绕「.*」提炼趋势判断、实际影响与行动建议$/,
  /^围绕「.*」拆出冲突点、风险判断和读者最关心的后续影响$/,
  /^把「.*」转成读者看得懂、愿意转发的机会解读$/,
  /^从普通读者视角解释「.*」为什么现在值得关注$/,
  /^结合账号定位，输出「.*」带来的机会、风险与行动建议$/,
  /^先把「.*」最值得关注的重点讲明白$/,
] as const;
const LEGACY_GENERIC_REASON_PATTERNS = [
  /正在快速升温，适合/,
  /欢迎关注/,
  /微信号/,
  /^来自(微博|知乎|抖音|百度|头条|今日头条).*(热搜|热榜)/,
] as const;

function normalizeTopicType(type: string): TopicType {
  return validTypes.has(type as TopicType) ? (type as TopicType) : "热点型";
}

function shouldRefreshAngles(angles: string[], source: string) {
  if (!angles.length) return true;
  const isHotSource = /实时热点|微博|知乎|抖音|百度|头条|36氪|少数派|爱范儿/.test(source);

  return angles.some((angle) => {
    const normalized = angle.trim();
    return (
      LEGACY_GENERIC_ANGLE_PATTERNS.some((pattern) => pattern.test(normalized)) ||
      (isHotSource && /微博热搜|知乎热榜|抖音热搜|百度热搜|今日头条|软件|效率|公司/.test(normalized))
    );
  });
}

function shouldRefreshReason(reason: string, source: string) {
  const normalized = reason.trim();
  if (!normalized) return true;
  const isHotSource = /实时热点|微博|知乎|抖音|百度|头条|36氪|少数派|爱范儿/.test(source);
  return (
    LEGACY_GENERIC_REASON_PATTERNS.some((pattern) => pattern.test(normalized)) ||
    (isHotSource && (normalized.length < 10 || normalized.length > 72))
  );
}

export function mapTopicRecord(record: TopicRecord): TopicSuggestion {
  const inferredDomain = detectArticleDomain(record.title, record.tags, record.source, record.reason);
  const resolvedStoredDomain = resolveArticleDomain(record.domain);
  const preferredDomain =
    record.domain && resolvedStoredDomain !== "科技"
      ? resolvedStoredDomain
      : inferredDomain;
  const angles = shouldRefreshAngles(record.angles ?? [], record.source)
    ? deriveTopicAngles({
        title: record.title,
        tags: record.tags,
        source: record.source,
        domain: preferredDomain,
      })
    : record.angles;
  const reason = shouldRefreshReason(record.reason, record.source)
    ? deriveTopicReason({
        title: record.title,
        source: record.source,
        domain: preferredDomain,
        summary: record.reason,
      })
    : record.reason;

  return {
    id: record.id,
    title: record.title,
    domain: preferredDomain,
    heat: ["极高", "高", "中高", "中"].includes(record.heat) ? (record.heat as TopicSuggestion["heat"]) : "中",
    fit: record.fit,
    reason,
    angles,
    source: record.source,
    type: normalizeTopicType(record.type),
    tags: record.tags,
  };
}

export async function readTopics() {
  if (!hasDatabaseUrl()) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("topics")
      .select("*")
      .order("updated_at", { ascending: false })
      .order("fit", { ascending: false });

    if (error) throw error;

    const mappedItems = (data ?? []).map((item) => mapTopicRecord({
      id: item.id,
      title: item.title,
      domain: item.domain,
      heat: item.heat,
      fit: item.fit,
      reason: item.reason,
      angles: item.angles ?? [],
      source: item.source,
      type: item.type,
      tags: item.tags ?? [],
      updatedAt: item.updated_at,
    }));
    const { allowed } = filterRestrictedTopics(mappedItems);
    const deduped = new Map<string, TopicSuggestion>();

    allowed.forEach((topic) => {
      const key = buildTopicIdentityKey(topic);
      if (!deduped.has(key)) {
        deduped.set(key, topic);
      }
    });

    return Array.from(deduped.values());
  }

  const items = await prisma.topic.findMany({
    orderBy: [{ updatedAt: "desc" }, { fit: "desc" }],
  });

  const mappedItems = items.map(mapTopicRecord);
  const { allowed } = filterRestrictedTopics(mappedItems);
  const deduped = new Map<string, TopicSuggestion>();

  allowed.forEach((topic) => {
    const key = buildTopicIdentityKey(topic);
    if (!deduped.has(key)) {
      deduped.set(key, topic);
    }
  });

  return Array.from(deduped.values());
}

export async function upsertTopicRecord(topic: TopicSuggestion) {
  assertTopicAllowed(topic);

  if (!hasDatabaseUrl()) {
    const supabase = getSupabaseAdmin();
    const { data: existingItems, error: existingError } = await supabase
      .from("topics")
      .select("id")
      .eq("title", topic.title)
      .eq("source", topic.source)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (existingError) throw existingError;
    const topicId = existingItems?.[0]?.id ?? topic.id;
    const updatedAt = new Date().toISOString();
    const { data, error } = await supabase
      .from("topics")
      .upsert({
        id: topicId,
        title: topic.title,
        domain: topic.domain,
        heat: topic.heat,
        fit: topic.fit,
        reason: topic.reason,
        angles: topic.angles,
        source: topic.source,
        type: topic.type,
        tags: topic.tags,
        updated_at: updatedAt,
      }, { onConflict: "id" })
      .select("*")
      .single();

    if (error) throw error;
    return mapTopicRecord({
      id: data.id,
      title: data.title,
      domain: data.domain,
      heat: data.heat,
      fit: data.fit,
      reason: data.reason,
      angles: data.angles ?? [],
      source: data.source,
      type: data.type,
      tags: data.tags ?? [],
      updatedAt: data.updated_at,
    });
  }

  const existingTopic = await prisma.topic.findFirst({
    where: {
      title: topic.title,
      source: topic.source,
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  const topicId = existingTopic?.id ?? topic.id;

  const item = await prisma.topic.upsert({
    where: { id: topicId },
    create: {
      id: topicId,
      title: topic.title,
      domain: topic.domain,
      heat: topic.heat,
      fit: topic.fit,
      reason: topic.reason,
      angles: topic.angles,
      source: topic.source,
      type: topic.type,
      tags: topic.tags,
    },
    update: {
      title: topic.title,
      domain: topic.domain,
      heat: topic.heat,
      fit: topic.fit,
      reason: topic.reason,
      angles: topic.angles,
      source: topic.source,
      type: topic.type,
      tags: topic.tags,
    },
  });

  return mapTopicRecord(item);
}

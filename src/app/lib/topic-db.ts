import { prisma } from "./prisma";
import { type TopicSuggestion, type TopicType } from "./app-data";
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
  updatedAt: Date;
};

const validTypes = new Set<TopicType>(["热点型", "常青型", "行业型"]);

function normalizeTopicType(type: string): TopicType {
  return validTypes.has(type as TopicType) ? (type as TopicType) : "热点型";
}

export function mapTopicRecord(record: TopicRecord): TopicSuggestion {
  const inferredDomain = detectArticleDomain(record.title, record.tags, record.source, record.reason);
  const resolvedStoredDomain = resolveArticleDomain(record.domain);
  const preferredDomain =
    record.domain && resolvedStoredDomain !== "科技"
      ? resolvedStoredDomain
      : inferredDomain;

  return {
    id: record.id,
    title: record.title,
    domain: preferredDomain,
    heat: ["极高", "高", "中高", "中"].includes(record.heat) ? (record.heat as TopicSuggestion["heat"]) : "中",
    fit: record.fit,
    reason: record.reason,
    angles: record.angles,
    source: record.source,
    type: normalizeTopicType(record.type),
    tags: record.tags,
  };
}

export async function readTopics() {
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

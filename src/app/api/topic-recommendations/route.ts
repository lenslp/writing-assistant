import { NextResponse } from "next/server";
import { getHotTopicsSnapshot } from "../../lib/hot-topic-refresh";
import {
  buildFallbackDomainRecommendations,
  recommendDailyTopicsByDomainWithAI,
  recommendTopicsForDomainWithAI,
} from "../../lib/topic-recommendation";
import { normalizeWorkbenchTopicCandidates } from "../../lib/workbench-topics";
import type { TopicRecommendationCandidate } from "../../lib/workbench-topics";
import { articleDomains, type ActiveArticleDomain } from "../../lib/content-domains";
import type { TopicSuggestion } from "../../lib/app-data";
import type { HotTopicItem } from "../../lib/hot-topics";

export const dynamic = "force-dynamic";
const TOPIC_RECOMMENDATION_TIMEOUT_MS = 60000;

function normalizeDomain(value: string | null): ActiveArticleDomain | null {
  return value && (articleDomains as readonly string[]).includes(value)
    ? (value as ActiveArticleDomain)
    : null;
}

const topicHeatIndexMap: Record<TopicSuggestion["heat"], number> = {
  极高: 9600,
  高: 8200,
  中高: 6800,
  中: 5200,
};

function normalizeTopicSuggestions(topics: TopicSuggestion[]): TopicRecommendationCandidate[] {
  return topics
    .map((topic) => {
      const domain = normalizeDomain(topic.domain);
      if (!domain) return null;

      return {
        id: topic.id,
        title: topic.title,
        source: topic.source,
        sourceType: topic.type,
        domain,
        heat: Math.max(topicHeatIndexMap[topic.heat] ?? 5200, topic.fit * 100),
        trend: `+${Math.max(8, Math.min(98, topic.fit - 45))}%`,
        time: "选题库",
        tags: topic.tags.slice(0, 3),
        summary: topic.reason,
        fetchedAt: new Date().toISOString(),
      };
    })
    .filter((topic): topic is NonNullable<typeof topic> => Boolean(topic));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => null)) as {
      items?: HotTopicItem[];
      topics?: TopicSuggestion[];
      domain?: string | null;
    } | null;

    const preferredDomain = normalizeDomain(payload?.domain ?? null);
    const candidatesFromTopics = Array.isArray(payload?.topics) && payload.topics.length
      ? normalizeTopicSuggestions(payload.topics)
      : [];
    let candidates = candidatesFromTopics;

    if (!candidates.length) {
      const rawItems = Array.isArray(payload?.items) && payload.items.length
        ? payload.items
        : (await getHotTopicsSnapshot(120)).items;
      candidates = normalizeWorkbenchTopicCandidates(rawItems);
    }
    const groups = await withTimeout(
      preferredDomain
        ? Promise.all([recommendTopicsForDomainWithAI(candidates, preferredDomain)])
        : recommendDailyTopicsByDomainWithAI(candidates),
      TOPIC_RECOMMENDATION_TIMEOUT_MS,
      "AI 选题筛选超时，已使用规则排序。",
    ).catch((error) => {
      const message = error instanceof Error ? error.message : "AI 选题筛选暂不可用，已使用规则排序。";
      const fallbackGroups = buildFallbackDomainRecommendations(candidates).map((group) => ({
        ...group,
        message,
      }));

      return preferredDomain
        ? fallbackGroups.filter((group) => group.domain === preferredDomain)
        : fallbackGroups;
    });
    const preferredGroup = preferredDomain
      ? groups.find((group) => group.domain === preferredDomain)
      : null;
    const firstGroup = preferredGroup ?? groups.find((group) => group.items.length) ?? null;
    const firstItem = firstGroup?.items[0] ?? null;

    return NextResponse.json({
      recommendation: firstItem
        ? {
            topicId: firstItem.topicId,
            score: firstItem.score,
            reason: firstItem.reason,
            angle: firstItem.angle,
            risks: firstItem.risks,
            source: firstGroup?.source ?? "fallback",
            model: firstGroup?.model,
            provider: firstGroup?.provider,
            message: firstGroup?.message,
          }
        : {
            topicId: null,
            score: 0,
            reason: "暂无可评估热点。",
            angle: "",
            risks: [],
            source: "fallback",
          },
      groups,
    });
  } catch (error) {
    console.error("Failed to build topic recommendation:", error);
    return NextResponse.json(
      {
        recommendation: {
          topicId: null,
          score: 0,
          reason: "AI 选题推荐暂时不可用。",
          angle: "",
          risks: [],
          source: "fallback",
          message: error instanceof Error ? error.message : "request failed",
        },
        groups: [],
      },
      { status: 500 },
    );
  }
}

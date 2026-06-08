import { NextResponse } from "next/server";
import { getHotTopicsSnapshot } from "../../lib/hot-topic-refresh";
import {
  recommendDailyTopicsByDomainWithAI,
} from "../../lib/topic-recommendation";
import { normalizeWorkbenchTopicCandidates } from "../../lib/workbench-topics";
import { articleDomains, type ActiveArticleDomain } from "../../lib/content-domains";
import type { HotTopicItem } from "../../lib/hot-topics";

export const dynamic = "force-dynamic";

function normalizeDomain(value: string | null): ActiveArticleDomain | null {
  return value && (articleDomains as readonly string[]).includes(value)
    ? (value as ActiveArticleDomain)
    : null;
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => null)) as {
      items?: HotTopicItem[];
      domain?: string | null;
    } | null;

    const preferredDomain = normalizeDomain(payload?.domain ?? null);
    const rawItems = Array.isArray(payload?.items) && payload.items.length
      ? payload.items
      : (await getHotTopicsSnapshot(120)).items;
    const candidates = normalizeWorkbenchTopicCandidates(rawItems);
    const groups = await recommendDailyTopicsByDomainWithAI(candidates);
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

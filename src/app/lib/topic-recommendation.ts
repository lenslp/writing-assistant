import { completeAIText, getAIProviderConfig } from "./ai-writing";
import { articleDomains, domainConfigs, type ActiveArticleDomain } from "./content-domains";
import type { TopicRecommendationCandidate } from "./workbench-topics";

export type TopicRecommendationItem = {
  topicId: string;
  score: number;
  reason: string;
  angle: string;
  risks: string[];
};

export type TopicRecommendationResult = {
  topicId: string | null;
  score: number;
  reason: string;
  angle: string;
  risks: string[];
  source: "ai" | "fallback";
  model?: string;
  provider?: string;
  message?: string;
};

export type DomainTopicRecommendationGroup = {
  domain: ActiveArticleDomain;
  items: TopicRecommendationItem[];
  source: "ai" | "fallback";
  model?: string;
  provider?: string;
  message?: string;
};

const RECOMMENDATION_CANDIDATE_LIMIT = 24;
const DOMAIN_RECOMMENDATION_LIMIT = 5;
const DOMAIN_RECOMMENDATION_CANDIDATE_LIMIT = 16;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function safeText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function safeStringList(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => safeText(item)).filter(Boolean).slice(0, 4)
    : [];
}

function toRecommendationItem(
  value: unknown,
  fallbackTopic: TopicRecommendationCandidate,
  fallbackIndex: number,
): TopicRecommendationItem {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

  return {
    topicId: safeText(record.topicId, fallbackTopic.id),
    score: clamp(Math.round(Number(record.score) || Math.round(fallbackTopic.heat / 100) - fallbackIndex), 1, 100),
    reason: safeText(record.reason, "AI 根据可写性、信息密度和传播窗口判断，适合今天优先写。").slice(0, 90),
    angle: safeText(record.angle, domainConfigs[fallbackTopic.domain].writingFocus[0] ?? fallbackTopic.title).slice(0, 90),
    risks: safeStringList(record.risks),
  };
}

function extractJsonPayload(text: string) {
  const direct = text.trim();
  const candidates = [
    direct,
    direct.match(/```json\s*([\s\S]*?)```/i)?.[1] ?? "",
    direct.match(/```[\s\S]*?```/i)?.[0]?.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim() ?? "",
  ].filter(Boolean);
  const firstBraceIndex = direct.indexOf("{");
  const lastBraceIndex = direct.lastIndexOf("}");
  if (firstBraceIndex >= 0 && lastBraceIndex > firstBraceIndex) {
    candidates.push(direct.slice(firstBraceIndex, lastBraceIndex + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      continue;
    }
  }

  return {};
}

export function buildFallbackTopicRecommendation(
  topics: TopicRecommendationCandidate[],
  preferredDomain?: ActiveArticleDomain | null,
): TopicRecommendationResult {
  const candidates = preferredDomain ? topics.filter((topic) => topic.domain === preferredDomain) : topics;
  const sorted = [...(candidates.length ? candidates : topics)].sort((left, right) => {
    const leftSummaryBonus = left.summary?.trim() ? 160 : 0;
    const rightSummaryBonus = right.summary?.trim() ? 160 : 0;
    return right.heat + rightSummaryBonus - (left.heat + leftSummaryBonus);
  });
  const topic = sorted[0];

  if (!topic) {
    return {
      topicId: null,
      score: 0,
      reason: "暂无可评估热点。",
      angle: "",
      risks: [],
      source: "fallback",
    };
  }

  return {
    topicId: topic.id,
    score: clamp(Math.round(topic.heat / 100), 60, 88),
    reason: "写作模型暂不可用，先按领域匹配、信息完整度和站内热度指数做临时推荐。",
    angle: domainConfigs[topic.domain].writingFocus[0] ?? "从读者最关心的问题切入",
    risks: [],
    source: "fallback",
  };
}

function buildFallbackRecommendationItem(topic: TopicRecommendationCandidate, index: number): TopicRecommendationItem {
  return {
    topicId: topic.id,
    score: clamp(Math.round(topic.heat / 100) + (topic.summary?.trim() ? 2 : 0) - index, 58, 88),
    reason: "模型暂不可用，先按领域匹配、信息完整度和站内热度指数排序。",
    angle: domainConfigs[topic.domain].writingFocus[index % domainConfigs[topic.domain].writingFocus.length] ?? "从读者最关心的问题切入",
    risks: [],
  };
}

export function buildFallbackDomainRecommendations(
  topics: TopicRecommendationCandidate[],
): DomainTopicRecommendationGroup[] {
  return articleDomains.map((domain) => {
    const domainTopics = topics
      .filter((topic) => topic.domain === domain)
      .sort((left, right) => {
        const leftSummaryBonus = left.summary?.trim() ? 160 : 0;
        const rightSummaryBonus = right.summary?.trim() ? 160 : 0;
        return right.heat + rightSummaryBonus - (left.heat + leftSummaryBonus);
      })
      .slice(0, DOMAIN_RECOMMENDATION_LIMIT);

    return {
      domain,
      items: domainTopics.map(buildFallbackRecommendationItem),
      source: "fallback",
    };
  });
}

function buildRecommendationPrompt(topics: TopicRecommendationCandidate[], preferredDomain?: ActiveArticleDomain | null) {
  const candidates = topics
    .slice(0, RECOMMENDATION_CANDIDATE_LIMIT)
    .map((topic, index) => ({
      index: index + 1,
      id: topic.id,
      title: topic.title,
      domain: topic.domain,
      source: topic.source,
      sourceType: topic.sourceType,
      heatIndex: topic.heat,
      trend: topic.trend,
      tags: topic.tags,
      summary: topic.summary || "",
      time: topic.time,
    }));

  return JSON.stringify({
    preferredDomain: preferredDomain ?? "自动",
    candidates,
    scoring: {
      writingValue: "是否能写出有判断、有信息量、读者愿意点开的内容",
      freshness: "是否新鲜，是否还在传播窗口内",
      domainFit: "是否明确属于 AI、汽车、教育、旅游之一",
      informationDensity: "标题、摘要、标签是否足够支撑成文",
      platformSignal: "不要直接比较不同平台原始热度，只把 heatIndex 当站内参考",
      risk: "敏感、纯娱乐八卦、事实不足、过于碎片化要扣分",
    },
  });
}

function buildDomainRecommendationPrompt(topics: TopicRecommendationCandidate[]) {
  const groups = articleDomains.map((domain) => ({
    domain,
    focus: domainConfigs[domain].writingFocus,
    candidates: topics
      .filter((topic) => topic.domain === domain)
      .sort((left, right) => right.heat - left.heat)
      .slice(0, DOMAIN_RECOMMENDATION_CANDIDATE_LIMIT)
      .map((topic, index) => ({
        index: index + 1,
        id: topic.id,
        title: topic.title,
        source: topic.source,
        sourceType: topic.sourceType,
        heatIndex: topic.heat,
        trend: topic.trend,
        tags: topic.tags,
        summary: topic.summary || "",
        time: topic.time,
      })),
  }));

  return JSON.stringify({
    date: new Date().toISOString().slice(0, 10),
    groups,
    scoring: {
      writingValue: "是否能写出有判断、有信息量、读者愿意点开的内容",
      freshness: "是否仍在传播窗口内，是否适合今天写",
      domainFit: "是否明确属于对应领域",
      informationDensity: "标题、摘要、标签是否足够支撑成文",
      platformSignal: "不要直接比较不同平台原始热度，heatIndex 只是站内参考",
      risk: "敏感、事实不足、过于碎片化、只适合快讯的内容要扣分",
    },
  });
}

function buildSingleDomainRecommendationPrompt(topics: TopicRecommendationCandidate[], domain: ActiveArticleDomain) {
  const focus = domainConfigs[domain].writingFocus;
  const candidates = topics
    .filter((topic) => topic.domain === domain)
    .sort((left, right) => right.heat - left.heat)
    .slice(0, DOMAIN_RECOMMENDATION_CANDIDATE_LIMIT)
    .map((topic, index) => ({
      index: index + 1,
      id: topic.id,
      title: topic.title,
      source: topic.source,
      sourceType: topic.sourceType,
      heatIndex: topic.heat,
      trend: topic.trend,
      tags: topic.tags,
      summary: topic.summary || "",
      time: topic.time,
    }));

  return JSON.stringify({
    date: new Date().toISOString().slice(0, 10),
    domain,
    focus,
    candidates,
    scoring: {
      writingValue: "是否能写出有判断、有信息量、读者愿意点开的内容",
      freshness: "是否仍在传播窗口内，是否适合今天写",
      informationDensity: "标题、摘要、标签是否足够支撑成文",
      risk: "敏感、事实不足、过于碎片化、只适合快讯的内容要扣分",
    },
  });
}

function sanitizeDomainRecommendationGroups(
  parsed: Record<string, unknown>,
  topics: TopicRecommendationCandidate[],
  sourceMeta: Pick<DomainTopicRecommendationGroup, "source" | "model" | "provider" | "message">,
): DomainTopicRecommendationGroup[] {
  const fallbackGroups = buildFallbackDomainRecommendations(topics);
  const rawGroups = Array.isArray(parsed.groups) ? parsed.groups : [];

  return articleDomains.map((domain) => {
    const fallbackGroup = fallbackGroups.find((group) => group.domain === domain) ?? {
      domain,
      items: [],
      source: "fallback" as const,
    };
    const rawGroup = rawGroups.find((item) =>
      item &&
      typeof item === "object" &&
      "domain" in item &&
      (item as { domain?: unknown }).domain === domain,
    ) as Record<string, unknown> | undefined;
    const rawItems = Array.isArray(rawGroup?.items) ? rawGroup.items : [];
    const domainTopics = topics.filter((topic) => topic.domain === domain);

    if (!rawItems.length || !domainTopics.length) {
      return { ...fallbackGroup, ...sourceMeta };
    }

    const usedTopicIds = new Set<string>();
    const items = rawItems
      .map((rawItem, index) => {
        const rawRecord = rawItem && typeof rawItem === "object" && !Array.isArray(rawItem)
          ? rawItem as Record<string, unknown>
          : {};
        const requestedTopicId = safeText(rawRecord.topicId);
        const fallbackTopic = domainTopics[index] ?? domainTopics[0];
        const matchedTopic = domainTopics.find((topic) => topic.id === requestedTopicId) ?? fallbackTopic;
        if (!matchedTopic || usedTopicIds.has(matchedTopic.id)) return null;
        usedTopicIds.add(matchedTopic.id);
        return toRecommendationItem({ ...rawRecord, topicId: matchedTopic.id }, matchedTopic, index);
      })
      .filter((item): item is TopicRecommendationItem => Boolean(item))
      .slice(0, DOMAIN_RECOMMENDATION_LIMIT);

    const filledItems = [...items];
    for (const fallbackItem of fallbackGroup.items) {
      if (filledItems.length >= DOMAIN_RECOMMENDATION_LIMIT) break;
      if (usedTopicIds.has(fallbackItem.topicId)) continue;
      filledItems.push(fallbackItem);
      usedTopicIds.add(fallbackItem.topicId);
    }

    return {
      domain,
      items: filledItems,
      ...sourceMeta,
    };
  });
}

export async function recommendTopicWithAI(
  topics: TopicRecommendationCandidate[],
  preferredDomain?: ActiveArticleDomain | null,
): Promise<TopicRecommendationResult> {
  if (!topics.length) {
    return buildFallbackTopicRecommendation(topics, preferredDomain);
  }

  const config = await getAIProviderConfig();
  if (!config.configured) {
    return {
      ...buildFallbackTopicRecommendation(topics, preferredDomain),
      message: "AI 写作模型未配置，已使用规则推荐。",
    };
  }

  const candidates = preferredDomain ? topics.filter((topic) => topic.domain === preferredDomain) : topics;
  const scopedTopics = candidates.length ? candidates : topics;

  try {
    const response = await completeAIText({
      task: "title",
      temperature: 0.15,
      systemPrompt: [
        "你是资深中文内容主编，负责从实时热点中选出今天最值得写的一条。",
        "不要把不同平台热度直接等同比较，heatIndex 只是站内参考。",
        "优先选择能写出清晰观点、具体信息、读者收益和传播标题的选题。",
        "避开敏感、事实不足、纯情绪、只适合短视频快讯、不适合长文展开的题。",
        "只输出 JSON，不要解释，不要 Markdown。",
      ].join("\n"),
      userPrompt: [
        "请从候选热点里选出 1 条最值得写的选题。",
        "输出格式：",
        "{\"topicId\":\"候选 id\",\"score\":0-100,\"reason\":\"40字内中文理由\",\"angle\":\"一个具体写作切入角度\",\"risks\":[\"风险1\"]}",
        "候选数据：",
        buildRecommendationPrompt(scopedTopics, preferredDomain),
      ].join("\n"),
    });

    const parsed = extractJsonPayload(response.content);
    const topicId = safeText(parsed.topicId);
    const matchedTopic = scopedTopics.find((topic) => topic.id === topicId) ?? scopedTopics[0];

    return {
      topicId: matchedTopic.id,
      score: clamp(Math.round(Number(parsed.score) || Math.round(matchedTopic.heat / 100)), 1, 100),
      reason: safeText(parsed.reason, "AI 根据可写性、信息密度和传播窗口综合判断，这条更适合优先写。").slice(0, 80),
      angle: safeText(parsed.angle, domainConfigs[matchedTopic.domain].writingFocus[0] ?? matchedTopic.title).slice(0, 80),
      risks: safeStringList(parsed.risks),
      source: "ai",
      model: response.model,
      provider: response.config.provider,
    };
  } catch (error) {
    console.error("Failed to recommend topic with AI:", error);
    return {
      ...buildFallbackTopicRecommendation(topics, preferredDomain),
      message: error instanceof Error ? error.message : "AI 选题推荐失败，已使用规则推荐。",
    };
  }
}

export async function recommendDailyTopicsByDomainWithAI(
  topics: TopicRecommendationCandidate[],
): Promise<DomainTopicRecommendationGroup[]> {
  if (!topics.length) {
    return buildFallbackDomainRecommendations(topics);
  }

  const config = await getAIProviderConfig();
  if (!config.configured) {
    return buildFallbackDomainRecommendations(topics).map((group) => ({
      ...group,
      message: "AI 写作模型未配置，已使用规则推荐。",
    }));
  }

  try {
    const response = await completeAIText({
      task: "title",
      temperature: 0.12,
      systemPrompt: [
        "你是资深中文内容主编，负责每天从实时热点中为各领域挑选最值得写的选题。",
        "请分别评估 AI、汽车、教育、旅游四个领域，每个领域最多选 5 条。",
        "不要把不同平台热度直接等同比较，heatIndex 只是站内参考。",
        "优先选择能写出清晰观点、具体信息、读者收益和传播标题的选题。",
        "避开敏感、事实不足、纯情绪、只适合短视频快讯、不适合长文展开的题。",
        "只输出 JSON，不要解释，不要 Markdown。",
      ].join("\n"),
      userPrompt: [
        "请为每个领域选出今天最值得写的 5 个选题。候选不足 5 个时按实际数量返回。",
        "输出格式：",
        "{\"groups\":[{\"domain\":\"AI\",\"items\":[{\"topicId\":\"候选 id\",\"score\":0-100,\"reason\":\"40字内中文理由\",\"angle\":\"一个具体写作切入角度\",\"risks\":[\"风险1\"]}]}]}",
        "候选数据：",
        buildDomainRecommendationPrompt(topics),
      ].join("\n"),
    });

    const parsed = extractJsonPayload(response.content);
    return sanitizeDomainRecommendationGroups(parsed, topics, {
      source: "ai",
      model: response.model,
      provider: response.config.provider,
    });
  } catch (error) {
    console.error("Failed to recommend daily topics by domain with AI:", error);
    return buildFallbackDomainRecommendations(topics).map((group) => ({
      ...group,
      message: error instanceof Error ? error.message : "AI 推荐选题失败，已使用规则推荐。",
    }));
  }
}

export async function recommendTopicsForDomainWithAI(
  topics: TopicRecommendationCandidate[],
  domain: ActiveArticleDomain,
): Promise<DomainTopicRecommendationGroup> {
  const domainTopics = topics.filter((topic) => topic.domain === domain);
  const fallbackGroup = buildFallbackDomainRecommendations(topics).find((group) => group.domain === domain) ?? {
    domain,
    items: [],
    source: "fallback" as const,
  };

  if (!domainTopics.length) {
    return fallbackGroup;
  }

  const config = await getAIProviderConfig();
  if (!config.configured) {
    return {
      ...fallbackGroup,
      message: "AI 写作模型未配置，已使用规则推荐。",
    };
  }

  try {
    const response = await completeAIText({
      task: "title",
      temperature: 0.12,
      systemPrompt: [
        "你是资深中文内容主编，负责从一个领域的实时热点中挑选最值得写的选题。",
        `本次只评估「${domain}」领域，最多选 5 条。`,
        "优先选择能写出清晰观点、具体信息、读者收益和传播标题的选题。",
        "避开敏感、事实不足、纯情绪、只适合短视频快讯、不适合长文展开的题。",
        "只输出 JSON，不要解释，不要 Markdown。",
      ].join("\n"),
      userPrompt: [
        `请为「${domain}」领域选出今天最值得写的 5 个选题。候选不足 5 个时按实际数量返回。`,
        "输出格式：",
        "{\"groups\":[{\"domain\":\"AI\",\"items\":[{\"topicId\":\"候选 id\",\"score\":0-100,\"reason\":\"40字内中文理由\",\"angle\":\"一个具体写作切入角度\",\"risks\":[\"风险1\"]}]}]}",
        "候选数据：",
        buildSingleDomainRecommendationPrompt(domainTopics, domain),
      ].join("\n"),
    });

    const parsed = extractJsonPayload(response.content);
    return sanitizeDomainRecommendationGroups(parsed, domainTopics, {
      source: "ai",
      model: response.model,
      provider: response.config.provider,
    }).find((group) => group.domain === domain) ?? {
      ...fallbackGroup,
      source: "ai",
      model: response.model,
      provider: response.config.provider,
    };
  } catch (error) {
    console.error("Failed to recommend topics for domain with AI:", error);
    return {
      ...fallbackGroup,
      message: error instanceof Error ? error.message : "AI 推荐选题失败，已使用规则推荐。",
    };
  }
}

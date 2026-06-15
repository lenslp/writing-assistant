import { articleDomains, detectArticleDomainWithSignals, type ActiveArticleDomain } from "./content-domains";
import { isAiRelevantHotTopic, type HotTopicItem } from "./hot-topics";

export type WorkbenchHotTopicInput = Omit<HotTopicItem, "time"> & {
  time?: string;
};

export type TopicRecommendationCandidate = Pick<
  WorkbenchHotTopicInput,
  "id" | "title" | "source" | "sourceType" | "domain" | "heat" | "trend" | "time" | "tags" | "summary" | "url" | "fetchedAt" | "sourcePublishedAt"
> & {
  domain: ActiveArticleDomain;
  time: string;
};

export function resolveWorkbenchTopicDomain(topic: WorkbenchHotTopicInput): ActiveArticleDomain | null {
  const isExplicitActiveDomain = topic.domain && (articleDomains as readonly string[]).includes(topic.domain);
  const explicitDomain = isExplicitActiveDomain ? (topic.domain as ActiveArticleDomain) : null;

  if (topic.source === "微博") {
    const signal = detectArticleDomainWithSignals(topic.title, topic.tags, topic.source, topic.summary ?? "");
    const resolvedSignalDomain = (articleDomains as readonly string[]).includes(signal.domain) ? (signal.domain as ActiveArticleDomain) : null;
    if (resolvedSignalDomain && signal.confidence !== "low") {
      return resolvedSignalDomain;
    }
    return null;
  }

  if (explicitDomain && explicitDomain !== "AI") {
    return explicitDomain;
  }

  if (isAiRelevantHotTopic(topic)) {
    return "AI";
  }

  const signal = detectArticleDomainWithSignals(topic.title, topic.tags, topic.source, topic.summary ?? "");
  const resolvedSignalDomain = (articleDomains as readonly string[]).includes(signal.domain) ? (signal.domain as ActiveArticleDomain) : null;
  if (resolvedSignalDomain && resolvedSignalDomain !== "AI" && signal.confidence !== "low") {
    return resolvedSignalDomain;
  }

  return null;
}

export function normalizeWorkbenchTopicCandidates(topics: WorkbenchHotTopicInput[]) {
  return topics
    .map((topic) => {
      const domain = resolveWorkbenchTopicDomain(topic);
      if (!domain) return null;

      return {
        ...topic,
        domain,
        time: topic.time ?? "刚刚",
        tags: topic.tags.slice(0, 3),
      };
    })
    .filter((topic): topic is TopicRecommendationCandidate => Boolean(topic));
}
